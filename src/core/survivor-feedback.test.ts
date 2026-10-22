import { describe, expect, it } from 'vitest';
import { BASIC_MOVE, createSurvivorState } from './survivor';
import { attackProfile } from './survivor-moves';
import { decodeSurvivorFeedback, encodeSurvivorFeedback } from './survivor-feedback';
import type { SurvivorFeedbackInput } from './survivor-feedback';

describe('feedback da corrida de Survival', () => {
  it('codifica e decodifica métricas, build e opinião sem perder acentos', () => {
    const state = createSurvivorState(1234, { kindCount: 12, move: BASIC_MOVE, profile: attackProfile(BASIC_MOVE, null) });
    state.player.upgradeLevels.power = 1;
    const input: SurvivorFeedbackInput = {
      runId: 'run-abc', seed: 1234, participant: { id: 'carta-1', name: 'Pokémon Ágil', dexId: 25 },
      summary: { survivedMs: 180000, level: 8, stage: 1, kills: 42, wave: 7, trainersBeaten: 1, bossesBeaten: 0, finalBossBeaten: false, infinite: false, digitalPokeballs: 0 },
      move: { type: 'normal', category: 'projetil', effect: 'nenhum' }, preparation: 'classica', state,
      answers: { fun: 5, difficulty: 3, clarity: 4, fairness: 4, replay: 5, comment: 'Gostei muito da pressão no final!' },
    };
    const code = encodeSurvivorFeedback(input);
    const decoded = decodeSurvivorFeedback(code);
    expect(code.startsWith('SVF1.')).toBe(true);
    expect(decoded?.p.n).toBe('Pokémon Ágil');
    expect(decoded?.q).toEqual([5, 3, 4, 4, 5]);
    expect(decoded?.build.up).toContain('power');
    expect(decoded?.s.k).toBe(42);
  });

  it('recusa prefixo, payload corrompido e versão desconhecida', () => {
    expect(decodeSurvivorFeedback('qualquer coisa')).toBeNull();
    expect(decodeSurvivorFeedback('SVF1.inválido')).toBeNull();
    expect(decodeSurvivorFeedback('SVF9.eyJ2Ijo5fQ')).toBeNull();
  });
});

