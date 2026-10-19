import type { SurvivorState } from './survivor';

export type SurvivorObjectiveId =
  | 'tempo-1m' | 'nivel-5' | 'dois-golpes'
  | 'abates-20' | 'tempo-3m' | 'onda-3'
  | 'treinador-1' | 'onda-5' | 'nivel-7'
  | 'abates-50' | 'treinador-3' | 'sobrevive-5m';

const OBJECTIVE_SETS: readonly (readonly SurvivorObjectiveId[])[] = [
  ['tempo-1m', 'nivel-5', 'dois-golpes'],
  ['abates-20', 'tempo-3m', 'onda-3'],
  ['treinador-1', 'onda-5', 'nivel-7'],
  ['abates-50', 'treinador-3', 'sobrevive-5m'],
];

export const SURVIVOR_OBJECTIVE_IDS: readonly SurvivorObjectiveId[] = [...new Set(OBJECTIVE_SETS.flat())];

/** Cada corrida recebe um conjunto fixo pela semente real, sem consumir o RNG de combate. */
export function survivorObjectiveSet(runSeed: number): readonly SurvivorObjectiveId[] {
  const seed = Math.floor(runSeed) >>> 0;
  return OBJECTIVE_SETS[seed % OBJECTIVE_SETS.length] ?? OBJECTIVE_SETS[0]!;
}

/** Uma troca grátis é padrão; três desafios distintos registrados liberam mais uma troca. */
export function survivorRerollLimit(completedObjectives: readonly string[]): number {
  const completed = new Set(completedObjectives.filter((id): id is SurvivorObjectiveId => SURVIVOR_OBJECTIVE_IDS.includes(id as SurvivorObjectiveId)));
  return completed.size >= 3 ? 2 : 1;
}

export interface SurvivorObjective {
  id: SurvivorObjectiveId;
  title: string;
  target: number;
  progress: number;
  unit: string;
  complete: boolean;
}

const OBJECTIVE_DETAILS: Record<SurvivorObjectiveId, { title: string; target: number; unit: string }> = {
  'tempo-1m': { title: 'Resista por 1 minuto', target: 60_000, unit: 's' },
  'nivel-5': { title: 'Chegue ao nível 5', target: 5, unit: 'Nv' },
  'dois-golpes': { title: 'Desbloqueie dois golpes', target: 1, unit: '' },
  'abates-20': { title: 'Derrote 20 Pokémon', target: 20, unit: '' },
  'tempo-3m': { title: 'Resista por 3 minutos', target: 180_000, unit: 's' },
  'onda-3': { title: 'Alcance a onda 3', target: 3, unit: '' },
  'treinador-1': { title: 'Derrote um treinador', target: 1, unit: '' },
  'onda-5': { title: 'Alcance a onda 5', target: 5, unit: '' },
  'nivel-7': { title: 'Chegue ao nível 7', target: 7, unit: 'Nv' },
  'abates-50': { title: 'Derrote 50 Pokémon', target: 50, unit: '' },
  'treinador-3': { title: 'Derrote 3 treinadores', target: 3, unit: '' },
  'sobrevive-5m': { title: 'Resista por 5 minutos', target: 300_000, unit: 's' },
};

/** Objetivos opcionais medem apenas feitos reais e não alteram atributos nem recompensas da corrida. */
export function survivorObjectives(state: Pick<SurvivorState, 'runSeed' | 'elapsedMs' | 'player' | 'kills' | 'wave' | 'trainersBeaten'>): SurvivorObjective[] {
  const values: Record<SurvivorObjectiveId, number> = {
    'tempo-1m': state.elapsedMs, 'nivel-5': state.player.level, 'dois-golpes': state.player.secondMove ? 1 : 0,
    'abates-20': state.kills, 'tempo-3m': state.elapsedMs, 'onda-3': state.wave,
    'treinador-1': state.trainersBeaten, 'onda-5': state.wave, 'nivel-7': state.player.level,
    'abates-50': state.kills, 'treinador-3': state.trainersBeaten, 'sobrevive-5m': state.elapsedMs,
  };
  return survivorObjectiveSet(state.runSeed).map((id) => {
    const detail = OBJECTIVE_DETAILS[id];
    const progress = Math.min(detail.target, Math.max(0, values[id]));
    return { id, ...detail, progress, complete: progress >= detail.target };
  });
}
