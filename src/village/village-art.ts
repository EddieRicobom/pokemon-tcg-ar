import { seededRng } from '../core/battle';
import type { Tile } from '../core/village/map';
import { createBuf, EDGE, paintGround, TILE } from '../box/ground-art';
import type { PixelBuf } from '../box/ground-art';

/**
 * Pixel art da Vila, toda desenhada por código (sem imagens): blocos do chão, árvores, pedras, arbustos, água, a casa em
 * cada nível, os móveis e o seu personagem andando. Mesma paleta curta do chão da Caixa (`ground-art.ts`).
 */

export { TILE };

export function put(buf: PixelBuf, x: number, y: number, rgb: number, a = 255): void {
  if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) return;
  const i = (y * buf.w + x) * 4;
  buf.data[i] = (rgb >> 16) & 255;
  buf.data[i + 1] = (rgb >> 8) & 255;
  buf.data[i + 2] = rgb & 255;
  buf.data[i + 3] = a;
}

export function rect(buf: PixelBuf, x: number, y: number, w: number, h: number, rgb: number): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(buf, x + i, y + j, rgb);
}

export function disc(buf: PixelBuf, cx: number, cy: number, rx: number, ry: number, rgb: number): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) put(buf, x, y, rgb);
  }
}

/** Contorno de 1 pixel em volta do que já foi desenhado (fundo transparente). */
export function outline(buf: PixelBuf, rgb: number): void {
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

// ----------------------------------------------------------------------------- chão

const SAND = { base: 0xf0dca0, dot: 0xd8c080, light: 0xfff0c0 };
const WATER = { base: 0x4f8fe0, deep: 0x3a74c8, light: 0x9cd0ff, foam: 0xe8f6ff };
const DIRT = { base: 0xb88a52, dark: 0x8e6638, light: 0xd2a66c, stake: 0x6a4a28 };

/**
 * Um recorte real de tileset (ver THIRD_PARTY_NOTICES.md) pra usar como grama da Vila em vez do ladrilho
 * desenhado por código: 32×32 (2×2 variações de 16×16, pra não repetir sempre o mesmo pixel a pixel).
 */
export interface GroundTileImage {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

/** Copia uma das 4 variações de 16×16 do recorte (conforme a posição do bloco, pra variar) para o bloco do chão. */
function paintGroundTileImage(buf: PixelBuf, img: GroundTileImage, c: number, r: number): void {
  const qx = (c % 2) * TILE;
  const qy = (r % 2) * TILE;
  for (let y = 0; y < TILE; y++) {
    const srcRow = ((qy + y) * img.w + qx) * 4;
    const dstRow = (y * TILE) * 4;
    buf.data.set(img.data.subarray(srcRow, srcRow + TILE * 4), dstRow);
  }
}

/**
 * Bloco do chão. `edges` = lados com vizinho de outro tipo (a água ganha espuma e a areia, borda); `frame` anima a
 * água. `groundTile` (opcional): recorte real de tileset pra grama — sem ele, cai no ladrilho desenhado por código
 * de sempre (a trilha, a água, a areia e os canteiros ainda são desenhados por código; o resto do tileset da
 * cidade é um próximo passo, ver IMPLEMENTATION_PLAN.md).
 */
export function paintTile(tile: Tile, edges: number, c: number, r: number, frame = 0, groundTile?: GroundTileImage): PixelBuf {
  const buf = createBuf(TILE, TILE);
  const rng = seededRng((c * 73856093) ^ (r * 19349663) ^ 0x5bd1e995);
  switch (tile) {
    case 'shop':
      paintGround(buf, 0, 0, 'path', rng, 0, { c, r });
      break;
    case 'grass':
    case 'building':
    case 'lamp':
    case 'tree':
    case 'rock':
    case 'bush':
      if (groundTile) paintGroundTileImage(buf, groundTile, c, r);
      else paintGround(buf, 0, 0, (c + r) % 3 === 0 ? 'grass2' : 'grass', rng, 0, { c, r });
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

// O personagem (visual por treinador do perfil) fica em player-art.ts.
export { outfitFor, paintPlayer } from './player-art';
export type { Outfit } from './player-art';

/** A loja da praça: barraca de 48×48 com toldo listrado, balcão e caixotes de frutas. */
export function paintShop(): PixelBuf {
  const buf = createBuf(48, 48);
  rect(buf, 4, 22, 40, 24, 0xd2a66c);
  for (let y = 25; y < 46; y += 4) rect(buf, 4, y, 40, 1, 0xb8844a);
  rect(buf, 4, 30, 40, 6, 0x8a5a2e);
  rect(buf, 4, 30, 40, 1, 0xa8743e);
  for (const [x, c] of [[8, 0x4a6ae8], [17, 0xf8a8c8], [26, 0xffd84a], [35, 0xe84a3a]] as const) {
    rect(buf, x, 27, 6, 3, 0x6a4a28);
    for (let i = 0; i < 3; i++) rect(buf, x + i * 2, 26, 2, 2, c);
  }
  rect(buf, 4, 8, 2, 22, 0x6a4a28);
  rect(buf, 42, 8, 2, 22, 0x6a4a28);
  for (let y = 4; y < 16; y++) for (let x = 1; x < 47; x++) put(buf, x, y, Math.floor(x / 6) % 2 ? 0xd8463c : 0xf6f6f6);
  for (let x = 1; x < 47; x += 6) for (let k = 0; k < 3; k++) rect(buf, x + k, 16 + k, 6 - 2 * k, 1, Math.floor(x / 6) % 2 ? 0xd8463c : 0xf6f6f6);
  rect(buf, 18, 0, 12, 5, 0x3a6ad8);
  rect(buf, 20, 1, 8, 3, 0xffcb05);
  outline(buf, 0x2a1a10);
  return buf;
}
