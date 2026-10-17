import { describe, expect, it } from 'vitest';
import { ATLAS_SOURCES, ATLAS_W, packAtlas } from './atlas-spec';
import { cropRgba, recolor, VillaAtlas, windowGlow } from './tileset-art';

const px = (...rgba: number[][]) => ({ w: rgba.length, h: 1, data: new Uint8ClampedArray(rgba.flat()) });

describe('atlas da Vila', () => {
  it('posições determinísticas, sem sobreposição e dentro da largura', () => {
    const { rects, h } = packAtlas();
    expect(rects.size).toBe(ATLAS_SOURCES.length);
    const list = [...rects.values()];
    for (const a of list) {
      expect(a.x + a.w).toBeLessThanOrEqual(ATLAS_W);
      expect(a.y + a.h).toBeLessThanOrEqual(h);
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
      }
    }
    expect(packAtlas().h).toBe(h);
  });

  it('ids únicos e autotiles reduzidos pela metade', () => {
    expect(new Set(ATLAS_SOURCES.map((s) => s.id)).size).toBe(ATLAS_SOURCES.length);
    expect(packAtlas().rects.get('at-path')).toMatchObject({ w: 48, h: 64 });
  });

  it('recusa imagem menor que o atlas esperado (arquivo velho ou errado)', () => {
    expect(() => new VillaAtlas({ w: 10, h: 10, data: new Uint8ClampedArray(400) })).toThrow();
  });

  it('recorta o pedaço certo', () => {
    const img = { w: 2, h: 2, data: new Uint8ClampedArray([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]) };
    expect([...cropRgba(img, { x: 1, y: 1, w: 1, h: 1 }).data]).toEqual([4, 4, 4, 4]);
  });
});

describe('cor da casa e janelas acesas', () => {
  it('troca a matiz só do que é colorido; cinza, branco e vidro ficam', () => {
    const out = recolor(px([230, 190, 40, 255], [128, 128, 128, 255], [255, 255, 255, 255], [150, 200, 240, 255], [0, 0, 0, 0]), 0x3f6fd0);
    const [r, g, b] = [...out.data.slice(0, 3)];
    expect(b!).toBeGreaterThan(r!); // amarelo virou azul
    expect(b!).toBeGreaterThan(g!);
    expect([...out.data.slice(4, 8)]).toEqual([128, 128, 128, 255]);
    expect([...out.data.slice(8, 12)]).toEqual([255, 255, 255, 255]);
    expect([...out.data.slice(12, 16)]).toEqual([150, 200, 240, 255]);
    expect(out.data[19]).toBe(0);
  });

  it('acende só o vidro', () => {
    const out = windowGlow(px([150, 200, 240, 255], [230, 190, 40, 255], [150, 200, 240, 0]));
    expect(out.data[3]).toBe(255);
    expect(out.data[7]).toBe(0);
    expect(out.data[11]).toBe(0);
  });
});
