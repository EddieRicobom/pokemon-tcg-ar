import { DIFFICULTIES, MAX_PER_SIDE } from '../core/pins';
import type { Difficulty } from '../core/pins';
import type { PinField } from '../core/pin-terrain';

/** Quem vai para a arena do Pin Mode (ids de cartas guardadas) e a dificuldade. Lógica pura + persistência. */
export interface PinsSetup {
  mine: string[];
  enemy: string[];
  difficulty: Difficulty;
  /** Os golpes elementais e a Pancada marcam o chão da arena (e a arena já começa com algumas marcas). */
  marks: boolean;
  /** A borda da arena encolhe a cada rodada depois do aquecimento. */
  shrink: boolean;
  /** Sons do jogo e vibração do celular (cada um liga e desliga sozinho). */
  sound: boolean;
  haptics: boolean;
  /** Efeitos elementais intensos da arena (anéis, faíscas e fragmentos). */
  effects: boolean;
  /** Campo inicial; a tela só oferece os desbloqueados na Liga. */
  field: PinField;
}

export type Role = 'mine' | 'enemy';

const KEY = 'tcg-ar-pins-setup-v1';
/** Sem escolha, a arena começa com os 3 pins mais recentes do seu lado e os 5 seguintes do adversário. */
export const DEFAULT_MINE = 3;
export const DEFAULT_ENEMY = 4;

export interface Candidate {
  id: string;
  lastSeenAt: number;
}

export function emptySetup(): PinsSetup {
  return { mine: [], enemy: [], difficulty: 'normal', marks: true, shrink: true, sound: true, haptics: true, effects: true, field: 'natural' };
}

/** Só ids de cartas que ainda existem, sem repetir nem estar nos dois lados, até o limite de cada lado. */
export function normalizeSetup(raw: unknown, available: ReadonlySet<string>): PinsSetup {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof PinsSetup, unknown>>;
  const seen = new Set<string>();
  const clean = (list: unknown, max: number) => {
    const out: string[] = [];
    if (!Array.isArray(list)) return out;
    for (const id of list) {
      if (typeof id === 'string' && available.has(id) && !seen.has(id) && out.length < max) {
        seen.add(id);
        out.push(id);
      }
    }
    return out;
  };
  const mine = clean(r.mine, MAX_PER_SIDE[0]);
  const enemy = clean(r.enemy, MAX_PER_SIDE[1]);
  const difficulty = DIFFICULTIES.find((d) => d === r.difficulty) ?? 'normal';
  const field: PinField = r.field === 'ice' || r.field === 'toxic' || r.field === 'psy' ? r.field : 'natural';
  return { mine, enemy, difficulty, marks: r.marks !== false, shrink: r.shrink !== false, sound: r.sound !== false, haptics: r.haptics !== false, effects: r.effects !== false, field };
}

/** Escolha inicial: as cartas mais recentes (para o seu lado primeiro, depois para o adversário). */
export function defaultSetup(cards: readonly Candidate[]): PinsSetup {
  const recent = [...cards].sort((a, b) => b.lastSeenAt - a.lastSeenAt).map((c) => c.id);
  return { mine: recent.slice(0, DEFAULT_MINE), enemy: recent.slice(DEFAULT_MINE, DEFAULT_MINE + DEFAULT_ENEMY), difficulty: 'normal', marks: true, shrink: true, sound: true, haptics: true, effects: true, field: 'natural' };
}

export function roleOf(setup: PinsSetup, id: string): Role | null {
  return setup.mine.includes(id) ? 'mine' : setup.enemy.includes(id) ? 'enemy' : null;
}

/**
 * Põe a carta num lado (ou tira, com `null`). Passar de um lado para o outro tira do primeiro. `full` diz que o lado
 * pedido já estava cheio (nada muda).
 */
export function setRole(setup: PinsSetup, id: string, role: Role | null): { setup: PinsSetup; full: Role | null } {
  const without: PinsSetup = { ...setup, mine: setup.mine.filter((x) => x !== id), enemy: setup.enemy.filter((x) => x !== id) };
  if (role === null) return { setup: without, full: null };
  const max = MAX_PER_SIDE[role === 'mine' ? 0 : 1];
  if (without[role].length >= max) return { setup, full: role };
  return { setup: { ...without, [role]: [...without[role], id] }, full: null };
}

export function loadSetup(available: ReadonlySet<string>, cards: readonly Candidate[]): PinsSetup {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = normalizeSetup(JSON.parse(raw), available);
      if (saved.mine.length > 0 || saved.enemy.length > 0) return saved;
      return { ...defaultSetup(cards), difficulty: saved.difficulty, marks: saved.marks, shrink: saved.shrink, sound: saved.sound, haptics: saved.haptics, effects: saved.effects, field: saved.field };
    }
  } catch {
    // Sem armazenamento ou texto quebrado: começa do padrão.
  }
  return defaultSetup(cards);
}

export function saveSetup(setup: PinsSetup): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(setup));
  } catch {
    // Só não lembra da escolha na próxima vez.
  }
}

/** Por que não dá para começar (ou null). */
export function setupBlocker(setup: PinsSetup): string | null {
  if (setup.mine.length === 0) return 'Escolha pelo menos 1 pin seu.';
  if (setup.enemy.length === 0) return 'Escolha pelo menos 1 adversário.';
  return null;
}
