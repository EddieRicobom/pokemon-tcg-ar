import { describe, expect, it } from 'vitest';
import { ALL_CHALLENGES, applyLeagueResult, CHAMPION, challengeById, ELITE, emptyLeague, GYMS, nextChallenge, normalizeLeague, statusOf } from './league';
import type { LeagueProgress } from './league';

const winAll = (p: LeagueProgress, list = GYMS) => list.reduce((acc, c) => applyLeagueResult(acc, c, true).progress, p);

describe('a Liga', () => {
  it('8 Ginásios, 4 da Elite e a Campeã, com equipes de 3 a 6 e dificuldade crescente', () => {
    expect(GYMS).toHaveLength(8);
    expect(ELITE).toHaveLength(4);
    expect(new Set(ALL_CHALLENGES.map((c) => c.id)).size).toBe(13);
    let power = 0;
    for (const c of ALL_CHALLENGES) {
      expect(c.team.length).toBeGreaterThanOrEqual(3);
      expect(c.team.length).toBeLessThanOrEqual(6);
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
