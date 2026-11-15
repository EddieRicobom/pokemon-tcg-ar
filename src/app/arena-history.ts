/** Partidas concluídas da Arena, limitadas para caber no backup local. */
export const ARENA_HISTORY_KEY = 'tcg-ar-arena-historico-v1';
export const ARENA_HISTORY_LIMIT = 30;

export interface ArenaHighlight {
  timeMs: number;
  text: string;
}

export interface ArenaMatch {
  at: string;
  mode: 'treino' | 'liga' | 'corrida' | 'pvp';
  rival: string;
  result: 'vitoria' | 'derrota' | 'empate';
  durationMs: number;
  highlights: ArenaHighlight[];
}

const modes = new Set<ArenaMatch['mode']>(['treino', 'liga', 'corrida', 'pvp']);
const results = new Set<ArenaMatch['result']>(['vitoria', 'derrota', 'empate']);

function valid(entry: unknown): entry is ArenaMatch {
  if (!entry || typeof entry !== 'object') return false;
  const v = entry as ArenaMatch;
  return typeof v.at === 'string' && Number.isFinite(Date.parse(v.at)) && modes.has(v.mode)
    && typeof v.rival === 'string' && v.rival.length <= 80 && results.has(v.result)
    && Number.isFinite(v.durationMs) && v.durationMs >= 0
    && Array.isArray(v.highlights) && v.highlights.length <= 8
    && v.highlights.every((h) => h && Number.isFinite(h.timeMs) && h.timeMs >= 0 && typeof h.text === 'string' && h.text.length <= 120);
}

export function readArenaHistory(): ArenaMatch[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(ARENA_HISTORY_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter(valid).slice(-ARENA_HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

export function saveArenaMatch(match: ArenaMatch): void {
  if (!valid(match)) return;
  try {
    localStorage.setItem(ARENA_HISTORY_KEY, JSON.stringify([...readArenaHistory(), match].slice(-ARENA_HISTORY_LIMIT)));
  } catch {
    // A luta permanece concluída mesmo quando o armazenamento do aparelho está cheio.
  }
}
