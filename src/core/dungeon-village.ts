import { add } from './village/life';
import type { VillageState } from './village/life';
import { VAULT_SIZE } from './village/dungeon-vault';
import { SURVIVOR_OMEGA_SHARD_ITEM } from './survivor-mega';
import { recomputeMember } from './dungeon';
import type { DungeonState } from './dungeon';
import type { Gem } from './dungeon-gems';
import type { LunchEffect } from './survivor-lunch';

/**
 * A ponte entre a Masmorra e a Vila. Antes de descer: até 2 gemas do cofre e a marmita do Café. Ao sair com o espólio:
 * moedas por andar, Love Candy por chefe, fragmentos Ômega por profundidade e as melhores gemas de volta ao cofre.
 * Quem cai perde as gemas que levou e não ganha prêmio — o risco da descida. Puro (só mexe nos objetos recebidos).
 */

export const LOVE_CANDY = 'love-candy';
export const VAULT_TAKE = 2;
/** Expedições premiadas por dia (as outras ainda guardam gemas e recorde, mas sem moedas, doces nem fragmentos). */
export const DAILY_REWARDS = 3;
export const COINS_PER_FLOOR = 5;
export const MAX_CANDY = 3;
/** Um fragmento Ômega a cada tantos andares alcançados. */
export const SHARD_EVERY = 10;
/** Marmita do Café na expedição: +1 poção e HP máximo da equipe +15%. */
export const LUNCH_HP = 0.15;

export interface ExpeditionRewards {
  coins: number;
  loveCandy: number;
  omegaShards: number;
  /** Gemas que entraram no cofre. */
  kept: Gem[];
  /** Já passou do teto diário: só cofre e recorde. */
  capped: boolean;
  newRecord: boolean;
}

/** Todas as gemas da expedição: mochila e encaixadas nas armas. */
function allGems(state: DungeonState): Gem[] {
  return [...state.bag, ...state.team.flatMap((m) => m.gems.filter((g): g is Gem => !!g))];
}

const gemRank = (g: Gem) => (g.legendary ? 1000 : 0) + g.tier;

/** O que a expedição renderia (sem mexer em nada). */
export function expeditionRewards(state: DungeonState, village: Pick<VillageState, 'dungeon'>, day: string): ExpeditionRewards {
  const retired = state.phase === 'retired';
  const vault = village.dungeon;
  const used = vault.rewardDay === day ? vault.rewardsToday : 0;
  const capped = used >= DAILY_REWARDS;
  const paid = retired && !capped;
  const space = VAULT_SIZE - vault.gems.length;
  const kept = retired ? allGems(state).sort((a, b) => gemRank(b) - gemRank(a)).slice(0, Math.max(0, space)) : [];
  return {
    coins: paid ? state.stats.deepest * COINS_PER_FLOOR : 0,
    loveCandy: paid ? Math.min(MAX_CANDY, state.stats.bosses) : 0,
    omegaShards: paid ? Math.floor(state.stats.deepest / SHARD_EVERY) : 0,
    kept,
    capped: retired && capped,
    newRecord: state.stats.deepest > vault.bestFloor,
  };
}

/**
 * Fecha a expedição na Vila: guarda gemas no cofre, Love Candy e fragmentos Ômega na mochila, conta o teto do dia e o
 * recorde. As moedas voltam no resultado para entrarem pela carteira (que aplica bônus como o de Zapdos).
 */
export function settleExpedition(village: VillageState, state: DungeonState, day: string): ExpeditionRewards {
  const r = expeditionRewards(state, village, day);
  const vault = village.dungeon;
  if (vault.rewardDay !== day) { vault.rewardDay = day; vault.rewardsToday = 0; }
  if (state.phase === 'retired' && !r.capped) vault.rewardsToday++;
  let nextId = Math.max(0, ...vault.gems.map((g) => g.id)) + 1;
  for (const g of r.kept) vault.gems.push({ ...g, id: nextId++ });
  if (r.loveCandy) add(village, LOVE_CANDY, r.loveCandy);
  if (r.omegaShards) add(village, SURVIVOR_OMEGA_SHARD_ITEM, r.omegaShards);
  vault.bestFloor = Math.max(vault.bestFloor, state.stats.deepest);
  return r;
}

/** Tira até `VAULT_TAKE` gemas do cofre para levar na descida (somem do cofre: quem cai, perde). */
export function takeFromVault(village: VillageState, ids: readonly number[]): Gem[] {
  const want = new Set(ids.slice(0, VAULT_TAKE));
  const taken = village.dungeon.gems.filter((g) => want.has(g.id));
  village.dungeon.gems = village.dungeon.gems.filter((g) => !want.has(g.id));
  return taken;
}

/** Põe as gemas trazidas da Vila na mochila da expedição (com ids novos). */
export function bringGems(state: DungeonState, gems: readonly Gem[]): void {
  for (const g of gems) state.bag.push({ ...g, id: state.nextGemId++ });
  if (gems.length) state.log.push(`Do cofre da Vila: ${gems.length} gema(s) na mochila.`);
}

/** A marmita do Café vira provisão: +1 poção e HP máximo da equipe +15% nesta expedição. */
export function packLunch(state: DungeonState, lunch: Pick<LunchEffect, 'name'>): void {
  state.potions++;
  for (const m of state.team) {
    m.baseMaxHp = Math.round(m.baseMaxHp * (1 + LUNCH_HP));
    recomputeMember(m);
    m.hp = m.maxHp;
  }
  state.log.push(`Marmita do Café (${lunch.name}): +1 poção e mais fôlego para a equipe.`);
}
