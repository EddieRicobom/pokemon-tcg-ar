/**
 * Ampliação de sprites pequenos (os GIFs do Showdown têm ~50–150 px) antes de irem para a GPU.
 *
 * Mostrar o sprite direto com "vizinho mais próximo" deixa os degraus de pixel enormes na tela; com filtro
 * bilinear puro vira uma mancha. O meio-termo usado aqui é o Scale2x (EPX): cada pixel vira 2×2 e as
 * diagonais são suavizadas só onde há uma borda de verdade, mantendo os traços nítidos. Aplicado duas vezes
 * (×4) e seguido do filtro bilinear da GPU, a silhueta fica lisa sem borrar o desenho.
 *
 * Os modos de suavização (`SmoothingMode`) vão de "Nítido" (pixels originais) a "Macio" (Scale2x + desfoque que
 * preserva bordas + silhueta arredondada). Tudo roda na CPU, uma vez por quadro do GIF, e o resultado é guardado.
 */

export type SmoothingMode = 'nitido' | 'bordas' | 'suave' | 'macio';

export const SMOOTHING_MODES: SmoothingMode[] = ['nitido', 'bordas', 'suave', 'macio'];
export const DEFAULT_SMOOTHING: SmoothingMode = 'bordas';

export const SMOOTHING_LABELS_PT: Record<SmoothingMode, string> = {
  nitido: 'Nítido',
  bordas: 'Bordas suaves',
  suave: 'Suave',
  macio: 'Macio',
};

export const SMOOTHING_HINTS_PT: Record<SmoothingMode, string> = {
  nitido: 'Pixels originais do GIF, sem ampliar nem suavizar (visual de pixel art).',
  bordas: 'Amplia o GIF e arredonda só as diagonais do desenho (Scale2x). É o padrão.',
  suave: 'Bordas suaves, mais um desfoque leve que alisa degraus e arredonda a silhueta.',
  macio: 'O mais liso: desfoque mais forte e silhueta bem arredondada. Perde um pouco de detalhe fino.',
};

/** Aceita o valor novo ou, para configurações antigas, o antigo liga/desliga (`smooth`). */
export function normalizeSmoothing(value: unknown, legacySmooth?: boolean): SmoothingMode {
  if (SMOOTHING_MODES.includes(value as SmoothingMode)) return value as SmoothingMode;
  return legacySmooth === false ? 'nitido' : DEFAULT_SMOOTHING;
}

/** Só o "Nítido" usa o filtro de vizinho mais próximo na GPU. */
export const isLinearSmoothing = (mode: SmoothingMode): boolean => mode !== 'nitido';

/** Força do desfoque que preserva bordas (sigma de cor, passos) e do arredondamento da silhueta (passos no alfa). */
const SMOOTHING_PARAMS: Record<SmoothingMode, { sigma: number; passes: number; alphaPasses: number }> = {
  nitido: { sigma: 0, passes: 0, alphaPasses: 0 },
  bordas: { sigma: 0, passes: 0, alphaPasses: 0 },
  suave: { sigma: 48, passes: 1, alphaPasses: 1 },
  macio: { sigma: 110, passes: 2, alphaPasses: 2 },
};

export interface UpscaledImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  factor: number;
}

/** Lado maior, em pixels, que a ampliação pode produzir (memória de textura em celulares fracos). */
export const MAX_UPSCALED_SIDE = 512;

/** 1, 2 ou 4: quanto ampliar para o lado maior ficar entre ~256 e `MAX_UPSCALED_SIDE`. */
export function upscaleFactor(width: number, height: number): 1 | 2 | 4 {
  const side = Math.max(width, height);
  if (side * 4 <= MAX_UPSCALED_SIDE) return 4;
  if (side * 2 <= MAX_UPSCALED_SIDE && side < 256) return 2;
  return 1;
}

function samePixel(d: Uint8ClampedArray, a: number, b: number): boolean {
  const aa = d[a + 3]!;
  const ab = d[b + 3]!;
  if (aa === 0 && ab === 0) return true;
  return aa === ab && d[a] === d[b] && d[a + 1] === d[b + 1] && d[a + 2] === d[b + 2];
}

/** Scale2x (EPX) em RGBA; pixels totalmente transparentes contam como iguais entre si. */
export function scale2x(src: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const ow = width * 2;
  const out = new Uint8ClampedArray(ow * height * 2 * 4);
  const at = (x: number, y: number) => (Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))) * 4;
  const put = (x: number, y: number, from: number) => {
    const o = (y * ow + x) * 4;
    out[o] = src[from]!;
    out[o + 1] = src[from + 1]!;
    out[o + 2] = src[from + 2]!;
    out[o + 3] = src[from + 3]!;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = at(x, y);
      const up = at(x, y - 1);
      const down = at(x, y + 1);
      const left = at(x - 1, y);
      const right = at(x + 1, y);
      let e0 = p;
      let e1 = p;
      let e2 = p;
      let e3 = p;
      if (!samePixel(src, up, down) && !samePixel(src, left, right)) {
        if (samePixel(src, left, up)) e0 = left;
        if (samePixel(src, up, right)) e1 = right;
        if (samePixel(src, left, down)) e2 = left;
        if (samePixel(src, down, right)) e3 = right;
      }
      put(x * 2, y * 2, e0);
      put(x * 2 + 1, y * 2, e1);
      put(x * 2, y * 2 + 1, e2);
      put(x * 2 + 1, y * 2 + 1, e3);
    }
  }
  return out;
}

/**
 * Copia a cor dos pixels opacos vizinhos para os transparentes (alfa continua 0). Sem isso, o filtro bilinear
 * mistura a cor preta "escondida" dos pixels transparentes na borda do sprite e aparece um contorno escuro.
 */
export function bleedTransparent(data: Uint8ClampedArray, width: number, height: number, passes = 2): void {
  // `known` marca os pixels cuja cor é confiável: os opacos e, a cada passo, os transparentes já preenchidos.
  let known = new Uint8Array(width * height);
  for (let i = 0; i < known.length; i++) known[i] = data[i * 4 + 3] !== 0 ? 1 : 0;
  for (let pass = 0; pass < passes; pass++) {
    const nextKnown = new Uint8Array(known);
    const updates: [number, number, number, number][] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (known[index]) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const j = ny * width + nx;
            if (!known[j]) continue;
            r += data[j * 4]!;
            g += data[j * 4 + 1]!;
            b += data[j * 4 + 2]!;
            n++;
          }
        }
        if (n > 0) {
          updates.push([index, Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
          nextKnown[index] = 1;
        }
      }
    }
    for (const [index, r, g, b] of updates) {
      data[index * 4] = r;
      data[index * 4 + 1] = g;
      data[index * 4 + 2] = b;
    }
    known = nextKnown;
  }
}

const RANGE_STEP = 64;
const RANGE_LUT_CACHE = new Map<number, Float32Array>();

/** Peso por diferença de cor (distância² em RGB, em passos de 64): quanto mais diferente, menos entra na média. */
function rangeLut(sigma: number): Float32Array {
  let lut = RANGE_LUT_CACHE.get(sigma);
  if (!lut) {
    const size = Math.ceil((3 * 255 * 255) / RANGE_STEP) + 1;
    lut = new Float32Array(size);
    for (let i = 0; i < size; i++) lut[i] = Math.exp(-(i * RANGE_STEP) / (2 * sigma * sigma));
    RANGE_LUT_CACHE.set(sigma, lut);
  }
  return lut;
}

/**
 * Desfoque 3×3 que preserva bordas (filtro bilateral): cada pixel vira a média dos vizinhos, com peso menor
 * para quem tem cor muito diferente. Alisa degraus e ruído sem apagar os contornos do desenho. Só mexe na cor.
 */
export function edgePreservingBlur(src: Uint8ClampedArray, width: number, height: number, sigma: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src);
  const lut = rangeLut(sigma);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (src[i + 3] === 0) continue;
      const r0 = src[i]!;
      const g0 = src[i + 1]!;
      const b0 = src[i + 2]!;
      let r = 0;
      let g = 0;
      let b = 0;
      let total = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const j = (ny * width + nx) * 4;
          const dr = src[j]! - r0;
          const dg = src[j + 1]! - g0;
          const db = src[j + 2]! - b0;
          const spatial = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
          const w = spatial * lut[Math.min(lut.length - 1, ((dr * dr + dg * dg + db * db) / RANGE_STEP) | 0)]!;
          r += src[j]! * w;
          g += src[j + 1]! * w;
          b += src[j + 2]! * w;
          total += w;
        }
      }
      out[i] = Math.round(r / total);
      out[i + 1] = Math.round(g / total);
      out[i + 2] = Math.round(b / total);
    }
  }
  return out;
}

/**
 * Desfoca o canal alfa (média 3×3). Como a GPU corta a transparência em 50 % (`alphaTest`), os cantos viram
 * curvas e a silhueta perde os degraus. A cor dos pixels que ganham alfa precisa ter sido espalhada antes.
 */
export function smoothAlpha(data: Uint8ClampedArray, width: number, height: number): void {
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]!;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = Math.min(height - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) sum += alpha[ny * width + Math.min(width - 1, Math.max(0, x + dx))]!;
      }
      data[(y * width + x) * 4 + 3] = Math.round(sum / 9);
    }
  }
}

/** Amplia o quadro (Scale2x repetido) e aplica o modo de suavização. `nitido` devolve o quadro como está. */
export function upscaleSprite(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  maxFactor: 1 | 2 | 4 = 4,
  mode: SmoothingMode = DEFAULT_SMOOTHING,
): UpscaledImage {
  if (mode === 'nitido') return { data: new Uint8ClampedArray(rgba), width, height, factor: 1 };
  const factor = Math.min(upscaleFactor(width, height), maxFactor) as 1 | 2 | 4;
  let data = rgba;
  let w = width;
  let h = height;
  for (let f = factor; f > 1; f /= 2) {
    data = scale2x(data, w, h);
    w *= 2;
    h *= 2;
  }
  if (factor === 1) data = new Uint8ClampedArray(data);
  bleedTransparent(data, w, h, 2);
  const params = SMOOTHING_PARAMS[mode];
  for (let pass = 0; pass < params.passes; pass++) data = edgePreservingBlur(data, w, h, params.sigma);
  for (let pass = 0; pass < params.alphaPasses; pass++) smoothAlpha(data, w, h);
  return { data, width: w, height: h, factor };
}
