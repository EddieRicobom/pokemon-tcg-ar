import type { SurvivorEnemy } from './survivor-types';

/**
 * Armadura dos alvos da Torre.
 *
 * Só o dano direto do jogador é reduzido: queimadura, veneno, espinhos, terreno e efeitos de status
 * continuam entrando. Crítico, Terastal e Supremo abrem a guarda por alguns segundos, então builds
 * que acertam com frequência têm uma resposta clara contra chefes blindados.
 *
 * Módulo folha (só tipos) para poder ser usado pelo motor e por `survivor-supreme.ts` sem ciclo.
 */

/** Crítico, Terastal ou Supremo abrem a guarda por este tempo. */
export const SURVIVOR_ARMOR_BREAK_MS = 4000;
/** Quanto da armadura some enquanto ela está quebrada. */
export const SURVIVOR_ARMOR_BREAK_REDUCTION = 0.35;
/** Teto duro da armadura: nenhum alvo ignora mais que isso do dano direto. */
export const SURVIVOR_ARMOR_MAX = 0.8;

type ArmoredEnemy = Pick<SurvivorEnemy, 'damageReduction'> & { armorBreakMs?: number };

/** Armadura efetiva: base limitada ao teto, menos a quebra temporária. */
export function survivorEnemyDamageReduction(enemy: ArmoredEnemy): number {
  const value = enemy.damageReduction ?? 0;
  if (!Number.isFinite(value) || value <= 0) return 0;
  const base = Math.min(SURVIVOR_ARMOR_MAX, value);
  const broken = (enemy.armorBreakMs ?? 0) > 0 ? base - SURVIVOR_ARMOR_BREAK_REDUCTION : base;
  return Math.max(0, Math.min(SURVIVOR_ARMOR_MAX, broken));
}

export function mitigateSurvivorEnemyDamage(enemy: ArmoredEnemy, damage: number): number {
  if (!Number.isFinite(damage) || damage <= 0) return 0;
  return damage * (1 - survivorEnemyDamageReduction(enemy));
}

/** Quebra a armadura de um alvo que ainda tem guarda; devolve `true` se abriu agora. */
export function breakSurvivorEnemyArmor(enemy: SurvivorEnemy, ms = SURVIVOR_ARMOR_BREAK_MS): boolean {
  if ((enemy.damageReduction ?? 0) <= 0) return false;
  const wasBroken = (enemy.armorBreakMs ?? 0) > 0;
  enemy.armorBreakMs = Math.max(enemy.armorBreakMs ?? 0, ms);
  return !wasBroken;
}
