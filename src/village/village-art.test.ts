import { describe, expect, it } from 'vitest';
import { FURNITURE } from '../core/village/life';
import { TILES } from '../core/village/map';
import { outfitFor, paintBush, paintHouse, paintPlayer, paintRock, paintShop, paintTile, paintTree } from './village-art';
import { paintFurnitureItem } from './item-art';
import type { PixelBuf } from '../box/ground-art';

const opaque = (b: PixelBuf) => {
  let n = 0;
  for (let i = 3; i < b.data.length; i += 4) if (b.data[i]! > 0) n++;
  return n;
};

describe('arte da Vila', () => {
  it('todo bloco do chão é cheio (sem buracos)', () => {
    for (const t of TILES) expect(opaque(paintTile(t, 0, 3, 4))).toBe(256);
  });

  it('a água muda entre quadros e ganha espuma na beira', () => {
    expect([...paintTile('water', 0, 1, 1, 0).data]).not.toEqual([...paintTile('water', 0, 1, 1, 1).data]);
    expect([...paintTile('water', 1, 1, 1, 0).data]).not.toEqual([...paintTile('water', 0, 1, 1, 0).data]);
  });

  it('objetos têm fundo transparente e desenho de verdade', () => {
    for (const b of [paintTree(0), paintTree(2), paintRock(), paintBush(true), ...FURNITURE.map((f) => paintFurnitureItem(f)), paintShop()]) {
      const n = opaque(b);
      expect(n).toBeGreaterThan(30);
      expect(n).toBeLessThan(b.w * b.h);
    }
    expect(opaque(paintBush(true))).toBeGreaterThan(0);
    expect([...paintBush(true).data]).not.toEqual([...paintBush(false).data]);
    expect([...paintFurnitureItem('luminaria', true).data]).not.toEqual([...paintFurnitureItem('luminaria', false).data]);
  });

  it('a casa muda a cada nível (0 = terreno vazio)', () => {
    expect(opaque(paintHouse(0))).toBe(0);
    const levels = [1, 2, 3, 4].map((l) => paintHouse(l).data.join());
    expect(new Set(levels).size).toBe(4);
  });

  it('o personagem vira para os quatro lados, mexe as pernas e usa as cores do treinador', () => {
    const o = outfitFor('dawn');
    const frames = (['down', 'up', 'left', 'right'] as const).map((d) => paintPlayer(d, -1, o).data.join());
    expect(new Set(frames).size).toBe(4);
    expect(paintPlayer('down', 1, o).data.join()).not.toBe(paintPlayer('down', 2, o).data.join());
    expect(outfitFor('dawn')).toEqual(o);
  });
});
