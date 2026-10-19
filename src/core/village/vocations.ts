import type { PokemonType } from '../pokemon-data';

/** Atividades que os moradores podem escolher sem comando do treinador. */
export const VILLAGE_ACTIVITIES = [
  'agricultura', 'pesca', 'mineracao', 'madeireira', 'culinaria', 'manutencao', 'construcao', 'transporte', 'exploracao',
  'pesquisa', 'jardinagem', 'vigilancia', 'comercio', 'protecao', 'conservacao', 'reciclagem',
  'acolhimento', 'brincadeira', 'descanso',
] as const;

export type VillageActivity = (typeof VILLAGE_ACTIVITIES)[number];

/** Afinidades iniciais: todas afetam a pontuação das atividades disponíveis. */
export const TYPE_AFFINITIES: Readonly<Record<PokemonType, readonly VillageActivity[]>> = {
  grass: ['agricultura', 'madeireira', 'jardinagem'],
  water: ['agricultura', 'pesca', 'conservacao'],
  fire: ['culinaria', 'manutencao', 'construcao'],
  electric: ['manutencao', 'pesquisa', 'transporte'],
  rock: ['mineracao', 'construcao', 'manutencao'],
  ground: ['mineracao', 'agricultura', 'construcao'],
  steel: ['mineracao', 'construcao', 'manutencao'],
  fighting: ['madeireira', 'transporte', 'construcao'],
  flying: ['transporte', 'exploracao', 'vigilancia'],
  psychic: ['pesquisa', 'acolhimento', 'exploracao'],
  fairy: ['jardinagem', 'acolhimento', 'brincadeira'],
  ghost: ['vigilancia', 'exploracao', 'pesquisa'],
  dark: ['comercio', 'protecao', 'exploracao'],
  dragon: ['protecao', 'exploracao', 'transporte'],
  ice: ['conservacao', 'pesquisa', 'pesca'],
  bug: ['jardinagem', 'agricultura', 'reciclagem'],
  poison: ['reciclagem', 'pesquisa', 'manutencao'],
  normal: ['agricultura', 'comercio', 'culinaria', 'transporte'],
};

export interface ActivityNeed {
  activity: VillageActivity;
  urgency: number;
}

export interface ActivityContext {
  available: readonly VillageActivity[];
  types: readonly PokemonType[];
  interests: readonly VillageActivity[];
  energy: number;
  socialOpportunity: number;
  communityNeeds?: readonly ActivityNeed[];
  recentActivity?: VillageActivity;
  rememberedActivity?: VillageActivity;
}

export interface ActivityChoice {
  activity: VillageActivity;
  score: number;
  reason: 'interesse' | 'aptidao' | 'necessidade' | 'relacao' | 'descanso' | 'curiosidade';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

/** Pontuação pura e configurável. Aptidões de dois tipos combinam, com bônus total limitado a 4. */
export function scoreActivity(context: ActivityContext, activity: VillageActivity): ActivityChoice {
  let score = 0;
  let reason: ActivityChoice['reason'] = 'curiosidade';
  const affinityCount = context.types.reduce((count, type) => count + (TYPE_AFFINITIES[type].includes(activity) ? 1 : 0), 0);
  if (affinityCount > 0) {
    score += 3 + Math.min(1, affinityCount - 1);
    reason = 'aptidao';
  }
  if (context.interests.includes(activity)) {
    score += 4;
    reason = 'interesse';
  }
  const need = context.communityNeeds?.find((entry) => entry.activity === activity);
  if (need) {
    score += clamp(need.urgency, 0, 5);
    reason = 'necessidade';
  }
  if (activity === 'acolhimento' || activity === 'brincadeira') {
    score += clamp(context.socialOpportunity, 0, 4);
    if (context.socialOpportunity > 0) reason = 'relacao';
  }
  if (activity === 'descanso') {
    score += clamp((55 - context.energy) / 8, 0, 7);
    if (context.energy < 45) reason = 'descanso';
  } else {
    score -= clamp((35 - context.energy) / 5, 0, 6);
  }
  if (activity === context.rememberedActivity) score += 1.5;
  if (activity === context.recentActivity) score -= 2.5;
  return { activity, score, reason };
}

/** Escolhe uma ação disponível; o RNG entra só no desempate e pode ser semeado por ID e ciclo. */
export function chooseActivity(context: ActivityContext, rng: () => number): ActivityChoice {
  const unique = [...new Set(context.available)];
  if (unique.length === 0) return { activity: 'descanso', score: 0, reason: 'descanso' };
  const selected = unique
    .map((activity) => ({ ...scoreActivity(context, activity), tie: clamp(rng(), 0, 0.999999) }))
    .sort((a, b) => (b.score - a.score) || (b.tie - a.tie) || a.activity.localeCompare(b.activity))[0]!;
  return { activity: selected.activity, score: selected.score, reason: selected.reason };
}
