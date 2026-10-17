/**
 * Física das insígnias soltas nos encaixes da maleta: cada uma é uma massa presa por uma mola fraca (a espuma do forro)
 * dentro de uma folga pequena. Quando a maleta acelera (girar rápido, chacoalhar, o celular sacudido), as insígnias
 * ficam para trás pela inércia, balançam e batem na borda do encaixe; cada batida forte vira um evento (para o som).
 * Unidades: deslocamento em fração da folga do encaixe; aceleração em folgas/s².
 */

export interface Wobble {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Clink {
  order: number;
  /** Velocidade da batida (0 a 1, já normalizada). */
  strength: number;
}

export const WOBBLE_SPRING = 90;
export const WOBBLE_DAMPING = 5;
/** Quanto da velocidade sobra depois de bater na borda. */
export const WOBBLE_RESTITUTION = 0.45;
/** Velocidade mínima (folgas/s) para uma batida fazer barulho. */
export const CLINK_MIN_SPEED = 1.2;
const CLINK_FULL_SPEED = 8;

export function restingWobble(): Wobble {
  return { x: 0, y: 0, vx: 0, vy: 0 };
}

/**
 * Avança `dt` segundos. `accel` é a aceleração da maleta no plano do forro: as insígnias sentem o oposto.
 * A folga é um círculo de raio 1. Passos longos são divididos para a mola não explodir num quadro lento.
 */
export function stepWobble(states: Wobble[], accel: { x: number; y: number }, dt: number, phase: readonly number[] = []): Clink[] {
  const clinks: Clink[] = [];
  if (!(dt > 0)) return clinks;
  const steps = Math.min(8, Math.max(1, Math.ceil(dt / (1 / 120))));
  const h = Math.min(dt, 0.25) / steps;
  states.forEach((s, order) => {
    // Cada insígnia reage um pouco diferente (peso e encaixe), para não balançarem todas iguais.
    const k = 1 + 0.25 * Math.sin((phase[order] ?? order) * 2.4);
    let hit = 0;
    for (let i = 0; i < steps; i++) {
      const ax = -accel.x * k - WOBBLE_SPRING * s.x - WOBBLE_DAMPING * s.vx;
      const ay = -accel.y * k - WOBBLE_SPRING * s.y - WOBBLE_DAMPING * s.vy;
      s.vx += ax * h;
      s.vy += ay * h;
      s.x += s.vx * h;
      s.y += s.vy * h;
      const r = Math.hypot(s.x, s.y);
      if (r > 1) {
        const nx = s.x / r;
        const ny = s.y / r;
        s.x = nx;
        s.y = ny;
        const vn = s.vx * nx + s.vy * ny;
        if (vn > 0) {
          if (vn > CLINK_MIN_SPEED) hit = Math.max(hit, vn);
          s.vx -= (1 + WOBBLE_RESTITUTION) * vn * nx;
          s.vy -= (1 + WOBBLE_RESTITUTION) * vn * ny;
        }
      }
    }
    if (hit > 0) clinks.push({ order, strength: Math.min(1, hit / CLINK_FULL_SPEED) });
  });
  return clinks;
}

/** A insígnia está praticamente parada (dá para pular a física e o redesenho). */
export function isResting(s: Wobble): boolean {
  return Math.abs(s.x) + Math.abs(s.y) < 0.002 && Math.abs(s.vx) + Math.abs(s.vy) < 0.01;
}

/**
 * Chacoalhada do botão: a maleta vai e volta de lado algumas vezes, cada vez mais fraco. Devolve o deslocamento lateral
 * (em fração da largura da maleta) e o giro (radianos) no instante `t` (segundos desde o começo), ou null quando acabou.
 */
export const SHAKE_DURATION = 0.9;
export function shakeOffset(t: number): { x: number; roll: number } | null {
  if (t < 0 || t > SHAKE_DURATION) return null;
  const fade = 1 - t / SHAKE_DURATION;
  const wave = Math.sin(t * Math.PI * 2 * 5.5);
  return { x: 0.06 * wave * fade, roll: 0.08 * Math.sin(t * Math.PI * 2 * 5.5 + 0.8) * fade };
}

/** Aceleração (2ª derivada numérica) de uma grandeza amostrada em três quadros seguidos com o mesmo intervalo. */
export function secondDerivative(prev2: number, prev: number, now: number, dt: number): number {
  return dt > 0 ? (now - 2 * prev + prev2) / (dt * dt) : 0;
}
