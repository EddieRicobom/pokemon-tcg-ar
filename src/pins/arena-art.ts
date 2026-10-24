import type { Patch } from '../core/pins';

/**
 * Pixel art da arena do Pin Mode, vista de cima, desenhada por código (sem imagens): um buffer RGBA em que cada pixel
 * vale `UNITS_PER_PIXEL` unidades do mundo. A tela o amplia sem suavizar (pixels bem marcados, estilo Pokémon antigo).
 */

export const UNITS_PER_PIXEL = 5;
/** Folga ao redor da arena, em unidades (a mureta, o penhasco e o "vazio" para onde os pins caem). */
export const ARENA_MARGIN = 88;

/** Da borda do chão para fora, em unidades: face de dentro da mureta, topo, face de fora, penhasco. */
const INNER_FACE = 20;
const TOP_FACE = 8;
const OUTER_FACE = 4;
const CLIFF = 44;
const OUTER_RIM = 12;

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
  void: [0x0d, 0x16, 0x2e], voidWave: [0x16, 0x26, 0x4a], voidStar: [0x3a, 0x52, 0x8a],
  cliffA: [0x86, 0x72, 0x5b], cliffB: [0x6b, 0x5a, 0x48], cliffC: [0x4d, 0x3f, 0x31], cliffD: [0x34, 0x2a, 0x21],
  wallTopA: [0xe6, 0xdf, 0xcf], wallTopB: [0xcf, 0xc6, 0xb2], wallMortar: [0x9b, 0x90, 0x7c], wallEdge: [0xfb, 0xf7, 0xea],
  wallInnerA: [0x8e, 0x84, 0x70], wallInnerB: [0x7c, 0x72, 0x60], wallInnerShadow: [0x2f, 0x5e, 0x2c],
  wallOuterA: [0x6f, 0x66, 0x55], wallOuterB: [0x5a, 0x52, 0x44],
  grassA: [0x5f, 0xb0, 0x4c], grassB: [0x58, 0xa8, 0x47], grassDark: [0x3f, 0x8a, 0x3a], grassLight: [0x82, 0xd0, 0x65],
  mowA: [0x66, 0xb8, 0x52], mowB: [0x54, 0xa2, 0x44],
  flowerWhite: [0xf6, 0xf2, 0xe4], flowerYellow: [0xf2, 0xd1, 0x52],
  bumperBody: [0xe2, 0x3b, 0x3b], bumperRing: [0x9c, 0x22, 0x22], bumperTop: [0xff, 0xe9, 0xe9], bumperShadow: [0x1f, 0x4a, 0x1c],
} as const;
type Rgb = readonly [number, number, number];

const CLIFF_BANDS: readonly Rgb[] = [C.cliffA, C.cliffB, C.cliffC, C.cliffD];

function put(buf: ArtBuf, x: number, y: number, c: Rgb, alpha = 255): void {
  const i = (y * buf.w + x) * 4;
  buf.data[i] = c[0];
  buf.data[i + 1] = c[1];
  buf.data[i + 2] = c[2];
  buf.data[i + 3] = alpha;
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

/** Tamanho (unidades) de cada pedra da mureta, medido no arco do topo. */
const STONE = 36;

/**
 * Pinta o fundo da arena: gramado, mureta de pedra (face de dentro, topo e face de fora), penhasco em camadas e o vazio
 * ao redor. O chão em blocos (`terrain-paint.ts`), as linhas (`paintArenaLines`) e os pinos de mola (`paintBumpers`) vão
 * por cima.
 */
export function paintArena(radius: number, seed = 1): ArtBuf {
  const size = artSize(radius);
  const buf: ArtBuf = { w: size, h: size, data: new Uint8ClampedArray(size * size * 4) };
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const wx = (px + 0.5 - size / 2) * UNITS_PER_PIXEL;
      const wy = (py + 0.5 - size / 2) * UNITS_PER_PIXEL;
      const d = Math.hypot(wx, wy);
      const out = d - radius;
      let color: Rgb;
      if (out > CLIFF) {
        // Vazio: noite com ondas e uma estrela de vez em quando.
        const n = hash(px >> 1, py >> 1, seed + 1);
        color = n < 0.012 ? C.voidStar : n < 0.09 || (px + py * 2) % 23 === 0 ? C.voidWave : C.void;
      } else if (out > OUTER_RIM) {
        // Penhasco: camadas que escurecem com a profundidade, com o limite entre elas picotado.
        const depth = (out - OUTER_RIM) / ((CLIFF - OUTER_RIM) / CLIFF_BANDS.length);
        const band = Math.min(CLIFF_BANDS.length - 1, Math.floor(depth));
        const next = Math.min(CLIFF_BANDS.length - 1, band + ((px + py) % 2 === 0 && depth - band > 0.55 ? 1 : 0));
        color = CLIFF_BANDS[hash(px, py, seed) < 0.1 ? Math.min(CLIFF_BANDS.length - 1, next + 1) : next]!;
      } else if (out > OUTER_FACE) {
        color = (px + py) % 2 === 0 ? C.wallOuterA : C.wallOuterB;
      } else if (out > -TOP_FACE) {
        // Topo da mureta: pedras claras e escuras, com argamassa entre elas e um brilho na quina de fora.
        const stone = ((Math.atan2(wy, wx) + Math.PI) * radius) / STONE;
        const within = stone - Math.floor(stone);
        if (within < 0.07) color = C.wallMortar;
        else if (out > OUTER_FACE - 2.2) color = C.wallEdge;
        else color = Math.floor(stone) % 2 === 0 ? C.wallTopA : C.wallTopB;
      } else if (out > -INNER_FACE) {
        // Face de dentro da mureta, mais escura, e a sombra dela caindo no gramado.
        if (out < -INNER_FACE + 4.5) color = C.wallInnerShadow;
        else color = Math.floor(((Math.atan2(wy, wx) + Math.PI) * radius) / STONE) % 2 === 0 ? C.wallInnerA : C.wallInnerB;
      } else {
        // Gramado cortado em faixas (anéis) e quadradinhos, com tufos e flores esparsas.
        const mow = Math.floor(d / 56) % 2 === 0;
        color = Math.floor(px / 3 + py / 3) % 2 === 0 ? (mow ? C.mowA : C.grassA) : mow ? C.grassB : C.mowB;
        const n = hash(px, py, seed);
        if (n < 0.035) color = C.grassDark;
        else if (n > 0.975) color = C.grassLight;
        else if (n > 0.9965) color = hash(px, py, seed + 7) < 0.5 ? C.flowerWhite : C.flowerYellow;
      }
      put(buf, px, py, color);
    }
  }
  return buf;
}

/** Distância do centro até a mureta onde o chão marcável acaba (veja `terrainHalf`). */
const FLOOR_EDGE = INNER_FACE;
/** Cada lado começa além desta fração do raio do chão, medida a partir da linha do meio. */
const START_ZONE = 0.34;
const CENTER_RING = 120;

const ZONE_ME: Rgb = [0x4f, 0x9b, 0xff];
const ZONE_FOE: Rgb = [0xff, 0x6a, 0x5a];
const CHALK: Rgb = [0xff, 0xff, 0xff];

/**
 * Camada transparente com o que dá leitura ao campo, desenhada por cima do chão em blocos: sombra da mureta no gramado,
 * as duas zonas de saída (azul embaixo, vermelha em cima), a linha do meio e o círculo central. Não interfere na física.
 */
export function paintArenaLines(radius: number): ArtBuf {
  const size = artSize(radius);
  const buf: ArtBuf = { w: size, h: size, data: new Uint8ClampedArray(size * size * 4) };
  const floor = radius - FLOOR_EDGE;
  const zoneEdge = floor * START_ZONE;
  const px1 = UNITS_PER_PIXEL * 0.75;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const wx = (px + 0.5 - size / 2) * UNITS_PER_PIXEL;
      const wy = (py + 0.5 - size / 2) * UNITS_PER_PIXEL;
      const d = Math.hypot(wx, wy);
      if (d > floor) continue;
      let color: Rgb | null = null;
      let alpha = 0;
      // Zonas de saída: um véu de cor e uma linha que as separa do meio do campo.
      if (Math.abs(wy) > zoneEdge) {
        color = wy > 0 ? ZONE_ME : ZONE_FOE;
        alpha = 34;
      }
      if (Math.abs(Math.abs(wy) - zoneEdge) < px1) {
        color = wy > 0 ? ZONE_ME : ZONE_FOE;
        alpha = 120;
      }
      // Linha do meio tracejada e círculo central (giz).
      if (Math.abs(wy) < px1 && Math.floor(wx / 44) % 2 === 0) {
        color = CHALK;
        alpha = 110;
      }
      if (Math.abs(d - CENTER_RING) < px1) {
        color = CHALK;
        alpha = 110;
      }
      if (d < 11) {
        color = CHALK;
        alpha = 140;
      }
      // Sombra da mureta: escurece o gramado perto da borda.
      const shade = Math.max(0, 1 - (floor - d) / 90);
      if (shade > 0) {
        const a = Math.round(shade * shade * 78);
        if (color === null) {
          color = [0, 0, 0];
          alpha = a;
        } else {
          alpha = Math.min(255, alpha + a);
        }
      }
      if (color) put(buf, px, py, color, alpha);
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
