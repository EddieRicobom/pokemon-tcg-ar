import data from './data/pokemon-stats.json';
import type { BaseStats } from './survivor-moves';

/**
 * Stats base reais de cada espécie (PokéAPI, `data/pokemon-stats.json`, gerado por `scripts/build-stats.mjs`), para a
 * Torre de Sobrevivência decidir a forma e os números do golpe. Null quando não há dado — nunca um valor inventado.
 */
const STATS: readonly (readonly number[])[] = data.stats;

export function statsOfDex(dexId: number): BaseStats | null {
  if (!Number.isInteger(dexId) || dexId <= 0) return null;
  const row = STATS[dexId];
  if (!row || row.length < 6 || row.some((v) => !(v > 0))) return null;
  const [hp, attack, defense, spAttack, spDefense, speed] = row as [number, number, number, number, number, number];
  return { hp, attack, defense, spAttack, spDefense, speed };
}
