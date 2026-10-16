import type { Dir } from './actors';

/**
 * Joystick virtual da Vila. A Vila anda em blocos (um passo por vez), então o analógico vira direções: a do eixo
 * mais forte (`primary`) e, quando o dedo está na diagonal, a do outro eixo (`secondary`). Quem anda alterna as
 * duas a cada passo (anda na diagonal em escadinha) e, se uma estiver bloqueada, tenta a outra (desliza pela
 * parede em vez de travar). Puro e testável; o toque fica em `VillageView.vue`.
 */
export interface StickDirs {
  primary: Dir | null;
  secondary: Dir | null;
  /** 0 a 1: quanto o dedo saiu do centro (depois da zona morta). */
  strength: number;
}

/** Abaixo disso (fração do raio), o dedo está "no centro": parado. */
export const STICK_DEADZONE = 0.28;
/** O eixo menor conta como diagonal quando vale pelo menos isto do maior (≈ 27° fora do eixo). */
export const DIAGONAL_RATIO = 0.5;

/** Leva o deslocamento do dedo (px) ao círculo do joystick: vetor em −1..1, preso ao raio `max`. */
export function stickVector(dx: number, dy: number, max: number): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  if (len === 0 || max <= 0) return { x: 0, y: 0 };
  const k = Math.min(len, max) / len / max;
  return { x: dx * k, y: dy * k };
}

/** Direções a partir do vetor do joystick (`y` para baixo, como na tela). */
export function stickDirs(x: number, y: number, deadzone = STICK_DEADZONE): StickDirs {
  const len = Math.hypot(x, y);
  if (len < deadzone) return { primary: null, secondary: null, strength: 0 };
  const strength = Math.min(1, (len - deadzone) / (1 - deadzone));
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const horiz: Dir = x < 0 ? 'left' : 'right';
  const vert: Dir = y < 0 ? 'up' : 'down';
  const [primary, secondary, major, minor] = ax >= ay ? [horiz, vert, ax, ay] : [vert, horiz, ay, ax];
  return { primary, secondary: minor >= major * DIAGONAL_RATIO ? secondary : null, strength };
}

/**
 * Ordem de tentativa do próximo passo. Na diagonal alterna qual eixo vai primeiro (`stepParity` muda a cada passo
 * dado); o outro é a reserva, para deslizar quando o primeiro está bloqueado.
 */
export function stepOrder(dirs: Pick<StickDirs, 'primary' | 'secondary'>, stepParity: number): Dir[] {
  const { primary, secondary } = dirs;
  if (!primary) return [];
  if (!secondary) return [primary];
  return stepParity % 2 === 0 ? [primary, secondary] : [secondary, primary];
}
