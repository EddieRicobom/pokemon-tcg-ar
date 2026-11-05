import { createBuf } from '../box/ground-art';
import type { PixelBuf } from '../box/ground-art';
import { disc, outline, put, rect } from './village-art';

/**
 * Prédios dos modos de jogo, pintados por código na mesma família: visão em 3/4, contorno azul-marinho, parede com luz à
 * esquerda e sombra na base, telhado em fileiras, pé-direito igual e porta centrada. Desenho original, na linguagem visual
 * dos tilesets de Sinnoh já usados na Vila. A Torre é a exceção de propósito: uma torre digital, alta e de vidro.
 */

const NAVY = 0x1f2a44;
const GLASS = 0x8fd0ff;
const GLASS_LIGHT = 0xdff4ff;

/** Tábuas horizontais com emendas, luz à esquerda, sombra do beiral no alto e barra de pedra junto ao chão. */
function wall(b: PixelBuf, x: number, y: number, w: number, h: number, base: number, light: number, dark: number): void {
  rect(b, x, y, w, h, base);
  for (let row = y + 3; row < y + h - 6; row += 4) {
    rect(b, x, row, w, 1, dark);
    for (let seam = x + ((row * 7) % 13) + 4; seam < x + w - 2; seam += 17) rect(b, seam, row - 3, 1, 3, dark);
  }
  rect(b, x, y, 2, h, light);
  rect(b, x + w - 3, y, 3, h, dark);
  rect(b, x, y, w, 4, 0x6a5a58);
  rect(b, x, y + 4, w, 1, dark);
  rect(b, x, y + h - 6, w, 6, 0x8d8a80);
  for (let px = x + 2; px < x + w; px += 7) rect(b, px, y + h - 6, 1, 6, 0x6f6c64);
  rect(b, x, y + h - 6, w, 1, 0xb5b1a4);
}

/** Telhado em 3/4 com telhas desencontradas, cume claro e beiral que faz sombra na parede. */
function roof(b: PixelBuf, x: number, y: number, w: number, h: number, base: number, light: number, dark: number): void {
  rect(b, x, y, w, h, base);
  for (let row = y + 3, n = 0; row < y + h - 2; row += 3, n++) {
    rect(b, x, row, w, 1, dark);
    for (let px = x + (n % 2) * 3; px < x + w; px += 6) {
      rect(b, px, row - 2, 1, 2, dark);
      rect(b, px + 1, row - 2, 2, 1, light);
    }
  }
  rect(b, x, y, w, 2, light);
  rect(b, x - 2, y + h - 3, w + 4, 2, base);
  rect(b, x - 2, y + h - 1, w + 4, 1, dark);
}

/** Janela pequena com caixilho em cruz, peitoril e floreira: o tamanho das casas da Vila. */
function pane(b: PixelBuf, x: number, y: number, w: number, h: number, frame: number): void {
  const px = x + Math.floor((w - 12) / 2);
  rect(b, px - 1, y - 1, 14, 12, frame);
  rect(b, px, y, 12, 10, GLASS);
  rect(b, px, y, 5, 3, GLASS_LIGHT);
  rect(b, px + 6, y, 1, 10, frame);
  rect(b, px, y + 5, 12, 1, frame);
  rect(b, px - 2, y + 10, 16, 2, 0x8a5a38);
  rect(b, px - 1, y + 9, 2, 1, 0x3fa66a);
  rect(b, px + 5, y + 9, 3, 1, 0xff7ab6);
  rect(b, px + 11, y + 9, 2, 1, 0x3fa66a);
}

/** Porta recuada sob um toldo listrado, com degrau. */
function doors(b: PixelBuf, cx: number, bottom: number, frame: number): void {
  rect(b, cx - 9, bottom - 19, 18, 19, 0x2b2f3f);
  rect(b, cx - 8, bottom - 18, 7, 16, GLASS);
  rect(b, cx + 1, bottom - 18, 7, 16, GLASS);
  rect(b, cx - 7, bottom - 17, 2, 1, GLASS_LIGHT);
  rect(b, cx - 12, bottom - 23, 24, 4, frame);
  for (let x = cx - 12; x < cx + 12; x += 6) rect(b, x, bottom - 23, 3, 4, 0xf4f0e0);
  rect(b, cx - 12, bottom - 19, 24, 1, 0x2b2f3f);
  rect(b, cx - 11, bottom - 2, 22, 2, 0xb5b1a4);
}

export function paintArcadeHall(): PixelBuf {
  const b = createBuf(80, 72);
  roof(b, 4, 12, 72, 18, 0xe8743b, 0xf6a26a, 0xb04f26);
  wall(b, 6, 30, 68, 41, 0xf0dcb8, 0xfff0d4, 0xc9b088);
  // Letreiro com lâmpadas, a marca do Fliperama.
  rect(b, 12, 4, 56, 16, NAVY);
  rect(b, 14, 6, 52, 12, 0x3a2f78);
  for (let x = 16; x < 66; x += 6) put(b, x, 7, x % 12 === 4 ? 0xffe36e : 0xff7ab6);
  for (let x = 19; x < 66; x += 6) put(b, x, 16, x % 12 === 7 ? 0x7be6ff : 0xffe36e);
  rect(b, 24, 10, 8, 4, 0xff7ab6);
  rect(b, 36, 10, 8, 4, 0x7be6ff);
  rect(b, 48, 10, 8, 4, 0xffe36e);
  // Máquinas vistas pela vitrine.
  pane(b, 11, 40, 20, 16, 0x8a5a38);
  pane(b, 49, 40, 20, 16, 0x8a5a38);
  doors(b, 40, 71, 0x8a5a38);
  outline(b, NAVY);
  return b;
}

export function paintPinsHall(): PixelBuf {
  const b = createBuf(80, 72);
  roof(b, 4, 12, 72, 18, 0x3fa66a, 0x7bd29a, 0x2a7a4c);
  wall(b, 6, 30, 68, 41, 0xe8ecd8, 0xfbfdf0, 0xb8c0a4);
  // Pino gigante no telhado: bola branca com a faixa vermelha.
  disc(b, 40, 11, 10, 10, NAVY);
  disc(b, 40, 11, 9, 9, 0xf4f6ec);
  rect(b, 31, 9, 18, 4, 0xc94a4a);
  disc(b, 37, 8, 2, 2, 0xffffff);
  // Faixa da pista correndo pela fachada.
  rect(b, 6, 33, 68, 3, 0xc94a4a);
  rect(b, 6, 36, 68, 1, 0xfff3c9);
  pane(b, 12, 42, 16, 12, 0x2a7a4c);
  pane(b, 52, 42, 16, 12, 0x2a7a4c);
  doors(b, 40, 71, 0x2a7a4c);
  outline(b, NAVY);
  return b;
}

export function paintDungeonGate(): PixelBuf {
  const b = createBuf(80, 72);
  const stones = [0x7c7488, 0x6a6276, 0x8a8296] as const;
  // Muralha de pedra com ameias: um portão, não uma casa.
  rect(b, 6, 18, 68, 53, stones[1]);
  for (let y = 18; y < 68; y += 6) {
    for (let x = 6 + ((y / 6) % 2) * 5; x < 72; x += 11) rect(b, x, y, 9, 4, stones[(x + y) % 3]!);
  }
  for (let x = 6; x < 74; x += 14) rect(b, x, 12, 9, 7, stones[2]);
  rect(b, 6, 65, 68, 6, 0x4f4860);
  // Arco e escada que desce para o escuro.
  disc(b, 40, 40, 19, 19, 0x4f4860);
  rect(b, 21, 40, 38, 31, 0x4f4860);
  disc(b, 40, 41, 16, 16, 0x0e0a18);
  rect(b, 24, 41, 32, 30, 0x0e0a18);
  for (let step = 0; step < 4; step++) rect(b, 26 + step * 2, 60 + step * 3, 28 - step * 4, 2, 0x3a3448 - step * 0x050505);
  // Pedra-chave roxa e duas tochas.
  rect(b, 36, 20, 8, 7, NAVY);
  rect(b, 37, 21, 6, 5, 0x8a5fc0);
  rect(b, 38, 22, 2, 1, 0xd8b8ff);
  for (const x of [13, 63]) {
    rect(b, x, 34, 3, 9, 0x2b2f3f);
    rect(b, x - 1, 29, 5, 5, 0xff9a3c);
    rect(b, x, 28, 3, 3, 0xffe36e);
  }
  outline(b, NAVY);
  return b;
}

/** A Torre digital: fuste de vidro afinando para cima, anéis de luz e antena. Nada de telhado nem de parede de casa. */
export function paintDigitalTower(): PixelBuf {
  const b = createBuf(64, 132);
  const cx = 32;
  // Base de aço.
  rect(b, 6, 116, 52, 15, 0x4a5678);
  rect(b, 6, 116, 52, 2, 0x8fa0c8);
  rect(b, 6, 128, 52, 3, 0x2b3350);
  // Fuste.
  for (let y = 24; y < 116; y++) {
    const half = Math.round(9 + ((y - 24) / 92) * 11);
    rect(b, cx - half, y, half * 2, 1, 0x23406e);
    rect(b, cx - half, y, 3, 1, 0x3f6aa8);
    rect(b, cx + half - 3, y, 3, 1, 0x182c50);
    // Andares de janelas acesas, em blocos de dados.
    if (y % 8 < 3) for (let x = cx - half + 4; x < cx + half - 4; x += 5) rect(b, x, y, 3, 1, (x + y) % 3 === 0 ? 0x67f8cf : 0x53dcff);
  }
  // Coluna central de luz.
  rect(b, cx - 1, 24, 2, 92, 0xc8f4ff);
  // Anéis.
  for (const [y, half] of [[46, 20], [84, 25]] as const) {
    rect(b, cx - half, y, half * 2, 4, 0x8fa0c8);
    rect(b, cx - half, y + 1, half * 2, 1, 0x53dcff);
    rect(b, cx - half + 2, y + 4, half * 2 - 4, 1, 0x182c50);
  }
  // Topo: domo, antena e farol.
  disc(b, cx, 20, 9, 9, 0x3f6aa8);
  disc(b, cx, 19, 6, 6, 0x53dcff);
  disc(b, cx - 2, 17, 2, 2, GLASS_LIGHT);
  rect(b, cx - 1, 2, 2, 11, 0x8fa0c8);
  rect(b, cx - 5, 7, 10, 1, 0x8fa0c8);
  rect(b, cx - 2, 0, 4, 3, 0xff5a5a);
  doors(b, cx, 131, 0x8fa0c8);
  outline(b, NAVY);
  return b;
}

export interface GameBuildingArt {
  paint: () => PixelBuf;
  /** Janelas que acendem à noite: x, y, largura e altura em pixels do desenho. */
  windows: readonly (readonly [number, number, number, number])[];
}

export const GAME_BUILDINGS: Readonly<Record<string, GameBuildingArt>> = {
  arcade: { paint: paintArcadeHall, windows: [[15, 40, 12, 10], [53, 40, 12, 10]] },
  pins: { paint: paintPinsHall, windows: [[14, 42, 12, 10], [54, 42, 12, 10]] },
  masmorra: { paint: paintDungeonGate, windows: [[12, 28, 5, 6], [62, 28, 5, 6]] },
  torre: { paint: paintDigitalTower, windows: [[24, 30, 16, 80], [28, 15, 8, 8]] },
};
