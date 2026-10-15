import type { Piece } from './minigames';

/**
 * Pokédex Nacional por geração (faixas fixas e conhecidas) e nomes vindos do PokeAPI.
 * Serve ao "Quem é esse Pokémon?" sorteado: nenhum nome ou número é inventado, a lista de nomes vem da rede.
 */

export interface Generation {
  gen: number;
  roman: string;
  region: string;
  from: number;
  to: number;
}

export const GENERATIONS: readonly Generation[] = [
  { gen: 1, roman: 'I', region: 'Kanto', from: 1, to: 151 },
  { gen: 2, roman: 'II', region: 'Johto', from: 152, to: 251 },
  { gen: 3, roman: 'III', region: 'Hoenn', from: 252, to: 386 },
  { gen: 4, roman: 'IV', region: 'Sinnoh', from: 387, to: 493 },
  { gen: 5, roman: 'V', region: 'Unova', from: 494, to: 649 },
  { gen: 6, roman: 'VI', region: 'Kalos', from: 650, to: 721 },
  { gen: 7, roman: 'VII', region: 'Alola', from: 722, to: 809 },
  { gen: 8, roman: 'VIII', region: 'Galar', from: 810, to: 905 },
  { gen: 9, roman: 'IX', region: 'Paldea', from: 906, to: 1025 },
];

/** De onde o jogo sorteia os Pokémon: das cartas guardadas, de todas as gerações ou de uma geração. */
export type WhoSource = { kind: 'cards' } | { kind: 'random' } | { kind: 'gen'; gen: number };

export function sourceLabel(source: WhoSource): string {
  if (source.kind === 'cards') return 'Minhas cartas';
  if (source.kind === 'random') return 'Aleatório (todas as gerações)';
  const g = GENERATIONS.find((x) => x.gen === source.gen);
  return g ? `Geração ${g.roman} · ${g.region}` : 'Geração desconhecida';
}

export function generationOf(dexId: number): number | null {
  return GENERATIONS.find((g) => dexId >= g.from && dexId <= g.to)?.gen ?? null;
}

const SPECIAL_NAMES: Record<string, string> = {
  'nidoran-f': 'Nidoran♀',
  'nidoran-m': 'Nidoran♂',
  'mr-mime': 'Mr. Mime',
  'mime-jr': 'Mime Jr.',
  'mr-rime': 'Mr. Rime',
  farfetchd: "Farfetch'd",
  sirfetchd: "Sirfetch'd",
  'type-null': 'Type: Null',
  'ho-oh': 'Ho-Oh',
  'porygon-z': 'Porygon-Z',
  'jangmo-o': 'Jangmo-o',
  'hakamo-o': 'Hakamo-o',
  'kommo-o': 'Kommo-o',
  flabebe: 'Flabébé',
  'wo-chien': 'Wo-Chien',
  'chien-pao': 'Chien-Pao',
  'ting-lu': 'Ting-Lu',
  'chi-yu': 'Chi-Yu',
};

/** "great-tusk" → "Great Tusk"; nomes com pontuação própria vêm de uma lista curta. */
export function prettyPokemonName(slug: string): string {
  const special = SPECIAL_NAMES[slug];
  if (special) return special;
  return slug
    .split('-')
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Lê a resposta de `pokemon-species?limit=…` do PokeAPI: número da Pokédex → nome. Entradas estranhas são ignoradas. */
export function parseSpeciesList(json: unknown): Map<number, string> {
  const names = new Map<number, string>();
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return names;
  for (const entry of results) {
    const e = entry as { name?: unknown; url?: unknown } | null;
    if (typeof e?.name !== 'string' || typeof e.url !== 'string') continue;
    const id = Number(/\/pokemon-species\/(\d+)\/?$/.exec(e.url)?.[1]);
    if (!Number.isInteger(id) || id < 1) continue;
    names.set(id, prettyPokemonName(e.name));
  }
  return names;
}

/** Números da Pokédex que o sorteio pode usar (só os que têm nome conhecido). */
export function dexIdsFor(source: Exclude<WhoSource, { kind: 'cards' }>, names: ReadonlyMap<number, string>): number[] {
  const from = source.kind === 'gen' ? (GENERATIONS.find((g) => g.gen === source.gen)?.from ?? 1) : 1;
  const to = source.kind === 'gen' ? (GENERATIONS.find((g) => g.gen === source.gen)?.to ?? 0) : GENERATIONS[GENERATIONS.length - 1]!.to;
  const ids: number[] = [];
  for (let id = from; id <= to; id++) if (names.has(id)) ids.push(id);
  return ids;
}

export const dexPieceId = (dexId: number) => `dex-${dexId}`;

export function dexIdOfPiece(piece: Piece): number | null {
  const m = /^dex-(\d+)$/.exec(piece.id);
  return m ? Number(m[1]) : null;
}

/** Peças do sorteio: uma por Pokémon, com o nome da lista. */
export function dexPieces(ids: readonly number[], names: ReadonlyMap<number, string>): Piece[] {
  return ids.flatMap((id) => {
    const name = names.get(id);
    return name ? [{ id: dexPieceId(id), name, spriteKey: dexPieceId(id) }] : [];
  });
}
