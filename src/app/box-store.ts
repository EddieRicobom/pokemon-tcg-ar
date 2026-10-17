import { reconcileLayout } from '../core/box-layout';
import type { BoxLayout } from '../core/box-layout';

/** Onde cada carta está nas caixas (Box). Entra no backup (`BACKUP_KEYS`). */
export const BOX_KEY = 'tcg-ar-box-v1';

export function loadBoxLayout(cardIds: readonly string[]): BoxLayout {
  let raw: unknown = null;
  try {
    const text = localStorage.getItem(BOX_KEY);
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }
  return reconcileLayout(raw, cardIds);
}

export function saveBoxLayout(layout: BoxLayout): void {
  try {
    localStorage.setItem(BOX_KEY, JSON.stringify(layout));
  } catch {
    // Sem espaço ou modo privado: só não lembra a organização na próxima vez.
  }
}
