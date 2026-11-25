/**
 * Recordes por espécie na Torre: melhor tempo, onda e nível de cada Pokémon.
 * Fica separado do recorde geral (`torre.bestMs`) para o jogador comparar o mesmo
 * Pokémon entre corridas; não altera recompensas nem a dificuldade.
 */

export interface SurvivorDexRecord {
  /** Melhor tempo sobrevivido, em ms. */
  ms: number;
  /** Melhor onda alcançada. */
  wave: number;
  /** Melhor nível alcançado. */
  level: number;
}

export type SurvivorDexRecords = Record<string, SurvivorDexRecord>;

export type SurvivorDexMetric = 'tempo' | 'onda' | 'nivel';

/** Medalhas cosméticas: 3, 6 e 10 minutos com a mesma espécie. */
export const SURVIVOR_DEX_MEDAL_MS = [180_000, 360_000, 600_000] as const;

/** Teto do save: cada entrada é pequena, mas o jogo tem mais de mil espécies. */
const MAX_DEX_RECORDS = 400;

export function dexRecordKey(dexId: number | undefined): string | null {
  if (!Number.isFinite(dexId) || (dexId ?? 0) <= 0) return null;
  return String(Math.floor(dexId!));
}

export function emptyDexRecord(): SurvivorDexRecord {
  return { ms: 0, wave: 0, level: 0 };
}

export function dexRecordFor(records: SurvivorDexRecords | undefined, dexId: number | undefined): SurvivorDexRecord | null {
  const key = dexRecordKey(dexId);
  if (!key || !records) return null;
  const record = records[key];
  return record && (record.ms > 0 || record.wave > 0 || record.level > 0) ? record : null;
}

/** Atualiza a espécie sem mexer nas outras; devolve `improved` para o resumo celebrar. */
const safeInt = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);

export function updateDexRecords(
  records: SurvivorDexRecords,
  dexId: number | undefined,
  run: { ms: number; wave: number; level: number },
): { records: SurvivorDexRecords; improved: SurvivorDexMetric[] } {
  const key = dexRecordKey(dexId);
  if (!key) return { records, improved: [] };
  const before = records[key] ?? emptyDexRecord();
  const next: SurvivorDexRecord = {
    ms: Math.max(safeInt(before.ms), safeInt(run.ms)),
    wave: Math.max(safeInt(before.wave), safeInt(run.wave)),
    level: Math.max(safeInt(before.level), safeInt(run.level)),
  };
  const improved: SurvivorDexMetric[] = [];
  if (next.ms > before.ms) improved.push('tempo');
  if (next.wave > before.wave) improved.push('onda');
  if (next.level > before.level) improved.push('nivel');
  if (improved.length === 0) return { records, improved };
  const keys = Object.keys(records);
  let merged: SurvivorDexRecords = { ...records, [key]: next };
  if (!(key in records) && keys.length >= MAX_DEX_RECORDS) {
    // Descarta a espécie com o pior tempo (nunca a que acabou de entrar).
    const worst = keys
      .filter((other) => other !== key)
      .sort((a, b) => (records[a]!.ms - records[b]!.ms) || a.localeCompare(b))[0];
    if (worst) {
      merged = { ...merged };
      delete merged[worst];
    }
  }
  return { records: merged, improved };
}

export function dexMedalCount(record: SurvivorDexRecord | null | undefined): number {
  if (!record) return 0;
  return SURVIVOR_DEX_MEDAL_MS.filter((threshold) => record.ms >= threshold).length;
}

export function dexMedalLabel(count: number): string {
  return count >= 3 ? '🥇' : count === 2 ? '🥈' : count === 1 ? '🥉' : '';
}

/** Normaliza o valor vindo do save antigo, descartando entradas inválidas. */
export function normalizeDexRecords(raw: unknown): SurvivorDexRecords {
  if (!raw || typeof raw !== 'object') return {};
  const out: SurvivorDexRecords = {};
  let count = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= MAX_DEX_RECORDS) break;
    if (!/^\d{1,4}$/.test(key) || !value || typeof value !== 'object') continue;
    const row = value as Partial<SurvivorDexRecord>;
    const ms = safeInt(Number(row.ms));
    const wave = safeInt(Number(row.wave));
    const level = safeInt(Number(row.level));
    if (ms <= 0 && wave <= 0 && level <= 0) continue;
    out[key] = { ms, wave, level };
    count++;
  }
  return out;
}
