/**
 * Polimento das insígnias na maleta: esfregar o dedo numa insígnia conquistada aumenta o brilho, que fica salvo no
 * aparelho (e no backup). Com os dias o metal perde um pouco do brilho, devagar, até um mínimo; nunca some.
 * Só insígnia conquistada pode ser polida: espaço vazio não ganha brilho nem entra no arquivo.
 */

export interface PolishEntry {
  /** Brilho de 0 (fosco) a 1 (espelhado) no momento `at`. */
  level: number;
  /** Quando o polimento foi registrado (ms desde 1970). */
  at: number;
}

export type PolishState = Record<number, PolishEntry>;

/** Brilho de uma insígnia que acabou de chegar (um pouco de poeira da viagem). */
export const POLISH_START = 0.35;
/** O brilho não cai abaixo disto com o tempo. */
export const POLISH_FLOOR = 0.2;
/** Quanto o brilho perde por dia sem polir. */
export const POLISH_DECAY_PER_DAY = 0.02;
/** Quanto uma esfregada do tamanho da insígnia inteira adiciona quando ela está fosca (rende menos perto do máximo). */
export const POLISH_PER_SWIPE = 0.04;

const DAY = 86_400_000;
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export function normalizePolish(raw: unknown, badgeCount = 8): PolishState {
  const out: PolishState = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const order = Number(key);
    if (!Number.isInteger(order) || order < 0 || order >= badgeCount) continue;
    const v = value as Partial<PolishEntry> | null;
    if (!v || typeof v.level !== 'number' || !Number.isFinite(v.level) || typeof v.at !== 'number' || !Number.isFinite(v.at)) continue;
    out[order] = { level: clamp01(v.level), at: v.at };
  }
  return out;
}

/** Brilho atual de uma insígnia conquistada, já com a perda dos dias; sem registro, o brilho de chegada. */
export function currentPolish(state: PolishState, order: number, now: number): number {
  const entry = state[order];
  if (!entry) return POLISH_START;
  const days = Math.max(0, now - entry.at) / DAY;
  if (entry.level <= POLISH_FLOOR) return entry.level;
  return Math.max(POLISH_FLOOR, entry.level - days * POLISH_DECAY_PER_DAY);
}

/**
 * Aplica uma esfregada de `distance` (em diâmetros da insígnia) numa insígnia. Insígnia não conquistada não muda.
 * O ganho diminui perto do brilho máximo, para valer a pena insistir sem chegar a 1 num toque.
 */
export function rubBadge(state: PolishState, order: number, distance: number, won: boolean, now: number): PolishState {
  if (!won || !(distance > 0)) return state;
  const before = currentPolish(state, order, now);
  const gain = distance * POLISH_PER_SWIPE * (1 - before) ** 0.7;
  const level = clamp01(before + gain);
  return { ...state, [order]: { level: Math.round(level * 10_000) / 10_000, at: now } };
}

/** Rótulo do brilho para a interface. */
export function polishLabel(level: number): string {
  if (level >= 0.95) return 'Espelhada';
  if (level >= 0.75) return 'Brilhante';
  if (level >= 0.5) return 'Limpa';
  return 'Fosca';
}

/** Tira do estado as insígnias que não foram conquistadas (o arquivo só guarda polimento de conquista real). */
export function onlyWon(state: PolishState, won: readonly number[]): PolishState {
  const out: PolishState = {};
  for (const order of won) {
    const entry = state[order];
    if (entry) out[order] = entry;
  }
  return out;
}
