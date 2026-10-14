import { describe, expect, it } from 'vitest';
import { applyLook, applyOutline, applyTone, DEFAULT_LOOK, isDefaultLook, lookKey, normalizeLook } from './sprite-look';

const px = (r: number, g: number, b: number, a = 255) => [r, g, b, a];
const img = (...pixels: number[][]) => new Uint8ClampedArray(pixels.flat());

describe('tom de cor', () => {
  it('normal devolve uma cópia igual', () => {
    const src = img(px(10, 20, 30), px(0, 0, 0, 0));
    const out = applyTone(src, 'normal');
    expect([...out]).toEqual([...src]);
    expect(out).not.toBe(src);
  });

  it('mono deixa R=G=B e não toca nos transparentes', () => {
    const out = applyTone(img(px(200, 50, 20), px(9, 9, 9, 0)), 'mono');
    expect(out[0]).toBe(out[1]);
    expect(out[1]).toBe(out[2]);
    expect([...out.slice(4)]).toEqual([9, 9, 9, 0]);
  });

  it('vívido aumenta a diferença entre canais e suave diminui', () => {
    const src = img(px(200, 100, 50));
    const spread = (d: Uint8ClampedArray) => d[0]! - d[2]!;
    expect(spread(applyTone(src, 'vivid'))).toBeGreaterThan(spread(src));
    expect(spread(applyTone(src, 'soft'))).toBeLessThan(spread(src));
  });

  it('sépia fica quente (R > G > B)', () => {
    const out = applyTone(img(px(100, 100, 100)), 'sepia');
    expect(out[0]!).toBeGreaterThan(out[1]!);
    expect(out[1]!).toBeGreaterThan(out[2]!);
  });
});

describe('contorno', () => {
  it('pinta os vizinhos transparentes da silhueta e deixa o fundo longe intacto', () => {
    const data = new Uint8ClampedArray(5 * 5 * 4);
    data.set(px(255, 0, 0), (2 * 5 + 2) * 4);
    applyOutline(data, 5, 5, 'white', 1);
    expect(data[(2 * 5 + 1) * 4 + 3]).toBe(255);
    expect(data[(1 * 5 + 2) * 4]).toBe(255);
    expect(data[0 * 4 + 3]).toBe(0);
    expect(data[(1 * 5 + 1) * 4 + 3]).toBe(0); // diagonal não conta (4-vizinhança)
  });

  it('applyLook com contorno aumenta a tela e cabe a borda', () => {
    const src = new Uint8ClampedArray(2 * 2 * 4);
    for (let i = 0; i < 4; i++) src.set(px(10, 200, 10), i * 4);
    const out = applyLook(src, 2, 2, { tone: 'normal', outline: 'dark' }, 2);
    expect(out.width).toBe(6);
    expect(out.height).toBe(6);
    expect(out.data[(0 * 6 + 2) * 4 + 3]).toBe(255); // a borda de cima do contorno encosta no topo
    expect(out.data[0 + 3]).toBe(0); // canto continua transparente
  });

  it('sem contorno mantém o tamanho', () => {
    const out = applyLook(new Uint8ClampedArray(16), 2, 2, DEFAULT_LOOK);
    expect([out.width, out.height]).toEqual([2, 2]);
  });
});

describe('opções', () => {
  it('normaliza valores inválidos', () => {
    expect(normalizeLook({ tone: 'xyz' as never, outline: 'gold' })).toEqual({ tone: 'normal', outline: 'gold' });
    expect(normalizeLook(undefined)).toEqual(DEFAULT_LOOK);
  });
  it('chave e padrão', () => {
    expect(isDefaultLook(DEFAULT_LOOK)).toBe(true);
    expect(isDefaultLook({ tone: 'mono', outline: 'none' })).toBe(false);
    expect(lookKey({ tone: 'mono', outline: 'gold' })).toBe('mono/gold');
  });
});
