import { SURVIVOR_OBJECTIVE_IDS } from './survivor-objectives';

/** Preparações opcionais da Torre, liberadas apenas por objetivos de corridas concluídas. */
export type SurvivorPreparationId = 'classica' | 'passo-leve' | 'mira-calculada' | 'ima-de-campo' | 'mira-longa';

export interface SurvivorPreparation {
  id: SurvivorPreparationId;
  name: string;
  description: string;
  unlockAtObjectives: number;
  speedMultiplier: number;
  damageMultiplier: number;
  rangeMultiplier: number;
  pickupRadiusMultiplier: number;
}

export const SURVIVOR_PREPARATIONS: readonly SurvivorPreparation[] = [
  {
    id: 'classica', name: 'Clássica', description: 'A preparação equilibrada, sem modificadores.',
    unlockAtObjectives: 0, speedMultiplier: 1, damageMultiplier: 1, rangeMultiplier: 1, pickupRadiusMultiplier: 1,
  },
  {
    id: 'passo-leve', name: 'Passo leve', description: '+8% de velocidade; −8% de dano.',
    unlockAtObjectives: 3, speedMultiplier: 1.08, damageMultiplier: 0.92, rangeMultiplier: 1, pickupRadiusMultiplier: 1,
  },
  {
    id: 'mira-calculada', name: 'Mira calculada', description: '+8% de dano; −8% de velocidade.',
    unlockAtObjectives: 6, speedMultiplier: 0.92, damageMultiplier: 1.08, rangeMultiplier: 1, pickupRadiusMultiplier: 1,
  },
  {
    id: 'ima-de-campo', name: 'Ímã de campo', description: '+20% de alcance para orbes; −8% de dano.',
    unlockAtObjectives: 9, speedMultiplier: 1, damageMultiplier: 0.92, rangeMultiplier: 1, pickupRadiusMultiplier: 1.2,
  },
  {
    id: 'mira-longa', name: 'Mira de longo alcance', description: '+12% de alcance de ataque; −8% de velocidade.',
    unlockAtObjectives: 12, speedMultiplier: 0.92, damageMultiplier: 1, rangeMultiplier: 1.12, pickupRadiusMultiplier: 1,
  },
] as const;

/** Ignora IDs desconhecidos e duplicados, preservando desbloqueios apenas de feitos registrados. */
export function availableSurvivorPreparations(completedObjectives: readonly string[]): readonly SurvivorPreparation[] {
  const knownObjectives = new Set<string>(SURVIVOR_OBJECTIVE_IDS);
  const recognizedObjectives = new Set(completedObjectives.filter((id) => knownObjectives.has(id)));
  return SURVIVOR_PREPARATIONS.filter((preparation) => preparation.unlockAtObjectives <= recognizedObjectives.size);
}

export function survivorPreparation(id: string | undefined): SurvivorPreparation {
  return SURVIVOR_PREPARATIONS.find((preparation) => preparation.id === id) ?? SURVIVOR_PREPARATIONS[0]!;
}
