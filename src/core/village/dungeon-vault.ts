import { GEM_KINDS, LEGENDARY_KINDS } from '../dungeon-gems';
import type { Gem } from '../dungeon-gems';

/**
 * O que a Vila guarda da Masmorra (vai no backup junto com o resto da Vila): o cofre de gemas trazidas das expedições,
 * o teto diário de expedições premiadas e o andar mais fundo já alcançado.
 */
export interface DungeonVault {
  gems: Gem[];
  rewardDay: string;
  rewardsToday: number;
  bestFloor: number;
}

export const VAULT_SIZE = 12;

export function emptyDungeonVault(): DungeonVault {
  return { gems: [], rewardDay: '', rewardsToday: 0, bestFloor: 0 };
}

const KINDS: readonly string[] = [...GEM_KINDS, ...LEGENDARY_KINDS];

export function normalizeDungeonVault(raw: unknown): DungeonVault {
  const base = emptyDungeonVault();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<DungeonVault>;
  const gems = Array.isArray(r.gems)
    ? r.gems.filter((g): g is Gem => !!g && typeof g === 'object' && KINDS.includes((g as Gem).kind) && Number.isInteger((g as Gem).tier) && (g as Gem).tier >= 1 && (g as Gem).tier <= 99)
      .slice(0, VAULT_SIZE)
      .map((g, i) => ({ id: i + 1, kind: g.kind, tier: g.legendary ? 1 : g.tier, legendary: (LEGENDARY_KINDS as readonly string[]).includes(g.kind) }))
    : [];
  return {
    gems,
    rewardDay: typeof r.rewardDay === 'string' ? r.rewardDay.slice(0, 10) : '',
    rewardsToday: Number.isInteger(r.rewardsToday) ? Math.max(0, Math.min(99, r.rewardsToday!)) : 0,
    bestFloor: Number.isInteger(r.bestFloor) ? Math.max(0, Math.min(99999, r.bestFloor!)) : 0,
  };
}
