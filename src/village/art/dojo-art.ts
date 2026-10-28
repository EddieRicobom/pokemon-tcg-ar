import { createBuf } from '../../box/ground-art';
import type { PixelBuf } from '../../box/ground-art';
import { disc, put, rect } from '../village-art';
import { bevel, glassWindow, inkOutline, mix } from '../building-style';

/**
 * O prédio do Dojô da Torre em quatro estágios, por código, no estilo das casas do atlas (`building-style.ts`:
 * contorno azul-marinho tingido, 3–4 tons com luz de cima-esquerda, telhado visto de cima em 3/4, janelas com o vidro
 * das casas). Todos têm 96 px de largura (6 blocos, a área sólida) e a base na última linha, com a porta no centro
 * (x = 48); a altura cresce com a reforma: 0 terreno vazio (96×48), 1 Tatame (96×64), 2 Dojô de madeira (96×80) e
 * 3 Dojô de pedra (96×90).
 */

export type DojoLevel = 0 | 1 | 2 | 3;
const W = 96;
const CX = W / 2;

const WOOD = [0xdcae6c, 0xbc8c52, 0x96683a, 0x6e4c2c] as const;
const DARK = [0x8a6244, 0x6a4832, 0x503626, 0x3c281c] as const;
const PLASTER = [0xf6f0dc, 0xe4dcc2, 0xc8bea2] as const;
const SLATE = [0x9aa0b4, 0x7c8298, 0x62687e, 0x4a4f64] as const;
const STONE = [0xd6d2c6, 0xb6b2a6, 0x96927f, 0x76726a] as const;
const DIRT = [0xdcbc84, 0xc4a068, 0xa48050] as const;
const RED = [0xe8584a, 0xc03c32, 0x8e2a24] as const;
const GOLD = [0xf8d860, 0xd8a830, 0xa07820] as const;
const TATAMI = { mat: [0xe8e0a8, 0xd0c688, 0xb0a668], edge: [0x76a860, 0x568a48] } as const;
const PAPER = [0xfaf6e6, 0xe8e0c8] as const;

// ----------------------------------------------------------------------------- peças

/** Chão de terra batida visto de cima, com a borda da frente mais escura (degrau para o gramado). */
function dirtLot(b: PixelBuf, x: number, y: number, w: number, h: number): void {
  rect(b, x, y, w, h, DIRT[1]);
  for (let j = y; j < y + h - 1; j++) for (let i = x; i < x + w; i++) {
    const n = (i * 7 + j * 11) % 23;
    if (n === 0) put(b, i, j, DIRT[0]);
    else if (n === 5) put(b, i, j, DIRT[2]);
  }
  rect(b, x, y, w, 1, DIRT[0]);
  rect(b, x, y + h - 1, w, 1, DIRT[2]);
}

/** Estaca de cerca com o topo claro (luz de cima) e o lado direito na sombra. */
function post(b: PixelBuf, x: number, top: number, bottom: number): void {
  rect(b, x, top, 3, bottom - top, WOOD[1]);
  rect(b, x, top, 1, bottom - top, WOOD[0]);
  rect(b, x + 2, top, 1, bottom - top, WOOD[2]);
  rect(b, x, top, 3, 1, WOOD[0]);
}

/** Cerca de fundo: estacas a cada 8 px e duas travessas. */
function fenceBack(b: PixelBuf, x0: number, x1: number, top: number, bottom: number): void {
  for (const y of [top + 2, top + 6]) { rect(b, x0, y, x1 - x0, 2, WOOD[1]); rect(b, x0, y, x1 - x0, 1, WOOD[0]); rect(b, x0, y + 2, x1 - x0, 1, WOOD[3]); }
  for (let x = x0; x <= x1 - 3; x += 8) post(b, x, top, bottom);
}

/** Boneco de treino: poste, fardo de palha amarrado e o alvo. */
function dummy(b: PixelBuf, cx: number, base: number, tall = 20): void {
  const top = base - tall;
  rect(b, cx - 1, top + 6, 3, tall - 6, WOOD[2]);
  put(b, cx - 1, top + 6, WOOD[1]);
  rect(b, cx - 4, top + 1, 9, 9, 0xe0c068);
  rect(b, cx - 4, top + 1, 9, 1, 0xf6e098);
  rect(b, cx + 3, top + 2, 2, 8, 0xb89848);
  rect(b, cx - 4, top + 5, 9, 1, 0x9a7038);
  rect(b, cx - 6, top + 4, 13, 2, WOOD[2]);
  rect(b, cx - 6, top + 4, 13, 1, WOOD[1]);
  put(b, cx, top + 3, RED[1]);
  rect(b, cx - 2, base - 2, 5, 2, DIRT[2]);
}

/** Placa de madeira com o aviso (traços no lugar do texto). */
function signboard(b: PixelBuf, x: number, base: number): void {
  rect(b, x + 5, base - 10, 2, 10, WOOD[2]);
  rect(b, x + 17, base - 10, 2, 10, WOOD[2]);
  bevel(b, x, base - 20, 24, 11, WOOD[1]);
  rect(b, x + 2, base - 18, 20, 7, PAPER[0]);
  rect(b, x + 2, base - 12, 20, 1, PAPER[1]);
  for (const [i, w] of [[4, 6], [12, 3], [16, 4]] as const) rect(b, x + i, base - 16, w, 1, DARK[2]);
  rect(b, x + 4, base - 14, 12, 1, STONE[2]);
}

/** Pilha de tábuas (material da obra). */
function lumber(b: PixelBuf, x: number, base: number): void {
  for (let i = 0; i < 3; i++) {
    const y = base - 3 - i * 3;
    bevel(b, x + i * 2, y, 18 - i * 4, 3, WOOD[i % 2 ? 0 : 1]);
    put(b, x + i * 2, y + 1, WOOD[3]);
  }
}

/** Lanterna de papel vermelha (o miolo amarelo é a luz da noite). */
function paperLantern(b: PixelBuf, cx: number, top: number): void {
  rect(b, cx, top, 1, 2, DARK[3]);
  rect(b, cx - 2, top + 2, 5, 1, DARK[2]);
  disc(b, cx, top + 6, 2.5, 3.2, RED[1]);
  rect(b, cx - 1, top + 4, 1, 4, RED[0]);
  rect(b, cx, top + 5, 1, 2, GOLD[0]);
  rect(b, cx - 2, top + 10, 5, 1, DARK[2]);
}

/** Faixa vermelha pendurada com o círculo claro (marca do Dojô). */
function banner(b: PixelBuf, x: number, y: number, h: number): void {
  rect(b, x - 1, y - 1, 7, 1, DARK[2]);
  rect(b, x, y, 5, h, RED[1]);
  rect(b, x, y, 1, h, RED[0]);
  rect(b, x + 4, y, 1, h, RED[2]);
  put(b, x + 1, y + h, RED[1]);
  put(b, x + 3, y + h, RED[2]);
  rect(b, x + 1, y + 3, 3, 3, PAPER[0]);
  put(b, x + 2, y + 4, RED[2]);
}

/** Porta de correr de papel (shoji) em grade de madeira; papel creme, nunca o azul do vidro. */
function shoji(b: PixelBuf, x: number, y: number, w: number, h: number): void {
  rect(b, x - 1, y - 1, w + 2, h + 1, DARK[2]);
  rect(b, x, y, w, h, PAPER[0]);
  for (let i = x + 3; i < x + w; i += 4) rect(b, i, y, 1, h, DARK[1]);
  for (let j = y + 4; j < y + h; j += 5) rect(b, x, j, w, 1, DARK[1]);
  rect(b, x + Math.floor(w / 2), y, 1, h, DARK[2]);
  rect(b, x, y + h - 1, w, 1, PAPER[1]);
}

/** Lanterna de pedra (tōrō); a janelinha é a luz da noite. */
function stoneLantern(b: PixelBuf, cx: number, base: number): void {
  bevel(b, cx - 4, base - 3, 9, 3, STONE[2]);
  rect(b, cx - 1, base - 9, 3, 6, STONE[1]);
  rect(b, cx + 1, base - 9, 1, 6, STONE[2]);
  bevel(b, cx - 3, base - 14, 7, 5, STONE[1]);
  rect(b, cx - 1, base - 13, 3, 3, GOLD[0]);
  rect(b, cx - 5, base - 17, 11, 3, STONE[0]);
  rect(b, cx - 5, base - 15, 11, 1, STONE[2]);
  rect(b, cx - 1, base - 19, 3, 2, STONE[1]);
}

/**
 * Telhado de quatro águas visto de cima em 3/4: a água da frente é um trapézio de telhas (da cumeeira, estreita, ao
 * beiral, largo), as águas dos lados são triângulos (o da esquerda pega luz, o da direita fica na sombra). O beiral tem
 * a testeira clara e as pontas viradas para cima, como nos templos de Johto.
 */
function hipRoof(b: PixelBuf, top: number, eave: number, ridgeHalf: number, eaveHalf: number, tone: readonly number[], ridge: readonly number[]): void {
  for (let y = top; y <= eave; y++) {
    const t = (y - top) / (eave - top);
    const hip = ridgeHalf + (eaveHalf - ridgeHalf) * t;
    // As pontas de cima recolhem um pouco (o fundo do telhado some atrás da cumeeira).
    const outer = eaveHalf - (y - top < 2 ? 2 - (y - top) : 0);
    for (let x = Math.round(CX - outer); x < Math.round(CX + outer); x++) {
      const dx = x + 0.5 - CX;
      let c: number;
      if (dx < -hip) c = (y - top) % 3 === 2 ? tone[1]! : tone[0]!;
      else if (dx > hip) c = (y - top) % 3 === 2 ? tone[3]! : tone[2]!;
      else {
        const row = (y - top) % 3;
        const seam = (x + (Math.floor((y - top) / 3) % 2) * 2) % 4 === 0;
        c = row === 2 ? tone[2]! : seam ? tone[2]! : row === 0 ? tone[0]! : tone[1]!;
      }
      put(b, x, y, c);
    }
    // Linhas das quinas (espigões).
    put(b, Math.round(CX - hip) - 1, y, tone[3]!);
    put(b, Math.round(CX + hip), y, tone[3]!);
  }
  // Beiral: testeira clara na frente e sombra logo embaixo; pontas viradas para cima.
  rect(b, CX - eaveHalf, eave + 1, eaveHalf * 2, 1, tone[0]!);
  rect(b, CX - eaveHalf, eave + 2, eaveHalf * 2, 1, tone[3]!);
  for (const [x, dir] of [[CX - eaveHalf - 1, -1], [CX + eaveHalf, 1]] as const) {
    rect(b, x, eave - 1, 1, 3, tone[dir < 0 ? 0 : 2]!);
    put(b, x + dir, eave - 2, tone[dir < 0 ? 0 : 2]!);
  }
  // Cumeeira com as telhas de ponta (onigawara).
  rect(b, CX - ridgeHalf - 1, top - 2, ridgeHalf * 2 + 2, 3, ridge[1]!);
  rect(b, CX - ridgeHalf - 1, top - 2, ridgeHalf * 2 + 2, 1, ridge[0]!);
  for (const x of [CX - ridgeHalf - 3, CX + ridgeHalf]) {
    rect(b, x, top - 4, 3, 4, ridge[1]!);
    rect(b, x, top - 4, 3, 1, ridge[0]!);
    put(b, x + 2, top - 3, ridge[2]!);
  }
}

/** Frontão (irimoya) no meio da cumeeira: triângulo de reboco com moldura de madeira e o brasão dourado. */
function gable(b: PixelBuf, top: number, half: number, h: number): void {
  for (let j = 0; j < h; j++) {
    const w = Math.round((half * (j + 1)) / h);
    rect(b, CX - w, top + j, w * 2, 1, PLASTER[j < 2 ? 0 : 1]);
    put(b, CX - w - 1, top + j, DARK[1]);
    put(b, CX + w, top + j, DARK[2]);
  }
  rect(b, CX - half - 1, top + h, half * 2 + 2, 1, DARK[2]);
  disc(b, CX - 0.5, top + h - 3, 1.6, 1.6, GOLD[1]);
  put(b, CX - 1, top + h - 4, GOLD[0]);
}

/** Parede de reboco entre pilares de madeira escura, com a viga de cima e a sombra do beiral. */
function wall(b: PixelBuf, x0: number, x1: number, top: number, bottom: number, pillars: readonly number[]): void {
  rect(b, x0, top, x1 - x0, bottom - top, PLASTER[0]);
  rect(b, Math.round(CX + (x1 - x0) * 0.25), top, Math.round(x1 - CX - (x1 - x0) * 0.25), bottom - top, PLASTER[1]);
  rect(b, x0, top, x1 - x0, 1, PLASTER[2]);
  rect(b, x0, top + 3, x1 - x0, 2, DARK[1]);
  rect(b, x0, top + 3, x1 - x0, 1, DARK[0]);
  for (const x of pillars) { rect(b, x, top, 3, bottom - top, DARK[1]); rect(b, x, top, 1, bottom - top, DARK[0]); rect(b, x + 2, top, 1, bottom - top, DARK[2]); }
}

/** Base de pedra em fiadas desencontradas. */
function stoneBase(b: PixelBuf, x0: number, x1: number, top: number, bottom: number): void {
  rect(b, x0, top, x1 - x0, bottom - top, STONE[1]);
  for (let y = top; y < bottom; y += 4) {
    const off = ((y - top) / 4) % 2 ? 4 : 0;
    rect(b, x0, y, x1 - x0, 1, STONE[0]);
    for (let x = x0 + off; x < x1; x += 8) rect(b, x, y + 1, 1, Math.min(3, bottom - 2 - y), STONE[2]);
  }
  rect(b, x0, bottom - 1, x1 - x0, 1, STONE[3]);
}

/** Degraus de pedra na frente da porta (pisam na última linha). */
function steps(b: PixelBuf, base: number, w: number): void {
  bevel(b, CX - w / 2, base - 2, w, 2, STONE[0]);
  bevel(b, CX - w / 2 - 2, base - 1, w + 4, 1, STONE[1]);
}

// ----------------------------------------------------------------------------- estágios

/** Janelas (vidro) e lanternas que acendem à noite, juntadas enquanto cada estágio é desenhado. */
type Glow = [number, number, number, number];

function terrain(): { buf: PixelBuf; glows: Glow[] } {
  const b = createBuf(W, 48);
  dirtLot(b, 3, 22, 90, 25);
  fenceBack(b, 4, 92, 12, 24);
  for (const x of [4, 89]) post(b, x, 12, 44);
  signboard(b, 10, 42);
  dummy(b, 60, 42, 22);
  lumber(b, 70, 45);
  // Estacas de marcação da obra com fita vermelha.
  for (const x of [38, 80]) { rect(b, x, 32, 2, 10, WOOD[2]); put(b, x, 32, WOOD[0]); rect(b, x - 1, 33, 4, 1, RED[1]); }
  inkOutline(b);
  return { buf: b, glows: [] };
}

function mat(): { buf: PixelBuf; glows: Glow[] } {
  const b = createBuf(W, 64);
  // Parede do fundo com o pergaminho, debaixo de um telhadinho.
  wall(b, 22, 74, 22, 40, [22, 47, 71]);
  rect(b, 30, 28, 12, 10, PAPER[0]);
  rect(b, 30, 28, 12, 1, DARK[2]);
  rect(b, 30, 37, 12, 1, DARK[2]);
  rect(b, 35, 30, 2, 6, DARK[3]);
  rect(b, 54, 28, 12, 10, PAPER[0]);
  rect(b, 54, 28, 12, 1, DARK[2]);
  rect(b, 54, 37, 12, 1, DARK[2]);
  disc(b, 59.5, 32.5, 2.5, 2.5, RED[1]);
  hipRoof(b, 8, 20, 12, 30, SLATE, DARK);
  // Tablado de madeira visto de cima, com o tatame (módulos verdes na borda).
  rect(b, 4, 39, 88, 17, WOOD[1]);
  rect(b, 4, 39, 88, 1, WOOD[0]);
  rect(b, 8, 41, 80, 13, TATAMI.mat[0]);
  for (let x = 8; x < 88; x += 20) { rect(b, x, 41, 1, 13, TATAMI.edge[1]); rect(b, x + 10, 47, 1, 7, TATAMI.mat[2]); }
  rect(b, 8, 47, 80, 1, TATAMI.mat[2]);
  rect(b, 8, 41, 80, 1, TATAMI.edge[0]);
  rect(b, 8, 53, 80, 1, TATAMI.edge[1]);
  rect(b, 87, 41, 1, 13, TATAMI.edge[1]);
  for (let x = 11; x < 88; x += 5) put(b, x, 43, TATAMI.mat[1]);
  // Frente do tablado (tábuas) e os degraus.
  rect(b, 4, 56, 88, 6, WOOD[2]);
  for (let x = 4; x < 92; x += 6) rect(b, x, 56, 1, 6, WOOD[3]);
  rect(b, 4, 56, 88, 1, WOOD[1]);
  steps(b, 64, 22);
  // Pilares dos cantos com lanternas de papel e faixas.
  for (const x of [5, 88]) { post(b, x, 26, 57); paperLantern(b, x + 1, 24); }
  banner(b, 17, 24, 12);
  banner(b, 74, 24, 12);
  dummy(b, 14, 52, 12);
  dummy(b, 82, 52, 12);
  inkOutline(b);
  return { buf: b, glows: [[5, 29, 3, 4], [88, 29, 3, 4]] };
}

function wooden(): { buf: PixelBuf; glows: Glow[] } {
  const b = createBuf(W, 80);
  const glows: Glow[] = [];
  // Corpo: reboco entre pilares, sobre a base de pedra.
  wall(b, 9, 87, 44, 72, [9, 30, 64, 84]);
  stoneBase(b, 7, 89, 71, 78);
  // Porta de correr no meio e janelas de vidro com caixilho de madeira escura nas laterais.
  shoji(b, 38, 52, 20, 20);
  glows.push(glassWindow(b, 15, 53, 10, 9, { frame: DARK[0], mullion: true }));
  glows.push(glassWindow(b, 70, 53, 10, 9, { frame: DARK[0], mullion: true }));
  banner(b, 32, 50, 14);
  banner(b, 59, 50, 14);
  // Telhado de telhas cinza-azuladas.
  hipRoof(b, 8, 41, 20, 46, SLATE, DARK);
  steps(b, 80, 26);
  paperLantern(b, 5, 46);
  paperLantern(b, 90, 46);
  inkOutline(b);
  return { buf: b, glows: [...glows, [4, 50, 3, 4], [89, 50, 3, 4]] };
}

function stone(): { buf: PixelBuf; glows: Glow[] } {
  const H = 90;
  const b = createBuf(W, H);
  const glows: Glow[] = [];
  // Andar de baixo: reboco e pilares sobre a base alta de pedra.
  wall(b, 10, 86, 52, 74, [10, 28, 66, 83]);
  stoneBase(b, 6, 90, 73, 88);
  // Portão de madeira escura com tachas douradas.
  rect(b, 37, 57, 22, 17, DARK[3]);
  for (const x of [38, 48]) {
    bevel(b, x, 58, 10, 16, DARK[1]);
    for (let y = 61; y < 73; y += 4) for (let i = x + 2; i < x + 10; i += 3) put(b, i, y, GOLD[1]);
  }
  put(b, 46, 66, GOLD[0]);
  put(b, 49, 66, GOLD[0]);
  glows.push(glassWindow(b, 15, 59, 9, 8, { frame: DARK[0], mullion: true }));
  glows.push(glassWindow(b, 72, 59, 9, 8, { frame: DARK[0], mullion: true }));
  banner(b, 31, 56, 14);
  banner(b, 60, 56, 14);
  // Telhado de baixo, largo.
  hipRoof(b, 36, 49, 30, 47, SLATE.map((c) => mix(c, 0.82)), [GOLD[0], GOLD[1], GOLD[2]]);
  // Andar de cima: faixa de reboco com três janelinhas.
  wall(b, 22, 74, 26, 37, [22, 47, 71]);
  for (const x of [28, 40, 54, 62]) glows.push(glassWindow(b, x, 31, 5, 4, { frame: DARK[0] }));
  // Telhado de cima com o frontão e a cumeeira dourada.
  hipRoof(b, 6, 24, 14, 34, SLATE.map((c) => mix(c, 0.82)), [GOLD[0], GOLD[1], GOLD[2]]);
  gable(b, 9, 9, 9);
  // Lanternas de pedra dos dois lados e os degraus de pedra.
  stoneLantern(b, 4, 89);
  stoneLantern(b, 91, 89);
  steps(b, H, 28);
  inkOutline(b);
  return { buf: b, glows: [...glows, [3, 76, 3, 3], [90, 76, 3, 3]] };
}

const PAINTERS: Record<DojoLevel, () => { buf: PixelBuf; glows: Glow[] }> = { 0: terrain, 1: mat, 2: wooden, 3: stone };

/** O Dojô no estágio `level` (0 terreno, 1 Tatame, 2 Dojô, 3 Dojô de pedra): 96 px de largura, base na última linha. */
export function paintDojo(level: DojoLevel): PixelBuf {
  return PAINTERS[level]().buf;
}

/**
 * Janelas (só o vidro) e lanternas que acendem à noite em cada estágio: [x, y, largura, altura] no desenho do estágio.
 * Saem da mesma geometria que pinta o desenho (não há como descasar).
 */
export const DOJO_WINDOWS: readonly (readonly number[])[][] = ([0, 1, 2, 3] as const).map((l) => PAINTERS[l]().glows);
