import { createBuf } from '../box/ground-art';
import type { PixelBuf } from '../box/ground-art';
import { disc, outline, put, rect } from './village-art';

/**
 * O Coliseu da Vila (o prédio «Arena»), todo por código: 112×80, fachada de pedra em dois andares de arcadas com um
 * portão central, a arquibancada aparecendo por trás (com torcida nos lados vermelho e azul, as duas equipes da
 * batalha), bandeirolas no topo, medalhão de bola de captura e tochas que acendem à noite. Mais largo que a área sólida
 * do prédio (7×2 blocos = 112×32 px): o desenho cabe entre a Torre e o Fliperama sem encostar neles.
 */

export const COLISEU_W = 112;
export const COLISEU_H = 80;

const STONE = { light: 0xe0d4b2, mid: 0xc9bb96, dark: 0xa3956f, shade: 0x7a6e52, deep: 0x2a2218 } as const;
const RED = { main: 0xd8463c, dark: 0xa02a24 } as const;
const BLUE = { main: 0x3f6fd0, dark: 0x2a4a98 } as const;
const GOLD = 0xffd84a;
const CROWD = [0xf2c9a0, 0x3a2a22, 0x8a5a38, 0xf5f0e0, 0xffd84a, 0xd0804a] as const;

const CX = COLISEU_W / 2;
/** Cada vão da arcada: pilar de 3 px + arco de 8 px; 9 arcos cabem em 102 px, de x = 5 a x = 107. */
const ARCH_W = 8;
const PIER = 3;
const ARCH_X0 = 5;
const ARCHES = 9;
const archX = (i: number): number => ARCH_X0 + PIER + i * (ARCH_W + PIER);

/** Tochas e luzes que acendem à noite, em pixels do desenho (o jogo soma o brilho por cima). */
export const COLISEU_GLOWS: readonly { x: number; y: number; w: number; h: number; torch?: boolean }[] = [
  { x: 48, y: 57, w: 2, h: 3, torch: true },
  { x: 62, y: 57, w: 2, h: 3, torch: true },
  { x: 52, y: 64, w: 8, h: 9 },
];

/** Um arco: retângulo `ARCH_W` de largura com o topo arredondado (os cantos de cima saem em degraus). */
function arch(b: PixelBuf, x: number, top: number, bottom: number, rgb: number): void {
  for (let y = top; y <= bottom; y++) {
    const cut = y === top ? 3 : y === top + 1 ? 2 : y === top + 2 ? 1 : 0;
    rect(b, x + cut, y, ARCH_W - 2 * cut, 1, rgb);
  }
}

/** Faixa de torcida: cabecinhas coloridas em posições fixas (nada de sorteio, o desenho é sempre o mesmo). */
function crowd(b: PixelBuf, x0: number, x1: number, y: number): void {
  for (let x = x0; x < x1; x++) {
    const h = (x * 7 + y * 13) % 11;
    if (h < 6) put(b, x, y, CROWD[(x * 3 + y) % CROWD.length]!);
  }
}

export function paintColiseu(): PixelBuf {
  const b = createBuf(COLISEU_W, COLISEU_H);

  // Arquibancada vista por trás do muro da frente: degraus de pedra, seções vermelha e azul nos lados.
  for (let y = 8; y <= 30; y++) {
    const hw = 50 - Math.round(12 * ((30 - y) / 22) ** 2);
    const row = (y - 8) % 4;
    for (let x = CX - hw; x < CX + hw; x++) {
      const off = x - CX;
      const section = off < -16 ? RED : off >= 16 ? BLUE : null;
      const base = row === 0 ? STONE.light : row === 3 ? STONE.dark : STONE.mid;
      put(b, x, y, section && row !== 0 ? (row === 3 ? section.dark : section.main) : base);
    }
    if (row === 1) crowd(b, CX - hw + 1, CX + hw - 1, y);
  }
  // Borda do alto e escadinhas que descem a arquibancada.
  rect(b, CX - 38, 7, 76, 1, STONE.light);
  for (const x of [CX - 16, CX + 15]) rect(b, x, 9, 1, 21, STONE.shade);

  // Bandeirolas: dois mastros em cada ponta e uma bandeira grande no meio.
  for (const [x, flag] of [[CX - 34, RED], [CX - 20, RED], [CX + 20, BLUE], [CX + 34, BLUE]] as const) {
    rect(b, x, 1, 1, 7, STONE.shade);
    rect(b, x + 1, 1, 5, 3, flag.main);
    rect(b, x + 1, 3, 5, 1, flag.dark);
  }
  rect(b, CX, 0, 1, 8, STONE.shade);
  rect(b, CX + 1, 0, 6, 3, GOLD);
  rect(b, CX + 1, 2, 6, 1, 0xc9a02a);

  // Muro da frente: dois andares, com as pontas arredondadas para lembrar a elipse.
  for (let y = 30; y <= 75; y++) {
    const hw = y < 34 ? 51 : 52;
    rect(b, CX - hw, y, hw * 2, 1, STONE.mid);
  }
  // Cornijas: uma no alto do muro e outra entre os andares, com sombra embaixo.
  for (const y of [30, 50]) {
    rect(b, 4, y, 104, 2, STONE.light);
    rect(b, 4, y + 2, 104, 1, STONE.dark);
  }
  // Pilares um pouco mais claros que o muro, para a arcada ter relevo.
  for (let i = 0; i <= ARCHES; i++) {
    const x = ARCH_X0 + i * (ARCH_W + PIER);
    rect(b, x, 33, PIER, 17, STONE.light);
    rect(b, x + PIER - 1, 33, 1, 17, STONE.dark);
    rect(b, x, 53, PIER, 22, STONE.light);
    rect(b, x + PIER - 1, 53, 1, 22, STONE.dark);
  }

  // Andar de cima: nove arcos (o do meio dá lugar ao medalhão) com faixas penduradas nos dois de fora.
  for (let i = 0; i < ARCHES; i++) {
    if (i === 4) continue;
    const x = archX(i);
    arch(b, x, 34, 46, STONE.deep);
    put(b, x + 3, 33, STONE.light);
    put(b, x + 4, 33, STONE.light);
    rect(b, x, 47, ARCH_W, 1, STONE.shade);
    if (i === 1 || i === 2) { rect(b, x + 1, 36, ARCH_W - 2, 9, RED.main); rect(b, x + 1, 44, ARCH_W - 2, 1, RED.dark); }
    if (i === 6 || i === 7) { rect(b, x + 1, 36, ARCH_W - 2, 9, BLUE.main); rect(b, x + 1, 44, ARCH_W - 2, 1, BLUE.dark); }
  }
  // Medalhão: bola de captura num aro dourado, sobre o portão.
  disc(b, CX, 40, 8, 8, GOLD);
  disc(b, CX, 40, 7, 7, STONE.deep);
  for (let y = 34; y <= 46; y++) {
    for (let x = CX - 6; x <= CX + 6; x++) {
      if ((x - CX) ** 2 + (y - 40) ** 2 > 36) continue;
      put(b, x, y, y < 40 ? RED.main : y === 40 ? STONE.deep : 0xffffff);
    }
  }
  disc(b, CX, 40, 2, 2, 0xffffff);
  put(b, CX - 1, 40, STONE.deep);
  put(b, CX, 40, STONE.deep);
  put(b, CX - 3, 36, 0xf08a82);
  put(b, CX - 2, 35, 0xf08a82);

  // Andar de baixo: arcos mais altos; o do meio é o portão, mais largo, com degraus e tochas nos pilares.
  for (let i = 0; i < ARCHES; i++) {
    if (i === 4) continue;
    const x = archX(i);
    arch(b, x, 54, 74, STONE.deep);
    rect(b, x + 1, 68, ARCH_W - 2, 7, 0x3a2e22);
    put(b, x + 3, 53, STONE.light);
    put(b, x + 4, 53, STONE.light);
    if (i === 1) { rect(b, x + 1, 58, ARCH_W - 2, 16, RED.main); rect(b, x + 1, 58, ARCH_W - 2, 2, RED.dark); }
    if (i === 7) { rect(b, x + 1, 58, ARCH_W - 2, 16, BLUE.main); rect(b, x + 1, 58, ARCH_W - 2, 2, BLUE.dark); }
  }
  // Portão: arco de 10 px de largura com moldura dourada e o interior fundo.
  for (let y = 52; y <= 74; y++) {
    const cut = y === 52 ? 4 : y === 53 ? 3 : y === 54 ? 2 : y === 55 ? 1 : 0;
    rect(b, 50 + cut, y, 12 - 2 * cut, 1, GOLD);
    if (y > 52) rect(b, 51 + Math.max(0, cut - 1), y, 10 - 2 * Math.max(0, cut - 1), 1, STONE.deep);
  }
  rect(b, 54, 62, 4, 12, 0x3a2e22);
  // Tochas nos pilares ao lado do portão: suporte e chama.
  for (const x of [48, 62]) {
    rect(b, x, 60, 2, 3, STONE.shade);
    rect(b, x, 57, 2, 3, 0xff9a2a);
    put(b, x, 56, 0xffd84a);
    put(b, x + 1, 57, 0xffe88a);
  }

  // Degraus de entrada e base de pedra.
  rect(b, 46, 73, 20, 1, STONE.light);
  rect(b, 44, 74, 24, 1, STONE.mid);
  rect(b, 42, 75, 28, 1, STONE.light);
  for (const [y, rgb] of [[76, STONE.light], [77, STONE.mid], [78, STONE.dark], [79, STONE.shade]] as const) rect(b, 2, y, 108, 1, rgb);

  outline(b, STONE.deep);
  return b;
}
