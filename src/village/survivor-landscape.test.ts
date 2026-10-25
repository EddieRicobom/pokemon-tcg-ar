import { describe, expect, it } from 'vitest';
import { SURVIVOR_REGIONS, REGION_DURATION_MS, survivorRegionAt } from '../core/survivor-regions';
import { ATLAS_SOURCES } from './atlas-spec';
import { SURVIVOR_REGION_TILESETS } from './survivor-landscape';

describe('tilesets regionais da Torre', () => {
  it('cada região tem recortes reais de terreno, trilha, detalhe e cobertura baixa no atlas', () => {
    const available = new Set(ATLAS_SOURCES.map((source) => source.id));
    expect(SURVIVOR_REGION_TILESETS).toHaveLength(SURVIVOR_REGIONS.length);
    for (const tiles of SURVIVOR_REGION_TILESETS) {
      expect(available.has(tiles.ground)).toBe(true);
      expect(available.has(tiles.path)).toBe(true);
      expect(available.has(tiles.detail)).toBe(true);
      expect(available.has(tiles.cover)).toBe(true);
      expect(tiles.coverDensity).toBeGreaterThan(0);
    }
  });

  it('troca o conjunto visual no mesmo marco temporal que muda a região e faz a transição gradualmente', () => {
    const before = survivorRegionAt(REGION_DURATION_MS - 40_001);
    const transition = survivorRegionAt(REGION_DURATION_MS - 20_000);
    const after = survivorRegionAt(REGION_DURATION_MS);
    expect(before.current).toBe(0);
    expect(transition).toMatchObject({ current: 0, next: 1 });
    expect(transition.blend).toBeGreaterThan(0);
    expect(transition.blend).toBeLessThan(1);
    expect(after.current).toBe(1);
    expect(SURVIVOR_REGION_TILESETS[before.current]).not.toEqual(SURVIVOR_REGION_TILESETS[after.current]);
  });

  it('combina terreno, trilha, detalhe e cobertura para que cada região tenha leitura própria', () => {
    const combinations = new Set(SURVIVOR_REGION_TILESETS.map((tiles) => `${tiles.ground}/${tiles.path}/${tiles.detail}/${tiles.cover}`));
    expect(combinations.size).toBe(SURVIVOR_REGION_TILESETS.length);
    expect(new Set(SURVIVOR_REGION_TILESETS.map((tiles) => tiles.ground)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(SURVIVOR_REGION_TILESETS.map((tiles) => tiles.detail)).size).toBeGreaterThanOrEqual(7);
    expect(SURVIVOR_REGION_TILESETS.filter((tiles) => tiles.cover === 'tall').length).toBeGreaterThanOrEqual(4);
  });
});
