import { typesOfDex } from './species-filter';
import { attackProfile, moveFor } from './survivor-moves';
import { statsOfDex } from './survivor-stats';
import type { PokemonType } from './pokemon-data';
import type { AttackProfile, SurvivorMove } from './survivor-moves';

/** Monta os golpes da Torre a partir dos tipos e atributos reais da espécie. */
export function survivorAttackOf(dexId: number, picked?: PokemonType): { move: SurvivorMove; profile: AttackProfile; types: PokemonType[]; secondMove?: SurvivorMove } {
  const stats = statsOfDex(dexId);
  const types = typesOfDex(dexId);
  const ordered = picked ? [picked, ...types.filter((t) => t !== picked)] : types;
  const move = moveFor(ordered, stats);
  const secondType = types.find((type) => type !== picked && type !== move.type);
  return { move, profile: attackProfile(move, stats), types, ...(secondType ? { secondMove: moveFor([secondType], stats) } : {}) };
}
