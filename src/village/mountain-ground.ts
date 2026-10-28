import { createBuf } from '../box/ground-art';
import type { PixelBuf } from '../box/ground-art';
import { tileAt } from '../core/village/map';
import type { VillageMap } from '../core/village/map';
import { cliffPart, elevationAt } from '../core/village/mountain';
import type { CliffPart } from '../core/village/mountain';
import { put, rect } from './village-art';

/**
 * O chão do Monte Miragem em blocos de 16 px, no jeito dos penhascos de Hoenn e Sinnoh: patamar de terra e rocha clara
 * com pedrinhas, borda com lábio iluminado por cima, paredão de rocha em faixas verticais (luz da esquerda, sombra
 * embaixo) e degraus de pedra que cortam o paredão. A paleta é a das pedras marrons de \`tilesets/All Cliffs.png\`.
 */

const ROCK = { lip: 0xeadbbd, light: 0xd2b996, mid: 0xb3936f, dark: 0x8a6a4e, deep: 0x634a37, line: 0x433224 } as const;
const GROUND = { base: 0xcdb894, speck: 0xb9a27c, light: 0xe0d0ae, pebble: 0x9c8466 } as const;

export type MountainPiece =
  | { kind: 'ground'; shadow: boolean }
  | { kind: 'cliff'; part: CliffPart; shadow: boolean; upper: boolean }
  | { kind: 'stairs'; part: 'face-top' | 'face-bottom' };

/** Que desenho o bloco (x, y) do monte usa, ou \`null\` fora do monte. Puro. */
export function mountainPiece(map: VillageMap, x: number, y: number): MountainPiece | null {
  const tile = tileAt(map, x, y);
  const level = elevationAt(map, x, y);
  // Sombra do paredão de cima caindo no patamar (ou na grama do sopé) logo abaixo dele.
  const above = tileAt(map, x, y - 1);
  const shadow = (above === 'cliff' || above === 'stairs') && elevationAt(map, x, y - 1) > level && cliffPart(x, y - 1)?.startsWith('face') === true;
  if (tile === 'stairs') return { kind: 'stairs', part: tileAt(map, x, y + 1) === 'stairs' ? 'face-top' : 'face-bottom' };
  if (tile === 'cliff') {
    const part = cliffPart(x, y);
    // Linha de cima do paredão: o bloco de baixo ainda é paredão do mesmo terraço.
    const below = tileAt(map, x, y + 1);
    const upper = (below === 'cliff' || below === 'stairs') && elevationAt(map, x, y + 1) === level;
    return part ? { kind: 'cliff', part, shadow, upper } : { kind: 'ground', shadow };
  }
  if (level > 0 && tile !== 'trail') return { kind: 'ground', shadow };
  if (shadow) return { kind: 'ground', shadow: true };
  return null;
}

export function mountainPieceKey(p: MountainPiece): string {
  return p.kind === 'ground' ? `g:${p.shadow}` : p.kind === 'cliff' ? `c:${p.part}:${p.shadow}:${p.upper}` : `s:${p.part}`;
}

const hash = (x: number, y: number): number => {
  let h = Math.imul(x * 73856093 ^ y * 19349663, 2654435761) >>> 0;
  h ^= h >>> 13;
  return (Math.imul(h, 1274126177) >>> 0) / 4294967296;
};

function ground(b: PixelBuf, seed: number): void {
  rect(b, 0, 0, 16, 16, GROUND.base);
  for (let i = 0; i < 18; i++) {
    const r = hash(seed + i, i * 7);
    put(b, Math.floor(r * 16), Math.floor(hash(i, seed) * 16), r > 0.6 ? GROUND.light : GROUND.speck);
  }
  // Uma pedrinha de vez em quando (contorno escuro embaixo, brilho em cima).
  if (hash(seed, 3) < 0.35) {
    const px = 3 + Math.floor(hash(seed, 5) * 9);
    const py = 4 + Math.floor(hash(seed, 9) * 8);
    rect(b, px, py, 3, 2, GROUND.pebble);
    put(b, px, py, GROUND.light);
    rect(b, px, py + 2, 3, 1, ROCK.dark);
  }
}

/** Paredão: faixas verticais de rocha de 4 px, com luz à esquerda de cada faixa e juntas escuras. */
function face(b: PixelBuf, y0: number, h: number, seed: number): void {
  for (let x = 0; x < 16; x++) {
    const col = (x + (seed % 3)) % 4;
    const rgb = col === 0 ? ROCK.light : col === 3 ? ROCK.dark : ROCK.mid;
    rect(b, x, y0, 1, h, rgb);
  }
  for (let y = y0; y < y0 + h; y++) {
    if ((y + seed) % 5 === 0) for (let x = 0; x < 16; x += 4) put(b, x + ((seed + y) % 4), y, ROCK.deep);
  }
}

/** Desenha um bloco do monte (16×16). \`x\` e \`y\` variam as pedrinhas e as faixas sem mudar o formato. */
export function paintMountainPiece(p: MountainPiece, x: number, y: number): PixelBuf {
  const b = createBuf(16, 16);
  const seed = Math.floor(hash(x, y) * 1000);
  if (p.kind === 'stairs') {
    face(b, 0, 16, seed);
    // Degraus: placas claras com espelho escuro, um pouco mais estreitas que o bloco (o paredão aparece dos lados).
    for (let s = 0; s < 4; s++) {
      const sy = s * 4;
      rect(b, 1, sy, 14, 3, ROCK.lip);
      rect(b, 1, sy + 3, 14, 1, ROCK.dark);
      put(b, 1, sy, ROCK.light);
    }
    rect(b, 0, 0, 1, 16, ROCK.line);
    rect(b, 15, 0, 1, 16, ROCK.line);
    if (p.part === 'face-bottom') rect(b, 0, 15, 16, 1, ROCK.deep);
    return b;
  }
  if (p.kind === 'ground') {
    ground(b, seed);
    if (p.shadow) for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 16; xx++) darken(b, xx, yy, yy === 0 ? 0.62 : yy === 1 ? 0.74 : 0.86);
    return b;
  }
  const part = p.part;
  if (part === 'face-top' || part === 'face-bottom' || part === 'corner-left' || part === 'corner-right') {
    face(b, 0, 16, seed);
    const top = p.upper;
    if (top) {
      // Lábio de cima do paredão: a beira do patamar, iluminada, com o contorno escuro logo abaixo.
      rect(b, 0, 0, 16, 2, ROCK.lip);
      rect(b, 0, 2, 16, 1, ROCK.line);
    } else {
      // Pé do paredão: sombra densa e uma linha de contorno encostando no chão.
      rect(b, 0, 12, 16, 3, ROCK.deep);
      rect(b, 0, 15, 16, 1, ROCK.line);
    }
    if (part === 'corner-left') { rect(b, 0, 0, 2, 16, ROCK.line); rect(b, 2, 0, 1, 16, ROCK.light); }
    if (part === 'corner-right') { rect(b, 14, 0, 2, 16, ROCK.line); rect(b, 13, 0, 1, 16, ROCK.deep); }
    return b;
  }
  // Borda de cima e laterais: o patamar com um lábio de rocha virado para fora e o contorno na beira.
  ground(b, seed);
  if (part === 'top') {
    rect(b, 0, 0, 16, 1, ROCK.line);
    rect(b, 0, 1, 16, 3, ROCK.mid);
    rect(b, 0, 1, 16, 1, ROCK.lip);
    rect(b, 0, 4, 16, 1, ROCK.dark);
  } else if (part === 'side-left') {
    rect(b, 0, 0, 1, 16, ROCK.line);
    rect(b, 1, 0, 3, 16, ROCK.mid);
    rect(b, 1, 0, 1, 16, ROCK.lip);
    rect(b, 4, 0, 1, 16, ROCK.dark);
  } else {
    rect(b, 15, 0, 1, 16, ROCK.line);
    rect(b, 12, 0, 3, 16, ROCK.mid);
    rect(b, 14, 0, 1, 16, ROCK.deep);
    rect(b, 11, 0, 1, 16, ROCK.light);
  }
  if (p.shadow) for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 16; xx++) darken(b, xx, yy, 0.7 + yy * 0.1);
  return b;
}

function darken(b: PixelBuf, x: number, y: number, k: number): void {
  const i = (y * b.w + x) * 4;
  b.data[i] = Math.round(b.data[i]! * k);
  b.data[i + 1] = Math.round(b.data[i + 1]! * k);
  b.data[i + 2] = Math.round(b.data[i + 2]! * k);
}
