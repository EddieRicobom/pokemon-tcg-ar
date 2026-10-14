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

/** Cor do pino de mola neste ponto (relativo ao centro dele), ou null fora dele. */
function paintBumper(patch: Patch, dx: number, dy: number): Rgb | null {
  const edge = Math.hypot(dx, dy) / patch.r;
  // Sombra deslocada para baixo, depois o corpo.
  const shadow = Math.hypot(dx - 6, dy - 8) / patch.r;
  if (edge > 1) return shadow <= 1 ? C.bumperShadow : null;
  if (edge < 0.42) return C.bumperTop;
  return edge > 0.82 ? C.bumperRing : C.bumperBody;
}

/**
 * Pinta o fundo da arena: grama, mureta, penhasco e o vazio ao redor. As marcas dos golpes (`terrain-paint.ts`) e os pinos
 * de mola (`paintBumpers`) vão por cima.
 */
export function paintArena(radius: number, seed = 1): ArtBuf {
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
      }
      put(buf, px, py, color);
    }
  }
  return buf;
}

/** Camada transparente só com os pinos de mola (desenhada por cima do chão). */
export function paintBumpers(radius: number, patches: readonly Patch[]): ArtBuf {
  const size = artSize(radius);
  const buf: ArtBuf = { w: size, h: size, data: new Uint8ClampedArray(size * size * 4) };
  for (const patch of patches) {
    if (patch.kind !== 'bumper') continue;
    const reach = patch.r + 14;
    const x0 = Math.max(0, Math.floor((patch.x - reach) / UNITS_PER_PIXEL + size / 2));
    const x1 = Math.min(size - 1, Math.ceil((patch.x + reach) / UNITS_PER_PIXEL + size / 2));
    const y0 = Math.max(0, Math.floor((patch.y - reach) / UNITS_PER_PIXEL + size / 2));
    const y1 = Math.min(size - 1, Math.ceil((patch.y + reach) / UNITS_PER_PIXEL + size / 2));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const color = paintBumper(patch, (px + 0.5 - size / 2) * UNITS_PER_PIXEL - patch.x, (py + 0.5 - size / 2) * UNITS_PER_PIXEL - patch.y);
        if (color) put(buf, px, py, color);
      }
    }
  }
  return buf;
}
