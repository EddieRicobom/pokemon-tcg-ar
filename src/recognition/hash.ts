import { cropFraction, resizeAverage, toGray } from './image';
import { ARTWORK_BOX } from './layout';
import type { RgbaImage } from './types';

/**
 * Características visuais compactas de uma carta retificada. Derivadas do hash perceptual
 * de 16×16 (256 bits) do pokeum (MIT): dHash sobre a carta inteira e sobre a janela de arte,
 * mais uma grade de cor 4×4 (RGB) que ajuda a separar impressões com a mesma arte.
 * São pequenas (≈112 bytes) e servem tanto para comparar candidatos quanto para guardar no cache.
 */
export const FEATURE_VERSION = 1;
export const HASH_SIZE = 16;
export const HASH_BITS = HASH_SIZE * HASH_SIZE;
const COLOR_GRID = 4;

export interface CardFeatures {
  version: number;
  fullHash: Uint8Array;
  artHash: Uint8Array;
  color: Uint8Array;
}

/** dHash: compara pixels vizinhos na horizontal numa grade (HASH_SIZE+1) × HASH_SIZE. */
export function dHash(image: RgbaImage): Uint8Array {
  const small = resizeAverage(image, HASH_SIZE + 1, HASH_SIZE);
  const gray = toGray(small);
  const bits = new Uint8Array(HASH_BITS / 8);
  let bit = 0;
  for (let y = 0; y < HASH_SIZE; y++) {
    for (let x = 0; x < HASH_SIZE; x++) {
      const left = gray[y * (HASH_SIZE + 1) + x] ?? 0;
      const right = gray[y * (HASH_SIZE + 1) + x + 1] ?? 0;
      if (left > right) bits[bit >> 3] = (bits[bit >> 3] ?? 0) | (1 << (bit & 7));
      bit++;
    }
  }
  return bits;
}

export function colorGrid(image: RgbaImage): Uint8Array {
  const small = resizeAverage(image, COLOR_GRID, COLOR_GRID);
  const out = new Uint8Array(COLOR_GRID * COLOR_GRID * 3);
  for (let i = 0; i < COLOR_GRID * COLOR_GRID; i++) {
    out[i * 3] = small.data[i * 4] ?? 0;
    out[i * 3 + 1] = small.data[i * 4 + 1] ?? 0;
    out[i * 3 + 2] = small.data[i * 4 + 2] ?? 0;
  }
  return out;
}

export function computeFeatures(card: RgbaImage): CardFeatures {
  const art = cropFraction(card, ARTWORK_BOX);
  return { version: FEATURE_VERSION, fullHash: dHash(card), artHash: dHash(art), color: colorGrid(art) };
}

const POPCOUNT = Uint8Array.from({ length: 256 }, (_, n) => {
  let count = 0;
  for (let v = n; v; v >>= 1) count += v & 1;
  return count;
});

export function hamming(a: Uint8Array, b: Uint8Array): number {
  let distance = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) distance += POPCOUNT[(a[i] ?? 0) ^ (b[i] ?? 0)] ?? 0;
  return distance;
}

function colorDistance(a: Uint8Array, b: Uint8Array): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 255;
  let sum = 0;
  for (let i = 0; i < length; i++) sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return sum / length;
}

export interface VisualSimilarity {
  art: number;
  full: number;
  color: number;
  /** Combinação em [0, 1]; ~0,5 é o esperado para cartas sem relação. */
  combined: number;
}

export function compareFeatures(a: CardFeatures, b: CardFeatures): VisualSimilarity {
  const art = 1 - hamming(a.artHash, b.artHash) / HASH_BITS;
  const full = 1 - hamming(a.fullHash, b.fullHash) / HASH_BITS;
  const color = 1 - colorDistance(a.color, b.color) / 255;
  return { art, full, color, combined: 0.6 * art + 0.25 * full + 0.15 * color };
}

/** Serialização para IndexedDB (ArrayBuffer estruturado) e para o cache. */
export function featuresToJson(features: CardFeatures): { v: number; f: number[]; a: number[]; c: number[] } {
  return { v: features.version, f: Array.from(features.fullHash), a: Array.from(features.artHash), c: Array.from(features.color) };
}

export function featuresFromJson(value: { v: number; f: number[]; a: number[]; c: number[] }): CardFeatures {
  return { version: value.v, fullHash: Uint8Array.from(value.f), artHash: Uint8Array.from(value.a), color: Uint8Array.from(value.c) };
}
