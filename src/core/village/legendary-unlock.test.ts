import { describe, expect, it } from 'vitest';
import { emptyLeague, LEAGUE_REGIONS, applyLeagueResult, statusOf } from '../league';
import type { LeagueProgress } from '../league';
import { isLegendUnlocked, unlockedLegendRegions } from './legendary-unlock';
import { emptyLegendary, rollLegendary } from './legendary';

/** Vence tudo de uma região, na ordem da Liga. */
function clearRegion(progress: LeagueProgress, id: string, withChampion = true): LeagueProgress {
  const region = LEAGUE_REGIONS.find((r) => r.id === id)!;
  let p = progress;
  for (const c of [...region.gyms, ...region.elite, ...(withChampion ? [region.champion] : [])]) {
    expect(statusOf(p, c)).not.toBe('locked');
    p = applyLeagueResult(p, c, true).progress;
  }
  return p;
}

describe('liberação dos lendários pela Liga', () => {
  it('começa fechado', () => {
    expect([...unlockedLegendRegions(emptyLeague())]).toEqual([]);
    expect(isLegendUnlocked('mew', unlockedLegendRegions(emptyLeague()))).toBe(false);
  });

  it('só abre com as 8 insígnias e o campeão da região', () => {
    const noChampion = clearRegion(emptyLeague(), 'kanto', false);
    expect(unlockedLegendRegions(noChampion).has('Kanto')).toBe(false);
    const done = clearRegion(emptyLeague(), 'kanto');
    const open = unlockedLegendRegions(done);
    expect([...open]).toEqual(['Kanto']);
    expect(isLegendUnlocked('mew', open)).toBe(true);
    expect(isLegendUnlocked('lugia', open)).toBe(false);
  });

  it('Sinnoh usa os contadores antigos da Liga', () => {
    expect(unlockedLegendRegions(clearRegion(emptyLeague(), 'sinnoh')).has('Sinnoh')).toBe(true);
  });

  it('o sorteio raro só escolhe lendários liberados', () => {
    const open = unlockedLegendRegions(clearRegion(emptyLeague(), 'johto'));
    const hit = rollLegendary(emptyLegendary(), () => 0, '2026-10-25', '2026-10-25T12:00:00.000Z', (id) => isLegendUnlocked(id, open));
    expect(hit.legendary && isLegendUnlocked(hit.legendary.id, open)).toBe(true);
    const none = rollLegendary(emptyLegendary(), () => 0, '2026-10-25', '2026-10-25T12:00:00.000Z', () => false);
    expect(none.legendary).toBeNull();
    expect(none.state.lastRollDay).toBe('2026-10-25');
  });
});
