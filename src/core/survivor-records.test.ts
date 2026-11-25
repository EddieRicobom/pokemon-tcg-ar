import { describe, expect, it } from 'vitest';
import { dexMedalCount, dexMedalLabel, dexRecordFor, dexRecordKey, normalizeDexRecords, updateDexRecords } from './survivor-records';

describe('recordes por Pokémon', () => {
  it('guarda o melhor de cada espécie sem tocar nas outras', () => {
    const first = updateDexRecords({}, 1, { ms: 120_000, wave: 4, level: 12 });
    expect(first.improved).toEqual(['tempo', 'onda', 'nivel']);
    const second = updateDexRecords(first.records, 4, { ms: 90_000, wave: 2, level: 8 });
    const back = updateDexRecords(second.records, 1, { ms: 60_000, wave: 9, level: 7 });
    expect(back.improved).toEqual(['onda']);
    expect(dexRecordFor(back.records, 1)).toEqual({ ms: 120_000, wave: 9, level: 12 });
    expect(dexRecordFor(back.records, 4)).toEqual({ ms: 90_000, wave: 2, level: 8 });
  });

  it('ignora corridas piores e entradas inválidas', () => {
    const base = updateDexRecords({}, 25, { ms: 200_000, wave: 5, level: 15 }).records;
    expect(updateDexRecords(base, 25, { ms: 10_000, wave: 1, level: 1 })).toEqual({ records: base, improved: [] });
    expect(dexRecordKey(0)).toBeNull();
    expect(dexRecordFor(base, Number.NaN)).toBeNull();
    expect(normalizeDexRecords({ '25': { ms: '200000', wave: -3, level: 15 }, 'x': { ms: 1 }, '26': { ms: 0, wave: 0, level: 0 } }))
      .toEqual({ '25': { ms: 200_000, wave: 0, level: 15 } });
    expect(normalizeDexRecords({ '1': { ms: Number.POSITIVE_INFINITY, wave: Number.NEGATIVE_INFINITY, level: Number.NaN }, '2': { ms: 1e999, wave: 2, level: 3 } }))
      .toEqual({ '2': { ms: 0, wave: 2, level: 3 } });
  });

  it('entrega medalhas de 3, 6 e 10 minutos', () => {
    expect(dexMedalCount(null)).toBe(0);
    expect(dexMedalCount({ ms: 179_000, wave: 1, level: 1 })).toBe(0);
    expect(dexMedalCount({ ms: 180_000, wave: 1, level: 1 })).toBe(1);
    expect(dexMedalCount({ ms: 360_000, wave: 1, level: 1 })).toBe(2);
    expect(dexMedalCount({ ms: 600_000, wave: 1, level: 1 })).toBe(3);
    expect(dexMedalLabel(2)).toBe('🥈');
  });
});
