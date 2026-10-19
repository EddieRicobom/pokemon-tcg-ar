import type { SurvivorState } from './survivor';

export type SurvivorObjectiveId = 'tempo-1m' | 'nivel-5' | 'dois-golpes';

export interface SurvivorObjective {
  id: SurvivorObjectiveId;
  title: string;
  target: number;
  progress: number;
  unit: string;
  complete: boolean;
}

/** Objetivos opcionais de uma corrida: dão direção, mas não alteram dano, XP ou recompensas. */
export function survivorObjectives(state: Pick<SurvivorState, 'elapsedMs' | 'player'>): SurvivorObjective[] {
  const values: readonly [SurvivorObjectiveId, string, number, number, string][] = [
    ['tempo-1m', 'Resista por 1 minuto', 60_000, state.elapsedMs, 's'],
    ['nivel-5', 'Chegue ao nível 5', 5, state.player.level, 'Nv'],
    ['dois-golpes', 'Desbloqueie dois golpes', 1, state.player.secondMove ? 1 : 0, ''],
  ];
  return values.map(([id, title, target, value, unit]) => {
    const progress = Math.min(target, Math.max(0, value));
    return { id, title, target, progress, unit, complete: progress >= target };
  });
}
