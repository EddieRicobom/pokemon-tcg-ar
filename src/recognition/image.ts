import type { FractionBox, RgbaImage } from './types';

export function toGray(image: RgbaImage): Float32Array {
  const { width, height, data } = image;
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * (data[p] ?? 0) + 0.587 * (data[p + 1] ?? 0) + 0.114 * (data[p + 2] ?? 0);
  }
  return gray;
}

/** Amostra bilinear de um canal único. */
export function sampleBilinear(
  src: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const cx = Math.min(Math.max(x, 0), width - 1);
  const cy = Math.min(Math.max(y, 0), height - 1);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = cx - x0;
  const fy = cy - y0;
  const a = src[y0 * width + x0] ?? 0;
  const b = src[y0 * width + x1] ?? 0;
  const c = src[y1 * width + x0] ?? 0;
  const d = src[y1 * width + x1] ?? 0;
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

/** Reduz a imagem por média de caixa (adequado para reduzir muito sem aliasing). */
export function resizeAverage(image: RgbaImage, width: number, height: number): RgbaImage {
  const out = new Uint8ClampedArray(width * height * 4);
  const sx = image.width / width;
  const sy = image.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.min(image.height, Math.ceil((y + 1) * sy)));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.min(image.width, Math.ceil((x + 1) * sx)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const p = (yy * image.width + xx) * 4;
          r += image.data[p] ?? 0;
          g += image.data[p + 1] ?? 0;
          b += image.data[p + 2] ?? 0;
          a += image.data[p + 3] ?? 0;
          n++;
        }
      }
      const o = (y * width + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = a / n;
    }
  }
  return { width, height, data: out };
}

/** Limita o lado maior, devolvendo a escala aplicada (1 = sem mudança). */
export function limitSide(image: RgbaImage, maxSide: number): { image: RgbaImage; scale: number } {
  const longest = Math.max(image.width, image.height);
  if (longest <= maxSide) return { image, scale: 1 };
  const scale = maxSide / longest;
  return {
    image: resizeAverage(image, Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale))),
    scale,
  };
}

export function cropFraction(image: RgbaImage, box: FractionBox): RgbaImage {
  const x0 = Math.max(0, Math.round(box[0] * image.width));
  const y0 = Math.max(0, Math.round(box[1] * image.height));
  const x1 = Math.min(image.width, Math.round(box[2] * image.width));
  const y1 = Math.min(image.height, Math.round(box[3] * image.height));
  const width = Math.max(1, x1 - x0);
  const height = Math.max(1, y1 - y0);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const from = ((y0 + y) * image.width + x0) * 4;
    data.set(image.data.subarray(from, from + width * 4), y * width * 4);
  }
  return { width, height, data };
}

/** Desfoque de caixa 3×3 separável sobre um canal. */
export function boxBlur(src: Float32Array, width: number, height: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const l = src[y * width + Math.max(0, x - 1)] ?? 0;
      const c = src[y * width + x] ?? 0;
      const r = src[y * width + Math.min(width - 1, x + 1)] ?? 0;
      tmp[y * width + x] = (l + c + r) / 3;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = tmp[Math.max(0, y - 1) * width + x] ?? 0;
      const c = tmp[y * width + x] ?? 0;
      const d = tmp[Math.min(height - 1, y + 1) * width + x] ?? 0;
      out[y * width + x] = (u + c + d) / 3;
    }
  }
  return out;
}
