import { createBuf } from '../box/ground-art';
import type { PixelBuf } from '../box/ground-art';
import { put, rect } from './village-art';
import { blend, FRAME, glassWindow, inkOutline, mix } from './building-style';

/**
 * O Coliseu da Vila (o prédio «Arena»), todo por código, no mesmo estilo das casas do atlas (`building-style.ts`):
 * estádio redondo visto de cima em 3/4. Em cima, a elipse do anel de pedra com a arquibancada em degraus (lado
 * vermelho à esquerda, azul à direita, as duas equipes da batalha) e o campo verde com as linhas e a bola de captura no
 * meio; embaixo, a fachada curva de pedra clara com janelas de vidro em arco, faixas das equipes, um medalhão sobre o
 * portão e duas tochas. 112×89: a largura é a da área sólida (7×2 blocos), o desenho cabe entre a Torre e o Fliperama.
 */

export const COLISEU_W = 112;
export const COLISEU_H = 89;

const STONE = [0xf0e6cc, 0xdccfae, 0xc2b38e, 0x9e9070, 0x7c7058] as const;
const SEAT = { red: [0xe0584a, 0xb83c34], blue: [0x4a6ad0, 0x34509e], cream: [0xe4dcc4, 0xc4baa0] } as const;
const FIELD = { main: 0x88b468, dark: 0x6e9a56, line: 0xeef0d8, shade: 0x5a8048 } as const;
const GOLD = { light: 0xf8d860, mid: 0xd8a830, dark: 0xa07820 } as const;
const CROWD = [0xf2c9a0, 0x6a4a3a, 0xf8f0e0, 0xf8d860, 0xd0804a, 0x8a5a38] as const;
const HOLE = 0x4a4058;

const CX = COLISEU_W / 2;
const CY = 27;
const RX = 55;
const RY = 24;
/** Arquibancada até a borda do campo (elipse de dentro). */
const RX_IN = 36;
const RY_IN = 12;
/** Altura da fachada (do anel até o chão), a mesma em toda a volta: a base acompanha a curva. */
const WALL_H = 34;

/** Coordenada normalizada do centro do pixel em relação ao meio do desenho. */
const ux = (x: number): number => (x + 0.5 - CX) / RX;
/** Onde a borda de baixo do anel passa na coluna `x` (o alto da fachada). */
const wallTop = (x: number): number => Math.round(CY + RY * Math.sqrt(Math.max(0, 1 - ux(x) ** 2)));

/**
 * Janelas de vidro do andar de cima: arcos de 5×7 a cada 10 px, acompanhando a curva da fachada (o vão do meio é do
 * medalhão). Ficam numa lista porque a mesma geometria vira as luzes da noite.
 */
const WINDOW_XS = [7, 17, 27, 37, 70, 80, 90, 100] as const;

/** Luzes da noite: o vidro de cada janela e as duas tochas do portão, em pixels do desenho. */
export const COLISEU_GLOWS: readonly { x: number; y: number; w: number; h: number; torch?: boolean }[] = [
  ...WINDOW_XS.map((x) => ({ x: x + 1, y: wallTop(x + 2) + 6, w: 3, h: 5 })),
  { x: 43, y: 71, w: 2, h: 3, torch: true },
  { x: 67, y: 71, w: 2, h: 3, torch: true },
];

/** Tom da pedra da fachada conforme a coluna: luz da esquerda, sombra crescendo para a direita (curva do tambor). */
function wallTone(x: number, lift = 0): number {
  const u = ux(x);
  const i = u < -0.62 ? 0 : u < 0.12 ? 1 : u < 0.62 ? 2 : 3;
  return STONE[Math.max(0, Math.min(4, i - lift))]!;
}

/**
 * Posição do pixel no anel de cima: 0 na borda do campo, 1 na borda de fora (elipses intermediárias entre as duas).
 * Fora do anel devolve < 0 (campo) ou > 1 (fora).
 */
function ringK(x: number, y: number): number {
  const dx = x + 0.5 - CX;
  const dy = y + 0.5 - CY;
  const at = (k: number) => (dx / (RX_IN + (RX - RX_IN) * k)) ** 2 + (dy / (RY_IN + (RY - RY_IN) * k)) ** 2;
  if (at(0) <= 1) return -1;
  if (at(1) > 1) return 2;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) <= 1) hi = mid;
    else lo = mid;
  }
  return hi;
}

function paintTop(b: PixelBuf): void {
  for (let y = 0; y < CY + RY + 1; y++) for (let x = 0; x < COLISEU_W; x++) {
    const k = ringK(x, y);
    if (k > 1) continue;
    const dx = x + 0.5 - CX;
    const back = y + 0.5 < CY;
    if (k < 0) {
      // Campo: grama em faixas, sombra da arquibancada de trás na borda de cima.
      const fy = (y + 0.5 - CY) / RY_IN;
      const fx = dx / RX_IN;
      const edge = fx * fx + fy * fy;
      let c: number = Math.floor((x + 2) / 6) % 2 ? FIELD.main : FIELD.dark;
      if (edge > 0.72 && fy < 0) c = FIELD.shade;
      put(b, x, y, c);
      continue;
    }
    if (k > 0.86) {
      // Anel de pedra do alto do muro: claro na frente-esquerda, mais escuro atrás-direita.
      put(b, x, y, k > 0.94 ? (back ? STONE[1] : STONE[0]) : dx > 20 ? STONE[2] : STONE[1]);
      continue;
    }
    // Arquibancada: 5 degraus, cada um com assento (cor da equipe) e espelho (sombra).
    const step = Math.floor(k * 5.8);
    const riser = (k * 5.8) % 1 > 0.62;
    const team = dx < -14 ? SEAT.red : dx >= 14 ? SEAT.blue : SEAT.cream;
    let c: number = riser ? team[1] : team[0];
    if (!back) c = mix(c, riser ? 0.78 : 0.9);
    if (step === 0) c = riser ? STONE[3] : STONE[2];
    put(b, x, y, c);
    // Torcida: cabecinhas em posições fixas nos degraus de trás (sem sorteio).
    if (back && !riser && step > 0 && (x * 7 + y * 13) % 5 === 0) put(b, x, y, CROWD[(x * 3 + step) % CROWD.length]!);
  }
  // Linhas do campo: borda, linha do meio e o círculo com a bola de captura.
  for (let y = CY - RY_IN; y <= CY + RY_IN; y++) for (let x = 0; x < COLISEU_W; x++) {
    const fx = (x + 0.5 - CX) / (RX_IN - 7);
    const fy = (y + 0.5 - CY) / (RY_IN - 4);
    if (ringK(x, y) >= 0) continue;
    const box = Math.abs(fx) <= 1 && Math.abs(fy) <= 1 && (Math.abs(fx) > 0.96 || Math.abs(fy) > 0.86);
    const mid = Math.abs(x + 0.5 - CX) < 1 && Math.abs(fy) <= 1;
    const r = Math.hypot((x + 0.5 - CX) / 6, (y + 0.5 - CY) / 4);
    if (box || mid || (r > 0.78 && r <= 1.02)) put(b, x, y, FIELD.line);
  }
  // Bola de captura no meio do campo (metade de cima vermelha).
  for (const [x, y, c] of [[54, 26, SEAT.red[0]], [55, 26, SEAT.red[0]], [56, 26, SEAT.red[0]], [57, 26, SEAT.red[0]], [54, 27, FIELD.line], [57, 27, FIELD.line], [55, 27, 0x4a4058], [56, 27, 0x4a4058]] as const) put(b, x, y, c);
  // Bandeiras nos mastros do anel de trás: vermelhas à esquerda, azuis à direita (os mastros do meio são mais curtos: o anel ali já está no alto do desenho).
  for (const [x, flag] of [[18, SEAT.red], [36, SEAT.red], [75, SEAT.blue], [93, SEAT.blue]] as const) {
    const top = CY - Math.round(RY * Math.sqrt(1 - ux(x) ** 2));
    const mast = Math.max(1, top - 8);
    rect(b, x, mast, 1, top - mast + 1, STONE[3]);
    rect(b, x + 1, mast, 5, 3, flag[0]);
    rect(b, x + 1, mast + 2, 5, 1, flag[1]);
    put(b, x, mast - 1, GOLD.light);
  }
}

function paintFacade(b: PixelBuf): void {
  for (let x = 1; x < COLISEU_W - 1; x++) {
    const top = wallTop(x);
    if (Math.abs(ux(x)) >= 1) continue;
    const base = top + WALL_H;
    rect(b, x, top, 1, WALL_H, wallTone(x));
    // Cornija do alto (o anel visto de frente) e a cinta entre os andares, com sombra embaixo.
    put(b, x, top, wallTone(x, 1));
    put(b, x, top + 1, wallTone(x, 1));
    put(b, x, top + 2, mix(wallTone(x), 0.8));
    put(b, x, top + 14, wallTone(x, 1));
    put(b, x, top + 15, wallTone(x, 1));
    put(b, x, top + 16, mix(wallTone(x), 0.8));
    // Rodapé mais escuro e fiadas de pedra a cada 4 linhas.
    for (let y = top + 18; y < base - 3; y += 4) if ((x + (y >> 2)) % 7 === 0) put(b, x, y, mix(wallTone(x), 0.88));
    rect(b, x, base - 3, 1, 3, mix(wallTone(x), 0.8));
    put(b, x, base - 3, mix(wallTone(x), 0.92));
  }
  // Andar de cima: janelas de vidro em arco (as mesmas das casas do atlas).
  for (const x of WINDOW_XS) glassWindow(b, x, wallTop(x + 2) + 5, 5, 7, { arch: wallTone(x + 2) });
  // Andar de baixo: pilastras com sombra e arcos escuros; as faixas das equipes caem nos arcos de fora.
  const archesAt = [6, 17, 28, 76, 87, 98] as const;
  for (const x of archesAt) {
    const top = wallTop(x + 3) + 19;
    const bottom = wallTop(x + 3) + WALL_H - 4;
    for (let y = top; y <= bottom; y++) {
      const cut = y === top ? 2 : y === top + 1 ? 1 : 0;
      rect(b, x + cut, y, 7 - 2 * cut, 1, HOLE);
    }
    rect(b, x + 1, bottom - 2, 5, 3, mix(HOLE, 0.8));
    const team = x < CX ? SEAT.red : SEAT.blue;
    if (x === 17 || x === 87) {
      rect(b, x + 1, top + 2, 5, bottom - top - 3, team[0]);
      rect(b, x + 1, top + 2, 1, bottom - top - 3, mix(team[0], 1.15));
      rect(b, x + 5, top + 2, 1, bottom - top - 3, team[1]);
      put(b, x + 3, bottom - 1, team[1]);
      put(b, x + 3, top + 6, FRAME.light);
    }
  }
  // Medalhão de bola de captura num aro dourado, sobre o portão.
  const my = wallTop(56) + 8;
  for (let y = my - 6; y <= my + 6; y++) for (let x = 49; x <= 62; x++) {
    const d = Math.hypot(x + 0.5 - CX, y + 0.5 - my);
    if (d > 6.2) continue;
    if (d > 5) put(b, x, y, x < CX ? GOLD.light : GOLD.dark);
    else if (Math.abs(y + 0.5 - my) < 0.8) put(b, x, y, HOLE);
    else put(b, x, y, y < my ? SEAT.red[0] : FRAME.light);
  }
  rect(b, 54, my - 1, 4, 2, HOLE);
  rect(b, 55, my - 1, 2, 2, FRAME.light);
  put(b, 52, my - 4, 0xf8a090);

  // Portão: arco largo com moldura de pedra clara e grade, degraus de entrada embaixo.
  const gateTop = wallTop(56) + 17;
  const gateBottom = wallTop(56) + WALL_H - 1;
  for (let y = gateTop - 2; y <= gateBottom; y++) {
    const cut = y <= gateTop ? 3 - (y - gateTop + 2) : 0;
    rect(b, 46 + Math.max(0, cut), y, 20 - 2 * Math.max(0, cut), 1, STONE[0]);
  }
  for (let y = gateTop; y <= gateBottom; y++) {
    const cut = y === gateTop ? 3 : y === gateTop + 1 ? 2 : y === gateTop + 2 ? 1 : 0;
    rect(b, 48 + cut, y, 16 - 2 * cut, 1, HOLE);
  }
  for (let x = 50; x < 63; x += 3) rect(b, x, gateTop + 2, 1, gateBottom - gateTop - 4, mix(HOLE, 1.35));
  rect(b, 49, gateTop + 6, 14, 1, mix(HOLE, 1.35));
  rect(b, 63, gateTop + 1, 1, gateBottom - gateTop, mix(STONE[2], 0.9));
  // Tochas: suporte de pedra e chama.
  for (const x of [43, 67]) {
    rect(b, x, 74, 2, 3, STONE[3]);
    rect(b, x - 1, 77, 4, 1, STONE[4]);
    rect(b, x, 71, 2, 3, 0xf08a2a);
    put(b, x, 70, GOLD.light);
    put(b, x, 72, 0xfff0a0);
  }
  // Degraus da entrada, que pisam na última linha do desenho.
  const steps: readonly (readonly [number, number])[] = [[gateBottom + 1, 24], [gateBottom + 2, 28], [gateBottom + 3, 32]];
  for (const [y, w] of steps) {
    if (y >= COLISEU_H) continue;
    rect(b, CX - w / 2, y, w, 1, y === gateBottom + 1 ? STONE[0] : y === gateBottom + 2 ? STONE[1] : STONE[2]);
  }
}

export function paintColiseu(): PixelBuf {
  const b = createBuf(COLISEU_W, COLISEU_H);
  paintFacade(b);
  paintTop(b);
  // Sombra do anel na fachada logo abaixo da borda (luz de cima).
  for (let x = 1; x < COLISEU_W - 1; x++) if (Math.abs(ux(x)) < 1) put(b, x, wallTop(x) + 3, blend(wallTone(x), STONE[4], 0.35));
  inkOutline(b);
  return b;
}
