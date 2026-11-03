import type { SurvivorPlayer } from './survivor-types';

/** Cura de HP real; retorna o valor efetivo e respeita o bloqueio digital. */
export function healSurvivor(player: SurvivorPlayer, amount: number): number {
  if ((player.healBlockMs ?? 0) > 0 || !Number.isFinite(amount) || amount <= 0) return 0;
  const healed = Math.min(amount, Math.max(0, player.maxHp - player.hp));
  player.hp += healed;
  return healed;
}
