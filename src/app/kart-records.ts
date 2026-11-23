/** Recordes locais do Kart por etapa da Copa (0 a 2). Melhor volta e melhor corrida completa. */

export interface KartRecord {
  bestLapMs: number;
  bestTotalMs: number;
}

export type KartRecords = Record<number, KartRecord>;

const KEY = 'tcg-ar-kart-records-v1';

export function readKartRecords(): KartRecords {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Partial<KartRecord>>;
    const out: KartRecords = {};
    for (const [key, value] of Object.entries(raw ?? {})) {
      const round = Number(key);
      if (!Number.isInteger(round) || round < 0 || round > 2) continue;
      const bestLapMs = Math.max(0, Number(value?.bestLapMs) || 0);
      const bestTotalMs = Math.max(0, Number(value?.bestTotalMs) || 0);
      if (bestLapMs > 0 || bestTotalMs > 0) out[round] = { bestLapMs, bestTotalMs };
    }
    return out;
  } catch {
    return {};
  }
}

function write(records: KartRecords): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch {
    // Só não lembra dos recordes.
  }
}

/** Guarda a corrida; devolve quais recordes foram batidos. */
export function saveKartResult(round: number, lapMs: readonly number[], totalMs: number, completed: boolean): { lap: boolean; total: boolean } {
  if (!Number.isInteger(round) || round < 0 || round > 2) return { lap: false, total: false };
  const laps = lapMs.filter((value) => Number.isFinite(value) && value > 0);
  const fastest = laps.length ? Math.min(...laps) : 0;
  const total = completed && Number.isFinite(totalMs) && totalMs > 0 ? Math.round(totalMs) : 0;
  if (fastest <= 0 && total <= 0) return { lap: false, total: false };
  const records = readKartRecords();
  const current = records[round] ?? { bestLapMs: 0, bestTotalMs: 0 };
  const lapRecord = fastest > 0 && (current.bestLapMs === 0 || fastest < current.bestLapMs);
  const totalRecord = total > 0 && (current.bestTotalMs === 0 || total < current.bestTotalMs);
  if (!lapRecord && !totalRecord) return { lap: false, total: false };
  records[round] = {
    bestLapMs: lapRecord ? Math.round(fastest) : current.bestLapMs,
    bestTotalMs: totalRecord ? total : current.bestTotalMs,
  };
  write(records);
  return { lap: lapRecord, total: totalRecord };
}
