/**
 * Contador de abates seguidos da Torre: só conta quem caiu de verdade no motor, e zera se o tempo passa sem novo abate.
 * É apresentação (não muda dano nem recompensa), então fica desligado junto com os impactos visuais.
 */

/** Tempo sem abate até a sequência acabar. */
export const STREAK_WINDOW_MS = 2600;
/** O contador só aparece a partir daqui: abaixo disso é o ritmo normal da corrida. */
export const STREAK_SHOW_AT = 10;
const POP_MS = 160;
const TIERS = [STREAK_SHOW_AT, 30, 60, 100] as const;

export interface KillStreak {
  count: number;
  leftMs: number;
  popMs: number;
  best: number;
}

export function createKillStreak(): KillStreak {
  return { count: 0, leftMs: 0, popMs: 0, best: 0 };
}

export function resetKillStreak(streak: KillStreak): void {
  Object.assign(streak, createKillStreak());
}

export function addStreakKills(streak: KillStreak, kills: number): void {
  if (!Number.isFinite(kills) || kills <= 0) return;
  streak.count += Math.floor(kills);
  streak.leftMs = STREAK_WINDOW_MS;
  streak.popMs = POP_MS;
  streak.best = Math.max(streak.best, streak.count);
}

export function stepKillStreak(streak: KillStreak, dtMs: number): void {
  streak.popMs = Math.max(0, streak.popMs - dtMs);
  if (streak.leftMs <= 0) return;
  streak.leftMs = Math.max(0, streak.leftMs - dtMs);
  if (streak.leftMs === 0) streak.count = 0;
}

export function streakVisible(streak: KillStreak): boolean {
  return streak.count >= STREAK_SHOW_AT && streak.leftMs > 0;
}

/** Faixa da cor: 0 a 3, conforme a sequência cresce. */
export function streakTier(count: number): number {
  let tier = 0;
  for (let i = 1; i < TIERS.length; i++) if (count >= TIERS[i]!) tier = i;
  return tier;
}

/** Soco do número de 1 a 0, logo depois de um novo abate. */
export function streakPop(streak: KillStreak): number {
  return streak.popMs / POP_MS;
}

/** Some só no último meio segundo: a sequência avisa que vai acabar. */
export function streakFade(streak: KillStreak): number {
  return Math.min(1, streak.leftMs / 500);
}
