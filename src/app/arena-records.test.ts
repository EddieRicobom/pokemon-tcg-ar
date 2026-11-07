import { beforeEach, describe, expect, it } from 'vitest';
import { ARENA_RECORDS_KEY, readArenaRecords, saveArenaRun } from './arena-records';

describe('recordes das corridas da Arena', () => {
  beforeEach(() => localStorage.clear());

  it('guarda só quando bate o recorde do modo', () => {
    expect(saveArenaRun('formatacao', { score: 300, wins: 2 })).toBe(true);
    expect(saveArenaRun('formatacao', { score: 200, wins: 5 })).toBe(false);
    expect(saveArenaRun('restauracao', { score: 100, wins: 1 })).toBe(true);
    expect(readArenaRecords()).toEqual({ formatacao: { score: 300, wins: 2 }, restauracao: { score: 100, wins: 1 } });
  });

  it('corrida sem pontos não vira recorde', () => {
    expect(saveArenaRun('formatacao', { score: 0, wins: 0 })).toBe(false);
    expect(readArenaRecords()).toEqual({});
  });

  it('ignora dado estragado no aparelho', () => {
    localStorage.setItem(ARENA_RECORDS_KEY, '{"formatacao":{"score":"x"}}');
    expect(readArenaRecords()).toEqual({});
  });
});
