import { seededRng } from '../core/battle';
import type { Tile } from '../core/village/map';
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
    case 'shop':
      paintGround(buf, 0, 0, 'path', rng, 0, { c, r });
      break;
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

// ----------------------------------------------------------------------------- você

export type HairStyle = 'short' | 'long' | 'spiky' | 'bun';
export type HeadGear = 'cap' | 'beanie' | 'none';

export interface Outfit {
  cap: number;
  capShade: number;
  hair: number;
  skin: number;
  /** Camisa/jaqueta, a cor da calça e o detalhe (mochila, barra). */
  shirt: number;
  shirtShade: number;
  pants: number;
  accent: number;
  shoes: number;
  style: HairStyle;
  gear: HeadGear;
}

const mul = (c: number, f: number): number => (Math.min(255, Math.round(((c >> 16) & 255) * f)) << 16) | (Math.min(255, Math.round(((c >> 8) & 255) * f)) << 8) | Math.min(255, Math.round((c & 255) * f));

const SKINS = [0xf6d0a8, 0xe8b88c, 0xc88c5c, 0x9a6a44, 0xffe0c8] as const;
const HAIRS = [0x3a2a1a, 0x1a1a24, 0x6a3a1a, 0xd8b060, 0xb8482a, 0x5a3a8a, 0x2a4a7a] as const;
const SHIRTS = [0x3a6ad8, 0xe86aa0, 0xf2c84a, 0xe86a3a, 0x4ac8c8, 0x4aa84a, 0x8a5ad8, 0xe04040] as const;
const CAPS = [0xe04040, 0xf6f6f6, 0x4aa84a, 0x3a3a4a, 0x8a5ad8, 0x3a8ad8, 0xf2c84a] as const;
const PANTS = [0x3a3a4a, 0x2a2a3a, 0x4a5a8a, 0x6a4a28, 0x3a6ad8, 0x5a5a68] as const;
const STYLES: readonly HairStyle[] = ['short', 'long', 'spiky', 'bun'];
const GEARS: readonly HeadGear[] = ['cap', 'cap', 'beanie', 'none'];

function mix(id: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}

/** As cores e o corte do seu personagem vêm do treinador escolhido (cada um cai numa combinação própria). */
export function outfitFor(trainerId: string): Outfit {
  const pick = <T,>(list: readonly T[], salt: number): T => list[mix(trainerId, salt) % list.length]!;
  const cap = pick(CAPS, 11);
  const shirt = pick(SHIRTS, 23);
  return {
    cap,
    capShade: mul(cap, 0.78),
    hair: pick(HAIRS, 37),
    skin: pick(SKINS, 41),
    shirt,
    shirtShade: mul(shirt, 0.78),
    pants: pick(PANTS, 53),
    accent: pick(CAPS, 61),
    shoes: 0x5a3a24,
    style: pick(STYLES, 71),
    gear: pick(GEARS, 83),
  };
}

const INK = 0x1a1a24;

/** Luz de cima e sombra embaixo, como nos móveis. */
function shadeBuf(buf: PixelBuf): void {
  const a = (x: number, y: number) => (x >= 0 && y >= 0 && x < buf.w && y < buf.h ? (buf.data[(y * buf.w + x) * 4 + 3] ?? 0) : 0);
  const edits: [number, number, number][] = [];
  for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) if (a(x, y) > 0) { if (a(x, y - 1) === 0) edits.push([x, y, 1]); else if (a(x, y + 1) === 0) edits.push([x, y, -1]); }
  for (const [x, y, dir] of edits) {
    const i = (y * buf.w + x) * 4;
    for (let k = 0; k < 3; k++) {
      const v = buf.data[i + k] ?? 0;
      buf.data[i + k] = dir > 0 ? Math.min(255, Math.round(v + (255 - v) * 0.18)) : Math.round(v * 0.82);
    }
  }
}

function flipX(buf: PixelBuf): PixelBuf {
  const out = createBuf(buf.w, buf.h);
  for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) for (let k = 0; k < 4; k++) out.data[(y * buf.w + x) * 4 + k] = buf.data[(y * buf.w + (buf.w - 1 - x)) * 4 + k] ?? 0;
  return out;
}

/** O cabelo por cima da cabeça já desenhada: `front` deixa o rosto à mostra, `back` cobre tudo, `side` cobre a nuca. */
function hair(buf: PixelBuf, o: Outfit, mode: 'front' | 'back' | 'side'): void {
  const h = o.hair;
  const hs = mul(h, 0.78);
  for (let y = 1; y < 15; y++) {
    for (let x = 2; x < 14; x++) {
      if (((x - 8) / 5.2) ** 2 + ((y - 7.5) / 5) ** 2 > 1) continue;
      const on = mode === 'back' ? true : mode === 'front' ? y <= 6 || (Math.abs(x - 8) >= 4 && y <= 9) : x <= 7 || y <= 5;
      if (on) put(buf, x, y, y >= 10 ? hs : h);
    }
  }
  for (const x of mode === 'side' ? [4, 5, 6] : [6, 7, 8]) put(buf, x, 3, mul(h, 1.3));
  const cx = mode === 'side' ? 5 : 8;
  if (o.style === 'spiky') for (const dx of [-4, -1, 2, 4]) rect(buf, cx + dx, dx === -1 ? 0 : 1, 2, 3, h);
  if (o.style === 'bun') disc(buf, cx, 1.5, 2.2, 2.2, h);
  if (o.style === 'long') {
    const left = mode === 'side' ? 2 : 2;
    rect(buf, left, 7, 3, 8, hs);
    if (mode !== 'side') rect(buf, 11, 7, 3, 8, hs);
    if (mode === 'back') rect(buf, 4, 11, 8, 4, hs);
  }
}

/** Seu personagem, 16×24, olhando para `dir`; `step` alterna as pernas e os braços ao andar (−1 = parado). */
export function paintPlayer(dir: Dir, step: number, o: Outfit): PixelBuf {
  const side = dir === 'left' || dir === 'right';
  const back = dir === 'up';
  const ph = step < 0 ? -1 : step % 2;
  const buf = createBuf(16, 24);
  const skin = o.skin;
  const skinS = mul(skin, 0.86);
  const pants = o.pants;
  const pantsS = mul(pants, 0.78);
  if (!side) {
    // Pernas e sapatos.
    const lUp = ph === 0 ? 1 : 0;
    const rUp = ph === 1 ? 1 : 0;
    rect(buf, 5, 19, 3, 3 - lUp, pants);
    rect(buf, 8, 19, 3, 3 - rUp, pantsS);
    rect(buf, 4, 22 - lUp, 4, 2, o.shoes);
    rect(buf, 8, 22 - rUp, 4, 2, o.shoes);
    // Torso (jaqueta) e braços.
    rect(buf, 4, 12, 8, 7, o.shirt);
    rect(buf, 4, 17, 8, 1, o.shirtShade);
    rect(buf, 4, 18, 8, 1, mul(pants, 0.7));
    if (!back) {
      rect(buf, 7, 12, 2, 4, 0xf6f6f6);
      rect(buf, 8, 14, 1, 5, o.shirtShade);
      put(buf, 8, 18, 0xffd84a);
      rect(buf, 5, 15, 2, 2, o.shirtShade);
    } else {
      rect(buf, 4, 12, 8, 1, o.shirtShade);
      rect(buf, 5, 13, 6, 5, o.accent);
      rect(buf, 5, 13, 6, 1, mul(o.accent, 1.2));
      rect(buf, 5, 17, 6, 1, mul(o.accent, 0.7));
      rect(buf, 7, 14, 2, 2, mul(o.accent, 0.8));
    }
    const lArm = ph === 0 ? -1 : ph === 1 ? 1 : 0;
    rect(buf, 2, 13 + lArm, 2, 5, o.shirt);
    rect(buf, 12, 13 - lArm, 2, 5, o.shirt);
    rect(buf, 2, 18 + lArm, 2, 2, skin);
    rect(buf, 12, 18 - lArm, 2, 2, skin);
    // Cabeça.
    disc(buf, 8, 7.5, 4.6, 4.4, skin);
    if (back) hair(buf, o, 'back');
    else {
      rect(buf, 7, 12, 2, 1, skinS);
      hair(buf, o, 'front');
      // Rosto: olhos grandes com brilho, bochechas e boca.
      for (const x of [5, 9]) {
        rect(buf, x, 8, 2, 2, INK);
        put(buf, x, 8, 0xffffff);
      }
      put(buf, 4, 10, 0xf2a0a0);
      put(buf, 11, 10, 0xf2a0a0);
      rect(buf, 7, 11, 2, 1, 0xa84a4a);
    }
    if (o.gear === 'cap') {
      disc(buf, 8, 4, 5.2, 3.2, o.cap);
      rect(buf, 3, 4, 10, 1, o.cap);
      rect(buf, 3, 5, 10, 1, o.capShade);
      if (!back) { rect(buf, 3, 6, 10, 1, o.capShade); disc(buf, 8, 3.2, 1.4, 1.4, 0xffffff); put(buf, 8, 3, o.cap); } else rect(buf, 6, 5, 4, 1, mul(o.cap, 1.2));
    } else if (o.gear === 'beanie') {
      disc(buf, 8, 4.2, 5, 3.4, o.cap);
      rect(buf, 3, 5, 10, 2, o.capShade);
      for (let x = 3; x < 13; x += 2) put(buf, x, 5, mul(o.cap, 1.15));
      disc(buf, 8, 0.8, 1.6, 1.6, 0xf6f6f6);
    }
  } else {
    // De lado (desenhado olhando para a direita; a esquerda é o espelho).
    const stride = ph === 0 ? 1 : ph === 1 ? -1 : 0;
    // Perna de trás e da frente.
    rect(buf, 5 - stride, 19, 3, ph < 0 ? 3 : 2 + (stride > 0 ? 0 : 1), pantsS);
    rect(buf, 4 - stride, ph < 0 ? 22 : stride > 0 ? 21 : 22, 4, 2, o.shoes);
    rect(buf, 8 + stride, 19, 3, ph < 0 ? 3 : 2 + (stride < 0 ? 0 : 1), pants);
    rect(buf, 8 + stride, ph < 0 ? 22 : stride < 0 ? 21 : 22, 5, 2, o.shoes);
    // Mochila nas costas.
    rect(buf, 2, 13, 3, 6, o.accent);
    rect(buf, 2, 13, 3, 1, mul(o.accent, 1.2));
    // Torso e o braço da frente.
    rect(buf, 4, 12, 8, 7, o.shirt);
    rect(buf, 4, 17, 8, 1, o.shirtShade);
    rect(buf, 4, 18, 8, 1, mul(pants, 0.7));
    rect(buf, 6 + stride, 13, 3, 5, o.shirtShade);
    rect(buf, 6 + stride, 18, 3, 2, skin);
    // Cabeça de perfil.
    disc(buf, 8, 7.5, 4.6, 4.4, skin);
    rect(buf, 12, 9, 1, 1, skin);
    hair(buf, o, 'side');
    rect(buf, 10, 8, 2, 2, INK);
    put(buf, 10, 8, 0xffffff);
    put(buf, 10, 10, 0xf2a0a0);
    rect(buf, 11, 11, 2, 1, 0xa84a4a);
    if (o.gear === 'cap') {
      disc(buf, 7, 4, 5, 3.2, o.cap);
      rect(buf, 3, 5, 9, 1, o.capShade);
      rect(buf, 10, 5, 5, 2, o.capShade);
      rect(buf, 11, 5, 4, 1, mul(o.cap, 1.1));
    } else if (o.gear === 'beanie') {
      disc(buf, 7, 4.2, 5, 3.4, o.cap);
      rect(buf, 3, 5, 9, 2, o.capShade);
      disc(buf, 6, 0.8, 1.6, 1.6, 0xf6f6f6);
    }
  }
  shadeBuf(buf);
  outline(buf, INK);
  return dir === 'left' ? flipX(buf) : buf;
}

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
