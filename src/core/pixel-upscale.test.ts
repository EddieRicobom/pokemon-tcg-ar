import { describe, expect, it } from 'vitest';
import { bleedTransparent, DEFAULT_SMOOTHING, edgePreservingBlur, isLinearSmoothing, normalizeSmoothing, scale2x, SMOOTHING_MODES, smoothAlpha, upscaleFactor, upscaleSprite } from './pixel-upscale';

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

describe('modos de suavização', () => {
  /** Quadrado opaco vermelho de 1 pixel no meio de uma imagem 3×3 transparente. */
  const dot = () => {
    const data = new Uint8ClampedArray(3 * 3 * 4);
    data.set([255, 0, 0, 255], 4 * 4);
    return data;
  };
  const alphaAt = (d: Uint8ClampedArray, w: number, x: number, y: number) => d[(y * w + x) * 4 + 3]!;

  it('normaliza valores, inclusive o liga/desliga antigo', () => {
    expect(normalizeSmoothing('macio')).toBe('macio');
    expect(normalizeSmoothing('xyz')).toBe(DEFAULT_SMOOTHING);
    expect(normalizeSmoothing(undefined, false)).toBe('nitido');
    expect(normalizeSmoothing(undefined, true)).toBe(DEFAULT_SMOOTHING);
    expect(normalizeSmoothing('suave', false)).toBe('suave');
    expect(SMOOTHING_MODES.filter(isLinearSmoothing)).toEqual(['bordas', 'suave', 'macio']);
  });

  it('nítido não amplia nem mexe nos pixels', () => {
    const src = dot();
    const out = upscaleSprite(src, 3, 3, 4, 'nitido');
    expect(out.factor).toBe(1);
    expect(out.width).toBe(3);
    expect(Array.from(out.data)).toEqual(Array.from(src));
  });

  it('bordas, suave e macio ampliam igual; só o acabamento muda', () => {
    const base = upscaleSprite(dot(), 3, 3, 4, 'bordas');
    for (const mode of ['suave', 'macio'] as const) {
      const out = upscaleSprite(dot(), 3, 3, 4, mode);
      expect([out.width, out.height, out.factor]).toEqual([base.width, base.height, base.factor]);
    }
  });

  it('suave e macio criam um contorno gradual no alfa; bordas suaves deixam o alfa só 0 ou 255', () => {
    const partial = (d: Uint8ClampedArray) => {
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]! > 0 && d[i]! < 255) n++;
      return n;
    };
    expect(partial(upscaleSprite(dot(), 3, 3, 4, 'bordas').data)).toBe(0);
    const suave = partial(upscaleSprite(dot(), 3, 3, 4, 'suave').data);
    const macio = partial(upscaleSprite(dot(), 3, 3, 4, 'macio').data);
    expect(suave).toBeGreaterThan(0);
    expect(macio).toBeGreaterThan(suave);
    // O miolo da figura continua praticamente opaco em todos os modos.
    for (const mode of SMOOTHING_MODES.filter(isLinearSmoothing)) expect(alphaAt(upscaleSprite(dot(), 3, 3, 4, mode).data, 12, 5, 5)).toBeGreaterThan(150);
  });

  it('o desfoque que preserva bordas alisa degraus suaves mas não mistura cores muito diferentes', () => {
    // 3×1: cinza 100, cinza 110, vermelho puro. O 100 e o 110 se aproximam; o vermelho quase não entra.
    const src = new Uint8ClampedArray([100, 100, 100, 255, 110, 110, 110, 255, 255, 0, 0, 255]);
    const out = edgePreservingBlur(src, 3, 1, 30);
    expect(out[0]).toBeGreaterThan(100);
    expect(out[0]).toBeLessThan(110);
    expect(out[8]).toBeGreaterThan(240); // vermelho continua vermelho
    expect(out[3]).toBe(255);
  });

  it('o desfoque ignora pixels transparentes e mantém o alfa', () => {
    const src = new Uint8ClampedArray([10, 20, 30, 0, 200, 100, 50, 255]);
    const out = edgePreservingBlur(src, 2, 1, 60);
    expect(Array.from(out.slice(0, 4))).toEqual([10, 20, 30, 0]);
    expect(out[3 + 4]).toBe(255);
  });

  it('smoothAlpha espalha o alfa e não passa de 255', () => {
    const data = new Uint8ClampedArray(3 * 1 * 4);
    data.set([0, 0, 0, 255], 4);
    smoothAlpha(data, 3, 1);
    expect(data[3]).toBeGreaterThan(0);
    expect(data[7]).toBeLessThanOrEqual(255);
  });
});
