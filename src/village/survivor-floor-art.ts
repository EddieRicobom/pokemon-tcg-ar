import { createBuf } from '../box/ground-art';
import type { PixelBuf } from '../box/ground-art';

/**
 * Pixel art do chão da Torre, no traço das rotas da quarta geração: base chapada com tufinhos em padrão regular,
 * flores de quatro pétalas com contorno, pedrinhas com luz e sombra. Tudo em código (sem canvas), então roda e é
 * testado em qualquer ambiente; `survivor-landscape.ts` transforma os buffers em ladrilhos.
 */

export type SurvivorFloorKind = 'grass' | 'meadow' | 'autumn' | 'snow' | 'sand' | 'dust';

export interface SurvivorFloorPalette {
  /** Cor dominante: igual à borda dos autotiles da mesma região, para a trilha emendar sem costura. */
  base: number;
  light: number;
  shade: number;
  deep: number;
  glint: number;
}

export const SURVIVOR_FLOOR_PALETTES: Record<SurvivorFloorKind, SurvivorFloorPalette> = {
  // Verde-água das rotas de HeartGold e SoulSilver: os mesmos tons da borda de `at-path`, `at-plot`, `at-plaza` e
  // `sand-grass` e da sombra das árvores do atlas.
  grass: { base: 0x70c8a0, light: 0xa0e0c0, shade: 0x40b088, deep: 0x18a068, glint: 0xc8f0d8 },
  // Borda de `at-trail`.
  meadow: { base: 0x82ba7e, light: 0xa2d294, shade: 0x6aa468, deep: 0x528a56, glint: 0xc8e4a8 },
  // Capim verde-amarelado dos bosques de outono; a borda verde-água dos autotiles recebe estes tons.
  autumn: { base: 0xb8d078, light: 0xd8e8a0, shade: 0x98b858, deep: 0x6e9a40, glint: 0xf0c050 },
  // Borda de `at-snow` e `at-snow-rock`.
  snow: { base: 0xeeeef4, light: 0xffffff, shade: 0xc2dce5, deep: 0x98b8cc, glint: 0xffffff },
  // Borda de `at-sand` e `at-harvest-stone`.
  sand: { base: 0xd8c880, light: 0xe8e0a0, shade: 0xd0b068, deep: 0xb09050, glint: 0xf8f0c8 },
  // Borda de `at-ruins`, `at-brick` e `at-ruins-path`.
  dust: { base: 0xc1a35a, light: 0xd6bc78, shade: 0xa88a48, deep: 0x8a6e38, glint: 0xe0cc90 },
};

export const FLOOR_TEXTURE_SIZE = 64;
export const DECOR_SIZE = 16;

function put(buf: PixelBuf, x: number, y: number, rgb: number, a = 255): void {
  if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) return;
  const i = (y * buf.w + x) * 4;
  buf.data[i] = (rgb >> 16) & 255;
  buf.data[i + 1] = (rgb >> 8) & 255;
  buf.data[i + 2] = rgb & 255;
  buf.data[i + 3] = a;
}

/** Na textura base as marcas dão a volta na borda: o ladrilho de 64 px repete sem costura. */
function wrapPut(buf: PixelBuf, x: number, y: number, rgb: number): void {
  put(buf, ((x % buf.w) + buf.w) % buf.w, ((y % buf.h) + buf.h) % buf.h, rgb);
}

/** Hash inteiro determinístico (sem estado), para posições e variantes. */
export function floorHash(...values: number[]): number {
  let h = 0x811c9dc5;
  for (const value of values) {
    h = Math.imul(h ^ (value | 0), 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
  }
  h ^= h >>> 13;
  return (h >>> 0) / 0x100000000;
}

/** Desenha um molde de texto: cada caractere é uma cor da tabela; `.` e espaço ficam vazios. */
function stamp(buf: PixelBuf, x: number, y: number, rows: readonly string[], colors: Record<string, number>, wrap = false): void {
  rows.forEach((row, dy) => {
    [...row].forEach((ch, dx) => {
      const color = colors[ch];
      if (color === undefined) return;
      if (wrap) wrapPut(buf, x + dx, y + dy, color);
      else put(buf, x + dx, y + dy, color);
    });
  });
}

// Tufinho em "v" das rotas: duas lâminas escuras com o brilho entre elas.
const TUFT_SMALL = ['D.D', '.d.'];
const TUFT_WIDE = ['D.D.D', '.dLd.'];
const SNOW_ARC = ['s..s', '.ss.'];
const SAND_DOTS = ['s.', '.l'];
const SAND_ARC = ['.ll.', 's..s'];
const PEBBLE = ['.l.', 'dsd'];
const CRACK = ['d..', '.dd', '...d'];

/**
 * Textura de 64 × 64 da base: cor chapada e marcas numa grade com pequeno desvio, como nos ladrilhos feitos à mão
 * (nada de ruído pixel a pixel, que no celular vira chuvisco).
 */
export function survivorFloorTexture(kind: SurvivorFloorKind): PixelBuf {
  const p = SURVIVOR_FLOOR_PALETTES[kind];
  const size = FLOOR_TEXTURE_SIZE;
  const buf = createBuf(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(buf, x, y, p.base);
  const colors = { d: p.shade, D: p.deep, L: p.light, l: p.light, s: p.shade };
  const salt = kind.length * 97 + kind.charCodeAt(0);
  for (let row = 0; row < size / 8; row++) {
    for (let col = 0; col < size / 8; col++) {
      const h = floorHash(salt, row, col);
      const x = col * 8 + (row % 2) * 4 + Math.floor(floorHash(salt, row, col, 1) * 3) - 1;
      const y = row * 8 + Math.floor(floorHash(salt, row, col, 2) * 4);
      if (kind === 'snow') {
        if (h < 0.3) stamp(buf, x, y, SNOW_ARC, colors, true);
        else if (h < 0.42) wrapPut(buf, x + 1, y, p.shade);
      } else if (kind === 'sand') {
        if (h < 0.26) stamp(buf, x, y, SAND_DOTS, colors, true);
        else if (h < 0.42) stamp(buf, x, y, SAND_ARC, colors, true);
      } else if (kind === 'dust') {
        if (h < 0.2) stamp(buf, x, y, PEBBLE, { l: p.light, d: p.deep, s: p.shade }, true);
        else if (h < 0.3) stamp(buf, x, y, CRACK, colors, true);
        else if (h < 0.45) wrapPut(buf, x, y, p.shade);
      } else if (h < 0.32) stamp(buf, x, y, TUFT_SMALL, colors, true);
      else if (h < 0.52) stamp(buf, x, y, TUFT_WIDE, colors, true);
      else if (h < 0.6) wrapPut(buf, x + 1, y + 1, p.light);
    }
  }
  return buf;
}

/**
 * Tons do chão verde-água que o atlas traz pintados na borda dos autotiles, sob as árvores (`tree-big`, `pine-*`) e no
 * pé do mato alto (`tall`), cada um com o papel que ocupa na paleta. Folhas de arbusto também são verde-água, mas
 * têm outros tons e ficam fora da lista.
 */
export const GRASS_BASE_TONES: ReadonlyMap<number, keyof SurvivorFloorPalette> = new Map([
  [0x70c8a0, 'base'], [0xa0e0c0, 'light'], [0x7bd694, 'light'], [0x40b088, 'shade'], [0x54c085, 'shade'], [0x18a068, 'deep'], [0x2d9567, 'deep'],
]);

/** O corpo do mato alto vem num verde-azulado escuro; na grama viva das rotas ele fica verde de folha. */
export const TALL_GRASS_TONES: ReadonlyMap<number, number> = new Map([[0x3f6f5e, 0x3d7a48], [0x364b44, 0x2b5236]]);

/** Cor que um pixel do atlas recebe no chão da região: só os tons das duas listas mudam. */
export function floorTone(rgb: number, floor: SurvivorFloorKind): number {
  const role = GRASS_BASE_TONES.get(rgb);
  return role ? SURVIVOR_FLOOR_PALETTES[floor][role] : TALL_GRASS_TONES.get(rgb) ?? rgb;
}

export type SurvivorDecorKind = 'tuft' | 'flowers' | 'pebbles' | 'leaves' | 'drift' | 'shell' | 'ripple' | 'crack' | 'clover';

export interface FlowerColors { petal: number; shade: number; light: number; core: number }

/** Flores das rotas: vermelha, amarela, rosa, branca e azul. */
export const SURVIVOR_FLOWER_COLORS: Record<'red' | 'orange' | 'yellow' | 'pink' | 'white' | 'blue', FlowerColors> = {
  red: { petal: 0xe85850, shade: 0xb03840, light: 0xf8a090, core: 0xf8e070 },
  orange: { petal: 0xf09048, shade: 0xc06028, light: 0xf8c898, core: 0xf8f0a0 },
  yellow: { petal: 0xf0d040, shade: 0xc89820, light: 0xf8f0a0, core: 0xe07830 },
  pink: { petal: 0xf090c0, shade: 0xc06090, light: 0xf8c8e0, core: 0xf8e070 },
  white: { petal: 0xf4f4f0, shade: 0xb8c0c8, light: 0xffffff, core: 0xf0c040 },
  blue: { petal: 0x7098e8, shade: 0x4868b8, light: 0xb0c8f8, core: 0xf8e070 },
};

const FLOWER = ['.oPo.', 'oPWPo', 'PWcWP', 'oPWPo', '.oPo.'];
const TALL_TUFT = ['..d...d', 'd.d..dd', '.dLd.Ld', '..DDDD.'];
const LEAF_A = ['ab', 'b.'];
const LEAF_B = ['.a', 'ab'];
const DRIFT = ['...llll...', '.llwwwwll.', 'lwwwwwwwwl', 'lwwwwwwssl', '.ssssssss.'];
const SHELL = ['.pp', 'pwp', 'ss.'];
const CLOVER = ['.g.g', 'gGgG', '.gG.'];

/**
 * Detalhe de 16 × 16 com fundo transparente, desenhado por cima da base. `variant` muda a posição das peças para
 * que dois blocos vizinhos nunca pareçam carimbos iguais.
 */
export function survivorDecorTile(kind: SurvivorDecorKind, floor: SurvivorFloorKind, variant: number, flowers: readonly FlowerColors[] = [SURVIVOR_FLOWER_COLORS.red], frame = 0): PixelBuf {
  const p = SURVIVOR_FLOOR_PALETTES[floor];
  const buf = createBuf(DECOR_SIZE, DECOR_SIZE);
  const v = Math.abs(variant | 0);
  const jitter = (n: number, span: number) => Math.floor(floorHash(v, n, kind.length) * span);
  switch (kind) {
    case 'tuft':
      stamp(buf, 2 + jitter(1, 6), 3 + jitter(2, 6), TALL_TUFT, { d: p.shade, D: p.deep, L: p.light });
      if (v % 3 === 0) stamp(buf, 1 + jitter(3, 4), 11, TUFT_SMALL, { d: p.shade, D: p.deep });
      break;
    case 'flowers': {
      const spots = v % 2 ? [[1, 1], [9, 8]] : [[8, 1], [2, 9]];
      spots.forEach(([x, y], i) => {
        const c = flowers[(v + i) % flowers.length]!;
        // Sombra no chão e duas folhinhas embaixo, como nas flores das rotas; no segundo quadro a flor balança 1 px
        // (cada uma para um lado) e a base fica parada.
        const sway = frame % 2 ? (i % 2 ? -1 : 1) : 0;
        stamp(buf, x! + 1, y! + 5, ['.ggg.'], { g: p.deep });
        stamp(buf, x! + sway, y!, FLOWER, { o: c.shade, P: c.petal, W: c.light, c: c.core });
      });
      break;
    }
    case 'pebbles': {
      // Pedrinhas com contorno escuro, luz no alto e sombra no chão, como as das rotas.
      const stone = { k: 0x58585e, l: 0xe8e8e0, s: 0xb8b8b0, d: 0x88888e, g: p.deep };
      stamp(buf, 1 + jitter(1, 4), 2 + jitter(2, 3), ['.kkkk.', 'kllssk', 'klsssk', 'ksssdk', '.kkkk.', '..gggg'], stone);
      stamp(buf, 9 + jitter(3, 3), 9 + jitter(4, 3), ['.kkk.', 'klsdk', 'kssdk', '.kkk.', '..gg.'], stone);
      break;
    }
    case 'leaves': {
      const tones = [{ a: 0xe07838, b: 0xa84c28 }, { a: 0xe8b040, b: 0xb07828 }, { a: 0xc84838, b: 0x883028 }];
      for (let i = 0; i < 4; i++) {
        const t = tones[(v + i) % tones.length]!;
        stamp(buf, jitter(i * 2 + 1, 13), jitter(i * 2 + 2, 13), i % 2 ? LEAF_A : LEAF_B, t);
      }
      break;
    }
    case 'drift':
      stamp(buf, 1 + jitter(1, 6), 3 + jitter(2, 8), DRIFT, { l: p.shade, w: 0xffffff, s: p.deep });
      break;
    case 'shell':
      stamp(buf, 3 + jitter(1, 9), 3 + jitter(2, 9), SHELL, { p: 0xf0a8a0, w: 0xfff0e8, s: p.deep });
      if (v % 2) stamp(buf, 1 + jitter(3, 12), 1 + jitter(4, 12), ['l.', '.s'], { l: p.light, s: p.shade });
      break;
    case 'ripple':
      for (let i = 0; i < 3; i++) stamp(buf, jitter(i + 1, 10), 2 + i * 5, ['ss..ss', '..ll..'], { s: p.deep, l: p.light });
      break;
    case 'crack':
      stamp(buf, 2 + jitter(1, 6), 2 + jitter(2, 6), ['d....', '.dd..', '...d.', '...dd', '....d'], { d: p.deep });
      stamp(buf, 1 + jitter(3, 10), 12, PEBBLE, { l: p.light, d: p.deep, s: p.shade });
      break;
    case 'clover':
      stamp(buf, 2 + jitter(1, 8), 2 + jitter(2, 8), CLOVER, { g: p.shade, G: p.deep });
      stamp(buf, 1 + jitter(3, 10), 10 + jitter(4, 3), CLOVER, { g: p.shade, G: p.deep });
      break;
  }
  return buf;
}

/**
 * As sombras e a base verde-água das árvores, do mato alto e da borda dos autotiles foram pintadas para um chão
 * verde-água. Cada um desses tons recebe o tom de mesmo papel na paleta da região; o resto fica intacto.
 */
export function recolorGrassBase(source: { w: number; h: number; data: Uint8Array | Uint8ClampedArray }, floor: SurvivorFloorKind): Uint8ClampedArray {
  const out = new Uint8ClampedArray(source.data);
  for (let i = 0; i < out.length; i += 4) {
    if (!out[i + 3]) continue;
    const rgb = (out[i]! << 16) | (out[i + 1]! << 8) | out[i + 2]!;
    const tone = floorTone(rgb, floor);
    if (tone === rgb) continue;
    out[i] = tone >> 16;
    out[i + 1] = (tone >> 8) & 255;
    out[i + 2] = tone & 255;
  }
  return out;
}

export type FoliageTint = 'green' | 'deep' | 'lime' | 'gold' | 'orange' | 'snowy';

/** Papel de cada tom das copas do atlas (`tree-big`, `pine-*`): brilho, meio-tom, sombra e contorno. */
const FOLIAGE_ROLES: ReadonlyMap<number, 0 | 1 | 2 | 3> = new Map([
  [0xb6fb82, 0], [0xb6fb81, 0], [0xb7fb82, 0], [0xb1f77e, 0],
  [0x7ace58, 1], [0x79ce58, 1], [0x75cb54, 1],
  [0x2e8828, 2], [0x2c8626, 2], [0x389030, 2],
  [0x2e4e0b, 3], [0x2d4d0b, 3], [0x2f4f0b, 3], [0x385810, 3],
]);

/** Copas em vários tons, como as florestas misturadas das rotas: verde-escuro, lima, dourado, laranja e nevado. */
export const FOLIAGE_TINTS: Record<Exclude<FoliageTint, 'green'>, readonly [number, number, number, number]> = {
  deep: [0x78d070, 0x3c9a40, 0x1e6a2c, 0x143c10],
  lime: [0xe8f890, 0xb0d848, 0x6a9a20, 0x3a5208],
  gold: [0xfff0a0, 0xf0c040, 0xc08820, 0x6a4410],
  orange: [0xffd090, 0xe89040, 0xb05a20, 0x5a2c10],
  snowy: [0xffffff, 0xd8eef0, 0x2c8626, 0x2e4e0b],
};

/** Troca só os tons das copas; tronco, sombra no chão e transparência ficam como estão. */
export function tintFoliage(data: Uint8Array | Uint8ClampedArray, tint: FoliageTint): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);
  if (tint === 'green') return out;
  const tones = FOLIAGE_TINTS[tint];
  for (let i = 0; i < out.length; i += 4) {
    if (!out[i + 3]) continue;
    const role = FOLIAGE_ROLES.get((out[i]! << 16) | (out[i + 1]! << 8) | out[i + 2]!);
    if (role === undefined) continue;
    const tone = tones[role];
    out[i] = tone >> 16;
    out[i + 1] = (tone >> 8) & 255;
    out[i + 2] = tone & 255;
  }
  return out;
}
