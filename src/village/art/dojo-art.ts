import { createBuf } from '../../box/ground-art';
import type { PixelBuf } from '../../box/ground-art';
import { disc, outline, put, rect } from '../village-art';

/**
 * O prédio do Dojô da Torre em quatro estágios (96×48, 6 blocos de largura), por código, no estilo dos outros prédios
 * (`town-art.ts`): 0 terreno vazio com um boneco de treino, 1 Tatame, 2 Dojô de madeira e 3 Dojô de pedra. O terreno e a
 * ancoragem são os mesmos nos quatro: a base fica na linha 47 e a porta no centro (x = 48).
 */

export type DojoLevel = 0 | 1 | 2 | 3;
const W = 96;
const H = 48;
const OUTLINE = 0x2a1a10;

const mix = (rgb: number, k: number): number => {
  const r = Math.min(255, Math.round(((rgb >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((rgb >> 8) & 255) * k));
  const b = Math.min(255, Math.round((rgb & 255) * k));
  return (r << 16) | (g << 8) | b;
};

/** Terra batida do pátio, com a mesma cor do terreno vazio das casas. */
function dirt(b: PixelBuf, x: number, y: number, w: number, h: number): void {
  rect(b, x, y, w, h, 0xb88a52);
  for (let j = y + 2; j < y + h; j += 4) for (let i = x + 1; i < x + w - 1; i++) if ((i + j) % 6 === 0) put(b, i, j, 0xd2a66c);
  for (let j = y + 3; j < y + h; j += 5) for (let i = x + 2; i < x + w - 1; i++) if ((i * 3 + j) % 11 === 0) put(b, i, j, 0x8e6638);
}

/** Tábuas verticais de madeira com uma sombra à direita de cada uma. */
function planks(b: PixelBuf, x: number, y: number, w: number, h: number, rgb: number, step = 4): void {
  rect(b, x, y, w, h, rgb);
  for (let i = x + step; i < x + w; i += step) rect(b, i - 1, y, 1, h, mix(rgb, 0.8));
  rect(b, x, y, w, 1, mix(rgb, 1.15));
}

/** Boneco de treino: poste, fardo de palha amarrado com corda e um alvo vermelho. */
function dummy(b: PixelBuf, cx: number, base: number, tall = 18): void {
  rect(b, cx - 1, base - tall, 3, tall, 0x6a4a28);
  rect(b, cx, base - tall, 1, tall, 0x8a5a2e);
  rect(b, cx - 4, base - tall + 2, 9, 9, 0xe0c060);
  for (let y = base - tall + 3; y < base - tall + 11; y += 2) for (let x = cx - 3; x < cx + 5; x += 2) put(b, x, y, 0xc8a040);
  rect(b, cx - 4, base - tall + 2, 9, 1, 0xf6e090);
  rect(b, cx - 4, base - tall + 6, 9, 1, 0x9a6a38);
  put(b, cx, base - tall + 4, 0xe8453c);
  put(b, cx - 1, base - tall + 4, 0xf6f6f6);
  put(b, cx + 1, base - tall + 4, 0xf6f6f6);
  rect(b, cx - 3, base - 2, 7, 2, 0x8e6638);
  rect(b, cx - 3, base - 2, 7, 1, 0xb88a52);
}

/** Lanterna de papel pendurada. */
function paperLantern(b: PixelBuf, cx: number, top: number): void {
  rect(b, cx, top, 1, 3, 0x3a2a1c);
  disc(b, cx, top + 6, 3, 3, 0xe8453c);
  rect(b, cx - 3, top + 3, 7, 1, 0x3a2a1c);
  rect(b, cx - 3, top + 9, 7, 1, 0x3a2a1c);
  put(b, cx - 1, top + 5, 0xff9a8a);
  put(b, cx, top + 6, 0xffd84a);
}

/** Cerca baixa de madeira (varais e um travessão). */
function fenceRow(b: PixelBuf, x: number, y: number, w: number): void {
  rect(b, x, y + 3, w, 1, 0xc8a070);
  rect(b, x, y + 6, w, 1, 0x9a6a38);
  for (let i = x; i < x + w; i += 4) {
    rect(b, i, y, 2, 9, 0x8a5a2e);
    put(b, i, y, 0xc8a070);
    put(b, i + 1, y + 8, 0x6a4a28);
  }
}

function fenceColumn(b: PixelBuf, x: number, y: number, h: number): void {
  rect(b, x - 1, y, 4, h, 0x8a5a2e);
  for (let j = y; j < y + h; j += 4) rect(b, x - 2, j, 6, 2, 0xc8a070);
  rect(b, x, y, 1, h, 0xa07040);
}

/** Tatame: esteira bege com borda verde e as divisões dos módulos. */
function tatami(b: PixelBuf, x: number, y: number, w: number, h: number): void {
  rect(b, x, y, w, h, 0xdccf98);
  for (let i = x; i < x + w; i += 12) rect(b, i, y, 1, h, 0xb0a468);
  for (let j = y + Math.floor(h / 2); j < y + h; j += Math.max(6, Math.floor(h / 2))) rect(b, x, j, w, 1, 0xb0a468);
  rect(b, x, y, w, 1, 0x6a9a58);
  rect(b, x, y + h - 1, w, 1, 0x4e7e44);
  rect(b, x, y, 1, h, 0x6a9a58);
  rect(b, x + w - 1, y, 1, h, 0x4e7e44);
  for (let i = x + 3; i < x + w - 2; i += 6) put(b, i, y + 2, 0xeee4b8);
}

/** Pedras do chão em volta (degraus de pedra chata). */
function stoneSlab(b: PixelBuf, x: number, y: number, w: number, h: number, rgb = 0x9a9890): void {
  rect(b, x, y, w, h, rgb);
  rect(b, x, y, w, 1, mix(rgb, 1.15));
  rect(b, x, y + h - 1, w, 1, mix(rgb, 0.75));
  for (let i = x + 6; i < x + w; i += 7) rect(b, i, y + 1, 1, h - 2, mix(rgb, 0.85));
}

/**
 * Telhado japonês: cumeeira estreita no alto e beiral largo que se curva para cima nas pontas. Telhas em fileiras, com
 * uma linha de sombra a cada 3 pixels.
 */
function curvedRoof(b: PixelBuf, cx: number, apex: number, base: number, ridgeHalf: number, fullHalf: number, rgb: number, ridgeRgb: number): void {
  const dark = mix(rgb, 0.7);
  const light = mix(rgb, 1.2);
  for (let y = apex; y <= base; y++) {
    const t = (y - apex) / (base - apex);
    const half = Math.round(ridgeHalf + (fullHalf - ridgeHalf) * t ** 1.25);
    // As pontas do beiral sobem 2 pixels na última fileira.
    const lift = y >= base - 1 ? 1 : 0;
    for (let x = cx - half; x <= cx + half; x++) {
      const edge = Math.abs(x - cx) >= half - 1;
      put(b, x, y - (edge ? lift : 0), (y - apex) % 3 === 2 ? dark : (x + y * 2) % 9 === 0 ? light : rgb);
    }
  }
  for (let x = cx - fullHalf; x <= cx + fullHalf; x++) put(b, x, base + 1, dark);
  rect(b, cx - ridgeHalf - 1, apex - 1, ridgeHalf * 2 + 3, 2, ridgeRgb);
  rect(b, cx - ridgeHalf - 1, apex - 1, ridgeHalf * 2 + 3, 1, mix(ridgeRgb, 1.2));
}

/** Porta de correr (shoji): papel claro em grade de madeira. */
function shoji(b: PixelBuf, x: number, y: number, w: number, h: number, frame: number): void {
  rect(b, x - 1, y - 1, w + 2, h + 1, frame);
  rect(b, x, y, w, h, 0xf2ead2);
  for (let i = x + 3; i < x + w; i += 4) rect(b, i, y, 1, h, frame);
  for (let j = y + 4; j < y + h; j += 5) rect(b, x, j, w, 1, frame);
  rect(b, x + Math.floor(w / 2), y, 1, h, mix(frame, 0.8));
  rect(b, x, y, w, 1, 0xfffbe8);
}

/** Janela de grade (treliça) com papel iluminável. */
function lattice(b: PixelBuf, x: number, y: number, w: number, h: number, frame: number): void {
  rect(b, x - 1, y - 1, w + 2, h + 2, frame);
  rect(b, x, y, w, h, 0xf2e6b8);
  for (let i = x + 2; i < x + w; i += 3) rect(b, i, y, 1, h, frame);
  for (let j = y + 2; j < y + h; j += 3) rect(b, x, j, w, 1, frame);
  put(b, x, y, 0xfffbe8);
}

/** Faixa vermelha pendurada com um círculo claro (marca do Dojô). */
function banner(b: PixelBuf, x: number, y: number, h: number): void {
  rect(b, x - 1, y - 2, 6, 2, 0x4a2a1c);
  rect(b, x, y, 4, h, 0xc83a32);
  rect(b, x, y, 1, h, 0xe8584a);
  rect(b, x + 3, y, 1, h, 0x9a2a24);
  for (let i = 0; i < 4; i++) put(b, x + i, y + h, i % 2 ? 0xc83a32 : 0x9a2a24);
  disc(b, x + 1.5, y + 4, 1, 1, 0xf6ecd2);
}

function toriiGate(b: PixelBuf, cx: number, base: number, half: number, height: number): void {
  const red = 0xd23a2a;
  const topY = base - height;
  for (const sx of [cx - half, cx + half - 2]) {
    rect(b, sx, topY + 3, 3, height - 3, red);
    rect(b, sx, topY + 3, 1, height - 3, 0xee5a46);
    rect(b, sx + 2, topY + 3, 1, height - 3, 0xa22a20);
    rect(b, sx - 1, base - 3, 5, 3, 0x2a2a30);
  }
  rect(b, cx - half - 4, topY, half * 2 + 8, 3, 0x2a2a30);
  rect(b, cx - half - 3, topY + 1, half * 2 + 6, 2, red);
  rect(b, cx - half - 5, topY - 1, 3, 2, 0x2a2a30);
  rect(b, cx + half + 2, topY - 1, 3, 2, 0x2a2a30);
  rect(b, cx - half, topY + 6, half * 2, 2, red);
  rect(b, cx - half, topY + 6, half * 2, 1, 0xee5a46);
  rect(b, cx - 1, topY + 3, 3, 4, 0x2a2a30);
}

function stoneLantern(b: PixelBuf, cx: number, base: number, lit: boolean): void {
  const stone = 0x9a9890;
  rect(b, cx - 3, base - 3, 7, 3, mix(stone, 0.85));
  rect(b, cx - 1, base - 9, 3, 6, stone);
  rect(b, cx - 3, base - 14, 7, 5, mix(stone, 1.05));
  rect(b, cx - 1, base - 13, 3, 3, lit ? 0xffe88a : 0x5a5a60);
  rect(b, cx - 4, base - 17, 9, 3, mix(stone, 0.75));
  rect(b, cx - 1, base - 19, 3, 2, mix(stone, 0.9));
  rect(b, cx - 3, base - 14, 7, 1, mix(stone, 1.2));
}

// ----------------------------------------------------------------------------- estágios

function terrain(): PixelBuf {
  const b = createBuf(W, H);
  dirt(b, 2, 24, 92, 23);
  // Cerca em três lados: fundo e as duas laterais, com a frente aberta.
  fenceRow(b, 4, 16, 88);
  fenceColumn(b, 4, 22, 24);
  fenceColumn(b, 91, 22, 24);
  // Cantos com estacas mais altas.
  for (const x of [3, 90]) { rect(b, x, 13, 3, 4, 0x6a4a28); rect(b, x, 13, 3, 1, 0x9a6a38); }
  // Placa de madeira com traços no lugar do texto.
  rect(b, 24, 28, 3, 16, 0x6a4a28);
  rect(b, 12, 22, 27, 10, 0x8a5a2e);
  rect(b, 13, 23, 25, 8, 0xf6ecd2);
  rect(b, 13, 23, 25, 1, 0xfffbe8);
  for (const [x, w] of [[16, 6], [24, 3], [28, 7]] as const) rect(b, x, 26, w, 2, 0x4a2a1c);
  rect(b, 17, 29, 17, 1, 0xb8a888);
  // Boneco de treino de pé, no meio do terreno.
  dummy(b, 62, 44, 22);
  // Sacos de areia no chão.
  rect(b, 74, 39, 8, 6, 0xc8b078);
  rect(b, 74, 39, 8, 1, 0xe8d8a0);
  rect(b, 76, 37, 4, 2, 0xa89058);
  outline(b, OUTLINE);
  return b;
}

function mat(): PixelBuf {
  const b = createBuf(W, H);
  dirt(b, 2, 26, 92, 21);
  // Tatame grande no meio do pátio.
  tatami(b, 12, 32, 72, 14);
  // Pórtico de madeira ao fundo, com um telhadinho de tábuas.
  for (const x of [26, 68]) { planks(b, x, 14, 4, 20, 0x8a5a2e, 4); rect(b, x - 1, 32, 6, 2, 0x6a4a28); }
  rect(b, 23, 12, 52, 3, 0x6a4a28);
  rect(b, 23, 12, 52, 1, 0x9a6a38);
  // Telhadinho de madeira sobre o pórtico (duas águas).
  for (let y = 3; y <= 11; y++) {
    const half = Math.round(((y - 3) / 8) * 28);
    for (let x = 49 - half; x <= 49 + half; x++) put(b, x, y, (y - 3) % 3 === 2 ? 0x6a4a28 : (x + y) % 5 === 0 ? 0xb07a48 : 0x8a5a2e);
  }
  rect(b, 20, 12, 58, 1, 0x4a3018);
  // Faixa de tecido e lanterna de papel pendurada no centro.
  banner(b, 47, 16, 10);
  paperLantern(b, 36, 15);
  paperLantern(b, 62, 15);
  // Dois bonecos de treino nas pontas e uma estaca com espada de madeira.
  dummy(b, 14, 41, 16);
  dummy(b, 82, 41, 16);
  rect(b, 8, 41, 1, 6, 0x6a4a28);
  rect(b, 7, 38, 3, 3, 0xc8a070);
  // Cercas laterais curtas.
  fenceColumn(b, 4, 28, 18);
  fenceColumn(b, 91, 28, 18);
  outline(b, OUTLINE);
  return b;
}

function wooden(): PixelBuf {
  const b = createBuf(W, H);
  // Pátio de terra e degrau de madeira.
  dirt(b, 2, 40, 92, 7);
  // Corpo: parede de tábuas sobre uma base de pedra.
  planks(b, 10, 21, 76, 21, 0xb98a52, 4);
  rect(b, 10, 40, 76, 3, 0x7c7868);
  for (let x = 10; x < 86; x += 6) rect(b, x, 40, 1, 3, 0x9a9890);
  rect(b, 8, 21, 80, 2, 0x6a4a28);
  // Vigas verticais.
  for (const x of [10, 28, 46, 49, 67, 84]) rect(b, x, 22, 2, 19, 0x6a4a28);
  // Telhado curvo de telhas cinza-azuladas.
  curvedRoof(b, 48, 4, 21, 13, 46, 0x5a6678, 0x2a3040);
  // Portas de correr no centro (shoji) e degrau.
  shoji(b, 39, 28, 18, 13, 0x6a4a28);
  stoneSlab(b, 36, 41, 24, 3, 0xb4aca0);
  // Janelas de grade.
  lattice(b, 15, 29, 14, 8, 0x6a4a28);
  lattice(b, 67, 29, 14, 8, 0x6a4a28);
  // Faixas vermelhas penduradas dos dois lados da porta.
  banner(b, 32, 23, 14);
  banner(b, 60, 23, 14);
  // Tatame diante da porta e um boneco de treino ao lado.
  tatami(b, 28, 43, 40, 4);
  dummy(b, 8, 46, 14);
  rect(b, 88, 36, 4, 10, 0x6a4a28);
  paperLantern(b, 90, 25);
  outline(b, OUTLINE);
  return b;
}

function stone(): PixelBuf {
  const b = createBuf(W, H);
  // Calçada de pedra em frente.
  stoneSlab(b, 8, 44, 80, 3, 0xb4aca0);
  // Base de pedra grande e corpo superior de madeira escura.
  rect(b, 8, 30, 80, 15, 0x8a8678);
  for (let y = 32; y < 45; y += 5) for (let x = 8 + ((y / 5) % 2) * 4; x < 88; x += 8) rect(b, x, y, 7, 4, (x + y) % 3 === 0 ? 0x989486 : 0x7c7868);
  rect(b, 8, 30, 80, 1, 0xa8a496);
  planks(b, 14, 17, 68, 13, 0x4a3426, 4);
  for (const x of [14, 38, 56, 80]) rect(b, x, 17, 3, 13, 0x2a1c14);
  // Telhado escuro de duas camadas com cumeeira dourada.
  curvedRoof(b, 48, 8, 18, 18, 46, 0x343a4c, 0xd8a820);
  curvedRoof(b, 48, 2, 9, 8, 24, 0x2c3242, 0xe0b020);
  // Pontas da cumeeira viradas para cima, em dourado.
  for (const x of [38, 58]) { rect(b, x - 1, 0, 3, 2, 0xe0b020); put(b, x, 0, 0xf6d860); }
  // Portas duplas de madeira escura, com aldravas douradas.
  rect(b, 38, 29, 21, 16, 0x3a2a1c);
  rect(b, 39, 30, 9, 15, 0x5a3a24);
  rect(b, 49, 30, 9, 15, 0x5a3a24);
  rect(b, 39, 30, 9, 1, 0x7a5434);
  rect(b, 49, 30, 9, 1, 0x7a5434);
  for (let j = 33; j < 45; j += 4) { rect(b, 39, j, 9, 1, 0x3a2a1c); rect(b, 49, j, 9, 1, 0x3a2a1c); }
  put(b, 46, 38, 0xe0b020); put(b, 50, 38, 0xe0b020);
  // Janelas altas iluminadas no corpo de madeira.
  lattice(b, 20, 20, 10, 7, 0x2a1c14);
  lattice(b, 66, 20, 10, 7, 0x2a1c14);
  // Lanternas de pedra e o torii vermelho diante da porta.
  stoneLantern(b, 12, 46, true);
  stoneLantern(b, 84, 46, true);
  toriiGate(b, 48, 46, 15, 17);
  outline(b, OUTLINE);
  return b;
}

const PAINTERS: Record<DojoLevel, () => PixelBuf> = { 0: terrain, 1: mat, 2: wooden, 3: stone };

/** O Dojô no estágio `level` (0 terreno, 1 Tatame, 2 Dojô, 3 Dojô de pedra), 96×48. */
export function paintDojo(level: DojoLevel): PixelBuf {
  return PAINTERS[level]();
}

/** Janelas e portas iluminadas à noite em cada estágio: [x, y, largura, altura] no desenho de 96×48. */
export const DOJO_WINDOWS: readonly (readonly number[])[][] = [
  [],
  [[34, 15, 5, 8], [60, 15, 5, 8]],
  [[39, 28, 18, 13], [15, 29, 14, 8], [67, 29, 14, 8]],
  [[20, 20, 10, 7], [66, 20, 10, 7], [10, 33, 5, 5], [81, 33, 5, 5]],
];
