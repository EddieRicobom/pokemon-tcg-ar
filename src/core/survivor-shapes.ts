import type { SurvivorPlayer } from './survivor-types';

/**
 * Geometria dos golpes de cone e órbita. Fica separada do motor para que o desenho use exatamente as mesmas
 * posições e ângulos que decidem o dano: o cone desenhado é o cone que acerta, e cada orbital desenhado é um
 * orbital que acerta.
 */

/** Meia abertura do cone (≈ 38°): um leque estreito à frente, não meia arena. */
export const SURVIVOR_CONE_HALF_ANGLE = 0.66;
/** Orbitais com 1 disparo; cada "Disparo múltiplo" acrescenta mais um, até `SURVIVOR_ORBIT_MAX`. */
export const SURVIVOR_ORBIT_BASE = 3;
export const SURVIVOR_ORBIT_MAX = 6;
/** Fração do raio do golpe em que os orbitais giram. */
const ORBIT_PATH_FACTOR = 0.72;

type Aim = Pick<SurvivorPlayer, 'aimAngle' | 'facing'>;

/** Direção da frente do Pokémon, em radianos (sem mira registrada, o lado para onde ele olha). */
export function survivorAimAngle(p: Aim): number {
  return p.aimAngle ?? (p.facing < 0 ? Math.PI : 0);
}

const normalizeAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

/**
 * O ponto está dentro do cone à frente do jogador? `extra` é o raio do alvo: ele conta na distância e alarga a
 * abertura na medida do quanto o corpo dele invade o leque.
 */
export function inSurvivorCone(
  p: Pick<SurvivorPlayer, 'x' | 'y'> & Aim,
  x: number,
  y: number,
  range: number,
  extra = 0,
): boolean {
  const dx = x - p.x;
  const dy = y - p.y;
  const distance = Math.hypot(dx, dy);
  if (distance > range + extra) return false;
  if (distance <= extra) return true;
  const delta = Math.abs(normalizeAngle(Math.atan2(dy, dx) - survivorAimAngle(p)));
  return delta <= SURVIVOR_CONE_HALF_ANGLE + Math.asin(Math.min(1, extra / distance));
}

export function survivorOrbitCount(p: Pick<SurvivorPlayer, 'shots'>): number {
  return Math.min(SURVIVOR_ORBIT_MAX, SURVIVOR_ORBIT_BASE + Math.max(0, p.shots - 1));
}

export function survivorOrbitRadius(p: Pick<SurvivorPlayer, 'attackRadius'>): number {
  return Math.max(30, p.attackRadius * ORBIT_PATH_FACTOR);
}

/** Raio de contato de cada orbital: alcança quem encosta no jogador e quem chega até a borda do giro. */
export function survivorOrbiterHitRadius(p: Pick<SurvivorPlayer, 'attackRadius'>): number {
  return Math.max(18, survivorOrbitRadius(p) * 0.45);
}

/**
 * Velocidade de giro (rad/ms). Com os 3 orbitais iniciais, um orbital passa pelo mesmo ponto a cada recarga do
 * golpe; recarga menor gira mais rápido e orbitais extras passam com mais frequência.
 */
export function survivorOrbitAngularSpeed(cooldownMs: number): number {
  return (Math.PI * 2) / (SURVIVOR_ORBIT_BASE * Math.max(120, cooldownMs));
}

/** Intervalo mínimo entre dois toques de orbital no mesmo inimigo, para um orbital não acertar a cada quadro. */
export function survivorOrbitHitIntervalMs(p: Pick<SurvivorPlayer, 'shots'>, cooldownMs: number): number {
  const passMs = (Math.PI * 2) / (survivorOrbitCount(p) * survivorOrbitAngularSpeed(cooldownMs));
  return Math.max(180, passMs * 0.8);
}

export interface SurvivorOrbiter {
  x: number;
  y: number;
  /** Ângulo do orbital em volta do jogador. */
  angle: number;
}

/** Posições atuais dos orbitais, igualmente espaçadas a partir de `orbitAngle`. */
export function survivorOrbiters(p: Pick<SurvivorPlayer, 'x' | 'y' | 'shots' | 'attackRadius' | 'orbitAngle'>): SurvivorOrbiter[] {
  const count = survivorOrbitCount(p);
  const radius = survivorOrbitRadius(p);
  const phase = p.orbitAngle ?? 0;
  return Array.from({ length: count }, (_, index) => {
    const angle = phase + (index / count) * Math.PI * 2;
    return { x: p.x + Math.cos(angle) * radius, y: p.y + Math.sin(angle) * radius, angle };
  });
}
