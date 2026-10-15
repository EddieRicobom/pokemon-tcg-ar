import { seededRng } from '../core/battle';
import type { Tile } from '../core/village/map';
import type { FurnitureId } from '../core/village/life';
import type { Dir } from '../core/village/actors';
import { createBuf, EDGE, paintGround, TILE } from '../box/ground-art';
import type { PixelBuf } from '../box/ground-art';

/**
 * Pixel art da Vila, toda desenhada por código (sem imagens): blocos do chão, árvores, pedras, arbustos, água, a casa em
 * cada nível, os móveis e o seu personagem andando. Mesma paleta curta do chão da Caixa (`ground-art.ts`).
 */

export { TILE };

function put(buf: PixelBuf, x: number, y: number, rgb: number, a = 255): void {
  if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) return;
  const i = (y * buf.w + x) * 4;
  buf.data[i] = (rgb >> 16) & 255;
  buf.data[i + 1] = (rgb >> 8) & 255;
  buf.data[i + 2] = rgb & 255;
  buf.data[i + 3] = a;
}

function rect(buf: PixelBuf, x: number, y: number, w: number, h: number, rgb: number): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(buf, x + i, y + j, rgb);
}

function disc(buf: PixelBuf, cx: number, cy: number, rx: number, ry: number, rgb: number): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) put(buf, x, y, rgb);
  }
}

/** Contorno de 1 pixel em volta do que já foi desenhado (fundo transparente). */
function outline(buf: PixelBuf, rgb: number): void {
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < buf.w && y < buf.h && (buf.data[(y * buf.w + x) * 4 + 3] ?? 0) > 0;
  const marks: [number, number][] = [];
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) marks.push([x, y]);
    }
  }
  for (const [x, y] of marks) put(buf, x, y, rgb);
}

/** Desenha uma figura a partir de linhas de texto (um caractere por pixel) e uma paleta. */
function stamp(buf: PixelBuf, ox: number, oy: number, rows: readonly string[], palette: Record<string, number>, flip = false): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[flip ? row.length - 1 - x : x]!;
      const color = palette[ch];
      if (color !== undefined) put(buf, ox + x, oy + y, color);
    }
  });
}

// ----------------------------------------------------------------------------- chão

const SAND = { base: 0xf0dca0, dot: 0xd8c080, light: 0xfff0c0 };
const WATER = { base: 0x4f8fe0, deep: 0x3a74c8, light: 0x9cd0ff, foam: 0xe8f6ff };
const DIRT = { base: 0xb88a52, dark: 0x8e6638, light: 0xd2a66c, stake: 0x6a4a28 };

/**
 * Bloco do chão. `edges` = lados com vizinho de outro tipo (a água ganha espuma e a areia, borda); `frame` anima a água.
 */
export function paintTile(tile: Tile, edges: number, c: number, r: number, frame = 0): PixelBuf {
  const buf = createBuf(TILE, TILE);
  const rng = seededRng((c * 73856093) ^ (r * 19349663) ^ 0x5bd1e995);
  switch (tile) {
    case 'grass':
    case 'tree':
    case 'rock':
    case 'bush':
      paintGround(buf, 0, 0, (c + r) % 3 === 0 ? 'grass2' : 'grass', rng, 0, { c, r });
      break;
    case 'flower':
      paintGround(buf, 0, 0, 'flowers', rng, 0, { c, r });
      break;
    case 'tall':
      paintGround(buf, 0, 0, 'tall', rng, 0, { c, r });
      break;
    case 'path':
      paintGround(buf, 0, 0, 'path', rng, edges, { c, r });
      break;
    case 'sand':
      rect(buf, 0, 0, TILE, TILE, SAND.base);
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if ((x * 5 + y * 3 + c * 7 + r * 13) % 19 === 0) put(buf, x, y, (x + y) % 2 ? SAND.dot : SAND.light);
      break;
    case 'water': {
      rect(buf, 0, 0, TILE, TILE, WATER.base);
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const wave = (x + c * 16 + frame * 3 + Math.floor((y + r * 16) / 4) * 5) % 12;
          if ((y + r) % 4 === 0 && wave < 4) put(buf, x, y, WATER.light);
          else if ((y + r) % 4 === 2 && wave > 8) put(buf, x, y, WATER.deep);
        }
      }
      // Espuma onde encontra terra.
      for (let t = 0; t < TILE; t++) {
        if (edges & EDGE.north) put(buf, t, (t + frame) % 3 === 0 ? 1 : 0, WATER.foam);
        if (edges & EDGE.south) put(buf, t, TILE - 1 - ((t + frame) % 3 === 0 ? 1 : 0), WATER.foam);
        if (edges & EDGE.west) put(buf, (t + frame) % 3 === 0 ? 1 : 0, t, WATER.foam);
        if (edges & EDGE.east) put(buf, TILE - 1 - ((t + frame) % 3 === 0 ? 1 : 0), t, WATER.foam);
      }
      break;
    }
    case 'plot':
      rect(buf, 0, 0, TILE, TILE, DIRT.base);
      for (let y = 1; y < TILE; y += 4) for (let x = 0; x < TILE; x++) put(buf, x, y, (x + r) % 6 === 0 ? DIRT.light : DIRT.dark);
      if (edges & EDGE.north) for (let x = 1; x < TILE; x += 5) rect(buf, x, 0, 2, 3, DIRT.stake);
      break;
  }
  return buf;
}

// ----------------------------------------------------------------------------- objetos

/** Árvore de 16×32 (a copa sobe um bloco acima do tronco). */
export function paintTree(variant = 0): PixelBuf {
  const buf = createBuf(16, 32);
  const leaf = variant % 2 ? 0x3f9a44 : 0x4aa84a;
  rect(buf, 6, 20, 4, 10, 0x8a5a2e);
  rect(buf, 6, 20, 1, 10, 0xa8743e);
  disc(buf, 8, 12, 7, 8, leaf);
  disc(buf, 6, 9, 3.5, 3.5, 0x6cc85c);
  disc(buf, 10, 16, 4, 3, 0x2f7f36);
  put(buf, 4, 7, 0x9ee080);
  put(buf, 5, 6, 0x9ee080);
  if (variant % 3 === 2) for (const [x, y] of [[4, 13], [11, 10], [9, 17]] as const) put(buf, x, y, 0xe8453c);
  outline(buf, 0x1d4a22);
  return buf;
}

export function paintRock(): PixelBuf {
  const buf = createBuf(16, 16);
  disc(buf, 8, 10, 6.5, 5, 0x9a968e);
  disc(buf, 6.5, 8.5, 3.5, 2.5, 0xc4c0b8);
  disc(buf, 10, 12.5, 4.5, 1.6, 0x6e6a64);
  put(buf, 5, 7, 0xe6e2da);
  outline(buf, 0x3a3834);
  return buf;
}

export function paintBush(withFruit: boolean): PixelBuf {
  const buf = createBuf(16, 16);
  disc(buf, 8, 9, 7, 6, 0x3f9a44);
  disc(buf, 6, 7, 3, 2.5, 0x5cb84e);
  disc(buf, 10, 12, 4, 2, 0x2f7f36);
  if (withFruit) for (const [x, y, c] of [[4, 9, 0x4a6ae8], [9, 6, 0xf28ab0], [11, 10, 0x4a6ae8], [7, 12, 0xf28ab0]] as const) rect(buf, x, y, 2, 2, c);
  outline(buf, 0x1d4a22);
  return buf;
}

/** A casa em cada nível: 64 de largura (4 blocos) por 64 de altura (o telhado sobe um bloco acima do terreno). */
export function paintHouse(level: number): PixelBuf {
  const buf = createBuf(64, 64);
  if (level <= 0) return buf;
  if (level === 1) {
    // Barraca listrada.
    for (let y = 22; y < 62; y++) {
      const half = Math.round(((y - 22) / 40) * 26) + 2;
      for (let x = 32 - half; x <= 32 + half; x++) put(buf, x, y, Math.floor((x + 64) / 6) % 2 ? 0xe86a4a : 0xf6e2c0);
    }
    for (let y = 44; y < 62; y++) {
      const half = Math.round(((y - 44) / 18) * 7);
      for (let x = 32 - half; x <= 32 + half; x++) put(buf, x, y, 0x3a2a2a);
    }
    rect(buf, 31, 18, 2, 5, 0x6a4a28);
    outline(buf, 0x3a1a14);
    return buf;
  }
  const wall = level === 2 ? 0xa8743e : 0xf2e6c8;
  const roof = level === 2 ? 0x6a4a28 : 0xd8463c;
  const roofDark = level === 2 ? 0x4e361e : 0xa83228;
  rect(buf, 6, 30, 52, 32, wall);
  if (level === 2) for (let y = 33; y < 62; y += 5) rect(buf, 6, y, 52, 1, 0x8a5a2e);
  // Telhado em degraus.
  for (let y = 10; y < 32; y++) {
    const inset = Math.round(((32 - y) / 22) * 18);
    for (let x = 2 + inset; x < 62 - inset; x++) put(buf, x, y, (y - 10) % 4 === 3 ? roofDark : roof);
  }
  // Porta e janelas.
  rect(buf, 27, 44, 10, 18, 0x7a4a24);
  put(buf, 34, 53, 0xffd84a);
  if (level >= 3) {
    for (const x of [11, 43]) {
      rect(buf, x, 38, 10, 9, 0x8fd0ff);
      rect(buf, x + 4, 38, 2, 9, wall);
      rect(buf, x, 42, 10, 1, wall);
    }
    rect(buf, 46, 4, 6, 12, 0x9a968e);
  } else {
    rect(buf, 12, 40, 8, 7, 0x8fd0ff);
  }
  if (level >= 4) {
    for (const x of [9, 41]) {
      rect(buf, x, 47, 14, 3, 0x8a5a2e);
      for (let i = 0; i < 6; i++) put(buf, x + 1 + i * 2, 46, [0xf06048, 0xffd84a, 0xf8a8c8][i % 3]!);
    }
  }
  outline(buf, 0x2a1a10);
  return buf;
}

/** Móvel de 16×16. `lit`: o lampião acende à noite; `frame` anima a fonte. */
export function paintFurniture(item: FurnitureId, lit = false, frame = 0): PixelBuf {
  const buf = createBuf(16, 16);
  switch (item) {
    case 'cadeira':
      rect(buf, 4, 2, 8, 7, 0x9a6a3a);
      rect(buf, 5, 3, 6, 5, 0xb8844a);
      rect(buf, 3, 9, 10, 2, 0x8a5a2e);
      rect(buf, 4, 11, 2, 4, 0x6a4a28);
      rect(buf, 10, 11, 2, 4, 0x6a4a28);
      break;
    case 'mesa':
      rect(buf, 1, 5, 14, 4, 0xb8844a);
      rect(buf, 1, 5, 14, 1, 0xd2a66c);
      rect(buf, 2, 9, 2, 6, 0x6a4a28);
      rect(buf, 12, 9, 2, 6, 0x6a4a28);
      break;
    case 'luminaria':
      rect(buf, 7, 6, 2, 9, 0x4a4a52);
      rect(buf, 5, 13, 6, 2, 0x4a4a52);
      rect(buf, 5, 1, 6, 6, lit ? 0xffe27a : 0xc8b070);
      rect(buf, 6, 2, 4, 4, lit ? 0xfff6c0 : 0xe0d098);
      break;
    case 'vaso':
      rect(buf, 4, 9, 8, 6, 0xc8643c);
      rect(buf, 3, 8, 10, 2, 0xe07a4c);
      for (const [x, y, c] of [[5, 4, 0xf06048], [8, 3, 0xffd84a], [10, 5, 0xf8a8c8], [7, 6, 0x4aa84a], [6, 7, 0x4aa84a], [9, 7, 0x4aa84a]] as const) rect(buf, x, y, 2, 2, c);
      break;
    case 'fonte':
      disc(buf, 8, 11, 7, 4, 0x9a968e);
      disc(buf, 8, 10.5, 5.5, 2.6, WATER.base);
      rect(buf, 7, 3, 2, 8, 0x9a968e);
      for (const [x, y] of (frame % 2 ? [[5, 4], [11, 5], [8, 1]] : [[6, 5], [10, 4], [8, 2]]) as [number, number][]) put(buf, x, y, WATER.light);
      break;
    case 'cerca':
      rect(buf, 2, 4, 2, 11, 0xd2a66c);
      rect(buf, 12, 4, 2, 11, 0xd2a66c);
      rect(buf, 0, 6, 16, 2, 0xb8844a);
      rect(buf, 0, 11, 16, 2, 0xb8844a);
      break;
    case 'placa':
      rect(buf, 7, 9, 2, 6, 0x6a4a28);
      rect(buf, 2, 2, 12, 8, 0xb8844a);
      rect(buf, 4, 4, 8, 1, 0x6a4a28);
      rect(buf, 4, 6, 6, 1, 0x6a4a28);
      break;
  }
  outline(buf, 0x2a1a10);
  return buf;
}

// ----------------------------------------------------------------------------- você

export interface Outfit {
  cap: number;
  capShade: number;
  hair: number;
  shirt: number;
  shirtShade: number;
  pants: number;
}

const OUTFITS: readonly Outfit[] = [
  { cap: 0xe04040, capShade: 0xa82828, hair: 0x3a2a1a, shirt: 0x3a6ad8, shirtShade: 0x2a4aa8, pants: 0x3a3a4a },
  { cap: 0xf6f6f6, capShade: 0xc8c8d0, hair: 0x2a2a3a, shirt: 0xe86aa0, shirtShade: 0xb84a78, pants: 0x2a2a3a },
  { cap: 0x4aa84a, capShade: 0x2f7f36, hair: 0x6a3a1a, shirt: 0xf2c84a, shirtShade: 0xc89a2a, pants: 0x4a5a8a },
  { cap: 0x3a3a4a, capShade: 0x22222e, hair: 0xd8b060, shirt: 0xe86a3a, shirtShade: 0xb84a22, pants: 0x3a6ad8 },
  { cap: 0x8a5ad8, capShade: 0x6a3aa8, hair: 0x1a1a24, shirt: 0x4ac8c8, shirtShade: 0x2a9898, pants: 0x3a3a4a },
];

/** As cores do seu personagem vêm do treinador escolhido (cada um cai numa das roupas). */
export function outfitFor(trainerId: string): Outfit {
  let h = 0;
  for (let i = 0; i < trainerId.length; i++) h = (h * 31 + trainerId.charCodeAt(i)) >>> 0;
  return OUTFITS[h % OUTFITS.length]!;
}

const DOWN = [
  '......KKKK......',
  '....KKCCCCKK....',
  '...KCCCCCCCCK...',
  '...KCCCCCCCcK...',
  '..KccccccccccK..',
  '..KHSSSSSSSSHK..',
  '..KHSESSSSESHK..',
  '...KSSSSSSSSK...',
  '....KsSSSSsK....',
  '...KTTTTTTTTK...',
  '..KTTTTWWTTTTK..',
  '..KSTTTTTTTTSK..',
  '..KSTTTTTTTTSK..',
  '...KttttttttK...',
  '...KPPPPPPPPK...',
  '...KPPPKKPPPK...',
];
const UP = [
  '......KKKK......',
  '....KKCCCCKK....',
  '...KCCCCCCCCK...',
  '...KCCCCCCCCK...',
  '..KccccccccccK..',
  '..KHHHHHHHHHHK..',
  '..KHHHHHHHHHHK..',
  '...KHHHHHHHHK...',
  '....KsSSSSsK....',
  '...KTTTTTTTTK...',
  '..KTTTTTTTTTTK..',
  '..KSTTTTTTTTSK..',
  '..KSTTTTTTTTSK..',
  '...KttttttttK...',
  '...KPPPPPPPPK...',
  '...KPPPKKPPPK...',
];
const SIDE = [
  '.....KKKK.......',
  '...KKCCCCKK.....',
  '..KCCCCCCCCK....',
  '..KCCCCCCCCcK...',
  '..KcccccccccccK.',
  '..KHHHSSSSSKK...',
  '..KHHHSSSESK....',
  '...KHHSSSSSK....',
  '....KsSSSsK.....',
  '....KTTTTTK.....',
  '...KTTTTTTTK....',
  '...KTTSSTTTK....',
  '...KTTSSTTTK....',
  '....KtttttK.....',
  '....KPPPPPK.....',
  '....KPPKPPK.....',
];
const LEGS: Record<'still' | 'a' | 'b', readonly string[]> = {
  still: ['...KPPK..KPPK...', '...KBBK..KBBK...', '...KKK....KKK...'],
  a: ['..KPPK...KPPK...', '..KBBK...KKKK...', '..KKK...........'],
  b: ['...KPPK...KPPK..', '...KKKK...KBBK..', '...........KKK..'],
};
const SIDE_LEGS: Record<'still' | 'a' | 'b', readonly string[]> = {
  still: ['....KPPKPPK.....', '....KBBKBBK.....', '....KKKKKKK.....'],
  a: ['...KPPK.KPPK....', '...KBBK.KBBK....', '...KKK..KKK.....'],
  b: ['.....KPPPK......', '.....KBBBK......', '.....KKKKK......'],
};

/** Seu personagem, 16×20, olhando para `dir`; `step` alterna as pernas ao andar (−1 = parado). */
export function paintPlayer(dir: Dir, step: number, outfit: Outfit): PixelBuf {
  const buf = createBuf(16, 20);
  const pal: Record<string, number> = {
    K: 0x1a1a24, C: outfit.cap, c: outfit.capShade, H: outfit.hair, S: 0xf6d0a8, s: 0xd8a880, E: 0x1a1a24, T: outfit.shirt, t: outfit.shirtShade, W: 0xffffff, P: outfit.pants, B: 0x6a3a1a,
  };
  const legs = step < 0 ? 'still' : step % 2 ? 'a' : 'b';
  if (dir === 'down' || dir === 'up') {
    stamp(buf, 0, 0, dir === 'down' ? DOWN : UP, pal);
    stamp(buf, 0, 16, LEGS[legs], pal);
  } else {
    const flip = dir === 'left';
    stamp(buf, 0, 0, SIDE, pal, flip);
    stamp(buf, 0, 16, SIDE_LEGS[legs], pal, flip);
  }
  return buf;
}
