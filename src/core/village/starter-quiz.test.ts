import { describe, expect, it } from 'vitest';
import { ALL_QUESTIONS, ERA_QUESTION, FONTE_POOL, GEN_STARTERS, isComplete, nextForm, PERSONALITY_QUESTIONS, resolveGen, resolveStarter, scoreTrack } from './starter-quiz';
import type { QuizAnswers } from './starter-quiz';

const answerAll = (track: 'planta' | 'fogo' | 'agua', gen: number): QuizAnswers => {
  const out: QuizAnswers = {};
  for (const q of PERSONALITY_QUESTIONS) out[q.id] = q.options.find((o) => o.track === track)!.id;
  out[ERA_QUESTION.id] = ERA_QUESTION.options.find((o) => o.gen === gen)!.id;
  return out;
};

describe('questionário do inicial', () => {
  it('tem 9 gerações, cada uma com os 3 iniciais reais (dexId > 0, distintos)', () => {
    expect(Object.keys(GEN_STARTERS)).toHaveLength(9);
    for (const gen of Object.values(GEN_STARTERS)) {
      const ids = [gen.planta, gen.fogo, gen.agua];
      expect(new Set(ids).size).toBe(3);
      for (const id of ids) expect(id).toBeGreaterThan(0);
    }
  });

  it('isComplete exige resposta pra todas as perguntas (5 de personalidade + 1 de era)', () => {
    expect(ALL_QUESTIONS).toHaveLength(6);
    expect(isComplete({})).toBe(false);
    expect(isComplete(answerAll('fogo', 1))).toBe(true);
  });

  it('respostas consistentes num tipo pontuam esse tipo (sem empate)', () => {
    expect(scoreTrack(answerAll('planta', 1))).toBe('planta');
    expect(scoreTrack(answerAll('fogo', 1))).toBe('fogo');
    expect(scoreTrack(answerAll('agua', 1))).toBe('agua');
  });

  it('desempate é fixo e documentado: Fogo > Água > Planta', () => {
    // 2 respostas de água e 2 de fogo (empate) + 1 de planta: fogo deve vencer.
    const a: QuizAnswers = {
      desafio: PERSONALITY_QUESTIONS[0]!.options.find((o) => o.track === 'fogo')!.id,
      curiosidade: PERSONALITY_QUESTIONS[1]!.options.find((o) => o.track === 'fogo')!.id,
      amigos: PERSONALITY_QUESTIONS[2]!.options.find((o) => o.track === 'agua')!.id,
      inesperado: PERSONALITY_QUESTIONS[3]!.options.find((o) => o.track === 'agua')!.id,
      parceiro: PERSONALITY_QUESTIONS[4]!.options.find((o) => o.track === 'planta')!.id,
      era: ERA_QUESTION.options[0]!.id,
    };
    expect(scoreTrack(a)).toBe('fogo');
  });

  it('a pergunta de era escolhe a geração; sem resposta válida cai na 1', () => {
    expect(resolveGen(answerAll('fogo', 7))).toBe(7);
    expect(resolveGen({})).toBe(1);
  });

  it('resolveStarter sempre devolve um dos 27 iniciais reais', () => {
    for (let gen = 1; gen <= 9; gen++) {
      for (const track of ['planta', 'fogo', 'agua'] as const) {
        const r = resolveStarter(answerAll(track, gen));
        expect(r).toEqual({ gen, track, dexId: GEN_STARTERS[gen]![track] });
      }
    }
  });

  it('nenhuma pergunta de personalidade tem todas as opções apontando pro mesmo tipo', () => {
    for (const q of PERSONALITY_QUESTIONS) {
      const tracks = new Set(q.options.map((o) => o.track));
      expect(tracks.size).toBe(3);
    }
  });
});

describe('evolução dos iniciais (universo fechado de 27 espécies)', () => {
  it('FONTE_POOL tem as 27 formas base, sem repetir', () => {
    expect(new Set(FONTE_POOL).size).toBe(27);
  });

  it('cada forma base evolui pra uma forma 2 real, e a forma 2 pra uma forma 3 real', () => {
    for (const dexId of FONTE_POOL) {
      const stage2 = nextForm(dexId);
      expect(stage2).not.toBeNull();
      expect(nextForm(stage2!)).not.toBeNull();
    }
  });

  it('a forma final não evolui, e um dexId fora do universo dos iniciais devolve null', () => {
    const final = nextForm(nextForm(FONTE_POOL[0]!)!)!;
    expect(nextForm(final)).toBeNull();
    expect(nextForm(25)).toBeNull();
  });
});
