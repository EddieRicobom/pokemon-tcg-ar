import type { Rng } from './battle';

/** Uma entrada elegível para a seleção da Torre. O id identifica a instância, não só a espécie. */
export interface SurvivorSelectionCandidate {
  id: string;
  dexId: number;
  name: string;
  origin: string;
}

function weightedOrder<T extends SurvivorSelectionCandidate>(items: readonly T[], favorites: ReadonlySet<string>, rng: Rng): T[] {
  const rest = [...items];
  const out: T[] = [];
  while (rest.length > 0) {
    const weights = rest.map((item) => (favorites.has(item.id) ? 3 : 1));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = rng() * total;
    let index = rest.length - 1;
    for (let i = 0; i < rest.length; i++) {
      roll -= weights[i]!;
      if (roll < 0) {
        index = i;
        break;
      }
    }
    out.push(rest.splice(index, 1)[0]!);
  }
  return out;
}

/**
 * Seleciona até `count` instâncias sem repetição. Em um reroll, tenta evitar exatamente o conjunto anterior
 * quando houver alternativas; com menos opções, retorna o que existe e nunca entra em loop.
 */
export function selectSurvivorCandidates<T extends SurvivorSelectionCandidate>(
  pool: readonly T[],
  rng: Rng,
  favorites: ReadonlySet<string> = new Set(),
  count = 3,
  previousIds: readonly string[] = [],
): T[] {
  const unique = [...new Map(pool.filter((item) => item.id && Number.isInteger(item.dexId)).map((item) => [item.id, item])).values()];
  if (unique.length === 0 || count <= 0) return [];
  const size = Math.min(Math.floor(count), unique.length);
  const previous = new Set(previousIds);
  const ordered = weightedOrder(unique, favorites, rng);
  const chosen = ordered.slice(0, size);
  if (previous.size === size && unique.length > size && chosen.every((item) => previous.has(item.id))) {
    const replacement = ordered.find((item) => !previous.has(item.id));
    if (replacement) chosen[chosen.length - 1] = replacement;
  }
  return chosen;
}

export function normalizeSurvivorFavorites(raw: unknown, available: ReadonlySet<string>): Set<string> {
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((id): id is string => typeof id === 'string' && available.has(id)).slice(0, 256));
}
