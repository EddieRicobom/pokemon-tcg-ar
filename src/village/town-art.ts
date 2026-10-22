import { createBuf } from '../box/ground-art';
import type { PixelBuf } from '../box/ground-art';
import { disc, outline, put, rect } from './village-art';
import type { HomeExteriorStyle } from '../core/village/town-layout';

/**
 * Pixel art da cidadinha da Vila, toda por código: a casa dos Pokémon em quatro níveis (com telhado de cor escolhida e
 * enfeites), o terreno ainda não liberado, o Café, o Correio, o Museu, a fonte da praça e o poste de luz.
 */

const mix = (rgb: number, k: number): number => {
  const r = Math.min(255, Math.round(((rgb >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((rgb >> 8) & 255) * k));
  const b = Math.min(255, Math.round((rgb & 255) * k));
  return (r << 16) | (g << 8) | b;
};

/** Telhado de duas águas: do cume `apex` à base `base`, até `half` blocos para cada lado de `cx`. */
function gable(buf: PixelBuf, cx: number, apex: number, base: number, half: number, rgb: number): void {
  const light = mix(rgb, 1.18);
  const dark = mix(rgb, 0.72);
  for (let y = apex; y <= base; y++) {
    const h = Math.round(((y - apex) / (base - apex)) * half);
    for (let x = cx - h; x <= cx + h; x++) put(buf, x, y, (y - apex) % 4 === 3 ? dark : (x + y) % 7 === 0 ? light : rgb);
  }
  for (let x = cx - half; x <= cx + half; x++) put(buf, x, base, dark);
}

function window(buf: PixelBuf, x: number, y: number, w: number, h: number, frame: number): void {
  rect(buf, x - 1, y - 1, w + 2, h + 2, frame);
  rect(buf, x, y, w, h, 0x8fd0ff);
  rect(buf, x + Math.floor(w / 2) - 1, y, 1, h, frame);
  rect(buf, x, y + Math.floor(h / 2), w, 1, frame);
  put(buf, x + 1, y + 1, 0xdff4ff);
}

/** Janelas de cada nível da casa, em pixels do desenho de 48×48 (para acender à noite). */
export const HOME_WINDOWS: readonly (readonly (readonly number[])[])[] = [
  [[10, 35, 6, 6]],
  [[8, 32, 8, 8], [32, 32, 8, 8]],
  [[8, 31, 8, 9], [32, 31, 8, 9]],
  [[7, 30, 8, 9], [33, 30, 8, 9], [21, 14, 6, 6]],
];

/** Onde fica o lampião da porta, em pixels do desenho (para o brilho à noite). */
export const HOME_LANTERN = { x: 15, y: 33 };

/** A casa de um Pokémon (48×48: o telhado sobe 16 pontos acima do chão de 2 blocos). */
export function paintHome(level: number, roofRgb: number, decor: number, style: HomeExteriorStyle = 'rústico'): PixelBuf {
  const b = createBuf(48, 48);
  const lvl = Math.max(0, Math.min(3, level));
  const baseWall = [0xc8985a, 0xb88450, 0xc4573e, 0xf3e8d0][lvl]!;
  const wall = style === 'jardim' ? mix(baseWall, 1.08) : style === 'festivo' ? (lvl === 3 ? 0xffd58a : 0xd96a5d) : style === 'moderno' ? (lvl < 2 ? 0x9eb4c9 : 0xe7edf2) : baseWall;
  const trim = mix(wall, 0.78);
  const geo = [
    { x0: 8, x1: 39, top: 30, apex: 12, base: 32, half: 22, cx: 24 },
    { x0: 5, x1: 42, top: 26, apex: 8, base: 28, half: 24, cx: 24 },
    { x0: 4, x1: 43, top: 24, apex: 6, base: 26, half: 25, cx: 24 },
    { x0: 4, x1: 43, top: 22, apex: 2, base: 24, half: 25, cx: 24 },
  ][lvl]!;
  rect(b, geo.x0, geo.top, geo.x1 - geo.x0 + 1, 47 - geo.top, wall);
  if (lvl === 0) {
    for (let x = geo.x0 + 3; x < geo.x1; x += 5) rect(b, x, geo.top, 1, 47 - geo.top, trim);
  } else if (lvl === 1) {
    for (let x = geo.x0 + 4; x < geo.x1; x += 6) rect(b, x, geo.top, 1, 47 - geo.top, trim);
  } else if (lvl === 2) {
    for (let y = geo.top + 3; y < 47; y += 4) {
      rect(b, geo.x0, y, geo.x1 - geo.x0 + 1, 1, 0xe8d8c0);
      for (let x = geo.x0 + (((y - geo.top) / 4) % 2 ? 2 : 6); x < geo.x1; x += 8) rect(b, x, y - 3, 1, 3, 0xe8d8c0);
    }
  } else {
    rect(b, geo.x0, geo.top + 10, geo.x1 - geo.x0 + 1, 2, 0x8a5a2e);
    for (const x of [geo.x0, geo.x1 - 1, 23]) rect(b, x, geo.top, 2, 47 - geo.top, 0x8a5a2e);
  }
  gable(b, geo.cx, geo.apex, geo.base, geo.half, roofRgb);
  if (style === 'festivo') {
    for (let x = geo.cx - 18; x <= geo.cx + 18; x += 6) put(b, x, geo.base + 3 + (x % 4 === 0 ? 1 : 0), [0xffd84a, 0xf06048, 0x4f8fe0][Math.abs(x / 6) % 3]!);
  } else if (style === 'jardim') {
    for (const x of [geo.x0 + 2, geo.x1 - 2]) { rect(b, x, 39, 2, 5, 0x4aa84a); put(b, x - 1, 38, 0xffd84a); put(b, x + 2, 38, 0xf08ab0); }
  } else if (style === 'moderno') {
    rect(b, geo.x0 + 2, geo.top + 3, 2, 12, 0xd8e6ef);
    rect(b, geo.x1 - 3, geo.top + 3, 2, 12, 0xd8e6ef);
  }
  if (lvl >= 2) {
    rect(b, 34, geo.apex + 4, 6, 12, 0x9a968e);
    rect(b, 33, geo.apex + 3, 8, 2, 0x6e6a64);
  }
  // Porta com maçaneta.
  rect(b, 20, 36, 8, 11, 0x7a4a24);
  rect(b, 21, 35, 6, 1, 0x7a4a24);
  rect(b, 20, 36, 1, 11, 0x5a3418);
  put(b, 26, 42, 0xffd84a);
  if (lvl === 3) rect(b, 16, 36, 1, 11, 0x8a5a2e);
  for (const w of HOME_WINDOWS[lvl]!) window(b, w[0]!, w[1]!, w[2]!, w[3]!, lvl === 3 ? 0xffffff : mix(wall, 0.6));
  // Enfeites.
  if (decor & 1) {
    for (const w of HOME_WINDOWS[lvl]!.slice(0, 2)) {
      rect(b, w[0]! - 1, w[1]! + w[3]! + 1, w[2]! + 2, 3, 0x6a4a28);
      for (let i = 0; i < w[2]!; i += 2) put(b, w[0]! + i, w[1]! + w[3]!, [0xf06048, 0xffd84a, 0xf8a8c8][(i / 2) % 3]!);
    }
  }
  if (decor & 4) {
    rect(b, 14, 36, 2, 11, 0x3a3a46);
    rect(b, 13, 32, 4, 4, 0xffe27a);
    rect(b, 13, 31, 4, 1, 0x3a3a46);
    rect(b, 13, 36, 4, 1, 0x3a3a46);
  }
  if (decor & 8) {
    rect(b, 43, 41, 2, 6, 0x6a4a28);
    rect(b, 41, 37, 6, 5, 0x3f6fd0);
    rect(b, 41, 37, 6, 1, 0x6a96f0);
    rect(b, 45, 38, 1, 3, 0xe8453c);
  }
  outline(b, 0x2a1a10);
  if (decor & 2) {
    for (let x = 0; x < 48; x += 3) {
      if (x > 17 && x < 30) continue;
      rect(b, x, 41, 2, 6, 0xffffff);
      put(b, x, 41, 0xdcdcdc);
      put(b, x + 1, 41, 0xdcdcdc);
    }
    rect(b, 0, 43, 18, 1, 0xdcdcdc);
    rect(b, 30, 43, 18, 1, 0xdcdcdc);
  }
  return b;
}

/** Terreno ainda não liberado: chão batido, estacas com corda e uma placa em branco (o texto é desenhado por cima). */
export function paintLot(): PixelBuf {
  const b = createBuf(48, 48);
  rect(b, 1, 20, 46, 27, 0xb88a52);
  for (let y = 22; y < 47; y += 4) for (let x = 2; x < 46; x++) if ((x + y) % 6 === 0) put(b, x, y, 0xd2a66c);
  for (const [x, y] of [[1, 20], [46, 20], [1, 44], [46, 44]] as const) {
    rect(b, x - 1, y - 1, 3, 6, 0x6a4a28);
    rect(b, x - 1, y - 1, 3, 1, 0x9a6a38);
  }
  for (let x = 3; x < 45; x++) {
    put(b, x, 22 + (x % 6 < 3 ? 0 : 1), 0xe8d8a8);
    put(b, x, 45 + (x % 6 < 3 ? 0 : 1), 0xe8d8a8);
  }
  rect(b, 22, 30, 4, 14, 0x6a4a28);
  rect(b, 14, 24, 20, 10, 0xf6ecd2);
  rect(b, 14, 24, 20, 1, 0x8a5a2e);
  rect(b, 14, 33, 20, 1, 0x8a5a2e);
  rect(b, 14, 24, 1, 10, 0x8a5a2e);
  rect(b, 33, 24, 1, 10, 0x8a5a2e);
  for (let x = 17; x < 31; x += 3) rect(b, x, 28, 2, 2, 0xb8a888);
  outline(b, 0x2a1a10);
  return b;
}

/** O Café: 64×48, toldo listrado verde-água, janela grande e um letreiro com a xícara. */
export function paintCafe(): PixelBuf {
  const b = createBuf(64, 48);
  rect(b, 2, 22, 60, 25, 0xf6e2c0);
  for (let y = 26; y < 47; y += 4) rect(b, 2, y, 60, 1, 0xe2cca0);
  window(b, 8, 30, 22, 12, 0x2a8a8a);
  rect(b, 8, 38, 22, 4, 0xd8f0f0);
  rect(b, 38, 28, 10, 19, 0x2a8a8a);
  rect(b, 39, 29, 8, 17, 0x3aa8a8);
  put(b, 45, 38, 0xffd84a);
  rect(b, 52, 30, 8, 10, 0x8fd0ff);
  for (let y = 14; y < 24; y++) for (let x = 0; x < 64; x++) put(b, x, y, Math.floor(x / 5) % 2 ? 0x2a9d9d : 0xffffff);
  for (let x = 0; x < 64; x += 5) for (let k = 0; k < 3; k++) rect(b, x + k, 24 + k, 5 - 2 * k, 1, Math.floor(x / 5) % 2 ? 0x2a9d9d : 0xffffff);
  // Letreiro com uma xícara.
  rect(b, 22, 1, 20, 12, 0x6a4a28);
  rect(b, 23, 2, 18, 10, 0xf6e2c0);
  rect(b, 28, 5, 7, 5, 0xffffff);
  rect(b, 28, 5, 7, 1, 0xdcdcdc);
  rect(b, 35, 6, 2, 3, 0xffffff);
  rect(b, 28, 10, 8, 1, 0x8a5a2e);
  for (const x of [29, 32]) rect(b, x, 2, 1, 2, 0xc0c0c8);
  outline(b, 0x2a1a10);
  return b;
}

/** O Correio: 48×48, fachada azul com a corneta amarela e uma caixa vermelha na frente. */
export function paintMail(): PixelBuf {
  const b = createBuf(48, 48);
  rect(b, 4, 22, 40, 25, 0x3f6fd0);
  for (let y = 26; y < 47; y += 4) rect(b, 4, y, 40, 1, 0x3560b8);
  gable(b, 24, 6, 24, 24, 0x4a5068);
  rect(b, 18, 30, 12, 17, 0x6a4a28);
  rect(b, 19, 31, 10, 15, 0x8a5a2e);
  put(b, 27, 39, 0xffd84a);
  window(b, 7, 31, 8, 8, 0xf6f6f6);
  window(b, 33, 31, 8, 8, 0xf6f6f6);
  // Corneta do correio sobre a porta.
  disc(b, 24, 16, 5, 5, 0xffd84a);
  disc(b, 24, 16, 3, 3, 0xc99a10);
  rect(b, 22, 11, 4, 1, 0xfff0a0);
  // Caixa de coleta na frente.
  rect(b, 36, 40, 8, 7, 0xe8453c);
  rect(b, 36, 40, 8, 1, 0xff7a6a);
  rect(b, 38, 43, 4, 1, 0x3a1a14);
  outline(b, 0x1a1a3a);
  return b;
}

/** O Museu: 48×48, frontão com colunas de mármore, degraus e uma faixa vermelha. */
export function paintMuseum(): PixelBuf {
  const b = createBuf(48, 48);
  for (let y = 4; y <= 18; y++) {
    const h = Math.round(((y - 4) / 14) * 23);
    for (let x = 24 - h; x <= 24 + h; x++) put(b, x, y, y === 18 || x === 24 - h || x === 24 + h ? 0xd8d0c0 : 0xf2ece0);
  }
  disc(b, 24, 13, 3, 3, 0xd8463c);
  rect(b, 2, 19, 44, 3, 0xe4dccb);
  rect(b, 4, 22, 40, 24, 0xf6f0e4);
  for (const x of [6, 16, 29, 39]) {
    rect(b, x, 22, 4, 22, 0xffffff);
    rect(b, x, 22, 1, 22, 0xdcd4c4);
    rect(b, x - 1, 22, 6, 2, 0xe4dccb);
    rect(b, x - 1, 42, 6, 2, 0xe4dccb);
  }
  rect(b, 20, 28, 8, 16, 0x5a3a24);
  rect(b, 21, 29, 6, 14, 0x7a4a24);
  rect(b, 23, 8, 2, 2, 0xffd84a);
  rect(b, 2, 44, 44, 3, 0xdcd4c4);
  rect(b, 0, 46, 48, 2, 0xc8c0b0);
  outline(b, 0x3a342a);
  return b;
}

/** O Fliperama: 64×48, fachada roxa com letreiro de lâmpadas, joystick e duas telas acesas. */
export function paintArcade(): PixelBuf {
  const b = createBuf(64, 48);
  rect(b, 2, 18, 60, 29, 0x4a2f86);
  for (let y = 22; y < 47; y += 4) rect(b, 2, y, 60, 1, 0x3c2570);
  // Letreiro com lâmpadas coloridas e um joystick.
  rect(b, 6, 2, 52, 15, 0x1f1640);
  rect(b, 8, 4, 48, 11, 0x2d2060);
  const bulbs = [0xff5a5a, 0xffd84a, 0x5ad8ff, 0x7aff7a];
  for (let x = 8; x < 56; x += 4) {
    put(b, x, 4, bulbs[(x / 4) % 4]!);
    put(b, x + 1, 14, bulbs[(x / 4 + 2) % 4]!);
  }
  rect(b, 18, 11, 12, 3, 0x9a9aa8);
  rect(b, 23, 7, 2, 4, 0xc8c8d4);
  disc(b, 24, 6, 3, 3, 0xe8453c);
  rect(b, 36, 7, 4, 4, 0xffd84a);
  rect(b, 42, 7, 4, 4, 0x5ad8ff);
  rect(b, 48, 9, 4, 4, 0xff7aa8);
  // Duas telas acesas com bichinhos de pixel.
  for (const x of [6, 40]) {
    rect(b, x - 1, 25, 18, 14, 0x1a1a22);
    rect(b, x, 26, 16, 12, 0x0e2a3a);
    for (let k = 0; k < 4; k++) rect(b, x + 2 + k * 3, 28 + (k % 2) * 3, 2, 2, k % 2 ? 0x7aff7a : 0xff7a7a);
    rect(b, x + 6, 35, 4, 1, 0xffd84a);
  }
  // Porta.
  rect(b, 25, 27, 12, 20, 0x2a1a50);
  rect(b, 26, 28, 10, 18, 0x6a4ac8);
  rect(b, 26, 28, 10, 2, 0x9a7aff);
  put(b, 34, 38, 0xffd84a);
  outline(b, 0x120a28);
  return b;
}

/** A Pista de Pins: 64×48, telhado de madeira, três pinos grandes no letreiro e a boca da pista aberta. */
export function paintPins(): PixelBuf {
  const b = createBuf(64, 48);
  gable(b, 32, 6, 22, 31, 0xb8453a);
  rect(b, 3, 22, 58, 25, 0xe8d4a8);
  for (let y = 26; y < 47; y += 4) rect(b, 3, y, 58, 1, 0xd0b888);
  // Letreiro com três pinos e uma bola.
  rect(b, 17, 9, 30, 13, 0x5a3a1c);
  rect(b, 18, 10, 28, 11, 0xfff0d0);
  for (const x of [22, 27, 32]) {
    disc(b, x, 12, 2, 2, 0xffffff);
    rect(b, x - 1, 14, 3, 5, 0xffffff);
    rect(b, x - 1, 14, 3, 1, 0xe8453c);
    rect(b, x - 2, 18, 5, 1, 0xdcdcdc);
  }
  disc(b, 40, 17, 3, 3, 0x2a3a8a);
  put(b, 39, 16, 0x9ab8ff);
  // A boca da pista: madeira clara em perspectiva e pinos ao fundo.
  rect(b, 18, 30, 28, 17, 0x3a2410);
  rect(b, 19, 31, 26, 16, 0xe8b868);
  for (let k = 0; k < 6; k++) rect(b, 19 + k * 4 + 1, 31, 1, 16, 0xd0a050);
  for (const [x, y] of [[29, 33], [32, 33], [35, 33], [30, 36], [34, 36], [32, 39]] as const) {
    rect(b, x, y, 2, 3, 0xffffff);
    put(b, x, y, 0xe8453c);
  }
  disc(b, 32, 45, 2, 1.5, 0x2a3a8a);
  // Janelas dos lados.
  window(b, 6, 30, 8, 8, 0x5a3a1c);
  window(b, 50, 30, 8, 8, 0x5a3a1c);
  outline(b, 0x2a1408);
  return b;
}

/** A Arena: 64×48, muralha de pedra com arcada, faixas vermelha e azul e uma bola de captura no topo. */
export function paintArena(): PixelBuf {
  const b = createBuf(64, 48);
  rect(b, 2, 16, 60, 31, 0xa8a49a);
  for (let y = 18; y < 47; y += 5) for (let x = 2 + ((y / 5) % 2) * 5; x < 62; x += 10) rect(b, x, y, 9, 4, (x + y) % 3 === 0 ? 0xb8b4aa : 0x9a968c);
  // Ameias.
  for (let x = 2; x < 62; x += 8) rect(b, x, 12, 5, 5, 0xa8a49a);
  // Bola de captura grande no centro, sobre a arcada.
  disc(b, 32, 9, 7, 7, 0xffffff);
  for (let y = 2; y <= 9; y++) for (let x = 25; x <= 39; x++) if ((x - 32) ** 2 + (y - 9) ** 2 <= 49) put(b, x, y, 0xe8453c);
  rect(b, 25, 9, 15, 1, 0x1a1a22);
  disc(b, 32, 9, 2, 2, 0xffffff);
  put(b, 32, 9, 0x1a1a22);
  // Faixas dos lados: uma vermelha, uma azul.
  rect(b, 8, 20, 9, 18, 0xd8463c);
  rect(b, 8, 36, 9, 2, 0xa02a24);
  rect(b, 47, 20, 9, 18, 0x3f6fd0);
  rect(b, 47, 36, 9, 2, 0x2a4a98);
  rect(b, 10, 24, 5, 5, 0xffd84a);
  rect(b, 49, 24, 5, 5, 0xffd84a);
  // Arcada de entrada.
  rect(b, 23, 26, 18, 21, 0x2a2a34);
  for (let y = 26; y < 34; y++) { const k = 34 - y; for (let x = 23; x < 23 + k; x++) put(b, x, y, 0xa8a49a); for (let x = 41 - k; x < 41; x++) put(b, x, y, 0xa8a49a); }
  rect(b, 26, 34, 12, 13, 0x1a1a22);
  rect(b, 24, 44, 16, 3, 0x7a766c);
  outline(b, 0x24221e);
  return b;
}

/** A Torre de Sobrevivência: 48×48, torre de pedra estreita com telhado cônico vermelho e uma janela por andar. */
export function paintTorre(): PixelBuf {
  const b = createBuf(48, 48);
  // Corpo de pedra, mais estreito que os outros prédios (sobra terreno dos dois lados, só mato).
  rect(b, 10, 18, 28, 29, 0x8a8678);
  for (let y = 20; y < 47; y += 5) for (let x = 10 + ((y / 5) % 2) * 4; x < 38; x += 8) rect(b, x, y, 7, 4, (x + y) % 3 === 0 ? 0x989486 : 0x7c7868);
  // Telhado cônico vermelho, no topo.
  gable(b, 24, 2, 18, 15, 0xc24a3a);
  rect(b, 22, 2, 4, 3, 0x5a4a3a); // pião do telhado
  // Três janelas empilhadas (andares da torre).
  window(b, 20, 23, 8, 7, 0x3a2a1c);
  window(b, 20, 32, 8, 7, 0x3a2a1c);
  // Porta em arco na base.
  rect(b, 19, 38, 10, 9, 0x241a12);
  for (let y = 38; y < 41; y++) { const k = 41 - y; for (let x = 19; x < 19 + k; x++) put(b, x, y, 0x8a8678); for (let x = 29 - k; x < 29; x++) put(b, x, y, 0x8a8678); }
  outline(b, 0x241e16);
  return b;
}

/** A fonte da praça: 32×40 (2×2 blocos; o jato sobe acima do chão). Dois quadros para a água brilhar. */
export function paintFountain(frame = 0): PixelBuf {
  const b = createBuf(32, 40);
  disc(b, 16, 30, 15, 9, 0xb8b4aa);
  disc(b, 16, 29, 13, 7, 0x4f8fe0);
  disc(b, 16, 29, 11, 5, 0x6aaaf0);
  for (let i = 0; i < 6; i++) put(b, 6 + ((i * 5 + frame * 3) % 20), 27 + (i % 3) * 2, 0xdff4ff);
  rect(b, 14, 14, 4, 16, 0xc8c4ba);
  disc(b, 16, 14, 5, 2, 0xc8c4ba);
  disc(b, 16, 13, 4, 1.5, 0x6aaaf0);
  for (let k = 0; k < 4; k++) {
    const dy = (frame + k) % 4;
    put(b, 16, 6 + dy, 0xdff4ff);
    put(b, 12 - k, 12 + dy * 2, 0xb8e0ff);
    put(b, 20 + k, 12 + dy * 2, 0xb8e0ff);
  }
  put(b, 16, 5, 0xffffff);
  outline(b, 0x3a3a46);
  return b;
}

/** O poste de luz da rua: 16×32, com a lâmpada acesa à noite. */
export function paintLamp(lit: boolean): PixelBuf {
  const b = createBuf(16, 32);
  rect(b, 7, 10, 2, 20, 0x3a3a46);
  rect(b, 5, 29, 6, 3, 0x2a2a34);
  rect(b, 4, 4, 8, 7, lit ? 0xffe27a : 0xc8dcea);
  rect(b, 5, 5, 3, 3, lit ? 0xfff4b0 : 0xe6f2fa);
  rect(b, 3, 2, 10, 2, 0x3a3a46);
  rect(b, 6, 0, 4, 2, 0x3a3a46);
  rect(b, 3, 11, 10, 1, 0x3a3a46);
  outline(b, 0x1a1a22);
  return b;
}
