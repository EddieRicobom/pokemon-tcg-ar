import { parseGameMove } from '../core/pokemon-data';
import type { GameMove } from '../core/pokemon-data';
import { parseLearnset } from '../core/moveset';
import type { LearnableMove, Learnset } from '../core/moveset';
import { getJson, isGameMoves, POKEAPI } from './pokemon-data-service';
import type { BattleDataDeps } from './pokemon-data-service';

/**
 * Learnset (todos os golpes que a espécie aprende) e os números de cada golpe, da PokéAPI, guardados no aparelho. Os
 * golpes quase não mudam, então cada um é consultado uma vez só, para qualquer Pokémon. O que falha fica de fora da lista
 * e a tela diz quantos faltaram; nada é inventado.
 */
export type LearnsetDeps = Pick<BattleDataDeps, 'fetchImpl' | 'storage' | 'timeoutMs'>;

const LEARNSET_KEY = (dex: number) => `tcg-ar-learnset-v1:${dex}`;
const MOVE_DATA_KEY = 'tcg-ar-move-data-v1';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const METHODS = new Set(['level-up', 'machine', 'egg', 'tutor', 'other']);
function isLearnset(v: unknown): v is Learnset {
  return isRecord(v) && typeof v.versionGroup === 'string' && Array.isArray(v.moves) && v.moves.length > 0 && v.moves.every((m: unknown) => isRecord(m)
    && typeof m.slug === 'string' && typeof m.url === 'string' && Array.isArray(m.methods) && m.methods.every((x: unknown) => typeof x === 'string' && METHODS.has(x))
    && (m.level === null || typeof m.level === 'number'));
}

function readJson(storage: LearnsetDeps['storage'], key: string): unknown {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: LearnsetDeps['storage'], key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    /* sem espaço ou bloqueado: segue sem guardar */
  }
}

const describe = (error: unknown): string => (error instanceof Error && error.message ? error.message : 'falha de rede');

/** Learnset do Pokémon (aparelho ou PokéAPI). Erro vem como mensagem para a tela mostrar o que faltou. */
export async function loadLearnset(dexId: number, deps: LearnsetDeps): Promise<{ ok: true; value: Learnset } | { ok: false; message: string }> {
  const cached = readJson(deps.storage, LEARNSET_KEY(dexId));
  if (isLearnset(cached)) return { ok: true, value: cached };
  try {
    const learnset = parseLearnset(await getJson(`${POKEAPI}/pokemon/${dexId}`, deps));
    if (!learnset) return { ok: false, message: 'A PokéAPI respondeu sem a lista de golpes deste Pokémon.' };
    writeJson(deps.storage, LEARNSET_KEY(dexId), learnset);
    return { ok: true, value: learnset };
  } catch (error) {
    return { ok: false, message: `Não consegui a lista de golpes (PokéAPI): ${describe(error)}.` };
  }
}

/** Números dos golpes já guardados, por slug. */
export function cachedMoveData(storage: LearnsetDeps['storage']): Record<string, GameMove> {
  const raw = readJson(storage, MOVE_DATA_KEY);
  if (!isRecord(raw)) return {};
  const out: Record<string, GameMove> = {};
  for (const [slug, move] of Object.entries(raw)) if (isGameMoves([move])) out[slug] = move as GameMove;
  return out;
}

/**
 * Busca os números (tipo, poder, precisão, PP, classe) dos golpes que ainda não estão guardados, poucos de cada vez.
 * `onProgress` recebe cada golpe que chega, para a lista ir se completando na tela.
 */
export async function loadMoveData(
  moves: readonly LearnableMove[],
  deps: LearnsetDeps,
  onProgress?: (slug: string, move: GameMove) => void,
  concurrency = 6,
): Promise<{ data: Record<string, GameMove>; failed: string[] }> {
  const data = cachedMoveData(deps.storage);
  const pending = moves.filter((m) => !data[m.slug]);
  const failed: string[] = [];
  let cursor = 0;
  let dirty = false;
  const worker = async () => {
    while (cursor < pending.length) {
      const ref = pending[cursor++]!;
      try {
        const move = parseGameMove(await getJson(ref.url, deps));
        if (!move) throw new Error('resposta sem o golpe');
        data[ref.slug] = move;
        dirty = true;
        onProgress?.(ref.slug, move);
      } catch {
        failed.push(ref.slug);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, pending.length)) }, worker));
  if (dirty) writeJson(deps.storage, MOVE_DATA_KEY, data);
  return { data, failed };
}
