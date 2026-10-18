import { survivorRegionAt } from './survivor-regions';
import type { SurvivorEnemy } from './survivor';

/** Quatro espécies nativas e um chefe por região, todas com Walk no pacote local. */
export const REGIONAL_ENCOUNTERS = [
  { wild: [10, 16, 19, 23], boss: 95 }, // Kanto
  { wild: [161, 163, 165, 179], boss: 217 }, // Johto
  { wild: [261, 263, 265, 273], boss: 306 }, // Hoenn
  { wild: [396, 399, 401, 403], boss: 445 }, // Sinnoh
  { wild: [504, 506, 509, 519], boss: 553 }, // Unova
  { wild: [659, 661, 664, 667], boss: 697 }, // Kalos
  { wild: [731, 734, 736, 742], boss: 758 }, // Alola
  { wild: [819, 821, 824, 827], boss: 823 }, // Galar
  { wild: [915, 917, 919, 921], boss: 977 }, // Paldea
] as const;

export const REGIONAL_ENEMY_SPRITES = REGIONAL_ENCOUNTERS.flatMap((r) => [...r.wild, r.boss]);
export const REGIONAL_KIND_COUNT = 4;

/** Mistura estável por nascimento; não consome o RNG de combate. */
function encounterRoll(id: number): number {
  let h = id | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

/** Decidido uma única vez, ao nascer. Sobreviventes nunca se transformam com o mapa. */
export function regionalEnemyDexId(enemy: Pick<SurvivorEnemy, 'id' | 'kind' | 'boss'>, elapsedMs: number): number {
  const { current, next, blend } = survivorRegionAt(elapsedMs);
  const region = REGIONAL_ENCOUNTERS[encounterRoll(enemy.id) < blend ? next : current]!;
  return enemy.boss ? region.boss : region.wild[enemy.kind % REGIONAL_KIND_COUNT]!;
}
