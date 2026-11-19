import { seededRng, type Rng } from './battle';
import type { SurvivorEnemy } from './survivor-types';

export const SURVIVOR_ALPHA_INCREASE_MS = 180_000;
export const SURVIVOR_ALPHA_MULTIPLIER = 2;

/** Chance por nascimento no relógio exibido. A taxa tardia considera a densidade maior das ondas. */
export function survivorAlphaChance(elapsedMs: number): number {
  return elapsedMs < SURVIVOR_ALPHA_INCREASE_MS ? 0.002 : 0.01;
}

/** Sorteio próprio preserva a sequência de espécies, golpes e recompensas da corrida. */
export function survivorAlphaRng(runSeed: number, enemyId: number): Rng {
  return seededRng(runSeed ^ Math.imul(enemyId, 0x85ebca6b));
}

/** Aplicado uma única vez ao inimigo recém-criado, após calcular seus atributos normais. */
export function rollSurvivorAlpha(enemy: SurvivorEnemy, elapsedMs: number, rng: Rng): void {
  if (rng() >= survivorAlphaChance(elapsedMs)) return;
  enemy.alpha = true;
  enemy.hp *= SURVIVOR_ALPHA_MULTIPLIER;
  enemy.maxHp *= SURVIVOR_ALPHA_MULTIPLIER;
  enemy.damage *= SURVIVOR_ALPHA_MULTIPLIER;
  enemy.radius *= SURVIVOR_ALPHA_MULTIPLIER;
}

/** Considera também níveis cujo XP já foi recolhido neste mesmo quadro. */
export function survivorAlphaXpValue(level: number, xp: number, xpForLevel: (level: number) => number): number {
  let threshold = xpForLevel(level);
  while (xp >= threshold) {
    xp -= threshold;
    threshold = xpForLevel(++level);
  }
  return threshold;
}
