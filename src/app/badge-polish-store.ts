import { ref } from 'vue';
import { currentPolish, normalizePolish, onlyWon, rubBadge } from '../core/badge-polish';
import type { PolishState } from '../core/badge-polish';
import { league } from './league-store';

const KEY = 'tcg-ar-insignias-v1';

function read(): PolishState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? onlyWon(normalizePolish(JSON.parse(raw)), league.value.badges) : {};
  } catch {
    return {};
  }
}

/** Brilho das insígnias, polidas na maleta; só neste aparelho (e no backup). */
export const badgePolish = ref<PolishState>(read());

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function savePolishNow(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(badgePolish.value));
  } catch {
    // Sem armazenamento: o brilho vale até fechar o app.
  }
}

/** Brilho atual de uma insígnia conquistada (0 a 1). */
export function polishOf(order: number, now = Date.now()): number {
  return currentPolish(badgePolish.value, order, now);
}

/** Esfregada de `distance` diâmetros numa insígnia; só as conquistadas mudam. Grava logo depois que o dedo para. */
export function rubPolish(order: number, distance: number, now = Date.now()): number {
  const next = rubBadge(badgePolish.value, order, distance, league.value.badges.includes(order), now);
  if (next !== badgePolish.value) {
    badgePolish.value = next;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(savePolishNow, 500);
  }
  return polishOf(order, now);
}
