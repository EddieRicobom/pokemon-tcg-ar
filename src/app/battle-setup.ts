import { buildFighter } from '../core/battle';
import type { BattleMove, Fighter } from '../core/battle';
import type { BattleData, PartName } from './pokemon-data-service';
import { emptyBattleData } from './pokemon-data-service';

export interface FighterSeed {
  id: string;
  name: string;
  dexId?: number;
  /** Golpes escolhidos na Arena: no lugar dos golpes do jogo e da carta. */
  moves?: BattleMove[];
}

export type BattleLoader = (cardId: string, dexId: number | undefined, onPart: <K extends PartName>(part: K, result: BattleData[K]) => void) => Promise<void>;

/** Tempo máximo esperando as fontes de dados antes de batalhar com o que já chegou. */
export const PREPARE_TIMEOUT_MS = 9000;

/** Com muitos lutadores (a caixa chega a 40) são centenas de consultas na primeira vez: o prazo cresce, até 30 s. */
export function prepareTimeoutFor(count: number): number {
  return Math.min(30000, PREPARE_TIMEOUT_MS + 400 * Math.max(0, count - 8));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      () => {
        clearTimeout(timer);
        resolve();
      },
    );
  });
}

/**
 * Carrega os dados de batalha de cada Pokémon (em paralelo, cada fonte independente) e monta os lutadores na
 * mesma ordem. O que não chegar a tempo ou falhar vira valor neutro com aviso (`Fighter.notes`), nunca erro.
 */
export async function prepareFighters(seeds: readonly FighterSeed[], load: BattleLoader, timeoutMs = prepareTimeoutFor(seeds.length)): Promise<Fighter[]> {
  const loaded = seeds.map(() => emptyBattleData());
  await Promise.all(
    seeds.map((seed, i) =>
      withTimeout(
        load(seed.id, seed.dexId, (part, result) => {
          (loaded[i] as BattleData)[part] = result as never;
        }),
        timeoutMs,
      ),
    ),
  );
  return seeds.map((seed, i) => {
    const data = loaded[i]!;
    const fighter = buildFighter({
      id: seed.id,
      name: seed.name,
      profile: data.profile.state === 'ok' ? data.profile.value : null,
      card: data.card.state === 'ok' ? data.card.value : null,
      gameMoves: data.moves.state === 'ok' ? data.moves.value : [],
    });
    if (!seed.moves || seed.moves.length === 0) return fighter;
    return { ...fighter, moves: seed.moves.map((m) => ({ ...m })), notes: fighter.notes.filter((n) => !n.includes('ataques da carta') && !n.includes('sem golpes')) };
  });
}
