import { beforeEach, describe, expect, it } from 'vitest';
import { readKartRecords, saveKartResult } from './kart-records';

describe('recordes do Kart', () => {
  beforeEach(() => { localStorage.clear(); });

  it('guarda a primeira volta e a primeira corrida completa', () => {
    expect(saveKartResult(0, [41_500, 40_200, 39_900], 121_600, true)).toEqual({ lap: true, total: true });
    expect(readKartRecords()[0]).toEqual({ bestLapMs: 39_900, bestTotalMs: 121_600 });
  });

  it('só troca o que foi realmente batido', () => {
    saveKartResult(1, [40_000, 41_000, 42_000], 123_000, true);
    expect(saveKartResult(1, [39_500, 41_000, 42_000], 130_000, true)).toEqual({ lap: true, total: false });
    expect(readKartRecords()[1]).toEqual({ bestLapMs: 39_500, bestTotalMs: 123_000 });
    expect(saveKartResult(1, [45_000], 118_000, false)).toEqual({ lap: false, total: false });
  });

  it('ignora etapa fora da Copa e dados inválidos', () => {
    expect(saveKartResult(3, [30_000], 90_000, true)).toEqual({ lap: false, total: false });
    expect(saveKartResult(0, [], 0, false)).toEqual({ lap: false, total: false });
    expect(readKartRecords()).toEqual({});
  });
});
