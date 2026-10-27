import { describe, expect, it } from 'vitest';
import { REGION_DURATION_MS as D, REGION_TRANSITION_MS as T, SURVIVOR_REGIONS, survivorGenerationOrder, survivorRegionAt, survivorRegionLabel } from './survivor-regions';

describe('viagem regional da Torre', () => {
  it('sorteia uma ordem estável para a corrida e mantém o cenário até a transição', () => {
    const seed = 1234;
    const order = survivorGenerationOrder(seed);
    expect(survivorRegionAt(0, seed)).toEqual({ current: order[0], next: order[1], blend: 0 });
    expect(survivorRegionAt(D - T, seed).blend).toBe(0);
    expect(survivorRegionAt(D - T / 2, seed).blend).toBeCloseTo(0.5);
    expect(survivorRegionLabel(D - 1, seed)).toBe(`${SURVIVOR_REGIONS[order[0]!]!.name} → ${SURVIVOR_REGIONS[order[1]!]!.name}`);
  });
  it('visita todas as gerações sem repetir antes de fechar a volta', () => {
    const seed = 9876;
    const firstLoop = survivorGenerationOrder(seed);
    for (let i = 0; i < SURVIVOR_REGIONS.length; i++) {
      expect(survivorRegionAt(i * D, seed).current).toBe(firstLoop[i]);
      expect(survivorRegionAt((i + 1) * D - 1, seed).blend).toBeCloseTo(1);
    }
    expect(new Set(firstLoop).size).toBe(SURVIVOR_REGIONS.length);
    const secondLoop = Array.from({ length: SURVIVOR_REGIONS.length }, (_, index) => survivorRegionAt((SURVIVOR_REGIONS.length + index) * D, seed).current);
    expect(new Set(secondLoop).size).toBe(SURVIVOR_REGIONS.length);
  });
  it('normaliza tempos inválidos', () => {
    for (const t of [-1, NaN, Infinity]) expect(survivorRegionAt(t)).toEqual(survivorRegionAt(0));
  });
});
