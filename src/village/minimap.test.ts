import { describe, expect, it } from 'vitest';
import { generateVillage, TILES } from '../core/village/map';
import { MINI_COLORS, minimapPixels, minimapTileAt } from './minimap';

describe('minimapa da Vila', () => {
  it('todo tipo de chão tem cor, e água, rua e mata se distinguem', () => {
    for (const t of TILES) expect(MINI_COLORS[t], t).toBeTypeOf('number');
    expect(new Set([MINI_COLORS.water, MINI_COLORS.path, MINI_COLORS.tree, MINI_COLORS.building]).size).toBe(4);
  });

  it('um pixel por bloco, opaco, com a cor do chão', () => {
    const map = generateVillage(20261014);
    const px = minimapPixels(map);
    expect(px.length).toBe(map.w * map.h * 4);
    const i = map.spawn.y * map.w + map.spawn.x;
    const rgb = MINI_COLORS[map.tiles[i]!];
    expect([px[i * 4], px[i * 4 + 1], px[i * 4 + 2], px[i * 4 + 3]]).toEqual([(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, 255]);
  });

  it('um toque no minimapa vira o bloco certo (e fora dele, nada)', () => {
    const map = { w: 96, h: 72 };
    expect(minimapTileAt(map, 0, 0, 192, 144)).toEqual({ x: 0, y: 0 });
    expect(minimapTileAt(map, 191, 143, 192, 144)).toEqual({ x: 95, y: 71 });
    expect(minimapTileAt(map, 96, 72, 192, 144)).toEqual({ x: 48, y: 36 });
    expect(minimapTileAt(map, -1, 5, 192, 144)).toBeNull();
    expect(minimapTileAt(map, 5, 5, 0, 144)).toBeNull();
  });
});
