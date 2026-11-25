import { describe, expect, it } from 'vitest';
import { applyEvent, emptyTrainer, normalizeTrainer } from './trainer';

const day = '2026-11-25';

describe('torre: recorde por espécie no save do treinador', () => {
  it('grava o melhor da espécie e mantém as outras intactas', () => {
    const first = applyEvent(emptyTrainer(), {
      type: 'survivor', runId: 'run-1', survivedMs: 120_000, trainersBeaten: 0, bossesBeaten: 0,
      clearedTorre: false, infinite: false, wave: 3, kills: 10, level: 8, dexId: 1,
    }, day).state;
    expect(first.torre.bestByDex['1']).toEqual({ ms: 120_000, wave: 3, level: 8 });

    const second = applyEvent(first, {
      type: 'survivor', runId: 'run-2', survivedMs: 90_000, trainersBeaten: 0, bossesBeaten: 0,
      clearedTorre: false, infinite: false, wave: 5, kills: 12, level: 11, dexId: 1,
    }, day).state;
    expect(second.torre.bestByDex['1']).toEqual({ ms: 120_000, wave: 5, level: 11 });
    expect(second.torre.bestMs).toBe(120_000);
  });

  it('ignora corrida sem espécie e normaliza saves antigos', () => {
    const noDex = applyEvent(emptyTrainer(), {
      type: 'survivor', runId: 'run-3', survivedMs: 60_000, trainersBeaten: 0, bossesBeaten: 0,
      clearedTorre: false, infinite: false, wave: 2, kills: 4, level: 5,
    }, day).state;
    expect(noDex.torre.bestByDex).toEqual({});
    const old = normalizeTrainer({ ...emptyTrainer(), torre: { ...emptyTrainer().torre, bestByDex: { '25': { ms: 200_000, wave: 4, level: 9 }, 'x': { ms: 5 } } } });
    expect(old.torre.bestByDex).toEqual({ '25': { ms: 200_000, wave: 4, level: 9 } });
  });
});
