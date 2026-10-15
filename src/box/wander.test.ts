import { describe, expect, it } from 'vitest';
import { createWander, separate, stepWander } from './wander';

function seeded(seed = 7): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('passeio na caixa', () => {
  it('nasce dentro da caixa', () => {
    const rng = seeded();
    for (let i = 0; i < 50; i++) {
      const s = createWander(1, rng);
      expect(Math.abs(s.x)).toBeLessThanOrEqual(0.9);
      expect(Math.abs(s.z)).toBeLessThanOrEqual(0.9);
    }
  });

  it('nunca sai da caixa, mesmo depois de muito tempo', () => {
    const rng = seeded(3);
    const s = createWander(1.2, rng);
    for (let i = 0; i < 20000; i++) {
      stepWander(s, 16, 1.2, rng);
      expect(Math.abs(s.x)).toBeLessThanOrEqual(1.2 * 0.9 + 1e-9);
      expect(Math.abs(s.z)).toBeLessThanOrEqual(1.2 * 0.9 + 1e-9);
    }
  });

  it('anda e para: tem momentos parado e momentos em movimento', () => {
    const rng = seeded(11);
    const s = createWander(1.2, rng);
    let moving = 0;
    let still = 0;
    for (let i = 0; i < 6000; i++) {
      stepWander(s, 16, 1.2, rng);
      if (s.vx !== 0 || s.vz !== 0) moving++;
      else still++;
    }
    expect(moving).toBeGreaterThan(100);
    expect(still).toBeGreaterThan(100);
  });

  it('um quadro muito longo (aba em segundo plano) não faz teletransporte', () => {
    const rng = seeded(5);
    const s = createWander(1.2, rng);
    s.pauseMs = 0;
    s.tx = 1;
    s.tz = 1;
    s.x = 0;
    s.z = 0;
    stepWander(s, 60000, 1.2, rng);
    expect(Math.hypot(s.x, s.z)).toBeLessThan(0.1);
  });

  it('separate afasta quem está perto demais e mantém dentro da caixa', () => {
    const rng = seeded(2);
    const a = createWander(1, rng);
    const b = createWander(1, rng);
    a.x = b.x = 0;
    a.z = b.z = 0;
    separate([a, b], 0.4, 1);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(0.4 - 1e-9);
    a.x = b.x = 0.89;
    a.z = b.z = 0.89;
    separate([a, b], 0.4, 1);
    expect(Math.abs(a.x)).toBeLessThanOrEqual(0.9);
    expect(Math.abs(b.x)).toBeLessThanOrEqual(0.9);
  });
});
