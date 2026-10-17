import data from './data/pokemon-types.json';
import { formDexId } from './dex-form';
import { POKEMON_TYPES } from './pokemon-data';
import type { PokemonType } from './pokemon-data';

/**
 * Filtros de "Minhas cartas" por TIPO e por GERAÇÃO (pedido do dono). Os tipos vêm de um JSON gerado do CSV oficial
 * da PokéAPI (`scripts/build-types.mjs`, funciona offline), inclusive das formas regionais — o Ponyta de Galar é
 * Psíquico, não Fogo. A geração vem da faixa do número da Pokédex Nacional. Carta sem Pokémon (Treinador/Energia)
 * não tem tipo nem geração e só aparece com o filtro em "Todos".
 */
const ORDER: readonly string[] = data.order;
const SPECIES: readonly (readonly number[])[] = data.species;
const FORMS: Readonly<Record<string, readonly number[]>> = data.forms;

function decode(codes: readonly number[] | undefined): PokemonType[] {
  return (codes ?? [])
    .map((i) => ORDER[i])
    .filter((t): t is PokemonType => !!t && (POKEMON_TYPES as readonly string[]).includes(t));
}

/** Tipos do Pokémon de um número (espécie, ou forma alternativa com id 10001+). Vazio se não houver dado. */
export function typesOfDex(dexId: number | undefined): PokemonType[] {
  if (dexId === undefined || !Number.isInteger(dexId) || dexId <= 0) return [];
  return dexId > 10000 ? decode(FORMS[String(dexId)]) : decode(SPECIES[dexId]);
}

/** Primeiro número de cada geração (a próxima começa onde esta termina). */
export const GENERATION_STARTS = [1, 152, 252, 387, 494, 650, 722, 810, 906] as const;
export const LAST_DEX = 1025;

export function generationOf(dexId: number | undefined): number | undefined {
  if (dexId === undefined || !Number.isInteger(dexId) || dexId < 1 || dexId > LAST_DEX) return undefined;
  let gen = 0;
  for (let i = 0; i < GENERATION_STARTS.length; i++) if (dexId >= GENERATION_STARTS[i]!) gen = i + 1;
  return gen;
}

export const GENERATION_LABELS_PT: Record<number, string> = {
  1: 'I · Kanto', 2: 'II · Johto', 3: 'III · Hoenn', 4: 'IV · Sinnoh', 5: 'V · Unova', 6: 'VI · Kalos', 7: 'VII · Alola', 8: 'VIII · Galar', 9: 'IX · Paldea',
};

export interface SpeciesFilter {
  type?: PokemonType;
  generation?: number;
}

/** Carta (com o nome, para achar a forma regional) passa no filtro de tipo e geração? */
export function cardMatchesSpecies(card: { dexIds: readonly number[]; name: string }, filter: SpeciesFilter): boolean {
  if (!filter.type && !filter.generation) return true;
  const species = card.dexIds[0];
  if (species === undefined) return false;
  if (filter.generation && generationOf(species) !== filter.generation) return false;
  if (filter.type && !typesOfDex(formDexId(species, card.name)).includes(filter.type)) return false;
  return true;
}
