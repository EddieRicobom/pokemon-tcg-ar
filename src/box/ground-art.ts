import { seededRng } from '../core/battle';
import type { Rng } from '../core/battle';
import type { DecorKind, GroundKind, TerrainKind } from '../core/terrain';

/**
 * Pixel art do chão, desenhada por código (sem imagens e sem canvas, então roda e é testada em qualquer ambiente).
 * Cada bloco tem 16×16 pixels; o chão inteiro é um buffer RGBA que vira uma textura `NearestFilter`.
 */

export const TILE = 16;

export interface PixelBuf {
  w: number;
  h: number;
  /** RGBA, linha 0 primeiro. */
  data: Uint8Array;
}

export function createBuf(w: number, h: number): PixelBuf {
  return { w, h, data: new Uint8Array(w * h * 4) };
}

/** Bits dos lados do bloco que não têm vizinho do mesmo tipo (o desenho se dissolve nesses lados). */
export const EDGE = { north: 1, east: 2, south: 4, west: 8 } as const;

function put(buf: PixelBuf, x: number, y: number, rgb: number, a = 255): void {
  if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) return;
  const i = (y * buf.w + x) * 4;
  buf.data[i] = (rgb >> 16) & 255;
  buf.data[i + 1] = (rgb >> 8) & 255;
  buf.data[i + 2] = rgb & 255;
  buf.data[i + 3] = a;
}

function alphaAt(buf: PixelBuf, x: number, y: number): number {
  return buf.data[(y * buf.w + x) * 4 + 3] ?? 0;
}

function fill(buf: PixelBuf, ox: number, oy: number, rgb: number): void {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) put(buf, ox + x, oy + y, rgb);
}

/** Este pixel do bloco aparece? Perto de um lado sem vizinho a chance cai, e o contorno fica "borrado" em pixel art. */
function covered(x: number, y: number, edges: number, rng: Rng): boolean {
  let d = 99;
  if (edges & EDGE.north) d = Math.min(d, y);
  if (edges & EDGE.south) d = Math.min(d, TILE - 1 - y);
  if (edges & EDGE.west) d = Math.min(d, x);
  if (edges & EDGE.east) d = Math.min(d, TILE - 1 - x);
  if (d >= 5) return true;
  return rng() < (d + 0.6) / 5;
}

const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)]!;

// ----------------------------------------------------------------------------- chão base

const GRASS = { a: 0x5fb04c, b: 0x58a847, dark: 0x3f8a3a, light: 0x82d065 };
const PATH = { base: 0xd8b26a, dark: 0xc29a55, light: 0xebcf94, stone: 0xa8884c };
const TALL = { base: 0x2f8a3c, dark: 0x1f6a2c, light: 0x66c24a };
const PETALS = [0xffffff, 0xff7aa8, 0xffd84a, 0x8fb4ff];

function blades(buf: PixelBuf, ox: number, oy: number, rng: Rng, count: number, dark: number, light: number): void {
  for (let n = 0; n < count; n++) {
    const x = 1 + Math.floor(rng() * 14);
    const y = 2 + Math.floor(rng() * 12);
    put(buf, ox + x - 1, oy + y - 1, dark);
    put(buf, ox + x + 1, oy + y - 1, dark);
    put(buf, ox + x, oy + y, dark);
    if (rng() < 0.45) put(buf, ox + x, oy + y - 2, light);
  }
}

function flower(buf: PixelBuf, cx: number, cy: number, petal: number): void {
  put(buf, cx, cy - 1, petal);
  put(buf, cx - 1, cy, petal);
  put(buf, cx + 1, cy, petal);
  put(buf, cx, cy + 1, petal);
  put(buf, cx, cy, petal === 0xffd84a ? 0xff9a2e : 0xffd84a);
}

export function paintGround(buf: PixelBuf, ox: number, oy: number, kind: GroundKind, rng: Rng): void {
  if (kind === 'path') {
    fill(buf, ox, oy, PATH.base);
    for (let n = 0; n < 14; n++) put(buf, ox + Math.floor(rng() * 16), oy + Math.floor(rng() * 16), rng() < 0.5 ? PATH.dark : PATH.light);
    if (rng() < 0.5) {
      const x = 2 + Math.floor(rng() * 11);
      const y = 2 + Math.floor(rng() * 11);
      put(buf, ox + x, oy + y, PATH.stone);
      put(buf, ox + x + 1, oy + y, PATH.stone);
      put(buf, ox + x, oy + y - 1, PATH.light);
    }
    return;
  }
  if (kind === 'tall') {
    fill(buf, ox, oy, TALL.base);
    for (let t = 0; t < 3; t++) {
      const x = 2 + t * 5 + Math.floor(rng() * 2);
      const y = 5 + Math.floor(rng() * 6);
      for (let k = 0; k < 6; k++) {
        put(buf, ox + x - 1 + (k % 2), oy + y + 1 + (k >> 1), TALL.dark);
        put(buf, ox + x, oy + y - (k > 3 ? 0 : 2 - (k >> 1)), TALL.light);
      }
      put(buf, ox + x - 2, oy + y, TALL.light);
      put(buf, ox + x + 2, oy + y, TALL.light);
      put(buf, ox + x, oy + y - 3, TALL.light);
    }
    return;
  }
  fill(buf, ox, oy, kind === 'grass2' ? GRASS.b : GRASS.a);
  blades(buf, ox, oy, rng, kind === 'grass2' ? 6 : 4, GRASS.dark, GRASS.light);
  if (kind === 'flowers') {
    const petal = pick(rng, PETALS);
    flower(buf, ox + 3 + Math.floor(rng() * 4), oy + 3 + Math.floor(rng() * 4), petal);
    flower(buf, ox + 9 + Math.floor(rng() * 4), oy + 9 + Math.floor(rng() * 4), pick(rng, PETALS));
  }
}

/** Apaga (alfa 0) os pixels do bloco que ficam fora do formato do chão, com a borda dissolvida. */
export function fadeEdges(buf: PixelBuf, ox: number, oy: number, edges: number, rng: Rng): void {
  if (edges === 0) return;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (!covered(x, y, edges, rng)) put(buf, ox + x, oy + y, 0, 0);
    }
  }
}

// ----------------------------------------------------------------------------- marcas dos golpes

type Overlay = (buf: PixelBuf, ox: number, oy: number, rng: Rng, show: (x: number, y: number) => boolean) => void;

function overlayFill(buf: PixelBuf, ox: number, oy: number, show: (x: number, y: number) => boolean, color: (x: number, y: number) => number): void {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (show(x, y)) put(buf, ox + x, oy + y, color(x, y), alphaAt(buf, ox + x, oy + y) || 255);
    }
  }
}

function walk(buf: PixelBuf, ox: number, oy: number, rng: Rng, x: number, y: number, steps: number, color: number, show: (x: number, y: number) => boolean, bias = 0): void {
  for (let s = 0; s < steps; s++) {
    if (x >= 0 && y >= 0 && x < TILE && y < TILE && show(x, y)) put(buf, ox + x, oy + y, color, alphaAt(buf, ox + x, oy + y) || 255);
    x += Math.floor(rng() * 3) - 1 + bias;
    y += rng() < 0.7 ? 1 : 0;
  }
}

const OVERLAYS: Record<TerrainKind, Overlay> = {
  scorch(buf, ox, oy, rng, show) {
    overlayFill(buf, ox, oy, show, () => {
      const v = rng();
      return v < 0.05 ? 0xff7a2a : v < 0.065 ? 0xffd34a : v < 0.13 ? 0x5a524b : v < 0.4 ? 0x3d332e : 0x2b2522;
    });
  },
  puddle(buf, ox, oy, rng, show) {
    overlayFill(buf, ox, oy, show, (x, y) => ((x * 3 + y * 5) % 11 === 0 ? 0x2f78c4 : 0x3a8fe0));
    for (let n = 0; n < 2; n++) {
      const x = 2 + Math.floor(rng() * 9);
      const y = 2 + Math.floor(rng() * 12);
      for (let k = 0; k < 3; k++) if (show(x + k, y)) put(buf, ox + x + k, oy + y, 0xa9dcff);
    }
    const sx = 3 + Math.floor(rng() * 10);
    const sy = 3 + Math.floor(rng() * 10);
    if (rng() < 0.6 && show(sx, sy)) put(buf, ox + sx, oy + sy, 0xffffff);
  },
  thicket(buf, ox, oy, rng, show) {
    overlayFill(buf, ox, oy, show, () => 0x2a7a38);
    for (let x = 0; x < TILE; x++) {
      if (rng() < 0.75) {
        const h = 4 + Math.floor(rng() * 7);
        for (let k = 0; k < h; k++) {
          const y = 15 - k;
          if (show(x, y)) put(buf, ox + x, oy + y, k === h - 1 ? 0x7edc5a : k % 3 === 0 ? 0x1e5a2a : 0x3b9a44);
        }
      }
    }
  },
  frost(buf, ox, oy, rng, show) {
    overlayFill(buf, ox, oy, show, (x, y) => ((x - y + 32) % 6 === 0 ? 0xffffff : (x + y) % 9 === 0 ? 0xe9f8ff : 0xcfeeff));
    walk(buf, ox, oy, rng, 3 + Math.floor(rng() * 10), 0, 14, 0x8cc7e6, show);
    const x = 2 + Math.floor(rng() * 12);
    const y = 2 + Math.floor(rng() * 12);
    if (show(x, y)) put(buf, ox + x, oy + y, 0xffffff);
  },
  static(buf, ox, oy, rng, show) {
    overlayFill(buf, ox, oy, show, () => (rng() < 0.15 ? 0x3a3720 : 0x6e6a35));
    let x = 4 + Math.floor(rng() * 8);
    for (let y = 0; y < TILE; y++) {
      if (show(x, y)) put(buf, ox + x, oy + y, 0xfff36b);
      if (show(x + 1, y)) put(buf, ox + x + 1, oy + y, 0xffd000);
      if (y % 3 === 2) x += rng() < 0.5 ? -2 : 2;
      x = Math.min(14, Math.max(1, x));
    }
  },
  crack(buf, ox, oy, rng, show) {
    overlayFill(buf, ox, oy, show, () => (rng() < 0.25 ? 0xa58a63 : 0x6b5035));
    walk(buf, ox, oy, rng, 4 + Math.floor(rng() * 8), 0, 17, 0x2b1d10, show);
    walk(buf, ox, oy, rng, 8, 6, 12, 0x2b1d10, show, 1);
  },
  rubble(buf, ox, oy, rng, show) {
    overlayFill(buf, ox, oy, show, () => (rng() < 0.5 ? 0x7a7770 : 0x6f6c66));
    for (let n = 0; n < 3; n++) {
      const x = 1 + Math.floor(rng() * 11);
      const y = 2 + Math.floor(rng() * 11);
      if (!show(x, y)) continue;
      const w = 2 + Math.floor(rng() * 3);
      for (let dx = 0; dx < w; dx++) {
        put(buf, ox + x + dx, oy + y, 0xb8b4ac);
        put(buf, ox + x + dx, oy + y + 1, 0x8d8982);
        put(buf, ox + x + dx, oy + y + 2, 0x5f5c57);
      }
    }
  },
  toxic(buf, ox, oy, rng, show) {
    overlayFill(buf, ox, oy, show, (x, y) => ((x * 7 + y * 3) % 10 === 0 ? 0x4a2266 : 0x7e3fa8));
    for (let n = 0; n < 2; n++) {
      const x = 2 + Math.floor(rng() * 10);
      const y = 2 + Math.floor(rng() * 10);
      for (const [dx, dy] of [[1, 0], [0, 1], [2, 1], [1, 2]] as const) if (show(x + dx, y + dy)) put(buf, ox + x + dx, oy + y + dy, 0xd9a0f2);
    }
  },
  psy(buf, ox, oy, rng, show) {
    overlayFill(buf, ox, oy, show, () => (rng() < 0.1 ? 0xff9ff3 : 0xb24fc9));
    const c = 7;
    for (let k = 0; k <= 4; k++) {
      for (const [x, y] of [[c - k, 7 - 4 + k], [c + k, 7 - 4 + k], [c - k, 7 + 4 - k], [c + k, 7 + 4 - k]] as const) if (show(x, y)) put(buf, ox + x, oy + y, 0xffd9ff);
    }
    if (show(7, 7)) put(buf, ox + 7, oy + 7, 0xffffff);
  },
  shade(buf, ox, oy, rng, show) {
    overlayFill(buf, ox, oy, show, (x, y) => ((x + y) % 2 === 0 && rng() < 0.4 ? 0x2c2342 : 0x181226));
    if (rng() < 0.3) {
      const x = 3 + Math.floor(rng() * 8);
      const y = 3 + Math.floor(rng() * 8);
      if (show(x, y) && show(x + 3, y)) {
        put(buf, ox + x, oy + y, 0xb79cff);
        put(buf, ox + x + 3, oy + y, 0xb79cff);
      }
    }
  },
  bloom(buf, ox, oy, rng, show) {
    overlayFill(buf, ox, oy, show, () => (rng() < 0.25 ? 0x9be07f : 0x86d46a));
    for (let n = 0; n < 3; n++) {
      const x = 2 + Math.floor(rng() * 12);
      const y = 2 + Math.floor(rng() * 12);
      if (show(x, y)) flower(buf, ox + x, oy + y, pick(rng, [0xff8fc8, 0xffffff, 0xd6a8ff] as const));
    }
    const sx = 2 + Math.floor(rng() * 12);
    const sy = 2 + Math.floor(rng() * 12);
    if (show(sx, sy)) put(buf, ox + sx, oy + sy, 0xffffff);
  },
};

/** Pinta a marca de um golpe por cima do bloco; `edges` diz em que lados ela acaba (para a borda ficar orgânica). */
export function paintOverlay(buf: PixelBuf, ox: number, oy: number, kind: TerrainKind, edges: number, rng: Rng): void {
  // O sorteio da cobertura é fixo por bloco, então repintar não "treme".
  const mask = seededRng(Math.floor(rng() * 0x7fffffff));
  const cache = new Map<number, boolean>();
  const show = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return false;
    // Fora do formato do chão (pixels já apagados) a marca também não aparece.
    if (alphaAt(buf, ox + x, oy + y) === 0) return false;
    const key = y * TILE + x;
    let v = cache.get(key);
    if (v === undefined) {
      v = covered(x, y, edges, mask);
      cache.set(key, v);
    }
    return v;
  };
  OVERLAYS[kind](buf, ox, oy, rng, show);
}

// ----------------------------------------------------------------------------- enfeites de pé (16×16, fundo transparente)

function disc(buf: PixelBuf, cx: number, cy: number, rx: number, ry: number, color: number): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) put(buf, x, y, color);
    }
  }
}

function outline(buf: PixelBuf, color: number): void {
  const solid = new Uint8Array(buf.w * buf.h);
  for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) solid[y * buf.w + x] = alphaAt(buf, x, y) > 0 ? 1 : 0;
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      if (solid[y * buf.w + x]) continue;
      const near = (solid[(y - 1) * buf.w + x] ?? 0) || (solid[(y + 1) * buf.w + x] ?? 0) || (x > 0 && solid[y * buf.w + x - 1]) || (x < buf.w - 1 && solid[y * buf.w + x + 1]);
      if (near) put(buf, x, y, color);
    }
  }
}

const DECOR_PAINTERS: Record<DecorKind, (buf: PixelBuf) => void> = {
  bush(buf) {
    disc(buf, 8, 9, 6.5, 5, 0x2f8a3d);
    disc(buf, 6, 7, 3.5, 2.5, 0x49b24f);
    disc(buf, 10, 12, 5, 2, 0x1f6a2f);
    put(buf, 5, 6, 0x82d065);
    put(buf, 11, 8, 0xe0453a);
    put(buf, 8, 11, 0xe0453a);
  },
  tuft(buf) {
    for (const [x, h] of [[5, 6], [8, 9], [11, 6]] as const) {
      for (let k = 0; k < h; k++) put(buf, x + (k > 4 ? (x < 8 ? -1 : 1) : 0), 14 - k, k === h - 1 ? 0x82d065 : 0x3f9a44);
    }
    put(buf, 7, 14, 0x1f6a2c);
    put(buf, 9, 14, 0x1f6a2c);
  },
  'flower-red': (buf) => flowerPlant(buf, 0xe8453c),
  'flower-yellow': (buf) => flowerPlant(buf, 0xffd84a),
  'flower-blue': (buf) => flowerPlant(buf, 0x6fa0ff),
  rock(buf) {
    disc(buf, 8, 11, 5.5, 3.5, 0x8d8982);
    disc(buf, 7, 9.5, 3.5, 2, 0xb8b4ac);
    disc(buf, 10, 13, 4, 1.4, 0x5f5c57);
  },
  mushroom(buf) {
    for (let y = 9; y < 14; y++) for (let x = 7; x < 10; x++) put(buf, x, y, 0xf1e6c8);
    disc(buf, 8, 8, 5, 3, 0xe84a4a);
    for (const [x, y] of [[6, 7], [9, 6], [10, 8]] as const) put(buf, x, y, 0xffffff);
  },
};

function flowerPlant(buf: PixelBuf, petal: number): void {
  for (let y = 7; y < 15; y++) put(buf, 8, y, 0x3f9a44);
  put(buf, 7, 11, 0x3f9a44);
  put(buf, 6, 10, 0x3f9a44);
  put(buf, 9, 12, 0x3f9a44);
  put(buf, 10, 11, 0x3f9a44);
  for (const [dx, dy] of [[0, -2], [-2, 0], [2, 0], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) put(buf, 8 + dx, 5 + dy, petal);
  put(buf, 8, 5, 0xffd84a);
}

/** Textura 16×16 de um enfeite (fundo transparente, contorno escuro de 1 pixel). */
export function paintDecor(kind: DecorKind): PixelBuf {
  const buf = createBuf(TILE, TILE);
  DECOR_PAINTERS[kind](buf);
  outline(buf, kind === 'rock' ? 0x2f2d2a : 0x174a22);
  return buf;
}
