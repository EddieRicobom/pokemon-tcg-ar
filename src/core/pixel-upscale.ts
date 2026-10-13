/**
 * Ampliação de sprites pequenos (os GIFs do Showdown têm ~50–150 px) antes de irem para a GPU.
 *
 * Mostrar o sprite direto com "vizinho mais próximo" deixa os degraus de pixel enormes na tela; com filtro
 * bilinear puro vira uma mancha. O meio-termo usado aqui é o Scale2x (EPX): cada pixel vira 2×2 e as
 * diagonais são suavizadas só onde há uma borda de verdade, mantendo os traços nítidos. Aplicado duas vezes
 * (×4) e seguido do filtro bilinear da GPU, a silhueta fica lisa sem borrar o desenho.
 */

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

/** Amplia o quadro (Scale2x repetido) e prepara as bordas para o filtro bilinear. */
export function upscaleSprite(rgba: Uint8ClampedArray, width: number, height: number): UpscaledImage {
  const factor = upscaleFactor(width, height);
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
  return { data, width: w, height: h, factor };
}
