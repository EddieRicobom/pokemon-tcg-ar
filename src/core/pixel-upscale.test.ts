import { describe, expect, it } from 'vitest';
import { bleedTransparent, scale2x, upscaleFactor, upscaleSprite } from './pixel-upscale';

const px = (r: number, g: number, b: number, a = 255) => [r, g, b, a];
function image(rows: number[][][]): { data: Uint8ClampedArray; width: number; height: number } {
  const height = rows.length;
  const width = rows[0]!.length;
  return { data: new Uint8ClampedArray(rows.flat(2)), width, height };
}
const at = (data: Uint8ClampedArray, width: number, x: number, y: number) => Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));

describe('fator de ampliação', () => {
  it('amplia ×4 sprites pequenos, ×2 médios e não mexe nos grandes', () => {
    expect(upscaleFactor(96, 96)).toBe(4);
    expect(upscaleFactor(128, 100)).toBe(4);
    expect(upscaleFactor(200, 180)).toBe(2);
    expect(upscaleFactor(300, 300)).toBe(1);
  });
});

describe('Scale2x', () => {
  const W = px(255, 255, 255);
  const K = px(0, 0, 0);
  it('cada pixel vira um bloco 2×2 (cor sólida fica igual)', () => {
    const img = image([[W, W], [W, W]]);
    const out = scale2x(img.data, 2, 2);
    expect(out.length).toBe(4 * 4 * 4);
    for (let i = 0; i < out.length; i++) expect(out[i]).toBe(255);
  });
  it('suaviza o degrau de uma diagonal (canto interno ganha o pixel vizinho)', () => {
    // Diagonal de preto sobre branco: o pixel do meio fica com cantos "cortados" nos dois lados.
    const img = image([
      [K, K, W],
      [K, W, W],
      [W, W, W],
    ]);
    const out = scale2x(img.data, 3, 3);
    // Pixel central (1,1) é branco; seu canto superior esquerdo (2,2) encosta no preto de cima e da esquerda.
    expect(at(out, 6, 2, 2)).toEqual(K);
    // Os outros três cantos continuam brancos.
    expect(at(out, 6, 3, 2)).toEqual(W);
    expect(at(out, 6, 2, 3)).toEqual(W);
    expect(at(out, 6, 3, 3)).toEqual(W);
  });
  it('não inventa bordas em linhas retas', () => {
    const img = image([[K, K], [W, W]]);
    const out = scale2x(img.data, 2, 2);
    expect(at(out, 4, 0, 1)).toEqual(K);
    expect(at(out, 4, 0, 2)).toEqual(W);
  });
  it('pixels transparentes valem como iguais, mesmo com cores escondidas diferentes', () => {
    const T1 = px(10, 20, 30, 0);
    const T2 = px(200, 0, 0, 0);
    const img = image([[T1, T2], [T2, T1]]);
    const out = scale2x(img.data, 2, 2);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(0);
  });
});

describe('bordas para o filtro bilinear', () => {
  it('pixels transparentes herdam a cor do vizinho opaco (alfa continua 0)', () => {
    const img = image([[px(255, 0, 0), px(0, 0, 0, 0), px(0, 0, 0, 0)]]);
    bleedTransparent(img.data, 3, 1, 2);
    expect(at(img.data, 3, 1, 0)).toEqual([255, 0, 0, 0]);
    expect(at(img.data, 3, 2, 0)).toEqual([255, 0, 0, 0]);
  });
  it('não mexe nos pixels opacos', () => {
    const img = image([[px(1, 2, 3), px(4, 5, 6)]]);
    bleedTransparent(img.data, 2, 1);
    expect(Array.from(img.data)).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
  });
});

describe('upscaleSprite', () => {
  it('amplia 4× e devolve as dimensões novas sem alterar o original', () => {
    const img = image([[px(255, 0, 0), px(0, 0, 255)]]);
    const copy = Array.from(img.data);
    const up = upscaleSprite(img.data, 2, 1);
    expect(up).toMatchObject({ width: 8, height: 4, factor: 4 });
    expect(up.data.length).toBe(8 * 4 * 4);
    expect(Array.from(img.data)).toEqual(copy);
    expect(at(up.data, 8, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(at(up.data, 8, 7, 3)).toEqual([0, 0, 255, 255]);
  });
  it('sprite grande só é copiado (fator 1)', () => {
    const data = new Uint8ClampedArray(300 * 300 * 4).fill(200);
    const up = upscaleSprite(data, 300, 300);
    expect(up).toMatchObject({ width: 300, height: 300, factor: 1 });
    expect(up.data).not.toBe(data);
  });
});
