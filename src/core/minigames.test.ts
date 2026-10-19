import { describe, expect, it } from 'vitest';
import { seededRng, typeEffectiveness } from './battle';
import {
  cardsBlocker, distinctPieces, gameBlocker, gradeMemory, memoryUsesCards, gradeQuiz, makeMemoryBoard, makeTypeQuestions, makeWhoQuestions, MEMORY_PAIRS, MINIGAME_WIN_COINS, minigameCoinReward, multiplierLabel, QUIZ_ROUNDS, shuffle, TYPE_ROUNDS,
  WHO_DIFFICULTIES, WHO_DIFFICULTY_LABELS_PT,
} from './minigames';
import type { Piece } from './minigames';

const piece = (n: number, name = `Mon ${n}`): Piece => ({ id: `c${n}`, name, spriteKey: `s${n}` });
const pool = (n: number) => Array.from({ length: n }, (_, i) => piece(i));

describe('recompensas', () => {
  it('dá moedas de bônus só em vitória', () => {
    expect(minigameCoinReward(true)).toBe(MINIGAME_WIN_COINS);
    expect(minigameCoinReward(false)).toBe(0);
  });
});

describe('peças', () => {
  it('ignora repetidas por nome ou por imagem', () => {
    const list = [piece(1, 'Pikachu'), piece(2, 'pikachu'), { id: 'x', name: 'Raichu', spriteKey: 's1' }, piece(3, 'Eevee')];
    expect(distinctPieces(list).map((p) => p.name)).toEqual(['Pikachu', 'Eevee']);
  });

  it('explica o que falta para jogar', () => {
    expect(gameBlocker('tipos', [])).toBeNull();
    expect(gameBlocker('quem', [])).toBeNull();
    expect(cardsBlocker(pool(3))).toContain('4');
    expect(cardsBlocker(pool(4))).toBeNull();
    // Sem cartas que bastem, a Memória sorteia da Pokédex: nunca fica bloqueada.
    expect(gameBlocker('memoria', pool(2))).toBeNull();
    expect(memoryUsesCards(pool(2))).toBe(false);
    expect(memoryUsesCards(pool(3))).toBe(true);
    expect(cardsBlocker([piece(1, 'A'), piece(2, 'A'), piece(3, 'A'), piece(4, 'A')])).toContain('1');
  });

  it('embaralhar mantém os itens e é repetível', () => {
    const a = shuffle([1, 2, 3, 4, 5], seededRng(3));
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(shuffle([1, 2, 3, 4, 5], seededRng(3))).toEqual(a);
  });
});

describe('Quem é esse Pokémon?', () => {
  it('monta perguntas com 4 opções, a certa entre elas, sem repetir a carta', () => {
    const questions = makeWhoQuestions(pool(9), seededRng(1));
    expect(questions).toHaveLength(QUIZ_ROUNDS);
    expect(new Set(questions.map((q) => q.piece.id)).size).toBe(QUIZ_ROUNDS);
    for (const q of questions) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options[q.correct]).toBe(q.piece.name);
    }
  });

  it('com poucas cartas não monta nada, e com 4 faz 4 perguntas', () => {
    expect(makeWhoQuestions(pool(3), seededRng(1))).toEqual([]);
    expect(makeWhoQuestions(pool(4), seededRng(1))).toHaveLength(4);
  });

  it('a dificuldade só muda como a silhueta aparece, nunca as perguntas (ver MinigameQuem.vue)', () => {
    expect(WHO_DIFFICULTIES).toEqual(['normal', 'dificil']);
    for (const d of WHO_DIFFICULTIES) expect(WHO_DIFFICULTY_LABELS_PT[d]).toBeTruthy();
  });
});

describe('Duelo de tipos', () => {
  it('a resposta certa é a da tabela da batalha e as opções são diferentes e crescentes', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const questions = makeTypeQuestions(seededRng(seed));
      expect(questions).toHaveLength(TYPE_ROUNDS);
      for (const q of questions) {
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options).size).toBe(4);
        expect([...q.options].sort((a, b) => a - b)).toEqual(q.options);
        expect(q.options[q.correct]).toBe(typeEffectiveness(q.attack, q.defend));
      }
      expect(new Set(questions.map((q) => `${q.attack}>${q.defend.join()}`)).size).toBe(TYPE_ROUNDS);
    }
  });

  it('privilegia perguntas com resultado interessante', () => {
    const all = Array.from({ length: 30 }, (_, i) => makeTypeQuestions(seededRng(i + 1))).flat();
    const interesting = all.filter((q) => q.options[q.correct] !== 1).length;
    expect(interesting / all.length).toBeGreaterThan(0.6);
  });

  it('rotula todos os multiplicadores', () => {
    for (const m of [0, 0.25, 0.5, 1, 2, 4]) expect(multiplierLabel(m)).toContain('×');
  });
});

describe('Memória', () => {
  it('monta pares completos', () => {
    const { tiles, pieces } = makeMemoryBoard(pool(10), seededRng(2));
    expect(pieces).toHaveLength(MEMORY_PAIRS);
    expect(tiles).toHaveLength(MEMORY_PAIRS * 2);
    for (const p of pieces) expect(tiles.filter((t) => t.pieceId === p.id)).toHaveLength(2);
    expect(tiles.map((t) => t.slot)).toEqual(tiles.map((_, i) => i));
  });

  it('usa menos pares quando há poucas cartas e nada com menos de 3', () => {
    expect(makeMemoryBoard(pool(3), seededRng(2)).tiles).toHaveLength(6);
    expect(makeMemoryBoard(pool(2), seededRng(2)).tiles).toEqual([]);
  });
});

describe('pontuação', () => {
  it('quiz: proporção de acertos, vence com 60 % ou mais', () => {
    expect(gradeQuiz(5, 5)).toEqual({ score: 100, won: true });
    expect(gradeQuiz(3, 5)).toEqual({ score: 60, won: true });
    expect(gradeQuiz(2, 5)).toEqual({ score: 40, won: false });
    expect(gradeQuiz(0, 0)).toEqual({ score: 0, won: false });
  });

  it('memória: o mínimo de jogadas dá 100 e cada extra custa 8', () => {
    expect(gradeMemory(6, 6)).toEqual({ score: 100, won: true });
    expect(gradeMemory(10, 6)).toEqual({ score: 68, won: true });
    expect(gradeMemory(14, 6)).toEqual({ score: 36, won: false });
    expect(gradeMemory(60, 6).score).toBe(0);
  });
});
