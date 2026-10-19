import type { VillageState } from './life';

export interface ChallengeExhibit {
  achievementId: string;
  title: string;
  source: string;
  origin: string;
}

/** Marcos reais que podem aparecer na vitrine do Museu. */
export const CHALLENGE_EXHIBITS: readonly ChallengeExhibit[] = [
  {
    achievementId: 'liga-insignia', title: 'Credencial da Arena', source: 'Arena Digital · Ginásios',
    origin: 'Conquistada ao vencer um líder de Ginásio.',
  },
  {
    achievementId: 'pins-perfeito', title: 'Troféu da pista', source: 'Mini Pins',
    origin: 'Conquistado ao marcar 100 pontos em uma partida concluída.',
  },
  {
    achievementId: 'torre-chefao', title: 'Troféu da Torre', source: 'Torre de Sobrevivência',
    origin: 'Conquistado ao derrotar o chefão final aos 20 minutos.',
  },
  {
    achievementId: 'torre-mestre', title: 'Faixa de Mestre da Torre', source: 'Torre de Sobrevivência',
    origin: 'Conquistada ao derrotar dez treinadores em corridas concluídas.',
  },
];

/** A sala opcional só abre quando o pedido do pedestal foi entregue de verdade. */
export function challengeGalleryUnlocked(state: Pick<VillageState, 'requests'>): boolean {
  return state.requests.story.some((request) => request.id === 'modo:galeria-desafios' && request.done);
}

/** Não cria exposição por visita: a lista deriva apenas de conquistas já persistidas. */
export function completedChallengeExhibits(achievements: Readonly<Record<string, unknown>>): readonly ChallengeExhibit[] {
  return CHALLENGE_EXHIBITS.filter(({ achievementId }) => Boolean(achievements[achievementId]));
}
