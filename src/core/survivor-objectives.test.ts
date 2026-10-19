import { describe, expect, it } from 'vitest';
import { createSurvivorState } from './survivor';
import { survivorObjectives, survivorRerollLimit } from './survivor-objectives';

describe('objetivos opcionais da Torre', () => {
  it('começa zerado e não muda as regras da corrida', () => {
    const state = createSurvivorState(3, { kindCount: 4 });
    expect(survivorObjectives(state).map((o) => [o.id, o.progress, o.complete])).toEqual([
      ['tempo-1m', 0, false],
      ['nivel-5', 1, false],
      ['dois-golpes', 0, false],
    ]);
  });

  it('limita o progresso ao alvo e reconhece o segundo golpe', () => {
    const state = createSurvivorState(3, { kindCount: 4, player: { level: 8, secondMove: { ...createSurvivorState(4, { kindCount: 1 }).player.move, name: 'Secundário' } } });
    state.elapsedMs = 90_000;
    const objectives = survivorObjectives(state);
    expect(objectives.every((o) => o.complete)).toBe(true);
    expect(objectives[0]?.progress).toBe(60_000);
  });

  it('libera uma segunda troca só depois de registrar os três desafios concluídos', () => {
    expect(survivorRerollLimit([])).toBe(1);
    expect(survivorRerollLimit(['tempo-1m', 'nivel-5', 'inventado'])).toBe(1);
    expect(survivorRerollLimit(['tempo-1m', 'nivel-5', 'dois-golpes', 'tempo-1m'])).toBe(2);
  });
});
