import { describe, expect, it } from 'vitest';
import { DEFAULT_VILLAGE_SCALE, VILLAGE_SCALE_RANGE, normalizeVillageScale, villageMinimumDistance } from './ar-diorama';

describe('diorama AR da Vila', () => {
  it('limita o zoom a uma escala que ainda cabe no ambiente', () => {
    expect(normalizeVillageScale(-2)).toBe(VILLAGE_SCALE_RANGE.min);
    expect(normalizeVillageScale(9)).toBe(VILLAGE_SCALE_RANGE.max);
    expect(normalizeVillageScale('inválido')).toBe(DEFAULT_VILLAGE_SCALE);
  });

  it('aceita uma Vila menor mais perto do jogador', () => {
    expect(villageMinimumDistance(0.45)).toBeLessThan(villageMinimumDistance(1));
    expect(villageMinimumDistance(0.45)).toBeGreaterThan(0.35);
  });
});
