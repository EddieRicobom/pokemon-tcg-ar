import { describe, expect, it } from 'vitest';
import { addCrater, cinemaLook, cinemaPower, MAX_CRATERS } from './survivor-cinema';
import type { Crater } from './survivor-cinema';

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

  it('as crateras ficam, têm teto e crescem com a corrida', () => {
    const list: Crater[] = [];
    for (let i = 0; i < MAX_CRATERS + 10; i++) addCrater(list, i, 0, 60, 0, i);
    expect(list).toHaveLength(MAX_CRATERS);
    expect(list[0]!.x).toBe(10);
    const late: Crater[] = [];
    addCrater(late, 0, 0, 60, 1, 0);
    expect(late[0]!.r).toBeGreaterThan(list[0]!.r);
  });

  it('chefão em campo pesa a cena', () => {
    const calm = cinemaPower({ progressMs: 60_000, level: 2, bossOnField: false });
    expect(cinemaPower({ progressMs: 60_000, level: 2, bossOnField: true })).toBeGreaterThan(calm);
  });

  it('no começo é leve e no fim é noite vermelha, com raios e fagulhas', () => {
    const early = cinemaLook(0, false);
    const finale = cinemaLook(1, false);
    expect(early.rays).toBe(0);
    expect(early.embers).toBe(0);
    expect(early.finale).toBe(false);
    expect(finale.dark).toBeGreaterThan(early.dark * 3);
    expect(finale.tint[0]).toBeGreaterThan(finale.tint[2]);
    expect(early.tint[2]).toBeGreaterThan(early.tint[0]);
    expect(finale.rays).toBeGreaterThan(0);
    expect(finale.finale).toBe(true);
  });

  it('os limites por quadro têm teto, e o modo leve corta pela metade', () => {
    const full = cinemaLook(1, false);
    const lite = cinemaLook(1, true);
    expect(full.glows).toBeLessThanOrEqual(36);
    expect(full.shadows).toBeLessThanOrEqual(40);
    expect(full.embers).toBeLessThanOrEqual(30);
    expect(lite.glows).toBeLessThanOrEqual(full.glows / 2 + 1);
    expect(lite.embers).toBeLessThanOrEqual(full.embers / 2 + 1);
    expect(lite.rays).toBeLessThan(full.rays);
  });
});
