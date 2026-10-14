import { describe, expect, it, vi } from 'vitest';
import { Quaternion } from 'three';
import { CardSprite } from './card-sprite';
import type { TrackingEngine, TrackingInfo, TrackingOptions, TrackingUpdate } from './engine';
import { MultiArSession } from './multi-session';
import type { MultiArState, MultiSlot } from './multi-session';
import { makePlaceholder } from './placeholder';
import type { RenderBackend } from './session';

const f = 240 / Math.tan((45 * Math.PI) / 360);
const projection = [f / 320, 0, 0, 0, 0, f / 240, 0, 0, 0, 0, -1.0002, -1, 0, 0, -20.002, 0];
const info: TrackingInfo = {
  markerWidth: 600, markerHeight: 825, projection, inputWidth: 640, inputHeight: 480,
  markers: [{ width: 600, height: 825 }, { width: 300, height: 420 }, { width: 500, height: 700 }],
};

class FakeEngine implements TrackingEngine {
  onUpdate: ((u: TrackingUpdate) => void) | null = null;
  targets: readonly ArrayBuffer[] | ArrayBuffer | null = null;
  options: TrackingOptions | undefined;
  stopped = 0;
  starts = 0;
  onInputChange: (() => void) | null = null;
  async start(_v: HTMLVideoElement, target: ArrayBuffer | readonly ArrayBuffer[], onUpdate: (u: TrackingUpdate) => void, onInputChange?: () => void, options?: TrackingOptions) {
    this.starts++;
    this.targets = target;
    this.options = options;
    this.onUpdate = onUpdate;
    this.onInputChange = onInputChange ?? null;
    return info;
  }
  stop() { this.stopped++; }
}

function setup(count = 3, extra: Partial<ConstructorParameters<typeof MultiArSession>[0]> = {}) {
  const engine = new FakeEngine();
  const renderer: RenderBackend = { render: vi.fn(), setSize: vi.fn(), dispose: vi.fn() };
  const slots: MultiSlot[] = Array.from({ length: count }, (_, i) => {
    const sprite = new CardSprite({ frameCacheBytes: 1024 });
    sprite.setStatic(makePlaceholder(8));
    return { cardId: `c${i}`, name: `Carta ${i}`, sprite };
  });
  const frames: ((now: number) => void)[] = [];
  const states: MultiArState[] = [];
  const session = new MultiArSession({
    engine, renderer, slots, maxTrack: 3, video: {} as HTMLVideoElement, getContainerSize: () => ({ width: 360, height: 640 }),
    schedule: (cb) => frames.push(cb), cancel: () => frames.splice(0, frames.length), onState: (s) => states.push(s), ...extra,
  });
  const tick = (now = 0) => frames.shift()?.(now);
  const pose = (z = -500) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, z, 1];
  const targets = slots.map(() => new ArrayBuffer(8));
  return { engine, renderer, slots, session, states, tick, pose, targets };
}

describe('MultiArSession', () => {
  it('entrega todos os alvos ao motor, com o limite de cartas rastreadas ao mesmo tempo', async () => {
    const { session, engine, targets } = setup(3);
    await session.start(targets);
    expect(engine.targets).toHaveLength(3);
    expect(engine.options?.maxTrack).toBe(3);
    expect(session.currentState.phase).toBe('searching');
  });

  it('limita maxTrack ao número de cartas e exige um alvo por carta', async () => {
    const { session, engine } = setup(2, { maxTrack: 5 });
    await expect(session.start([new ArrayBuffer(8)])).rejects.toThrow(/cada carta/);
    await session.start([new ArrayBuffer(8), new ArrayBuffer(8)]);
    expect(engine.options?.maxTrack).toBe(2);
  });

  it('cada pose vai para o Pokémon da sua carta, com o tamanho do seu alvo', async () => {
    const { session, engine, slots, pose, targets } = setup(3);
    await session.start(targets);
    engine.onUpdate!({ worldMatrix: pose(-400), targetIndex: 1 });
    expect(slots[0]!.sprite.group.visible).toBe(false);
    expect(slots[1]!.sprite.group.visible).toBe(true);
    expect(slots[2]!.sprite.group.visible).toBe(false);
    // Centro do marcador 1 (300×420): (150, 210), escala = 300.
    expect(slots[1]!.sprite.group.matrix.elements[12]).toBeCloseTo(150, 6);
    expect(slots[1]!.sprite.group.matrix.elements[13]).toBeCloseTo(210, 6);
    expect(slots[1]!.sprite.group.matrix.elements[0]).toBeCloseTo(300, 6);
    engine.onUpdate!({ worldMatrix: pose(-900), targetIndex: 2 });
    expect(slots[2]!.sprite.group.matrix.elements[14]).toBeCloseTo(-900, 6);
    expect(slots[2]!.sprite.group.matrix.elements[0]).toBeCloseTo(500, 6);
    expect(session.currentState.visible).toEqual(['c1', 'c2']);
    expect(session.currentState.phase).toBe('tracking');
  });

  it('sem targetIndex vale a primeira carta', async () => {
    const { session, engine, slots, pose, targets } = setup(2);
    await session.start(targets);
    engine.onUpdate!({ worldMatrix: pose() });
    expect(slots[0]!.sprite.group.visible).toBe(true);
  });

  it('carta perdida some depois do tempo de segurar; as outras continuam', async () => {
    let t = 1000;
    const { session, engine, slots, pose, tick, targets } = setup(2, { holdMs: 600, now: () => t });
    await session.start(targets);
    engine.onUpdate!({ worldMatrix: pose(), targetIndex: 0 });
    engine.onUpdate!({ worldMatrix: pose(), targetIndex: 1 });
    t += 100;
    engine.onUpdate!({ worldMatrix: null, targetIndex: 0 }); // o MindAR desistiu só da carta 0
    t += 300;
    engine.onUpdate!({ worldMatrix: pose(), targetIndex: 1 });
    tick(t);
    expect(slots[0]!.sprite.group.visible).toBe(true);
    t += 400;
    tick(t);
    expect(slots[0]!.sprite.group.visible).toBe(false);
    expect(slots[1]!.sprite.group.visible).toBe(true);
    expect(session.currentState.visible).toEqual(['c1']);
    t += 700;
    tick(t);
    // Segue na carta 1 mesmo sem novas leituras? Não há nulo para ela: continua até o MindAR avisar.
    expect(slots[1]!.sprite.group.visible).toBe(true);
  });

  it('pose repetida de uma carta que o rastreador já perdeu a esconde depois do tempo de segurar', async () => {
    let t = 1000;
    const { session, engine, slots, pose, tick, targets } = setup(2, { holdMs: 600, now: () => t });
    await session.start(targets);
    engine.onUpdate!({ worldMatrix: pose(), targetIndex: 0, fresh: true });
    engine.onUpdate!({ worldMatrix: pose(), targetIndex: 1, fresh: true });
    t += 300;
    engine.onUpdate!({ worldMatrix: pose(), targetIndex: 0, fresh: false }); // carta 0 perdida, pose velha repetida
    engine.onUpdate!({ worldMatrix: pose(), targetIndex: 1, fresh: true });
    expect(slots[0]!.sprite.group.visible).toBe(true);
    t += 500;
    engine.onUpdate!({ worldMatrix: pose(), targetIndex: 0, fresh: false });
    engine.onUpdate!({ worldMatrix: pose(), targetIndex: 1, fresh: true });
    tick(t);
    expect(slots[0]!.sprite.group.visible).toBe(false);
    expect(slots[1]!.sprite.group.visible).toBe(true);
    expect(session.currentState.visible).toEqual(['c1']);
  });

  it('só avisa a interface quando muda o conjunto de cartas visíveis', async () => {
    const { session, engine, states, pose, targets } = setup(2);
    await session.start(targets);
    const before = states.length;
    engine.onUpdate!({ worldMatrix: pose(), targetIndex: 0 });
    const afterFirst = states.length;
    engine.onUpdate!({ worldMatrix: pose(-510), targetIndex: 0 });
    engine.onUpdate!({ worldMatrix: pose(-520), targetIndex: 0 });
    expect(afterFirst).toBe(before + 1);
    expect(states.length).toBe(afterFirst);
  });

  it('com giroscópio guarda a pose no mundo pela orientação do quadro e leva de volta no desenho', async () => {
    const at = vi.fn(() => new Quaternion());
    const { session, engine, slots, pose, tick, targets } = setup(2, {
      orientation: { at, isFresh: () => true }, getGyroSettings: () => ({ gyro: true, latencyMs: 70 }), now: () => 5000,
    });
    await session.start(targets);
    engine.onUpdate!({ worldMatrix: pose(), targetIndex: 1, capturedAt: 4900 });
    expect(at).toHaveBeenCalledWith(4900);
    tick(5000);
    expect(at).toHaveBeenCalledWith(5000 - 70);
    expect(slots[1]!.sprite.group.visible).toBe(true);
  });

  it('desenha a cada quadro e libera tudo ao parar', async () => {
    const { session, renderer, engine, slots, tick, targets } = setup(2);
    await session.start(targets);
    tick(1);
    tick(2);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    session.stop();
    expect(engine.stopped).toBe(1);
    expect(renderer.dispose).toHaveBeenCalled();
    expect(session.scene.children).toHaveLength(0);
    expect(slots.every((s) => s.sprite.mode !== undefined)).toBe(true);
    expect(session.currentState).toMatchObject({ phase: 'idle', visible: [] });
  });

  it('reinicia o rastreador com os mesmos alvos quando a câmera muda de proporção', async () => {
    const { session, engine, targets } = setup(2);
    await session.start(targets);
    engine.onInputChange!();
    await Promise.resolve();
    await Promise.resolve();
    expect(engine.starts).toBe(2);
    expect(engine.targets).toHaveLength(2);
  });
});
