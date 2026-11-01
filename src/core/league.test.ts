import { describe, expect, it } from 'vitest';
import { ALL_CHALLENGES, LEAGUE_REGIONS, leaguePerks, regionalProgress, applyLeagueResult, CHAMPION, challengeById, ELITE, emptyLeague, GYMS, nextChallenge, normalizeLeague, statusOf, TOTAL_BADGES } from './league';
import type { LeagueProgress } from './league';

const winAll = (p: LeagueProgress, list = GYMS) => list.reduce((acc, c) => applyLeagueResult(acc, c, true).progress, p);

describe('a Liga', () => {
  it('insígnias e título liberam vantagens jogáveis no Pins', () => {
    expect(leaguePerks(emptyLeague())).toEqual({ pinShotDiscount: 0, pinFields: ['natural'] });
    const four = { ...emptyLeague(), badges: [0, 1, 2, 3] };
    expect(leaguePerks(four)).toEqual({ pinShotDiscount: 1, pinFields: ['natural', 'ice'] });
    const eight = { ...emptyLeague(), badges: [0, 1, 2, 3, 4, 5, 6, 7] };
    expect(leaguePerks(eight)).toEqual({ pinShotDiscount: 2, pinFields: ['natural', 'ice', 'toxic'] });
    expect(leaguePerks({ ...eight, championWins: 1 })).toEqual({ pinShotDiscount: 3, pinFields: ['natural', 'ice', 'toxic', 'psy'] });
  });
  it('8 Ginásios, 4 da Elite e a Campeã, todos com seis Pokémon e dificuldade crescente', () => {
    expect(GYMS).toHaveLength(8);
    expect(ELITE).toHaveLength(4);
    expect(new Set(ALL_CHALLENGES.map((c) => c.id)).size).toBe(LEAGUE_REGIONS.length * 13);
    let power = 0;
    for (const c of [...GYMS, ...ELITE, CHAMPION]) {
      expect(c.team).toHaveLength(6);
      expect(c.power).toBeGreaterThan(power);
      power = c.power;
      expect(c.intro.length).toBeGreaterThan(10);
      expect(c.defeat.length).toBeGreaterThan(10);
    }
    expect(GYMS.every((g) => g.badge)).toBe(true);
    expect(challengeById('gym-3')?.leader).toBe('Crasher Wake');
    expect(challengeById('nada')).toBeNull();
  });

  it('Ginásios abrem em ordem', () => {
    let p = emptyLeague();
    expect(statusOf(p, GYMS[0]!)).toBe('open');
    expect(statusOf(p, GYMS[1]!)).toBe('locked');
    p = applyLeagueResult(p, GYMS[0]!, true).progress;
    expect(statusOf(p, GYMS[0]!)).toBe('beaten');
    expect(statusOf(p, GYMS[1]!)).toBe('open');
    expect(nextChallenge(p)?.id).toBe('gym-1');
  });

  it('a Elite 4 só abre com as 8 insígnias, um de cada vez', () => {
    let p = winAll(emptyLeague(), GYMS.slice(0, 7));
    expect(statusOf(p, ELITE[0]!)).toBe('locked');
    p = winAll(p, GYMS.slice(7));
    expect(p.badges).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(statusOf(p, ELITE[0]!)).toBe('open');
    expect(statusOf(p, ELITE[1]!)).toBe('locked');
    expect(statusOf(p, CHAMPION)).toBe('locked');
  });

  it('perder na Elite 4 volta ao começo da corrida; vencer os 4 abre a Campeã', () => {
    let p = winAll(emptyLeague());
    p = applyLeagueResult(p, ELITE[0]!, true).progress;
    p = applyLeagueResult(p, ELITE[1]!, true).progress;
    expect(p.eliteStreak).toBe(2);
    const lost = applyLeagueResult(p, ELITE[2]!, false);
    expect(lost.progress.eliteStreak).toBe(0);
    expect(lost.message).toContain('começo');
    p = winAll(lost.progress, ELITE);
    expect(statusOf(p, CHAMPION)).toBe('open');
    const champ = applyLeagueResult(p, CHAMPION, true);
    expect(champ.progress.championWins).toBe(1);
    expect(champ.progress.eliteStreak).toBe(0);
    expect(statusOf(champ.progress, CHAMPION)).toBe('beaten');
    expect(champ.message).toContain('Campeão');
  });

  it('perder num Ginásio não tira nada; XP cheio só na primeira vitória', () => {
    const p = applyLeagueResult(emptyLeague(), GYMS[0]!, false);
    expect(p.progress).toEqual(emptyLeague());
    const first = applyLeagueResult(emptyLeague(), GYMS[0]!, true);
    expect(first.first).toBe(true);
    expect(first.message).toContain('Insígnia Carvão');
    const again = applyLeagueResult(first.progress, GYMS[0]!, true);
    expect(again.first).toBe(false);
  });

  it('progresso salvo estranho é limpo', () => {
    expect(normalizeLeague(null)).toEqual(emptyLeague());
    const n = normalizeLeague({ badges: [3, 3, 99, -1, 1.5, 0], eliteStreak: 9, championWins: -2, beaten: ['gym-0', 'xx', 3] });
    expect(n).toEqual({ badges: [0, 3], eliteStreak: 4, championWins: 0, beaten: ['gym-0'] });
  });
});

describe('nomes das equipes dos líderes', () => {
  it('todo Pokémon de líder tem nome', async () => {
    const { speciesName } = await import('./league');
    for (const c of ALL_CHALLENGES) for (const dex of c.team) expect(speciesName(dex)).not.toMatch(/nº/);
  });
});


describe('Ligas regionais', () => {
  it('cada região tem 8 ginásios, 4 elites, campeão e IDs próprios', () => {
    expect(LEAGUE_REGIONS.map((r) => r.name)).toEqual(['Sinnoh', 'Kanto', 'Johto', 'Hoenn', 'Unova', 'Kalos']);
    for (const r of LEAGUE_REGIONS) {
      expect(r.gyms).toHaveLength(8);
      expect(r.elite).toHaveLength(4);
      let power = 0;
      for (const c of [...r.gyms, ...r.elite, r.champion]) {
        expect(challengeById(c.id)).toBe(c);
        expect(c.power).toBeGreaterThan(power);
        power = c.power;
        expect(c.team).toHaveLength(6);
      }
    }
  });
  it('insígnias e corrida da Elite ficam isoladas, inclusive depois de salvar', () => {
    let p = winAll(emptyLeague());
    p = winAll(p, ELITE);
    const sinnoh = regionalProgress(p, 'sinnoh');
    for (const r of LEAGUE_REGIONS.slice(1)) {
      expect(statusOf(p, r.gyms[0]!)).toBe('open');
      expect(statusOf(p, r.elite[0]!)).toBe('locked');
      expect(applyLeagueResult(p, r.champion, true).progress).toBe(p);
      p = winAll(p, r.gyms);
      expect(statusOf(p, r.elite[0]!)).toBe('open');
      p = winAll(p, r.elite.slice(0, 2));
      p = applyLeagueResult(p, r.elite[2]!, false).progress;
      expect(regionalProgress(p, r.id).eliteStreak).toBe(0);
      expect(regionalProgress(p, 'sinnoh').eliteStreak).toBe(sinnoh.eliteStreak);
      p = winAll(p, r.elite);
      expect(statusOf(p, r.champion)).toBe('open');
      const first = applyLeagueResult(p, r.champion, true);
      expect(first.first).toBe(true);
      p = normalizeLeague(JSON.parse(JSON.stringify(first.progress)));
      expect(regionalProgress(p, r.id).championWins).toBe(1);
      expect(statusOf(p, r.champion)).toBe('beaten');
      p = winAll(p, r.elite);
      const repeat = applyLeagueResult(p, r.champion, true);
      expect(repeat.first).toBe(false);
      p = repeat.progress;
    }
    expect(p.badges).toHaveLength(TOTAL_BADGES);
    expect(TOTAL_BADGES).toBe(48);
    expect(p.championWins).toBe(0);
    expect(p.eliteStreak).toBe(4);
  });
  it('limpa contadores regionais inválidos e conserva salvamento antigo', () => {
    expect(normalizeLeague({ badges: [0, 7], eliteStreak: 2, championWins: 1 })).toEqual({ badges: [0, 7], eliteStreak: 2, championWins: 1, beaten: [] });
    const p = normalizeLeague({ regions: { kanto: { eliteStreak: 99, championWins: -1 }, johto: null }, badges: [8, 31, 47, 48] });
    expect(p.badges).toEqual([8, 31, 47]);
    expect(p.regions?.kanto).toEqual({ eliteStreak: 4, championWins: 0 });
    expect(p.regions?.johto).toEqual({ eliteStreak: 0, championWins: 0 });
  });
});
