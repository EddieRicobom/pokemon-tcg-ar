import { packAtlas } from './atlas-spec';
import type { AtlasRect } from './atlas-spec';

/** Uma imagem RGBA solta (o atlas inteiro ou um recorte dele). */
export interface Rgba {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

/** Recorta `rect` de uma imagem RGBA (cópia). */
export function cropRgba(img: Rgba, rect: AtlasRect): Rgba {
  const out = new Uint8ClampedArray(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y++) {
    const from = ((rect.y + y) * img.w + rect.x) * 4;
    out.set(img.data.subarray(from, from + rect.w * 4), y * rect.w * 4);
  }
  return { w: rect.w, h: rect.h, data: out };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/**
 * Pinta a casa com a cor escolhida (o "telhado" da Vila): só os pixels coloridos do desenho (saturação acima de
 * `minSat`) trocam de matiz para o da cor; cinzas, brancos, madeira escura e vidro ficam como estão. `keep` diz quais
 * matizes não tocar (ex.: o azul do vidro), como faixa [de, até] em 0–1.
 */
export function recolor(img: Rgba, rgb: number, minSat = 0.35, keep: readonly [number, number][] = [[0.5, 0.64]]): Rgba {
  const [th, ts] = rgbToHsl((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255);
  const out = new Uint8ClampedArray(img.data);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    const [h, s, l] = rgbToHsl(out[i]!, out[i + 1]!, out[i + 2]!);
    if (s < minSat || l < 0.12 || l > 0.93) continue;
    if (keep.some(([a, b]) => h >= a && h <= b)) continue;
    const [r, g, b] = hslToRgb(th, Math.min(1, (s + ts) / 2), l);
    out[i] = Math.round(r);
    out[i + 1] = Math.round(g);
    out[i + 2] = Math.round(b);
  }
  return { w: img.w, h: img.h, data: out };
}

/**
 * As janelas do desenho, para acender à noite: os pixels de vidro (azul-claro) viram luz amarela; o resto fica
 * transparente. Achado pela cor, então serve para qualquer casa ou prédio do tileset.
 */
export function windowGlow(img: Rgba): Rgba {
  const out = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < img.data.length; i += 4) {
    const r = img.data[i]!;
    const g = img.data[i + 1]!;
    const b = img.data[i + 2]!;
    if (img.data[i + 3]! > 0 && b >= 170 && b > r + 35 && g > r + 10) {
      out[i] = 255;
      out[i + 1] = 214;
      out[i + 2] = 110;
      out[i + 3] = 255;
    }
  }
  return { w: img.w, h: img.h, data: out };
}

/** O desenho em 2× (cada pixel vira um bloco 2×2): aumenta sem borrar a pixel art. */
export function double(img: Rgba): Rgba {
  const w = img.w * 2;
  const out = new Uint8ClampedArray(w * img.h * 2 * 4);
  for (let y = 0; y < img.h * 2; y++) {
    for (let x = 0; x < w; x++) {
      const from = ((y >> 1) * img.w + (x >> 1)) * 4;
      out.set(img.data.subarray(from, from + 4), (y * w + x) * 4);
    }
  }
  return { w, h: img.h * 2, data: out };
}

/** O atlas carregado: acha cada recorte pelo id (mesmas posições do script que gerou a imagem). */
export class VillaAtlas {
  private readonly rects: Map<string, AtlasRect>;
  private readonly cache = new Map<string, Rgba>();

  constructor(readonly image: Rgba) {
    const { rects, h } = packAtlas();
    if (image.w !== 256 || image.h !== h || image.data.length !== image.w * image.h * 4) throw new Error('atlas da Vila com tamanho inesperado');
    this.rects = rects;
  }

  rect(id: string): AtlasRect | undefined {
    return this.rects.get(id);
  }

  piece(id: string): Rgba | undefined {
    let p = this.cache.get(id);
    if (!p) {
      const r = this.rects.get(id);
      if (!r) return undefined;
      p = cropRgba(this.image, r);
      this.cache.set(id, p);
    }
    return p;
  }
}
