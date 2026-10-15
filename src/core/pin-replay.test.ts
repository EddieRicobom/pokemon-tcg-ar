import { describe, expect, it } from 'vitest';
import { seededRng } from './battle';
import { MAX_FRAMES, REPLAY_AFTER, REPLAY_BEFORE, REPLAY_SPEED, ReplayRecorder, SAMPLE_EVERY } from './pin-replay';
import { createWorld, launch, stepWorld } from './pins';
import type { PinWorld } from './pins';

const spec = (id: string) => ({ id, name: id, types: ['normal' as const], stats: null, weightKg: 30 });

function worldWith(): PinWorld {
  const w = createWorld({ mine: [spec('a')], enemy: [spec('b')] }, seededRng(1), { marks: false });
  return w;
}

describe('repetição em câmera lenta', () => {
  it('guarda um quadro a cada 1/60 s, não a cada passo da física', () => {
    const w = worldWith();
    const rec = new ReplayRecorder();
    rec.start(w);
    for (let i = 0; i < 120; i++) {
      stepWorld(w, 1 / 120);
      rec.capture(w);
    }
    // 1 s de física = ~60 quadros (mais o inicial).
    expect(rec.frames.length).toBeGreaterThanOrEqual(59);
    expect(rec.frames.length).toBeLessThanOrEqual(62);
    expect(rec.frames[1]!.t - rec.frames[0]!.t).toBeGreaterThanOrEqual(SAMPLE_EVERY - 1e-6);
  });

  it('começar de novo apaga o disparo anterior', () => {
    const w = worldWith();
    const rec = new ReplayRecorder();
    rec.start(w);
    for (let i = 0; i < 60; i++) {
      stepWorld(w, 1 / 120);
      rec.capture(w);
    }
    rec.markDecisive(w);
    expect(rec.decisiveAt).not.toBeNull();
    rec.start(w);
    expect(rec.frames).toHaveLength(1);
    expect(rec.decisiveAt).toBeNull();
    expect(rec.hasReplay).toBe(false);
  });

  it('interpola a posição entre dois quadros e prende nas pontas', () => {
    const w = worldWith();
    const pin = w.pins[0]!;
    const rec = new ReplayRecorder();
    pin.x = 0;
    w.time = 1;
    rec.start(w);
    pin.x = 100;
    w.time = 1 + SAMPLE_EVERY;
    rec.capture(w);
    const mid = rec.frameAt(1 + SAMPLE_EVERY / 2)!;
    expect(mid.pins[0]!.x).toBeCloseTo(50, 5);
    expect(rec.frameAt(-5)!.pins[0]!.x).toBe(0);
    expect(rec.frameAt(99)!.pins[0]!.x).toBe(100);
    expect(new ReplayRecorder().frameAt(1)).toBeNull();
  });

  it('o trecho tocado cerca o momento decisivo e a duração depende da velocidade', () => {
    const w = worldWith();
    const rec = new ReplayRecorder();
    rec.start(w);
    for (let i = 0; i < 120 * 6; i++) {
      stepWorld(w, 1 / 120);
      rec.capture(w);
      if (i === 120 * 4) rec.markDecisive(w);
    }
    expect(rec.hasReplay).toBe(true);
    const range = rec.range()!;
    const at = rec.decisiveAt!;
    expect(range.from).toBeCloseTo(at - REPLAY_BEFORE, 1);
    expect(range.to).toBeCloseTo(at + REPLAY_AFTER, 1);
    expect(rec.duration()).toBeCloseTo((range.to - range.from) / REPLAY_SPEED, 5);
    expect(rec.duration(1)).toBeLessThan(rec.duration(0.25));
  });

  it('um disparo longo demais descarta os quadros mais antigos', () => {
    const w = worldWith();
    const rec = new ReplayRecorder();
    rec.start(w);
    for (let i = 0; i < MAX_FRAMES + 50; i++) {
      w.time += SAMPLE_EVERY;
      rec.capture(w);
    }
    expect(rec.frames).toHaveLength(MAX_FRAMES);
    expect(rec.frames[0]!.t).toBeGreaterThan(0);
  });

  it('o quadro lembra quem caiu e o raio da arena', () => {
    const w = worldWith();
    w.limit = 250;
    const a = w.pins[0]!;
    launch(a, { dirX: 1, dirY: 0, power: 1 });
    a.x = 340;
    const rec = new ReplayRecorder();
    rec.start(w);
    stepWorld(w, 1 / 120);
    w.time += 0.1;
    rec.capture(w);
    const last = rec.frameAt(w.time)!;
    expect(last.limit).toBe(250);
    expect(last.pins.find((p) => p.id === 'a')!.fall).toBeGreaterThan(0);
  });
});
