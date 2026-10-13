import { describe, expect, it, vi } from 'vitest';
import { makePlaceholder } from './placeholder';
import { CardSprite } from './card-sprite';
import type { TrackingEngine, TrackingInfo, TrackingUpdate } from './engine';
import { ArSession } from './session';
import { StatsPanel } from './stats-panel';
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

function setup(options: { lostAfterFrames?: number; holdMs?: number; now?: () => number; panel?: StatsPanel } = {}) {
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

  it('painel de status: filho do grupo da carta, posicionado pela altura do alvo, ligado/desligado pelo layout e liberado no fim', async () => {
    const panel = new StatsPanel('Pikachu', 25);
    const { session, sprite } = setup({ panel });
    await session.start(new ArrayBuffer(8));
    expect(sprite.group.children).toContain(panel.object);
    // markerHeight / markerWidth = 825 / 600
    expect(panel.mesh.position.y).toBeLessThan(-(825 / 600) / 2);
    session.setLayout({ heightRatio: 0.7, offsetX: 0, offsetY: 0, lift: 0, yawDeg: 0, anchor: 'base', showStats: false });
    expect(panel.object.visible).toBe(false);
    session.setLayout({ heightRatio: 0.7, offsetX: 0, offsetY: 0, lift: 0, yawDeg: 0, anchor: 'base' });
    expect(panel.object.visible).toBe(true);
    session.stop();
    expect(sprite.group.children).not.toContain(panel.object);
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
