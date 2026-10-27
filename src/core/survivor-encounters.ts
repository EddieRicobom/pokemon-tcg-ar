import { survivorRegionAt } from './survivor-regions';
import type { SurvivorEnemy } from './survivor';

/** Elencos nativos sem lendários; o sorteio usa só espécies com Walk no pacote local. */
export const REGIONAL_ENCOUNTERS = [
  { wild: [10, 13, 16, 19, 21, 23, 27, 37, 41, 46, 52, 54, 58, 60, 63], boss: 95 }, // Kanto
  { wild: [161, 163, 165, 167, 177, 179, 187, 191, 193, 198, 204, 216, 228, 231], boss: 217 }, // Johto
  { wild: [261, 263, 265, 270, 273, 276, 278, 283, 285, 287, 296, 309, 316, 322], boss: 306 }, // Hoenn
  { wild: [396, 399, 401, 403, 406, 412, 415, 418, 420, 422, 425, 427, 431, 434, 443, 447], boss: 445 }, // Sinnoh
  { wild: [504, 506, 509, 511, 513, 515, 517, 519, 524, 529, 535, 540, 543, 557, 572, 574, 577, 595], boss: 553 }, // Unova
  { wild: [659, 661, 664, 667, 669, 672, 677, 679, 682, 684, 688, 690, 692, 701], boss: 697 }, // Kalos
  { wild: [731, 734, 736, 739, 742, 747, 751, 759, 761, 766, 767, 769], boss: 758 }, // Alola
  { wild: [819, 821, 824, 827, 831, 833, 835, 840, 843, 846, 848, 852, 856, 859, 872], boss: 823 }, // Galar
  { wild: [915, 917, 919, 921, 924, 926, 928, 932, 935, 938, 940, 951, 952, 953, 957, 965, 969, 971], boss: 977 }, // Paldea
] as const;

export const REGIONAL_ENEMY_SPRITES = REGIONAL_ENCOUNTERS.flatMap((r) => [...r.wild, r.boss]);
export const REGIONAL_KIND_COUNT = 4;

/** Mistura estável por nascimento; não consome o RNG de combate. */
function encounterRoll(id: number, salt = 0): number {
  let h = (id ^ salt) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

/** Decidido uma única vez, ao nascer. Sobreviventes nunca se transformam com o mapa. */
export function regionalEnemyDexId(enemy: Pick<SurvivorEnemy, 'id' | 'kind' | 'boss'>, elapsedMs: number, runSeed = 0): number {
  const { current, next, blend } = survivorRegionAt(elapsedMs, runSeed);
  const region = REGIONAL_ENCOUNTERS[encounterRoll(enemy.id, runSeed) < blend ? next : current]!;
  if (enemy.boss) return region.boss;
  // Cada nascimento escolhe uniformemente uma espécie nativa. O `id` fixa a escolha e não altera o combate.
  return region.wild[Math.floor(encounterRoll(enemy.id, runSeed ^ 0x51ed270b) * region.wild.length)]!;
}
