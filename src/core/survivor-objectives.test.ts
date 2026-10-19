import { describe, expect, it } from 'vitest';
import { createSurvivorState } from './survivor';
import { survivorObjectives, survivorObjectiveSet, survivorRerollLimit, SURVIVOR_OBJECTIVE_DETAILS, SURVIVOR_OBJECTIVE_IDS } from './survivor-objectives';

describe('objetivos opcionais da Torre', () => {
  it('escolhe conjuntos variados e determinísticos sem depender de estado global', () => {
    expect(survivorObjectiveSet(0)).toEqual(survivorObjectiveSet(0));
    expect(survivorObjectiveSet(0)).not.toEqual(survivorObjectiveSet(1));
    expect(survivorObjectiveSet(-1)).toEqual(survivorObjectiveSet(0xffff_ffff));
    expect(SURVIVOR_OBJECTIVE_IDS).toHaveLength(12);
    expect(Object.keys(SURVIVOR_OBJECTIVE_DETAILS)).toHaveLength(SURVIVOR_OBJECTIVE_IDS.length);
    expect(SURVIVOR_OBJECTIVE_DETAILS['tempo-1m'].title).toBe('Resista por 1 minuto');
  });

  it('mede feitos reais do estado da corrida selecionada', () => {
    const state = createSurvivorState(1, { kindCount: 4 });
    expect(survivorObjectives(state).map((o) => o.id)).toEqual(['abates-20', 'tempo-3m', 'onda-3']);
    expect(survivorObjectives(state).map((o) => [o.progress, o.complete])).toEqual([[0, false], [0, false], [1, false]]);
    state.kills = 25;
    state.elapsedMs = 200_000;
    state.wave = 4;
    const objectives = survivorObjectives(state);
    expect(objectives.every((o) => o.complete)).toBe(true);
    expect(objectives.map((o) => o.progress)).toEqual([20, 180_000, 3]);
  });

  it('mede nível e segundo golpe no conjunto legado', () => {
    const state = createSurvivorState(0, { kindCount: 4, player: { level: 8, secondMove: { ...createSurvivorState(4, { kindCount: 1 }).player.move, name: 'Secundário' } } });
    state.elapsedMs = 90_000;
    const objectives = survivorObjectives(state);
    expect(objectives.every((o) => o.complete)).toBe(true);
    expect(objectives[0]?.progress).toBe(60_000);
  });

  it('libera uma segunda troca depois de três desafios distintos reconhecidos', () => {
    expect(survivorRerollLimit([])).toBe(1);
    expect(survivorRerollLimit(['tempo-1m', 'nivel-5', 'inventado'])).toBe(1);
    expect(survivorRerollLimit(['tempo-1m', 'nivel-5', 'tempo-1m'])).toBe(1);
    expect(survivorRerollLimit(['tempo-1m', 'abates-20', 'onda-3'])).toBe(2);
    // Saves antigos que já tinham completado o trio anterior continuam liberados.
    expect(survivorRerollLimit(['tempo-1m', 'nivel-5', 'dois-golpes'])).toBe(2);
  });
});
