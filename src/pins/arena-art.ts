import type { Patch } from '../core/pins';

/**
 * Pixel art da arena do Pin Mode, vista de cima, desenhada por código (sem imagens): um buffer RGBA em que cada pixel
 * vale `UNITS_PER_PIXEL` unidades do mundo. A tela o amplia sem suavizar (pixels bem marcados, estilo Pokémon antigo).
 */

export const UNITS_PER_PIXEL = 4;
/** Folga ao redor da arena, em unidades (a borda e o "vazio" para onde os pins caem). */
export const ARENA_MARGIN = 44;

export interface ArtBuf {
  w: number;
  h: number;
  /** RGBA, linha 0 primeiro. */
  data: Uint8ClampedArray;
}

/** Tamanho do buffer (em pixels) para uma arena de `radius`. */
export function artSize(radius: number): number {
  return Math.ceil((2 * (radius + ARENA_MARGIN)) / UNITS_PER_PIXEL);
}

/** Ruído repetível por pixel (0 a 1). */
function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const C = {
  void: [0x0d, 0x16, 0x2e], voidWave: [0x16, 0x26, 0x4a],
  cliff: [0x6b, 0x5a, 0x48], cliffDark: [0x45, 0x38, 0x2b],
  railA: [0xd9, 0xd2, 0xc2], railB: [0x9b, 0x90, 0x7c],
  grassA: [0x5f, 0xb0, 0x4c], grassB: [0x58, 0xa8, 0x47], grassDark: [0x3f, 0x8a, 0x3a], grassLight: [0x82, 0xd0, 0x65],
  iceA: [0xc6, 0xec, 0xf7], iceB: [0xdf, 0xf6, 0xfc], iceEdge: [0x8c, 0xc8, 0xdc], iceStreak: [0xff, 0xff, 0xff],
  mudA: [0x7a, 0x52, 0x30], mudDark: [0x5e, 0x3d, 0x22], mudLight: [0x94, 0x68, 0x3f], mudEdge: [0x4a, 0x30, 0x1a],
  waterA: [0x3b, 0x82, 0xd6], waterB: [0x4f, 0x95, 0xe6], waterRipple: [0x8c, 0xc4, 0xf5], waterEdge: [0x28, 0x5c, 0xa8],
  padA: [0x2b, 0x2b, 0x3a], padB: [0x35, 0x35, 0x4a], padEdge: [0x16, 0x16, 0x22], chevron: [0xf7, 0xd0, 0x2c],
  bumperBody: [0xe2, 0x3b, 0x3b], bumperRing: [0x9c, 0x22, 0x22], bumperTop: [0xff, 0xe9, 0xe9], bumperShadow: [0x1f, 0x4a, 0x1c],
} as const;
type Rgb = readonly [number, number, number];

function put(buf: ArtBuf, x: number, y: number, c: Rgb): void {
  const i = (y * buf.w + x) * 4;
  buf.data[i] = c[0];
  buf.data[i + 1] = c[1];
  buf.data[i + 2] = c[2];
  buf.data[i + 3] = 255;
}

function paintPatch(patch: Patch, dx: number, dy: number, px: number, py: number, seed: number): Rgb | null {
  const d = Math.hypot(dx, dy);
  const edge = d / patch.r;
  if (patch.kind === 'bumper') {
    // Sombra deslocada para baixo, depois o corpo.
    const shadow = Math.hypot(dx - 6, dy - 8) / patch.r;
    if (edge > 1) return shadow <= 1 ? C.bumperShadow : null;
    if (edge < 0.42) return C.bumperTop;
    return edge > 0.82 ? C.bumperRing : C.bumperBody;
  }
  if (edge > 1) return null;
  if (patch.kind === 'ice') {
    if (edge > 0.92) return C.iceEdge;
    if ((px + py) % 9 === 0 || (px + py + 3) % 17 === 0) return C.iceStreak;
    return hash(px >> 1, py >> 1, seed) < 0.5 ? C.iceA : C.iceB;
  }
  if (patch.kind === 'mud') {
    if (edge > 0.92) return C.mudEdge;
    const n = hash(px >> 1, py >> 1, seed + 5);
    return n < 0.18 ? C.mudDark : n > 0.86 ? C.mudLight : C.mudA;
  }
  if (patch.kind === 'water') {
    if (edge > 0.92) return C.waterEdge;
    // Marolas que correm na direção da correnteza.
    const along = px * Math.cos(patch.angle) + py * Math.sin(patch.angle);
    const across = -px * Math.sin(patch.angle) + py * Math.cos(patch.angle);
    if (Math.floor(along / 2) % 5 === 0 && Math.floor(across / 3) % 3 === 0) return C.waterRipple;
    return hash(px >> 1, py >> 1, seed + 9) < 0.5 ? C.waterA : C.waterB;
  }
  // Turbo: placa escura com setas amarelas que apontam para onde acelera.
  if (edge > 0.9) return C.padEdge;
  const u = dx * Math.cos(patch.angle) + dy * Math.sin(patch.angle);
  const v = -dx * Math.sin(patch.angle) + dy * Math.cos(patch.angle);
  const chevron = u - Math.abs(v) * 0.9;
  return Math.floor((chevron + 200) / 11) % 3 === 0 ? C.chevron : (px + py) % 2 === 0 ? C.padA : C.padB;
}

/** Pinta a arena inteira (chão, borda, vazio ao redor e os elementos do chão). */
export function paintArena(radius: number, patches: readonly Patch[], seed = 1): ArtBuf {
  const size = artSize(radius);
  const buf: ArtBuf = { w: size, h: size, data: new Uint8ClampedArray(size * size * 4) };
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const wx = (px + 0.5 - size / 2) * UNITS_PER_PIXEL;
      const wy = (py + 0.5 - size / 2) * UNITS_PER_PIXEL;
      const d = Math.hypot(wx, wy);
      let color: Rgb;
      if (d > radius + 22) {
        color = hash(px >> 1, py >> 1, seed + 1) < 0.08 || (px + py * 2) % 23 === 0 ? C.voidWave : C.void;
      } else if (d > radius + 6) {
        color = (px + py) % 2 === 0 ? C.cliff : C.cliffDark;
      } else if (d > radius - 10) {
        // Mureta da arena: faixas claras e escuras alternadas ao redor.
        const angle = Math.atan2(wy, wx);
        color = Math.floor((angle + Math.PI) * 28) % 2 === 0 ? C.railA : C.railB;
      } else {
        color = Math.floor(px / 3 + py / 3) % 2 === 0 ? C.grassA : C.grassB;
        const n = hash(px, py, seed);
        if (n < 0.035) color = C.grassDark;
        else if (n > 0.975) color = C.grassLight;
        for (const patch of patches) {
          const painted = paintPatch(patch, wx - patch.x, wy - patch.y, px, py, seed);
          if (painted) color = painted;
        }
      }
      put(buf, px, py, color);
    }
  }
  return buf;
}
