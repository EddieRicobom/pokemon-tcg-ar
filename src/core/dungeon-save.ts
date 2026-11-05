import type { DungeonState, Phase } from './dungeon';
import type { Gem } from './dungeon-gems';

/**
 * Descida salva: o estado da expedição é só dado (o sorteio é refeito a partir da semente e de `rollCount`), então dá para
 * guardar e continuar depois. Só se guarda a vez do jogador e as telas entre andares; o duelo com um amigo não entra.
 */
export const DUNGEON_SAVE_VERSION = 1;

export interface DungeonRunSave {
  v: number;
  state: DungeonState;
  /** Pokémon já usados na expedição e andares que já ofereceram armas. */
  chosen: string[];
  offered: number[];
  /** O que saiu da Vila: volta se a descida for abandonada. */
  brought: { gems: Gem[]; lunchbox: string | null } | null;
}

const RESUMABLE: readonly Phase[] = ['player', 'cleared', 'reward'];

export const canSaveRun = (phase: Phase): boolean => RESUMABLE.includes(phase);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Lê a descida guardada; qualquer coisa estranha ou de outra versão vira null, sem derrubar a tela. */
export function parseRunSave(raw: string | null): DungeonRunSave | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(value) || value.v !== DUNGEON_SAVE_VERSION || !isObject(value.state)) return null;
  const st = value.state;
  if (!isCount(st.seed) || !isCount(st.floor) || !isCount(st.round) || !isCount(st.ap) || !isCount(st.rollCount) || !isCount(st.nextUid) || !isCount(st.nextGemId)) return null;
  if (!RESUMABLE.includes(st.phase as Phase) || !isObject(st.pos)) return null;
  for (const list of [st.team, st.enemies, st.walls, st.bag, st.log, st.pool, st.loot]) if (!Array.isArray(list)) return null;
  if ((st.team as unknown[]).length === 0) return null;
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const numbers = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : []);
  const brought = isObject(value.brought) && Array.isArray(value.brought.gems)
    ? { gems: value.brought.gems as Gem[], lunchbox: typeof value.brought.lunchbox === 'string' ? value.brought.lunchbox : null }
    : null;
  return { v: DUNGEON_SAVE_VERSION, state: st as unknown as DungeonState, chosen: strings(value.chosen), offered: numbers(value.offered), brought };
}
