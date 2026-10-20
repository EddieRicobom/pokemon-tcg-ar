import { describe, expect, it } from 'vitest';
import { DEFAULT_VILLAGE_SCALE, VILLAGE_AR_TILT_DEG, VILLAGE_SCALE_RANGE, normalizeVillageScale } from './ar-diorama';

describe('diorama AR da Vila', () => {
  it('limita o zoom a uma escala que ainda cabe no ambiente', () => {
    expect(normalizeVillageScale(-2)).toBe(VILLAGE_SCALE_RANGE.min);
    expect(normalizeVillageScale(9)).toBe(VILLAGE_SCALE_RANGE.max);
    expect(normalizeVillageScale('inválido')).toBe(DEFAULT_VILLAGE_SCALE);
  });

  it('permite ampliar o tamanho real da Vila até 3×', () => {
    expect(normalizeVillageScale(2.5)).toBe(2.5);
    expect(normalizeVillageScale(4)).toBe(3);
  });

  it('mantém a inclinação 2.5D do AR em 75 graus sem alterar o mapa original', () => {
    expect(VILLAGE_AR_TILT_DEG).toBe(75);
  });
});
