import { sampleBilinear } from './image';
import type { Point, Quad, RgbaImage } from './types';

/**
 * Resolve a homografia 3×3 (h33 = 1) que leva 4 pontos de origem a 4 de destino,
 * por eliminação de Gauss com pivotamento. Devolve null se for degenerada.
 */
export function homographyFromPoints(from: readonly Point[], to: readonly Point[]): number[] | null {
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const s = from[i];
    const d = to[i];
    if (!s || !d) return null;
    a.push([s.x, s.y, 1, 0, 0, 0, -d.x * s.x, -d.x * s.y, d.x]);
    a.push([0, 0, 0, s.x, s.y, 1, -d.y * s.x, -d.y * s.y, d.y]);
  }
  const n = 8;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row]![col]!) > Math.abs(a[pivot]![col]!)) pivot = row;
    }
    if (Math.abs(a[pivot]![col]!) < 1e-10) return null;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row]![col]! / a[col]![col]!;
      for (let k = col; k <= n; k++) a[row]![k]! -= factor * a[col]![k]!;
    }
  }
  const h = a.map((row, i) => row[n]! / row[i]!);
  h.push(1);
  return h;
}

export function applyHomography(h: readonly number[], p: Point): Point {
  const w = h[6]! * p.x + h[7]! * p.y + h[8]!;
  return {
    x: (h[0]! * p.x + h[1]! * p.y + h[2]!) / w,
    y: (h[3]! * p.x + h[4]! * p.y + h[5]!) / w,
  };
}

/**
 * Corrige a perspectiva: devolve a região `quad` da imagem como um retângulo
 * `width × height` (amostragem bilinear por canal).
 */
export function rectify(image: RgbaImage, quad: Quad, width: number, height: number): RgbaImage | null {
  const destination: Point[] = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ];
  // Mapeia destino → origem para amostrar sem buracos.
  const h = homographyFromPoints(destination, quad);
  if (!h) return null;
  const channels = [0, 1, 2].map((channel) => {
    const plane = new Float32Array(image.width * image.height);
    for (let i = 0; i < plane.length; i++) plane[i] = image.data[i * 4 + channel] ?? 0;
    return plane;
  });
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = applyHomography(h, { x, y });
      const o = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        out[o + c] = sampleBilinear(channels[c]!, image.width, image.height, p.x, p.y);
      }
      out[o + 3] = 255;
    }
  }
  return { width, height, data: out };
}

