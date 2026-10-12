import { describe, expect, it, vi } from 'vitest';
import { makePlaceholder } from './placeholder';
import { CardSprite } from './card-sprite';
import type { TrackingEngine, TrackingInfo, TrackingUpdate } from './engine';
import { ArSession } from './session';
import type { ArState, RenderBackend } from './session';

const f = 240 / Math.tan((45 * Math.PI) / 360);
const projection = [f / 320, 0, 0, 0, 0, f / 240, 0, 0, 0, 0, -1.0002, -1, 0, 0, -20.002, 0];
const info: TrackingInfo = { markerWidth: 600, markerHeight: 825, projection, inputWidth: 640, inputHeight: 480 };

class FakeEngine implements TrackingEngine {
  onUpdate: ((u: TrackingUpdate) => void) | null = null;
  stopped = 0;
  failWith: Error | null = null;
  async start(_video: HTMLVideoElement, _target: ArrayBuffer, onUpdate: (u: TrackingUpdate) => void) {
    if (this.failWith) throw this.failWith;
    this.onUpdate = onUpdate;
    return info;
  }
  stop() { this.stopped++; }
}

function setup(options: { lostAfterFrames?: number } = {}) {
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
    const { session, engine, sprite, pose } = setup({ lostAfterFrames: 3 });
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

  it('segue o movimento: cada nova pose atualiza a matriz do sprite', async () => {
    const { session, engine, sprite, pose } = setup();
    await session.start(new ArrayBuffer(8));
    engine.onUpdate!({ worldMatrix: pose });
    const first = sprite.group.matrix.elements[12];
    const moved = [...pose];
    moved[12] = 80;
    engine.onUpdate!({ worldMatrix: moved });
    expect(sprite.group.matrix.elements[12]).toBeCloseTo(first! + 80, 6);
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
