import { generateVillage } from '../core/village/map';
import type { VillageMap } from '../core/village/map';
import { emptyVillage, normalizeVillage } from '../core/village/life';
import type { VillageState } from '../core/village/life';

/** A Vila é a mesma para todo mundo (semente fixa); o progresso de cada um fica no aparelho. */
export const VILLAGE_SEED = 20261014;
const KEY = 'tcg-ar-vila-v1';

let cachedMap: VillageMap | null = null;
export function villageMap(): VillageMap {
  return (cachedMap ??= generateVillage(VILLAGE_SEED));
}

export function loadVillage(): VillageState {
  const map = villageMap();
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeVillage(JSON.parse(raw), VILLAGE_SEED, map.spawn) : emptyVillage(VILLAGE_SEED, map.spawn);
  } catch {
    return emptyVillage(VILLAGE_SEED, map.spawn);
  }
}

export function saveVillage(state: VillageState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
