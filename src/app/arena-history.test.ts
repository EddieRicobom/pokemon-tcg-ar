import { beforeEach, describe, expect, it } from 'vitest';
import { ARENA_HISTORY_KEY, ARENA_HISTORY_LIMIT, readArenaHistory, saveArenaMatch } from './arena-history';

const match = { at: '2026-11-14T12:00:00.000Z', mode: 'treino' as const, rival: 'Rival', result: 'vitoria' as const, durationMs: 60000, highlights: [{ timeMs: 50000, text: 'Pikachu nocauteou o rival' }] };

describe('histórico da Arena', () => {
  beforeEach(() => localStorage.clear());

  it('guarda partidas concluídas e limita o histórico', () => {
    for (let i = 0; i < ARENA_HISTORY_LIMIT + 2; i++) saveArenaMatch({ ...match, durationMs: i });
    expect(readArenaHistory()).toHaveLength(ARENA_HISTORY_LIMIT);
    expect(readArenaHistory()[0]?.durationMs).toBe(2);
  });

  it('descarta registros inválidos sem perder os válidos', () => {
    localStorage.setItem(ARENA_HISTORY_KEY, JSON.stringify([{ ...match, highlights: [{ text: 'x'.repeat(121), timeMs: 0 }] }, match]));
    expect(readArenaHistory()).toEqual([match]);
  });

  it('preserva o modo, o resultado e os destaques de uma partida PvP', () => {
    const pvp = { ...match, mode: 'pvp' as const, result: 'derrota' as const, rival: 'Amigo' };
    saveArenaMatch(pvp);
    expect(readArenaHistory()).toEqual([pvp]);
  });
});
