import { ref } from 'vue';
import { isRosterSlot } from '../core/battle';
import type { RosterSlot } from '../core/battle';

const KEY = 'tcg-ar-roster-v1';

/** Só guarda marcas válidas de cartas (texto); o resto some. "Sorteio" é o padrão e não precisa ser guardado. */
export function normalizeRoster(raw: unknown): Record<string, RosterSlot> {
  const out: Record<string, RosterSlot> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [id, slot] of Object.entries(raw)) {
    if (isRosterSlot(slot) && slot !== 'auto') out[id] = slot;
  }
  return out;
}

function read(): Record<string, RosterSlot> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeRoster(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

/** Escalação escolhida para as batalhas da Caixa (carta → equipe ou fora), lembrada entre as visitas. */
export const roster = ref<Record<string, RosterSlot>>(read());

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(roster.value));
  } catch {
    // Só não lembra da escalação na próxima vez.
  }
}

export function slotOf(id: string): RosterSlot {
  return roster.value[id] ?? 'auto';
}

export function setSlot(id: string, slot: RosterSlot): void {
  const next = { ...roster.value };
  if (slot === 'auto') delete next[id];
  else next[id] = slot;
  roster.value = next;
  save();
}

export function resetRoster(): void {
  roster.value = {};
  save();
}

/** A escalação na ordem da lista de cartas da caixa. */
export function rosterFor(ids: readonly string[]): RosterSlot[] {
  return ids.map(slotOf);
}
