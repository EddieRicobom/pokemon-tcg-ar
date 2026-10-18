import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_VILLAGE_SCALE, VILLAGE_SCALE_RANGE } from '../core/village/ar-diorama';
import { normalizeVillageArSettings, resetVillageArSettingsForTests, villageArSettings } from './village-ar-settings';

describe('preferências do diorama AR da Vila', () => {
  beforeEach(() => {
    localStorage.clear();
    resetVillageArSettingsForTests();
  });

  it('normaliza o zoom guardado e preserva um valor válido', () => {
    expect(normalizeVillageArSettings({ scale: 9 }).scale).toBe(VILLAGE_SCALE_RANGE.max);
    expect(normalizeVillageArSettings({ scale: Number.NaN }).scale).toBe(DEFAULT_VILLAGE_SCALE);
    villageArSettings.scale = 0.58;
    expect(villageArSettings.scale).toBe(0.58);
  });
});
