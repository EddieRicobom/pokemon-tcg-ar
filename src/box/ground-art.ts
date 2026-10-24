import { seededRng } from '../core/battle';
import type { Rng } from '../core/battle';
import { gardenTrailDistance, TERRAIN_KINDS } from '../core/terrain';
import type { DecorKind, GroundKind, GroundLayout, TerrainGrid, TerrainKind } from '../core/terrain';

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

// ----------------------------------------------------------------------------- chão base (estilo portátil 16 bits)

/**
 * Paleta curta e chapada, como nos jogos de portátil: grama de uma cor só com tufinhos em padrão regular, trilha de
 * areia com borda de grama ondulada e contorno, mato alto em touceiras contornadas, flores de quatro pétalas.
 */
const GRASS = { base: 0x84cc64, tuft: 0x4a9838, light: 0xb4ec8c };
const PATH = { base: 0xecd8a0, dot: 0xd6ba7e, rim: 0xb8924e, lip: 0x4f9a3a };
const TALL = { base: 0x5aac46, out: 0x2a6a2a, mid: 0x66bc4c, light: 0xa4e474 };
const PETALS = [0xf06048, 0xf8f8f8, 0xf8a8c8, 0x88a8f8];
const FLOWER = { center: 0xf8d030, shadow: 0x58a844 };

/** Touceira do mato alto, 8×8 ('.' = fundo, o = contorno, M = verde médio, L = verde claro). */
const TALL_STAMP = [
  '........',
  '.o...o..',
  'oMo.oMo.',
  'oLMooLMo',
  'oLMMoLMo',
  'oLLMMLLo',
  '.oLLLLo.',
  '..oooo..',
];

function tuft(buf: PixelBuf, x: number, y: number): void {
  // "ʌʌ" pequeno: dois tufos escuros com uma ponta clara em cima.
  put(buf, x, y + 1, GRASS.tuft);
  put(buf, x + 1, y, GRASS.tuft);
  put(buf, x + 2, y + 1, GRASS.tuft);
  put(buf, x + 3, y, GRASS.tuft);
  put(buf, x + 4, y + 1, GRASS.tuft);
  put(buf, x + 1, y - 1, GRASS.light);
}

function flower(buf: PixelBuf, cx: number, cy: number, petal: number): void {
  put(buf, cx, cy - 1, petal);
  put(buf, cx - 1, cy, petal);
  put(buf, cx + 1, cy, petal);
  put(buf, cx, cy + 1, petal);
  put(buf, cx, cy, FLOWER.center);
  put(buf, cx - 1, cy + 2, FLOWER.shadow);
  put(buf, cx, cy + 2, FLOWER.shadow);
  put(buf, cx + 1, cy + 2, FLOWER.shadow);
}

/** Onde o bloco fica dentro do chão: muda os tufinhos de lugar em xadrez, para a grama não parecer carimbada. */
export interface CellPos {
  c: number;
  r: number;
}

/**
 * Pinta o chão base de um bloco. `edges` = lados (bits de `EDGE`) cujo vizinho é de outro tipo de chão: a trilha ganha
 * ali a borda de grama ondulada com contorno; o mato alto, uma beirada de grama.
 */
export function paintGround(buf: PixelBuf, ox: number, oy: number, kind: GroundKind, rng: Rng, edges = 0, cell: CellPos = { c: 0, r: 0 }): void {
  const odd = (cell.c + cell.r) % 2 === 1;
  if (kind === 'path') {
    fill(buf, ox, oy, PATH.base);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) if ((x * 3 + y * 5 + cell.c * 7 + cell.r * 11) % 23 === 0) put(buf, ox + x, oy + y, PATH.dot);
    }
    pathBorder(buf, ox, oy, edges);
    return;
  }
  fill(buf, ox, oy, kind === 'tall' ? TALL.base : GRASS.base);
  if (kind === 'tall') {
    for (const [qx, qy] of [[0, 0], [8, 0], [0, 8], [8, 8]] as const) {
      TALL_STAMP.forEach((row, y) => {
        for (let x = 0; x < 8; x++) {
          const ch = row[x];
          if (ch === 'o') put(buf, ox + qx + x, oy + qy + y, TALL.out);
          else if (ch === 'M') put(buf, ox + qx + x, oy + qy + y, TALL.mid);
          else if (ch === 'L') put(buf, ox + qx + x, oy + qy + y, TALL.light);
        }
      });
    }
    return;
  }
  // Grama: dois tufinhos em posições fixas (em xadrez); "grass2" ganha um terceiro, mais apagado.
  if (odd) {
    tuft(buf, ox + 9, oy + 3);
    tuft(buf, ox + 2, oy + 10);
  } else {
    tuft(buf, ox + 2, oy + 3);
    tuft(buf, ox + 9, oy + 10);
  }
  if (kind === 'grass2') put(buf, ox + (odd ? 6 : 13), oy + 7, GRASS.tuft);
  if (kind === 'flowers') {
    flower(buf, ox + (odd ? 4 : 11), oy + 5, pick(rng, PETALS));
    if (rng() < 0.7) flower(buf, ox + (odd ? 12 : 4), oy + 12, pick(rng, PETALS));
  }
}

/** Borda da trilha: a grama invade 2 a 3 pixels em onda, com contorno verde-escuro e uma linha de areia mais escura. */
function pathBorder(buf: PixelBuf, ox: number, oy: number, edges: number): void {
  if (edges === 0) return;
  const wave = (t: number) => (t % 4 < 2 ? 2 : 3);
  for (let t = 0; t < TILE; t++) {
    const depth = wave(t);
    const sides: [number, number, number, number][] = [];
    if (edges & EDGE.north) sides.push([t, 0, 0, 1]);
    if (edges & EDGE.south) sides.push([t, TILE - 1, 0, -1]);
    if (edges & EDGE.west) sides.push([0, t, 1, 0]);
    if (edges & EDGE.east) sides.push([TILE - 1, t, -1, 0]);
    for (const [x0, y0, dx, dy] of sides) {
      for (let k = 0; k < depth; k++) put(buf, ox + x0 + dx * k, oy + y0 + dy * k, GRASS.base);
      put(buf, ox + x0 + dx * depth, oy + y0 + dy * depth, PATH.lip);
      put(buf, ox + x0 + dx * (depth + 1), oy + y0 + dy * (depth + 1), PATH.rim);
    }
  }
}

/** Paleta mais terrosa e tufos variados para o diorama; o estilo dos Pins permanece separado. */
/** A arena da batalha (jardim ou Coliseu): disco limpo no meio, com as marcações do duelo. */
function arenaLike(layout: GroundLayout): boolean {
  return layout === 'battle' || layout === 'coliseu';
}

function paintNaturalGround(buf: PixelBuf, ox: number, oy: number, kind: GroundKind, rng: Rng, layout: GroundLayout, seed: number): void {
  const grass = 0x719653;
  const soil = 0xc5b184;
  const pathAt = (x: number, y: number) => {
    const nx = (x + .5) / buf.w * 2 - 1; const nz = (y + .5) / buf.h * 2 - 1;
    if (layout === 'coliseu') return true;
    return layout === 'battle' ? Math.hypot(nx, nz) < .68 : gardenTrailDistance(nx, nz, seed) < .13;
  };
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const px = ox + x; const py = oy + y;
    const path = pathAt(px, py);
    const fringe = !path && (pathAt(px - 1, py) || pathAt(px + 1, py) || pathAt(px, py - 1) || pathAt(px, py + 1));
    put(buf, px, py, path ? soil : fringe ? 0x91a568 : grass);
  }
  for (let n = 0; n < 9; n++) {
    const x = 1 + Math.floor(rng() * 14); const y = 1 + Math.floor(rng() * 14);
    const color = pathAt(ox + x, oy + y) ? rng() < 0.5 ? 0xb5a27a : 0xd2be91 : rng() < 0.5 ? 0x789e59 : 0x6a8d4f;
    put(buf, ox + x, oy + y, color);
    if (rng() < 0.4) put(buf, ox + x + 1, oy + y, color);
  }
  if (kind === 'path') return;
  const tufts = kind === 'tall' ? 5 : rng() < 0.6 ? 1 : 0;
  for (let n = 0; n < tufts; n++) {
    const x = 2 + Math.floor(rng() * 11); const y = 3 + Math.floor(rng() * 10);
    if (pathAt(ox + x, oy + y)) continue;
    put(buf, ox + x, oy + y, 0x507a41); put(buf, ox + x + 1, oy + y - 1, 0x83ab62);
    put(buf, ox + x + 2, oy + y, 0x567e43); put(buf, ox + x + 2, oy + y + 1, 0x668b48);
  }
  if (kind === 'flowers') flower(buf, ox + 5 + Math.floor(rng() * 6), oy + 5 + Math.floor(rng() * 6), pick(rng, PETALS));
}

/** Acabamento fixo: borda de pedra no jardim e marcações discretas na arena, sem mais malhas ou draw calls. */
function finishNaturalGround(buf: PixelBuf, ox: number, oy: number, grid: TerrainGrid, layout: GroundLayout): void {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const px = ox + x; const py = oy + y;
    const nx = (px + 0.5) / buf.w * 2 - 1; const nz = (py + 0.5) / buf.h * 2 - 1;
    if (arenaLike(layout) && Math.hypot(nx, nz) >= 1) { put(buf, px, py, 0, 0); continue; }
    if (alphaAt(buf, px, py) === 0) continue;
    if (layout === 'garden' && grid.shape === 'square') {
      const edge = Math.min(px, py, buf.w - 1 - px, buf.h - 1 - py);
      if (edge < 4) {
        const along = px < 4 || px >= buf.w - 4 ? py : px;
        put(buf, px, py, along % 13 === 0 ? 0x626b55 : edge === 0 ? 0x667456 : edge === 3 ? 0x899878 : 0xa3ad8e);
      }
    } else if (arenaLike(layout)) {
      const radius = Math.hypot(nx, nz);
      const circle = Math.hypot(nx / 0.18, nz / 0.18);
      if (Math.abs(radius - 0.72) < 0.009 || Math.abs(circle - 1) < 0.045 || Math.abs(nz) < 0.008 && Math.abs(nx) < 0.71 && circle > 1) put(buf, px, py, 0xe8dfbc);
    }
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

/**
 * Repinta o bloco `i` da grade (chão + marca do golpe) no buffer. Sempre usa o mesmo sorteio para o mesmo bloco, então
 * repintar não "treme". Usado pelo chão da Caixa (`ground.ts`) e pela arena do Pin Mode.
 */
export function paintTerrainCell(buf: PixelBuf, grid: TerrainGrid, i: number, seed: number, layout: GroundLayout = 'wild'): void {
  const c = i % grid.cols;
  const r = Math.floor(i / grid.cols);
  const ox = c * TILE;
  const oy = r * TILE;
  for (let y = 0; y < TILE; y++) buf.data.fill(0, ((oy + y) * buf.w + ox) * 4, ((oy + y) * buf.w + ox + TILE) * 4);
  if (!grid.inside[i] && !arenaLike(layout)) return;
  const salt = (seed * 31 + i * 2654435761) >>> 0;
  const neighbor = (dc: number, dr: number): number | null => {
    const nc = c + dc;
    const nr = r + dr;
    return nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows ? null : grid.index(nc, nr);
  };
  const around = [
    [EDGE.north, neighbor(0, -1)],
    [EDGE.east, neighbor(1, 0)],
    [EDGE.south, neighbor(0, 1)],
    [EDGE.west, neighbor(-1, 0)],
  ] as const;
  const ground = grid.groundAt(i);
  let groundEdges = 0;
  for (const [bit, n] of around) if (n !== null && grid.inside[n] && (grid.groundAt(n) === 'path') !== (ground === 'path')) groundEdges |= bit;
  if (layout === 'wild') paintGround(buf, ox, oy, ground, seededRng(salt), groundEdges, { c, r });
  else paintNaturalGround(buf, ox, oy, ground, seededRng(salt), layout, seed);
  let shape = 0;
  for (const [bit, n] of around) if (n === null || !grid.inside[n]) shape |= bit;
  if (grid.shape === 'ellipse' && layout === 'wild') fadeEdges(buf, ox, oy, shape, seededRng(salt ^ 0xabcdef));
  else if (grid.shape === 'ellipse' && !arenaLike(layout)) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (((ox + x + .5) / buf.w * 2 - 1) ** 2 + ((oy + y + .5) / buf.h * 2 - 1) ** 2 >= 1) put(buf, ox + x, oy + y, 0, 0);
  }
  if (layout !== 'wild') finishNaturalGround(buf, ox, oy, grid, layout);
  const kind = grid.overlayAt(i);
  if (kind) {
    let edges = 0;
    for (const [bit, n] of around) if (n === null || grid.over[n] !== grid.over[i]) edges |= bit;
    paintOverlay(buf, ox, oy, kind, edges, seededRng(salt ^ (0x1234567 + TERRAIN_KINDS.indexOf(kind))));
  }
}

/** Os blocos a repintar quando `changed` mudou: eles e os quatro vizinhos (a borda da marca muda). */
export function touchedCells(grid: TerrainGrid, changed: readonly number[]): Set<number> {
  const touched = new Set<number>();
  for (const i of changed) {
    touched.add(i);
    const c = i % grid.cols;
    const r = Math.floor(i / grid.cols);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (c + dc >= 0 && c + dc < grid.cols && r + dr >= 0 && r + dr < grid.rows) touched.add(grid.index(c + dc, r + dr));
    }
  }
  return touched;
}
