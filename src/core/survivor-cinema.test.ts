import { describe, expect, it } from 'vitest';
import { cinemaLook, cinemaPower } from './survivor-cinema';

describe('luz cinematográfica da Torre', () => {
  it('cresce com o tempo e o nível, e chega ao máximo no fim da corrida', () => {
    const start = cinemaPower({ progressMs: 0, level: 1, bossOnField: false });
    const middle = cinemaPower({ progressMs: 10 * 60_000, level: 15, bossOnField: false });
    const end = cinemaPower({ progressMs: 20 * 60_000, level: 41, bossOnField: false });
    expect(start).toBe(0);
    expect(middle).toBeGreaterThan(start);
    expect(end).toBeGreaterThan(middle);
    expect(end).toBeCloseTo(1);
    expect(cinemaPower({ progressMs: 90 * 60_000, level: 99, bossOnField: true })).toBe(1);
  });

  it('chefão em campo pesa a cena', () => {
    const calm = cinemaPower({ progressMs: 60_000, level: 2, bossOnField: false });
    expect(cinemaPower({ progressMs: 60_000, level: 2, bossOnField: true })).toBeGreaterThan(calm);
  });

  it('no começo é leve e no fim é noite vermelha', () => {
    const early = cinemaLook(0, false);
    const finale = cinemaLook(1, false);
    expect(early.finale).toBe(false);
    expect(finale.dark).toBeGreaterThan(early.dark * 3);
    expect(finale.tint[0]).toBeGreaterThan(finale.tint[2]);
    expect(early.tint[2]).toBeGreaterThan(early.tint[0]);
    expect(finale.finale).toBe(true);
  });

  it('os limites por quadro têm teto, e o modo leve corta pela metade', () => {
    const full = cinemaLook(1, false);
    const lite = cinemaLook(1, true);
    expect(full.glows).toBeLessThanOrEqual(36);
    expect(full.shadows).toBeLessThanOrEqual(40);
    expect(lite.glows).toBeLessThanOrEqual(full.glows / 2 + 1);
    expect(lite.shadows).toBeLessThanOrEqual(full.shadows / 2 + 1);
  });
});
