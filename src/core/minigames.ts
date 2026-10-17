import { POKEMON_TYPES, TYPE_LABELS_PT } from './pokemon-data';
import type { PokemonType } from './pokemon-data';
import { typeEffectiveness } from './battle';
import type { Rng } from './battle';

/**
 * Minigames com as cartas escaneadas. Só conta e sorteio (testáveis); as telas ficam em `components/Minigame*.vue`.
 * Nenhuma pergunta é inventada: o "Quem é esse Pokémon?" e a Memória usam as cartas guardadas no aparelho e o quiz de
 * tipos usa a mesma tabela de tipos da batalha.
 */

export type GameId = 'quem' | 'tipos' | 'memoria';

export const GAME_LABELS_PT: Record<GameId, { title: string; blurb: string }> = {
  quem: { title: 'Quem é esse Pokémon?', blurb: 'Adivinhe 5 Pokémon pela silhueta: das suas cartas, de uma geração ou sorteados de todas.' },
  tipos: { title: 'Duelo de tipos', blurb: 'Quanto dano um tipo causa em outro? A mesma tabela da batalha.' },
  memoria: { title: 'Memória', blurb: 'Encontre os pares de Pokémon: das suas cartas ou sorteados da Pokédex.' },
};

/** Uma carta guardada que serve de peça de jogo (com Pokémon carregado). */
export interface Piece {
  id: string;
  name: string;
  /** Identifica a imagem: cartas do mesmo Pokémon repetem. */
  spriteKey: string;
}

export function shuffle<T>(list: readonly T[], rng: Rng): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Peças distintas por nome e por imagem (duas cartas do mesmo Pokémon não viram duas peças). */
export function distinctPieces(pieces: readonly Piece[]): Piece[] {
  const names = new Set<string>();
  const sprites = new Set<string>();
  const out: Piece[] = [];
  for (const piece of pieces) {
    const key = piece.name.trim().toLowerCase();
    if (names.has(key) || sprites.has(piece.spriteKey)) continue;
    names.add(key);
    sprites.add(piece.spriteKey);
    out.push(piece);
  }
  return out;
}

export const MIN_PIECES: Record<'quem' | 'memoria', number> = { quem: 4, memoria: 3 };

/**
 * Por que o jogo ainda não dá para jogar (ou null). Todos dão sem cartas: o "Quem é esse Pokémon?" e a Memória sorteiam
 * da Pokédex quando as cartas guardadas não bastam (a opção "Minhas cartas" do "Quem é" é que fica bloqueada, veja
 * `cardsBlocker`; a Memória usa as cartas quando há `MIN_PIECES.memoria` Pokémon diferentes, veja `memoryUsesCards`).
 */
export function gameBlocker(_game: GameId, _pieces: readonly Piece[]): string | null {
  return null;
}

/** A Memória usa as cartas guardadas (há Pokémon diferentes que bastem) ou sorteia da Pokédex? */
export function memoryUsesCards(pieces: readonly Piece[]): boolean {
  return piecesBlocker('memoria', pieces) === null;
}

/** Por que "Minhas cartas" ainda não serve ao "Quem é esse Pokémon?" (ou null). */
export function cardsBlocker(pieces: readonly Piece[]): string | null {
  return piecesBlocker('quem', pieces);
}

function piecesBlocker(game: 'quem' | 'memoria', pieces: readonly Piece[]): string | null {
  const have = distinctPieces(pieces).length;
  const need = MIN_PIECES[game];
  if (have >= need) return null;
  return `Precisa de ${need} Pokémon diferentes nas cartas guardadas (você tem ${have}). Escaneie mais cartas!`;
}

// ----------------------------------------------------------------------------- Quem é esse Pokémon?

export const QUIZ_ROUNDS = 5;

export interface WhoQuestion {
  piece: Piece;
  /** 4 nomes embaralhados; `correct` é o índice do certo. */
  options: string[];
  correct: number;
}

/**
 * Dificuldade do "Quem é esse Pokémon?": só muda como a silhueta é mostrada (ver `MinigameQuem.vue`), nunca as
 * respostas nem o sorteio — ninguém fica sabendo menos sobre o Pokémon de verdade, só vê a imagem mais distorcida.
 */
export type WhoDifficulty = 'normal' | 'dificil';
export const WHO_DIFFICULTIES: readonly WhoDifficulty[] = ['normal', 'dificil'];
export const WHO_DIFFICULTY_LABELS_PT: Record<WhoDifficulty, string> = { normal: 'Normal', dificil: 'Difícil' };

export function makeWhoQuestions(pieces: readonly Piece[], rng: Rng, rounds = QUIZ_ROUNDS): WhoQuestion[] {
  const pool = distinctPieces(pieces);
  if (pool.length < MIN_PIECES.quem) return [];
  const order = shuffle(pool, rng);
  return Array.from({ length: Math.min(rounds, order.length) }, (_, i) => {
    const piece = order[i]!;
    const others = shuffle(pool.filter((p) => p.id !== piece.id), rng).slice(0, 3);
    const options = shuffle([piece.name, ...others.map((p) => p.name)], rng);
    return { piece, options, correct: options.indexOf(piece.name) };
  });
}

// ----------------------------------------------------------------------------- Duelo de tipos

export const TYPE_ROUNDS = 6;

export interface TypeQuestion {
  attack: PokemonType;
  defend: PokemonType[];
  /** Multiplicadores possíveis (crescentes) e o índice do certo. */
  options: number[];
  correct: number;
}

const MULTIPLIERS = [0, 0.25, 0.5, 1, 2, 4] as const;

export function multiplierLabel(m: number): string {
  if (m === 0) return 'Não afeta (×0)';
  if (m === 0.25) return 'Quase nada (×¼)';
  if (m === 0.5) return 'Pouco efetivo (×½)';
  if (m === 1) return 'Normal (×1)';
  if (m === 2) return 'Super efetivo (×2)';
  return 'Extremo (×4)';
}

export function makeTypeQuestions(rng: Rng, rounds = TYPE_ROUNDS): TypeQuestion[] {
  const questions: TypeQuestion[] = [];
  let guard = 0;
  while (questions.length < rounds && guard++ < 500) {
    const attack = POKEMON_TYPES[Math.floor(rng() * POKEMON_TYPES.length)]!;
    const first = POKEMON_TYPES[Math.floor(rng() * POKEMON_TYPES.length)]!;
    const second = rng() < 0.35 ? POKEMON_TYPES[Math.floor(rng() * POKEMON_TYPES.length)]! : null;
    const defend = second && second !== first ? [first, second] : [first];
    const m = typeEffectiveness(attack, defend);
    // Perguntas com resultado "normal" são sem graça: entram menos.
    if (m === 1 && rng() < 0.7) continue;
    if (questions.some((q) => q.attack === attack && q.defend.join() === defend.join())) continue;
    const wrong = shuffle(MULTIPLIERS.filter((x) => x !== m), rng).slice(0, 3);
    const options = [...wrong, m].sort((a, b) => a - b);
    questions.push({ attack, defend, options, correct: options.indexOf(m) });
  }
  return questions;
}

export function describeTypeQuestion(q: TypeQuestion): string {
  return `Golpe de ${TYPE_LABELS_PT[q.attack]} contra ${q.defend.map((t) => TYPE_LABELS_PT[t]).join(' / ')}`;
}

// ----------------------------------------------------------------------------- Memória

export const MEMORY_PAIRS = 6;

export interface MemoryTile {
  /** Posição no tabuleiro e a peça (as duas do par têm o mesmo `pieceId`). */
  slot: number;
  pieceId: string;
}

export function makeMemoryBoard(pieces: readonly Piece[], rng: Rng, pairs = MEMORY_PAIRS): { tiles: MemoryTile[]; pieces: Piece[] } {
  const pool = distinctPieces(pieces);
  if (pool.length < MIN_PIECES.memoria) return { tiles: [], pieces: [] };
  const chosen = shuffle(pool, rng).slice(0, Math.min(pairs, pool.length));
  const tiles = shuffle(chosen.flatMap((p) => [p.id, p.id]), rng).map((pieceId, slot) => ({ slot, pieceId }));
  return { tiles, pieces: chosen };
}

// ----------------------------------------------------------------------------- pontuação (0–100)

export interface Grade {
  score: number;
  won: boolean;
}

export function gradeQuiz(correct: number, total: number): Grade {
  const score = total === 0 ? 0 : Math.round((correct / total) * 100);
  return { score, won: score >= 60 };
}

/** Memória: 100 pontos com o mínimo de jogadas (uma por par); cada jogada extra tira 8; vence com 40 pontos ou mais. */
export function gradeMemory(moves: number, pairs: number): Grade {
  const score = Math.max(0, 100 - Math.max(0, moves - pairs) * 8);
  return { score, won: score >= 40 };
}
