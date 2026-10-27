import type { SurvivorPlayer, SurvivorUpgradeRarity } from './survivor-types';
import { SURVIVOR_UPGRADES } from './survivor-upgrades';

/**
 * Evolução visual dos projéteis: as cartas de ataque e de elemento que servem para disparos somam "poder", e o poder
 * vira um nível de 0 a 4 que só muda o desenho (tamanho, rastro, brilho, faíscas). Não altera dano nem alcance.
 */
export type SurvivorProjectileTier = 0 | 1 | 2 | 3 | 4;

export const PROJECTILE_TIER_NAMES: Record<SurvivorProjectileTier, string> = {
  0: 'Disparo simples',
  1: 'Disparo carregado',
  2: 'Disparo reforçado',
  3: 'Disparo supremo',
  4: 'Disparo lendário',
};

/** Poder mínimo para cada nível (índice = nível). */
export const PROJECTILE_TIER_THRESHOLDS: readonly number[] = [0, 3, 8, 15, 24];

const RARITY_POWER: Record<SurvivorUpgradeRarity, number> = { normal: 1, raro: 2, lendario: 3, ancestral: 5 };
/** Cada evolução da espécie também deixa o disparo mais imponente. */
const EVOLUTION_POWER = 2;

const UPGRADE_BY_ID = new Map(SURVIVOR_UPGRADES.map((upgrade) => [upgrade.id, upgrade]));

/** Soma do poder das cartas que fortalecem disparos (ataque/elemento compatíveis com projétil) e das evoluções. */
export function survivorProjectilePower(player: Pick<SurvivorPlayer, 'upgradeLevels' | 'stage'>): number {
  let power = Math.max(0, player.stage) * EVOLUTION_POWER;
  for (const [id, levels] of Object.entries(player.upgradeLevels)) {
    const upgrade = UPGRADE_BY_ID.get(id);
    if (!upgrade || levels <= 0) continue;
    if (upgrade.family !== 'ataque' && upgrade.family !== 'elemento') continue;
    if (upgrade.for && !upgrade.for.includes('projetil')) continue;
    power += RARITY_POWER[upgrade.rarity] * levels;
  }
  return power;
}

export function survivorProjectileTierFromPower(power: number): SurvivorProjectileTier {
  let tier = 0;
  PROJECTILE_TIER_THRESHOLDS.forEach((min, index) => { if (power >= min) tier = index; });
  return tier as SurvivorProjectileTier;
}

export function survivorProjectileTier(player: Pick<SurvivorPlayer, 'upgradeLevels' | 'stage'>): SurvivorProjectileTier {
  return survivorProjectileTierFromPower(survivorProjectilePower(player));
}

/** O que o desenho precisa saber do disparo: o nível e os traços que as cartas deixam visíveis. */
export interface SurvivorProjectileLook {
  tier: SurvivorProjectileTier;
  /** Atravessa inimigos: o disparo fica alongado, como uma lança. */
  piercing: boolean;
  /** Tem chance de crítico: brilhos em cruz piscam na cabeça. */
  critical: boolean;
}

export function survivorProjectileLook(player: Pick<SurvivorPlayer, 'upgradeLevels' | 'stage' | 'pierce' | 'critChance'>): SurvivorProjectileLook {
  return {
    tier: survivorProjectileTier(player),
    piercing: player.pierce > 0,
    critical: (player.critChance ?? 0) > 0,
  };
}

/** Escala de tamanho do desenho por nível (o raio de acerto não muda). */
export function projectileTierScale(tier: SurvivorProjectileTier): number {
  return 1 + tier * 0.14;
}
