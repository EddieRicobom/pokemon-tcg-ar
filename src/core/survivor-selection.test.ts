import { describe, expect, it } from 'vitest';
import { seededRng } from './battle';
import { normalizeSurvivorFavorites, selectSurvivorCandidates, type SurvivorSelectionCandidate } from './survivor-selection';

const pool: SurvivorSelectionCandidate[] = [
  { id: 'card-a', dexId: 1, name: 'Bulbasaur', origin: 'Carta' },
  { id: 'card-b', dexId: 4, name: 'Charmander', origin: 'Carta' },
  { id: 'dp-c', dexId: 7, name: 'Squirtle', origin: 'Digital Pokémon' },
  { id: 'card-d', dexId: 25, name: 'Pikachu', origin: 'Carta' },
];

describe('seleção da Torre', () => {
  it('não duplica instâncias e evita repetir a leva no reroll', () => {
    const first = selectSurvivorCandidates(pool, seededRng(1), new Set(), 3);
    const second = selectSurvivorCandidates(pool, seededRng(2), new Set(), 3, first.map((item) => item.id));
    expect(new Set(first.map((item) => item.id)).size).toBe(3);
    expect(new Set(second.map((item) => item.id)).size).toBe(3);
    expect(second.map((item) => item.id).sort()).not.toEqual(first.map((item) => item.id).sort());
  });

  it('funciona com uma ou duas opções sem repetir nem travar', () => {
    expect(selectSurvivorCandidates(pool.slice(0, 1), seededRng(3), new Set(), 3)).toHaveLength(1);
    expect(selectSurvivorCandidates(pool.slice(0, 2), seededRng(3), new Set(), 3)).toHaveLength(2);
  });

  it('mantém favoritos válidos, remove instâncias que saíram da coleção e aceita digitais', () => {
    expect([...normalizeSurvivorFavorites(['card-a', 'gone', 'dp-c', 4], new Set(pool.map((item) => item.id)))])
      .toEqual(['card-a', 'dp-c']);
    let favoriteHits = 0;
    let otherHits = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const picked = selectSurvivorCandidates(pool, seededRng(seed), new Set(['dp-c']), 1);
      if (picked[0]?.id === 'dp-c') favoriteHits++;
      else otherHits++;
    }
    expect(favoriteHits).toBeGreaterThan(otherHits / 2);
  });
});
