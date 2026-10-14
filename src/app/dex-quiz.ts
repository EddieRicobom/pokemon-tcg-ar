import { dexIdOfPiece } from '../core/dex';
import { QUIZ_ROUNDS, makeWhoQuestions } from '../core/minigames';
import type { Piece, WhoQuestion } from '../core/minigames';
import type { Rng } from '../core/battle';
import { fetchSprite } from '../ar/sprite-source';
import type { SpriteSource } from '../ar/sprite-source';

export interface DexRound {
  questions: WhoQuestion[];
  /** Imagem de cada pergunta (id da peça → URL local). */
  urls: Map<string, string>;
  release(): void;
}

/** Perguntas a mais sorteadas de reserva: Pokémon sem imagem no PokeAPI/sprites são trocados por elas. */
const SPARE = 3;

/**
 * Sorteia as perguntas do "Quem é esse Pokémon?" entre `pool` e baixa a imagem de cada Pokémon sorteado (só desses,
 * não da lista toda). Sem imagem não há pergunta: ela é trocada por uma reserva. Falha de rede lança.
 */
export async function prepareDexRound(
  pool: readonly Piece[],
  rng: Rng,
  fetchOne: (dexId: number) => Promise<SpriteSource | null> = fetchSprite,
  makeUrl: (blob: Blob) => string = (b) => URL.createObjectURL(b),
  revoke: (url: string) => void = (u) => URL.revokeObjectURL(u),
  rounds = QUIZ_ROUNDS,
): Promise<DexRound> {
  const candidates = makeWhoQuestions(pool, rng, rounds + SPARE);
  const sprites = await Promise.all(
    candidates.map(async (q) => {
      const dexId = dexIdOfPiece(q.piece);
      if (dexId === null) return null;
      try {
        return await fetchOne(dexId);
      } catch {
        return null;
      }
    }),
  );
  const questions: WhoQuestion[] = [];
  const urls = new Map<string, string>();
  candidates.forEach((q, i) => {
    const sprite = sprites[i];
    if (!sprite || questions.length >= rounds) return;
    questions.push(q);
    urls.set(q.piece.id, makeUrl(sprite.blob));
  });
  if (questions.length < Math.min(rounds, 3)) {
    urls.forEach((u) => revoke(u));
    throw new Error('Não foi possível baixar as imagens dos Pokémon. Verifique a conexão e tente de novo.');
  }
  return { questions, urls, release: () => urls.forEach((u) => revoke(u)) };
}
