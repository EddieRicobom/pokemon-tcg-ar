import { describe, expect, it } from 'vitest';
import { FURNITURE } from '../core/village/life';
import { TILES } from '../core/village/map';
import { outfitFor, paintBush, paintHouse, paintPlayer, paintRock, paintShop, paintTile, paintTree } from './village-art';
import type { GroundTileImage } from './village-art';
import { paintFurnitureItem } from './item-art';
import type { PixelBuf } from '../box/ground-art';

const opaque = (b: PixelBuf) => {
  let n = 0;
  for (let i = 3; i < b.data.length; i += 4) if (b.data[i]! > 0) n++;
  return n;
};

/** Imagem sintética 32×32 com 4 quadrantes de cor diferente (pra testar `paintGroundTileImage`). */
function syntheticGroundTile(): GroundTileImage {
  const data = new Uint8ClampedArray(32 * 32 * 4);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const quad = (x < 16 ? 0 : 1) + (y < 16 ? 0 : 2);
      const i = (y * 32 + x) * 4;
      data[i] = quad * 60;
      data[i + 1] = 100;
      data[i + 2] = 50;
      data[i + 3] = 255;
    }
  }
  return { w: 32, h: 32, data };
}

describe('arte da Vila', () => {
  it('todo bloco do chão é cheio (sem buracos)', () => {
    for (const t of TILES) expect(opaque(paintTile(t, 0, 3, 4))).toBe(256);
  });

  it('com um recorte de tileset, a grama usa o pixel real da imagem (e continua sem buracos)', () => {
    const img = syntheticGroundTile();
    // (c=0,r=0) pega o quadrante (0,0) da imagem; (c=1,r=1) pega o quadrante (1,1) — e eles diferem.
    const a = paintTile('grass', 0, 0, 0, 0, img);
    const b = paintTile('grass', 0, 1, 1, 0, img);
    expect(opaque(a)).toBe(256);
    expect(opaque(b)).toBe(256);
    expect(a.data[0]).toBe(0); // quadrante (0,0): R = 0*60
    expect(b.data[0]).toBe(180); // quadrante (1,1): R = 3*60
    expect([...a.data]).not.toEqual([...b.data]);
  });

  it('sem recorte de tileset, a grama continua o ladrilho desenhado por código de sempre', () => {
    expect(opaque(paintTile('grass', 0, 2, 5))).toBe(256);
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

  it('o personagem tem 16×24, rosto e sem buracos; cada treinador veste um visual e o gorro some com o chapéu', () => {
    const o = outfitFor('dawn');
    const b = paintPlayer('down', -1, o);
    expect([b.w, b.h]).toEqual([16, 24]);
    const solid = (buf: typeof b) => {
      let n = 0;
      for (let k = 3; k < buf.data.length; k += 4) if (buf.data[k]! > 0) n++;
      return n;
    };
    expect(solid(b)).toBeGreaterThan(110);
    const looks = new Set(['dawn', 'dusk', 'night', 'ash', 'misty', 'brock', 'may', 'red', 'blue', 'leaf', 'gold', 'silver'].map((id) => JSON.stringify(outfitFor(id))));
    expect(looks.size).toBeGreaterThanOrEqual(8);
    expect(paintPlayer('down', -1, { ...o, gear: 'none' }).data.join()).not.toBe(paintPlayer('down', -1, { ...o, gear: 'cap' }).data.join());
    for (const d of ['down', 'up', 'left', 'right'] as const) for (const step of [-1, 0, 1, 2, 3]) expect(solid(paintPlayer(d, step, o)), `${d}${step}`).toBeGreaterThan(100);
  });
});
