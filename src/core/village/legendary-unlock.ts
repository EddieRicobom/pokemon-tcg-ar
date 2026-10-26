import { LEAGUE_REGIONS, regionalProgress } from '../league';
import type { LeagueProgress } from '../league';
import { legendStoryOf } from './legendary-stories';

/**
 * Os lendários de uma região só aparecem depois de conquistar as 8 insígnias dela e vencer o campeão da Liga
 * dessa região. Regiões sem Liga no app (Alola, Galar, Hisui, Paldea) continuam fechadas.
 */
export function unlockedLegendRegions(league: LeagueProgress): ReadonlySet<string> {
  const open = new Set<string>();
  for (const region of LEAGUE_REGIONS) {
    const progress = regionalProgress(league, region.id);
    if (progress.badges.length >= 8 && progress.championWins > 0) open.add(region.name);
  }
  return open;
}

export function isLegendUnlocked(id: string, regions: ReadonlySet<string>): boolean {
  const story = legendStoryOf(id);
  return !!story && regions.has(story.region);
}
