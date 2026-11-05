import type { PokemonType } from './pokemon-data';
import type { SurvivorFx } from './survivor-types';

/**
 * Marcas que os golpes deixam no chão da Torre e a luz que eles soltam. Lógica pura; o desenho fica em
 * `village/survivor-scars-art.ts`. A marca segue o golpe: o tipo escolhe o material, a forma do efeito escolhe o contorno
 * (explosão redonda, leque ou faixa de feixe) e o tamanho vem do alcance. Ela é só desenho: física e inimigos não mudam.
 */

export type ScarShape = 'round' | 'cone' | 'line';

export interface Scar {
  type: PokemonType;
  shape: ScarShape;
  x: number;
  y: number;
  /** Raio da explosão, alcance do leque ou meia largura da faixa. */
  r: number;
  /** Direção do leque ou da faixa. */
  angle: number;
  /** Meia abertura do leque. */
  spread: number;
  /** Comprimento da faixa. */
  length: number;
  seed: number;
}

/** Abaixo disso o golpe é pequeno demais para marcar o chão. */
const MIN_ROUND_RADIUS = 22;
const MAX_ROUND_RADIUS = 110;
const MAX_LINE_WIDTH = 30;

const seedOf = (x: number, y: number): number => (Math.round(x) * 73 + Math.round(y) * 179) >>> 0;

/** A marca de um efeito de golpe, ou nada se ele não for um golpe que acerta o chão. */
export function scarFromFx(fx: SurvivorFx, power: number): Scar | null {
  if (!fx.moveType) return null;
  const base = { type: fx.moveType, x: fx.x, y: fx.y, seed: seedOf(fx.x, fx.y) };
  if (fx.kind === 'blast' || fx.kind === 'pulse') {
    if (fx.r < MIN_ROUND_RADIUS) return null;
    const r = Math.min(MAX_ROUND_RADIUS, fx.r * (0.6 + 0.3 * Math.min(1, Math.max(0, power))));
    return { ...base, shape: 'round', r, angle: 0, spread: 0, length: 0 };
  }
  if (fx.kind === 'cone') {
    if (fx.angle === undefined || fx.spread === undefined || fx.r < MIN_ROUND_RADIUS) return null;
    return { ...base, shape: 'cone', r: fx.r, angle: fx.angle, spread: fx.spread, length: 0 };
  }
  if (fx.kind === 'beam' || fx.kind === 'rush') {
    if (fx.fromX === undefined || fx.fromY === undefined || fx.toX === undefined || fx.toY === undefined) return null;
    const dx = fx.toX - fx.fromX;
    const dy = fx.toY - fx.fromY;
    const length = Math.hypot(dx, dy);
    if (length < 24) return null;
    const r = fx.kind === 'beam' ? Math.min(MAX_LINE_WIDTH, Math.max(6, fx.r)) : 9;
    return { ...base, shape: 'line', x: fx.fromX, y: fx.fromY, r, angle: Math.atan2(dy, dx), spread: 0, length };
  }
  return null;
}

/** Lado do pedaço de chão em que as marcas são pintadas de vez. */
export const SCAR_CHUNK = 480;
/** Pedaços a mais de dois de distância do jogador se perdem, e as marcas deles junto. */
const KEPT_CHUNKS = 2;

/** Retângulo que a marca ocupa, com folga para a borda irregular. */
export function scarBounds(scar: Scar): { left: number; top: number; right: number; bottom: number } {
  const margin = scar.r * 1.4 + 8;
  const endX = scar.x + Math.cos(scar.angle) * (scar.shape === 'line' ? scar.length : scar.shape === 'cone' ? scar.r : 0);
  const endY = scar.y + Math.sin(scar.angle) * (scar.shape === 'line' ? scar.length : scar.shape === 'cone' ? scar.r : 0);
  return {
    left: Math.min(scar.x, endX) - margin,
    top: Math.min(scar.y, endY) - margin,
    right: Math.max(scar.x, endX) + margin,
    bottom: Math.max(scar.y, endY) + margin,
  };
}

/** Pedaços de chão que a marca toca: uma marca na divisa é pintada nos dois. */
export function chunksTouched(scar: Scar): [number, number][] {
  const box = scarBounds(scar);
  const out: [number, number][] = [];
  for (let cy = Math.floor(box.top / SCAR_CHUNK); cy <= Math.floor(box.bottom / SCAR_CHUNK); cy++) {
    for (let cx = Math.floor(box.left / SCAR_CHUNK); cx <= Math.floor(box.right / SCAR_CHUNK); cx++) out.push([cx, cy]);
  }
  return out;
}

export function isChunkLost(cx: number, cy: number, playerX: number, playerY: number): boolean {
  const px = Math.floor(playerX / SCAR_CHUNK);
  const py = Math.floor(playerY / SCAR_CHUNK);
  return Math.max(Math.abs(cx - px), Math.abs(cy - py)) > KEPT_CHUNKS;
}

const LIGHT_BY_TYPE: Partial<Record<PokemonType, number>> = {
  fire: 1.25,
  electric: 1.3,
  psychic: 0.95,
  fairy: 0.95,
  dragon: 0.95,
  ice: 0.85,
  ghost: 0.35,
  dark: 0.25,
};

/** Quanta luz o tipo solta: fogo e raio clareiam a noite, sombra e fantasma quase não. */
export function moveLight(type: PokemonType | undefined): number {
  return type ? (LIGHT_BY_TYPE[type] ?? 0.6) : 0.6;
}

/** O clarão nasce forte e apaga rápido. */
export function flashAlpha(ageMs: number, lifeMs: number): number {
  const left = 1 - Math.min(1, ageMs / Math.max(1, lifeMs));
  return left * left;
}

export interface LightPoint {
  x: number;
  y: number;
  r: number;
  alpha: number;
}

/** Sombra de quem está perto de um clarão: aponta para longe da luz mais forte. Longe de qualquer luz, não há sombra. */
export function shadowFrom(x: number, y: number, radius: number, lights: readonly LightPoint[], maxLength: number): { angle: number; reach: number } | null {
  let best: LightPoint | null = null;
  let bestStrength = 0.1;
  for (const light of lights) {
    const distance = Math.hypot(x - light.x, y - light.y);
    if (distance < 4 || distance > light.r * 1.8) continue;
    const strength = light.alpha * (1 - distance / (light.r * 1.8));
    if (strength > bestStrength) {
      best = light;
      bestStrength = strength;
    }
  }
  if (!best) return null;
  return { angle: Math.atan2(y - best.y, x - best.x), reach: radius + maxLength * Math.min(1, 0.4 + bestStrength) };
}
