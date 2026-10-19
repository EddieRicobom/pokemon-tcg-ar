import type { PokemonType } from './pokemon-data';

export interface SurvivorSynergyTarget {
  wetMs?: number;
  seededMs?: number;
  slowMs?: number;
  stunMs?: number;
}

export interface SurvivorSynergyResult {
  id: 'agua-eletrico' | 'fogo-planta' | 'gelo-agua' | 'terra-eletrico';
  damageMultiplier: number;
  consume?: 'wetMs' | 'seededMs';
  refreshSlowMs?: number;
}

/** Regras limitadas e não-recursivas: uma combinação altera apenas o acerto atual e estados já existentes. */
export function survivorSynergyFor(type: PokemonType, target: SurvivorSynergyTarget): SurvivorSynergyResult | null {
  if (type === 'electric' && (target.wetMs ?? 0) > 0) {
    return { id: 'agua-eletrico', damageMultiplier: 1.25, consume: 'wetMs' };
  }
  if (type === 'fire' && (target.seededMs ?? 0) > 0) {
    return { id: 'fogo-planta', damageMultiplier: 1.25, consume: 'seededMs' };
  }
  if (type === 'water' && (target.slowMs ?? 0) > 0) {
    return { id: 'gelo-agua', damageMultiplier: 1.1, refreshSlowMs: 2300 };
  }
  if (type === 'electric' && (target.stunMs ?? 0) > 0) {
    return { id: 'terra-eletrico', damageMultiplier: 1.1 };
  }
  return null;
}

export function survivorElementalStatus(type: PokemonType): Partial<Pick<SurvivorSynergyTarget, 'wetMs' | 'seededMs'>> {
  if (type === 'water') return { wetMs: 1800 };
  if (type === 'grass') return { seededMs: 1800 };
  return {};
}

