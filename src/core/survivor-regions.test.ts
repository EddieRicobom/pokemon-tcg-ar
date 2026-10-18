import { describe, expect, it } from 'vitest';
import { REGION_DURATION_MS as D, REGION_TRANSITION_MS as T, SURVIVOR_REGIONS, survivorRegionAt, survivorRegionLabel } from './survivor-regions';

describe('viagem regional da Torre', () => {
  it('começa em Kanto e mantém o cenário até a transição', () => {
    expect(survivorRegionAt(0)).toEqual({ current: 0, next: 1, blend: 0 });
    expect(survivorRegionAt(D - T).blend).toBe(0);
    expect(survivorRegionAt(D - T / 2).blend).toBeCloseTo(0.5);
    expect(survivorRegionLabel(D - 1)).toBe('Kanto → Johto');
  });
  it('visita todas as regiões antes do chefão e fecha o ciclo sem salto', () => {
    for (let i = 0; i < SURVIVOR_REGIONS.length; i++) {
      expect(survivorRegionAt(i * D).current).toBe(i);
      expect(survivorRegionAt((i + 1) * D - 1).blend).toBeCloseTo(1);
    }
    expect(survivorRegionAt(20 * 60_000).current).toBe(8);
    expect(survivorRegionAt(D * SURVIVOR_REGIONS.length).current).toBe(0);
  });
  it('normaliza tempos inválidos', () => {
    for (const t of [-1, NaN, Infinity]) expect(survivorRegionAt(t)).toEqual(survivorRegionAt(0));
  });
});
