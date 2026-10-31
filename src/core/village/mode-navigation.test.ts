import { describe, expect, it } from 'vitest';
import { generateVillage } from './map';
import { VILLAGE_GAME_MENU } from './mode-navigation';

describe('atalhos dos modos da Vila', () => {
  it('inclui cada modo abrível, inclusive a Masmorra', () => {
    const map = generateVillage(20261031);
    expect(VILLAGE_GAME_MENU.map((place) => place.kind)).toEqual(['arcade', 'arena', 'torre', 'masmorra']);
    for (const place of VILLAGE_GAME_MENU) expect(map.buildings.some((building) => building.kind === place.kind), place.label).toBe(true);
  });
});
