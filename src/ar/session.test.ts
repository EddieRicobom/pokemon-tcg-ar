import { describe, expect, it, vi } from 'vitest';
import { makePlaceholder } from './placeholder';
import { CardSprite } from './card-sprite';
import type { TrackingEngine, TrackingInfo, TrackingUpdate } from './engine';
import { ArSession } from './session';
import { StatsPanel } from './stats-panel';
import { Quaternion, Vector3 } from 'three';
import type { ArState, RenderBackend } from './session';

const f = 240 / Math.tan((45 * Math.PI) / 360);
const projection = [f / 320, 0, 0, 0, 0, f / 240, 0, 0, 0, 0, -1.0002, -1, 0, 0, -20.002, 0];
const info: TrackingInfo = { markerWidth: 600, markerHeight: 825, projection, inputWidth: 640, inputHeight: 480 };

class FakeEngine implements TrackingEngine {
  onUpdate: ((u: TrackingUpdate) => void) | null = null;
  stopped = 0;
  starts = 0;
  onInputChange: (() => void) | null = null;
  failWith: Error | null = null;
  async start(_video: HTMLVideoElement, _target: ArrayBuffer, onUpdate: (u: TrackingUpdate) => void, onInputChange?: () => void) {
    if (this.failWith) throw this.failWith;
    this.starts++;
    this.onInputChange = onInputChange ?? null;
    this.onUpdate = onUpdate;
    return info;
  }
  stop() { this.stopped++; }
}

function setup(options: Partial<ConstructorParameters<typeof ArSession>[0]> & { panel?: StatsPanel } = {}) {
  const engine = new FakeEngine();
  const renders: number[] = [];
  const renderer: RenderBackend = {
    render: vi.fn(() => renders.push(renders.length)),
    setSize: vi.fn(),
    dispose: vi.fn(),
  };
  const sprite = new CardSprite();
  sprite.setStatic(makePlaceholder(8));
  const frames: ((now: number) => void)[] = [];
  const states: ArState[] = [];
  const session = new ArSession({
    engine, renderer, sprite, video: {} as HTMLVideoElement, getContainerSize: () => ({ width: 360, height: 640 }),
    schedule: (cb) => frames.push(cb),
    cancel: () => frames.splice(0, frames.length),
    onState: (s) => states.push(s), ...options,
  });
  const tick = (now = 0) => { const cb = frames.shift(); cb?.(now); };
  const pose = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -500, 1];
  return { engine, renderer, sprite, session, states, tick, pose, frames };
}

describe('ArSession', () => {
  it('começa procurando a carta e ajusta a câmera virtual', async () => {
    const { session, renderer } = setup();
    await session.start(new ArrayBuffer(8));
    expect(session.currentState.phase).toBe('searching');
    expect(renderer.setSize).toHaveBeenCalledWith(360, 640);
    expect(session.camera.fov).toBeCloseTo(45, 3);
    expect(session.camera.near).toBeGreaterThan(0);
  });

  it('carta encontrada: mostra o sprite e o coloca no espaço da carta; perdida: esconde', async () => {
    const { session, engine, sprite, pose } = setup({ lostAfterFrames: 3, holdMs: 0 });
    await session.start(new ArrayBuffer(8));
    expect(sprite.group.visible).toBe(false);
    engine.onUpdate!({ worldMatrix: pose });
    expect(session.currentState).toMatchObject({ phase: 'tracking', foundCount: 1 });
    expect(sprite.group.visible).toBe(true);
    // Origem do espaço da carta = centro do marcador: (300, 412.5, 0) em unidades do marcador, vezes a pose.
    expect(sprite.group.matrix.elements[12]).toBeCloseTo(300, 6);
    expect(sprite.group.matrix.elements[13]).toBeCloseTo(412.5, 6);
    expect(sprite.group.matrix.elements[14]).toBeCloseTo(-500, 6);
    expect(sprite.group.matrix.elements[0]).toBeCloseTo(600, 6); // escala = largura do marcador

    engine.onUpdate!({ worldMatrix: null });
    expect(sprite.group.visible).toBe(false);
    expect(session.currentState.phase).toBe('tracking'); // tolera poucos quadros sem pose
    engine.onUpdate!({ worldMatrix: null });
    engine.onUpdate!({ worldMatrix: null });
    expect(session.currentState.phase).toBe('lost');
    expect(session.currentState.message).toMatch(/Perdi/);
  });

  it('perda curta: mantém o sprite na última pose durante holdMs e só então esconde', async () => {
    let t = 1000;
    const { session, engine, sprite, pose } = setup({ holdMs: 700, now: () => t });
    await session.start(new ArrayBuffer(8));
    engine.onUpdate!({ worldMatrix: pose });
    t += 300;
    engine.onUpdate!({ worldMatrix: null });
    expect(sprite.group.visible).toBe(true);
    t += 600;
    engine.onUpdate!({ worldMatrix: null });
    expect(sprite.group.visible).toBe(false);
    t += 10;
    engine.onUpdate!({ worldMatrix: pose });
    expect(sprite.group.visible).toBe(true);
  });

  it('segue o movimento: cada nova pose atualiza a matriz do sprite', async () => {
    const { session, engine, sprite, pose } = setup();
    await session.start(new ArrayBuffer(8));
    engine.onUpdate!({ worldMatrix: pose });
    const first = sprite.group.matrix.elements[12];
    const moved = [...pose];
    moved[12] = 80;
    engine.onUpdate!({ worldMatrix: moved });
    // A pose nova é suavizada: não pula de uma vez...
    expect(sprite.group.matrix.elements[12]).toBeCloseTo(first!, 6);
    // ...mas converge para ela em poucos quadros de tela.
    for (let t = 100; t <= 2000; t += 100) sprite.update(t);
    expect(sprite.group.matrix.elements[12]).toBeCloseTo(first! + 80, 3);
  });

  it('câmera muda de proporção: reinicia o rastreador e volta a procurar, sem perder a sessão', async () => {
    const { session, engine, pose } = setup();
    await session.start(new ArrayBuffer(8));
    engine.onUpdate!({ worldMatrix: pose });
    expect(session.currentState.phase).toBe('tracking');
    engine.onInputChange!();
    await new Promise((r) => setTimeout(r, 0));
    expect(engine.starts).toBe(2);
    expect(engine.stopped).toBe(1);
    expect(session.currentState.phase).toBe('searching');
    engine.onUpdate!({ worldMatrix: pose });
    expect(session.currentState.phase).toBe('tracking');
  });

  it('painel de status: filho do grupo da carta, colado ao Pokémon, ligado/desligado pelo layout e liberado no fim', async () => {
    const panel = new StatsPanel('Pikachu', 25);
    const { session, sprite, tick } = setup({ panel });
    await session.start(new ArrayBuffer(8));
    expect(sprite.group.children).toContain(panel.object);
    // A cada quadro o painel é posicionado a partir do Pokémon: à frente dos pés, no chão, na escala dele.
    tick(16);
    const placement = sprite.placement;
    expect(panel.object.position.x).toBeCloseTo(placement.x, 6);
    expect(panel.object.position.y).toBeLessThan(placement.y);
    expect(panel.mesh.scale.x).toBeGreaterThan(0.4);
    session.setLayout({ heightRatio: 0.7, offsetX: 0, offsetY: 0, lift: 0, yawDeg: 0, anchor: 'base', showStats: false });
    expect(panel.object.visible).toBe(false);
    session.setLayout({ heightRatio: 0.7, offsetX: 0, offsetY: 0, lift: 0, yawDeg: 0, anchor: 'base' });
    expect(panel.object.visible).toBe(true);
    session.stop();
    expect(sprite.group.children).not.toContain(panel.object);
  });

  it('ponto da tela → plano da carta (arrastar o Pokémon com o dedo)', async () => {
    const { session, engine, pose } = setup();
    await session.start(new ArrayBuffer(8));
    expect(session.pointOnCardPlane(0, 0)).toBeNull(); // carta ainda não rastreada
    engine.onUpdate!({ worldMatrix: pose });
    const p = session.pointOnCardPlane(0, 0)!;
    // Centro da tela = origem do mundo; o centro da carta está em (300, 412,5) → no espaço da carta fica (−0,5, −0,6875).
    expect(p.x).toBeCloseTo(-0.5, 3);
    expect(p.y).toBeCloseTo(-0.6875, 3);
    const right = session.pointOnCardPlane(0.2, 0)!;
    expect(right.x).toBeGreaterThan(p.x);
    expect(Math.abs(right.y - p.y)).toBeLessThan(1e-6);
  });

  it('toque no painel: acha o golpe sob o dedo; fora do painel devolve null', async () => {
    const panel = new StatsPanel('Pikachu', 25);
    panel.setPart('moves', { state: 'ok', value: [{ name: 'Thunderbolt', type: 'electric', power: 90, accuracy: 100, pp: 15, damageClass: 'special' }] });
    panel.setMode('moves');
    const { session, engine, pose, tick } = setup({ panel });
    await session.start(new ArrayBuffer(8));
    engine.onUpdate!({ worldMatrix: pose });
    tick(16);
    session.scene.updateMatrixWorld(true);
    session.camera.updateMatrixWorld();
    // Ponto do painel onde fica a linha 0 de golpes (canvas 512×384; linha de y = 120 a 176).
    const local = new Vector3(280 / 512 - 0.5, 0.75 / 2 - 148 / 512, 0);
    const ndc = panel.mesh.localToWorld(local).project(session.camera);
    const picked = session.pickPanel(ndc.x, ndc.y);
    expect(picked?.page).toBe('moves');
    expect(picked?.hit).toEqual({ kind: 'move', source: 'game', index: 0, name: 'Thunderbolt' });
    expect(session.pickPanel(-0.99, 0.99)).toBeNull();
    session.setLayout({ heightRatio: 0.7, offsetX: 0, offsetY: 0, lift: 0, yawDeg: 0, anchor: 'base', showStats: false });
    expect(session.pickPanel(ndc.x, ndc.y)).toBeNull(); // desligado: não responde
  });

  it('recuperação: depois de perdida, encontrar de novo volta a "tracking" e conta de novo', async () => {
    const { session, engine, pose } = setup({ lostAfterFrames: 1 });
    await session.start(new ArrayBuffer(8));
    engine.onUpdate!({ worldMatrix: pose });
    engine.onUpdate!({ worldMatrix: null });
    expect(session.currentState.phase).toBe('lost');
    engine.onUpdate!({ worldMatrix: pose });
    expect(session.currentState).toMatchObject({ phase: 'tracking', foundCount: 2 });
  });

  it('desenha a cada quadro e anima o sprite', async () => {
    const { session, renderer, tick } = setup();
    await session.start(new ArrayBuffer(8));
    tick(16);
    tick(32);
    expect(renderer.render).toHaveBeenCalledTimes(2);
  });

  it('erro ao iniciar (alvo ruim, câmera sem imagem): estado de erro com mensagem e motor parado', async () => {
    const { session, engine } = setup();
    engine.failWith = new Error('O alvo de AR está vazio');
    await expect(session.start(new ArrayBuffer(0))).rejects.toThrow();
    expect(session.currentState).toMatchObject({ phase: 'error', message: 'O alvo de AR está vazio' });
    expect(engine.stopped).toBe(1);
  });

  it('stop libera tudo: motor, laço de desenho, sprite e renderizador', async () => {
    const { session, engine, renderer, sprite, tick, frames } = setup();
    await session.start(new ArrayBuffer(8));
    const dispose = vi.spyOn(sprite, 'dispose');
    session.stop();
    expect(engine.stopped).toBe(1);
    expect(dispose).toHaveBeenCalled();
    expect(renderer.dispose).toHaveBeenCalled();
    expect(frames).toHaveLength(0);
    tick(1);
    expect(renderer.render).not.toHaveBeenCalled();
    expect(session.currentState.phase).toBe('idle');
    expect(session.scene.children).toHaveLength(0);
  });

  it('resize recalcula a câmera para a nova proporção da tela', async () => {
    const { session } = setup();
    let size = { width: 360, height: 640 };
    (session as unknown as { deps: { getContainerSize: () => typeof size } }).deps.getContainerSize = () => size;
    await session.start(new ArrayBuffer(8));
    size = { width: 640, height: 300 };
    session.resize();
    expect(session.camera.aspect).toBeCloseTo(640 / 300, 6);
    expect(session.camera.fov).toBeLessThan(45);
  });
});

describe('ArSession: giroscópio', () => {
  const yaw = (deg: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (deg * Math.PI) / 180);

  /** Orientação falsa: a câmera gira `deg` graus por segundo, em torno de Y, a partir de t = 0. */
  function fakeOrientation(degPerSec: number, opts: { fresh?: boolean } = {}) {
    return {
      at: (t: number) => yaw((degPerSec * t) / 1000),
      isFresh: () => opts.fresh !== false,
    };
  }

  it('com giroscópio a pose vai para o mundo e girar o celular move o Pokémon sem novo resultado do rastreador', async () => {
    let t = 1000;
    const orientation = fakeOrientation(30);
    const { session, engine, sprite, pose, tick } = setup({ orientation, getGyroSettings: () => ({ gyro: true, latencyMs: 0 }), now: () => t });
    await session.start(new ArrayBuffer(8));
    engine.onUpdate!({ worldMatrix: pose, capturedAt: 1000 });
    tick(1000);
    const before = new Vector3(0, 0, 0).applyMatrix4(sprite.group.matrix);
    t = 1500; // meio segundo depois: a câmera girou 15°
    tick(1500);
    const after = new Vector3(0, 0, 0).applyMatrix4(sprite.group.matrix);
    expect(after.distanceTo(before)).toBeGreaterThan(50);
    expect(after.length()).toBeCloseTo(before.length(), 3); // só rodou em torno da câmera
  });

  it('com o giroscópio desligado nas configurações, nada muda entre as leituras', async () => {
    let t = 1000;
    const { session, engine, sprite, pose, tick } = setup({ orientation: fakeOrientation(30), getGyroSettings: () => ({ gyro: false, latencyMs: 0 }), now: () => t });
    await session.start(new ArrayBuffer(8));
    engine.onUpdate!({ worldMatrix: pose, capturedAt: 1000 });
    tick(1000);
    const before = sprite.group.matrix.clone();
    t = 1500;
    tick(1500);
    expect(sprite.group.matrix.equals(before)).toBe(true);
  });

  it('sensor parado (amostras velhas) não corrige nada', async () => {
    let t = 1000;
    const { session, engine, sprite, pose, tick } = setup({ orientation: fakeOrientation(30, { fresh: false }), now: () => t });
    await session.start(new ArrayBuffer(8));
    engine.onUpdate!({ worldMatrix: pose, capturedAt: 1000 });
    tick(1000);
    const before = sprite.group.matrix.clone();
    t = 1500;
    tick(1500);
    expect(sprite.group.matrix.equals(before)).toBe(true);
  });

  it('o atraso do sensor desloca a orientação consultada', async () => {
    const asked: number[] = [];
    const orientation = { at: (t: number) => (asked.push(t), yaw(0)), isFresh: () => true };
    let t = 5000;
    const { session, tick } = setup({ orientation, getGyroSettings: () => ({ gyro: true, latencyMs: 80 }), now: () => t });
    await session.start(new ArrayBuffer(8));
    tick(5000);
    expect(asked.at(-1)).toBe(4920);
  });

  it('com giroscópio o Pokémon fica mais tempo na última pose depois de perder a carta', async () => {
    let t = 1000;
    const { session, engine, sprite, pose } = setup({ orientation: fakeOrientation(0), now: () => t });
    await session.start(new ArrayBuffer(8));
    engine.onUpdate!({ worldMatrix: pose, capturedAt: 1000 });
    t += 1800;
    engine.onUpdate!({ worldMatrix: null });
    expect(sprite.group.visible).toBe(true); // sem giroscópio já teria sumido (1 s)
    t += 1000;
    engine.onUpdate!({ worldMatrix: null });
    expect(sprite.group.visible).toBe(false);
  });

  it('publica a taxa do rastreador e se o giroscópio está valendo', async () => {
    let t = 1000;
    const { session, engine, pose, states } = setup({ orientation: fakeOrientation(0), now: () => t });
    await session.start(new ArrayBuffer(8));
    for (let i = 0; i < 40; i++) {
      engine.onUpdate!({ worldMatrix: pose, capturedAt: t });
      t += 100; // 10 leituras por segundo
    }
    const last = states.at(-1)!;
    expect(last.trackerHz).toBeGreaterThan(8);
    expect(last.trackerHz).toBeLessThan(12);
    expect(last.gyro).toBe(true);
  });
});
