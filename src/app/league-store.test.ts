import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyLeagueResult, emptyLeague, LEAGUE_REGIONS, normalizeLeague } from '../core/league';
vi.mock('./trainer-store', () => ({ recordEvent: vi.fn() }));
import { recordEvent } from './trainer-store';
import { league, recordLeagueResult } from './league-store';

beforeEach(() => {
  localStorage.clear();
  league.value = emptyLeague();
  vi.mocked(recordEvent).mockClear();
});

describe('salvamento das Ligas regionais', () => {
  it('salva uma insígnia regional sem sobrescrever Sinnoh e marca revanche', () => {
    const sinnoh = LEAGUE_REGIONS[0]!;
    const kanto = LEAGUE_REGIONS[1]!;
    recordLeagueResult(sinnoh.gyms[0]!, true);
    recordLeagueResult(kanto.gyms[0]!, true);
    const saved = normalizeLeague(JSON.parse(localStorage.getItem('tcg-ar-liga-v1')!));
    expect(saved.badges).toEqual([0, 8]);
    expect(saved.beaten).toEqual(['gym-0', 'kanto-gym-0']);
    expect(recordLeagueResult(kanto.gyms[0]!, true).first).toBe(false);
    expect(recordEvent).toHaveBeenLastCalledWith(expect.objectContaining({ first: false, badges: 2 }));
  });
  it('soma títulos regionais nas conquistas do treinador', () => {
    const r = LEAGUE_REGIONS[3]!;
    league.value = [...r.gyms, ...r.elite].reduce((p, c) => applyLeagueResult(p, c, true).progress, emptyLeague());
    recordLeagueResult(r.champion, true);
    expect(recordEvent).toHaveBeenLastCalledWith(expect.objectContaining({ championWins: 1, badges: 8, first: true }));
    expect(league.value.championWins).toBe(0);
    expect(league.value.regions?.hoenn?.championWins).toBe(1);
  });
  it('desafio bloqueado não rende XP, moedas nem gravação', () => {
    const r = LEAGUE_REGIONS[2]!;
    recordLeagueResult(r.champion, true);
    expect(recordEvent).not.toHaveBeenCalled();
    expect(localStorage.getItem('tcg-ar-liga-v1')).toBeNull();
  });
});
