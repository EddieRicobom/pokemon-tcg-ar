import type { EndlessArenaMode } from '../core/endless-arena';

/** Melhor corrida de cada modo da Arena, guardada no aparelho (e no backup, por `BACKUP_KEYS`). */

export const ARENA_RECORDS_KEY = 'tcg-ar-arena-recordes-v1';

export interface ArenaRecord {
  score: number;
  wins: number;
}

export type ArenaRecords = Partial<Record<EndlessArenaMode, ArenaRecord>>;

const isRecord = (v: unknown): v is ArenaRecord =>
  typeof v === 'object' && v !== null && Number.isFinite((v as ArenaRecord).score) && Number.isFinite((v as ArenaRecord).wins);

export function readArenaRecords(): ArenaRecords {
  try {
    const raw = JSON.parse(localStorage.getItem(ARENA_RECORDS_KEY) ?? '{}') as Record<string, unknown>;
    const out: ArenaRecords = {};
    for (const mode of ['formatacao', 'restauracao'] as const) if (isRecord(raw[mode])) out[mode] = { score: raw[mode].score, wins: raw[mode].wins };
    return out;
  } catch {
    return {};
  }
}

/** Guarda a corrida se ela bater o recorde do modo. Devolve true quando é um recorde novo. */
export function saveArenaRun(mode: EndlessArenaMode, run: ArenaRecord): boolean {
  const records = readArenaRecords();
  const best = records[mode];
  if (run.score <= 0 || (best && best.score >= run.score)) return false;
  records[mode] = { score: run.score, wins: run.wins };
  try {
    localStorage.setItem(ARENA_RECORDS_KEY, JSON.stringify(records));
  } catch {
    // Sem armazenamento: o recorde vale só nesta tela.
  }
  return true;
}
