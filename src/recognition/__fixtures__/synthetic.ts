import { applyHomography, homographyFromPoints } from '../homography';
import { CARD_HEIGHT_PX, CARD_WIDTH_PX } from '../types';
import type { Point, Quad, RgbaImage } from '../types';

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fill(image: RgbaImage, x0: number, y0: number, x1: number, y1: number, rgb: [number, number, number]): void {
  for (let y = Math.max(0, Math.round(y0)); y < Math.min(image.height, Math.round(y1)); y++) {
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(image.width, Math.round(x1)); x++) {
      const o = (y * image.width + x) * 4;
      image.data[o] = rgb[0];
      image.data[o + 1] = rgb[1];
      image.data[o + 2] = rgb[2];
      image.data[o + 3] = 255;
    }
  }
}

/** Carta sintética 630×880: borda amarela, janela de arte com blocos coloridos da semente. */
export function syntheticCard(seed: number): RgbaImage {
  const image: RgbaImage = {
    width: CARD_WIDTH_PX,
    height: CARD_HEIGHT_PX,
    data: new Uint8ClampedArray(CARD_WIDTH_PX * CARD_HEIGHT_PX * 4),
  };
  const random = prng(seed);
  fill(image, 0, 0, CARD_WIDTH_PX, CARD_HEIGHT_PX, [232, 192, 64]);
  fill(image, 28, 28, CARD_WIDTH_PX - 28, CARD_HEIGHT_PX - 28, [244, 236, 214]);
  // Arte: grade de blocos com cores da semente.
  const art = { x0: 40, y0: 90, x1: CARD_WIDTH_PX - 40, y1: 480 };
  const cols = 6;
  const rows = 6;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const color: [number, number, number] = [random() * 255, random() * 255, random() * 255];
      fill(
        image,
        art.x0 + ((art.x1 - art.x0) / cols) * c,
        art.y0 + ((art.y1 - art.y0) / rows) * r,
        art.x0 + ((art.x1 - art.x0) / cols) * (c + 1),
        art.y0 + ((art.y1 - art.y0) / rows) * (r + 1),
        color,
      );
    }
  }
  // Barras que imitam texto, para dar textura ao corpo da carta.
  for (let i = 0; i < 6; i++) {
    fill(image, 50, 510 + i * 40, 50 + 200 + random() * 330, 524 + i * 40, [40, 40, 40]);
  }
  fill(image, 40, 36, 380, 70, [30, 30, 30]);
  return image;
}

export interface SceneOptions {
  background?: [number, number, number];
  noise?: number;
  seed?: number;
}

/** Desenha a carta dentro de um quadro `width × height` no quadrilátero dado (perspectiva). */
export function renderScene(card: RgbaImage, quad: Quad, width: number, height: number, options: SceneOptions = {}): RgbaImage {
  const random = prng(options.seed ?? 1);
  const bg = options.background ?? [58, 66, 60];
  const noise = options.noise ?? 0;
  const out: RgbaImage = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  const cardCorners: Point[] = [
    { x: 0, y: 0 },
    { x: card.width - 1, y: 0 },
    { x: card.width - 1, y: card.height - 1 },
    { x: 0, y: card.height - 1 },
  ];
  const toCard = homographyFromPoints(quad, cardCorners);
  if (!toCard) throw new Error('quadrilátero degenerado');
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = applyHomography(toCard, { x, y });
      const o = (y * width + x) * 4;
      const inside = p.x >= 0 && p.y >= 0 && p.x <= card.width - 1 && p.y <= card.height - 1;
      for (let c = 0; c < 3; c++) {
        const base = inside
          ? (card.data[(Math.round(p.y) * card.width + Math.round(p.x)) * 4 + c] ?? 0)
          : bg[c]!;
        out.data[o + c] = base + (random() - 0.5) * noise;
      }
      out.data[o + 3] = 255;
    }
  }
  return out;
}

export function uniformImage(width: number, height: number, rgb: [number, number, number]): RgbaImage {
  const image: RgbaImage = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  fill(image, 0, 0, width, height, rgb);
  return image;
}
