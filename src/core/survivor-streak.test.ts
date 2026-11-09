import { describe, expect, it } from 'vitest';
import { addStreakKills, createKillStreak, resetKillStreak, STREAK_SHOW_AT, STREAK_WINDOW_MS, streakFade, streakPop, streakTier, streakVisible, stepKillStreak } from './survivor-streak';

describe('sequência de abates', () => {
  it('só aparece a partir do mínimo e guarda o melhor valor', () => {
    const s = createKillStreak();
    addStreakKills(s, STREAK_SHOW_AT - 1);
    expect(streakVisible(s)).toBe(false);
    addStreakKills(s, 1);
    expect(streakVisible(s)).toBe(true);
    expect(s.best).toBe(STREAK_SHOW_AT);
  });

  it('acaba quando o tempo passa sem abate, mas mantém o melhor', () => {
    const s = createKillStreak();
    addStreakKills(s, 25);
    stepKillStreak(s, STREAK_WINDOW_MS - 1);
    expect(s.count).toBe(25);
    addStreakKills(s, 5);
    stepKillStreak(s, STREAK_WINDOW_MS);
    expect(s.count).toBe(0);
    expect(streakVisible(s)).toBe(false);
    expect(s.best).toBe(30);
  });

  it('ignora abate inválido, sem inventar número nem renovar o tempo', () => {
    const s = createKillStreak();
    addStreakKills(s, 12);
    stepKillStreak(s, 1000);
    const left = s.leftMs;
    addStreakKills(s, 0);
    addStreakKills(s, Number.NaN);
    addStreakKills(s, -3);
    expect(s.count).toBe(12);
    expect(s.leftMs).toBe(left);
  });

  it('sobe de faixa, dá o soco e some aos poucos no fim', () => {
    expect([0, 10, 29, 30, 60, 99, 100, 500].map(streakTier)).toEqual([0, 0, 0, 1, 2, 2, 3, 3]);
    const s = createKillStreak();
    addStreakKills(s, 10);
    expect(streakPop(s)).toBe(1);
    expect(streakFade(s)).toBe(1);
    stepKillStreak(s, STREAK_WINDOW_MS - 250);
    expect(streakPop(s)).toBe(0);
    expect(streakFade(s)).toBeCloseTo(0.5);
  });

  it('reinicia inteira numa corrida nova', () => {
    const s = createKillStreak();
    addStreakKills(s, 40);
    resetKillStreak(s);
    expect(s).toEqual(createKillStreak());
  });
});
