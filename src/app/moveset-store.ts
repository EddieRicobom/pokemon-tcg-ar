import { ref } from 'vue';
import type { BattleMove } from '../core/battle';
import { movesetFor, sanitizeMovesetBook, toBattleMove, withMoveset } from '../core/moveset';
import type { ChosenMove, MovesetBook } from '../core/moveset';
import { cardJourneys } from './card-evolution-store';

/** Golpes escolhidos na Arena, por Pokémon (id da carta ou do Digital Pokémon). Entra no backup (`tcg-ar-`). */
export const MOVESET_KEY = 'tcg-ar-movesets-v1';

function read(): MovesetBook {
  try {
    const raw = localStorage.getItem(MOVESET_KEY);
    return raw ? sanitizeMovesetBook(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export const movesetBook = ref<MovesetBook>(read());

/** Espécie atual do Pokémon: a carta pode ter evoluído na jornada (`cardJourneys`). */
export function currentDexId(id: string, dexId: number | undefined): number | undefined {
  return cardJourneys.value[id]?.dexId ?? dexId;
}

export function savedMoves(id: string, dexId: number | undefined): ChosenMove[] {
  return movesetFor(movesetBook.value, id, currentDexId(id, dexId));
}

/** Salva na hora (lista vazia apaga o conjunto). Devolve false se o aparelho não deixou guardar. */
export function saveMoves(id: string, dexId: number, moves: readonly ChosenMove[]): boolean {
  movesetBook.value = withMoveset(movesetBook.value, id, dexId, moves);
  try {
    localStorage.setItem(MOVESET_KEY, JSON.stringify(movesetBook.value));
    return true;
  } catch {
    return false;
  }
}

/** Golpes salvos no formato do motor automático (Caixa, Liga, corridas e PvP), ou undefined para os golpes de sempre. */
export function savedBattleMoves(id: string, dexId: number | undefined): BattleMove[] | undefined {
  const moves = savedMoves(id, dexId);
  return moves.length > 0 ? moves.map(toBattleMove) : undefined;
}
