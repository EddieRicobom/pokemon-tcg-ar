const WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;
const CHANCE_BY_DAYS = [0, 0, 0.12, 0.20, 0.28, 0.36, 0.44, 0.52, 0.60] as const;

export interface SurvivalAbsence {
  runDays: string[];
  lastTalkDay: string;
  lastMomentDay: string;
}

function dayTime(day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NaN;
  const time = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day ? time : NaN;
}

function isDay(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(dayTime(value));
}

export function normalizeSurvivalAbsence(raw: unknown, pastTalkDays: readonly string[] = []): SurvivalAbsence {
  const value = raw && typeof raw === 'object' ? raw as Partial<SurvivalAbsence> : {};
  const lastTalkDay = [...pastTalkDays, value.lastTalkDay].filter(isDay).sort().at(-1) ?? '';
  const runDays = Array.isArray(value.runDays) ? [...new Set(value.runDays.filter(isDay))].sort() : [];
  return {
    runDays: runDays.filter((day) => day > lastTalkDay).slice(-WINDOW_DAYS),
    lastTalkDay,
    lastMomentDay: isDay(value.lastMomentDay) ? value.lastMomentDay : '',
  };
}

function recentRunDays(state: SurvivalAbsence, day: string): string[] {
  const today = dayTime(day);
  return state.runDays.filter((runDay) => runDay > state.lastTalkDay && runDay <= day && today - dayTime(runDay) < WINDOW_DAYS * DAY_MS);
}

/** A Torre registra o dia só quando a partida de Survival fica jogável. Repetir no mesmo dia não conta de novo. */
export function recordSurvivalDay(state: SurvivalAbsence, day: string): boolean {
  if (!isDay(day) || day <= state.lastTalkDay || state.runDays.includes(day)) return false;
  state.runDays = [...recentRunDays(state, day), day];
  return true;
}

/** Qualquer conversa com um morador encerra a sequência, inclusive se ele já conversou naquele dia. */
export function recordVillageConversation(state: SurvivalAbsence, day: string): void {
  if (!isDay(day) || day < state.lastTalkDay) return;
  state.lastTalkDay = day;
  state.runDays = state.runDays.filter((runDay) => runDay > day);
}

export function survivalAbsenceChance(state: SurvivalAbsence, day: string): number {
  if (day <= state.lastTalkDay || day <= state.lastMomentDay) return 0;
  const days = recentRunDays(state, day).length;
  return CHANCE_BY_DAYS[Math.min(days, CHANCE_BY_DAYS.length - 1)] ?? 0;
}
