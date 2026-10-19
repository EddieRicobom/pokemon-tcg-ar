import { describe, expect, it } from 'vitest';
import { challengeGalleryUnlocked, completedChallengeExhibits } from './challenge-gallery';
import { emptyVillage } from './life';

describe('vitrine opcional de desafios do Museu', () => {
  it('só abre depois da entrega persistente do pedido do pedestal', () => {
    const state = emptyVillage(123, { x: 45, y: 41 });
    expect(challengeGalleryUnlocked(state)).toBe(false);
    state.requests.story.push({ id: 'modo:galeria-desafios', day: '', persistent: true, done: false, kind: 'collect', title: 'Montar o pedestal', detail: '', location: 'Museu da Vila', item: 'pedra', qty: 3, rewardCoins: 0, rewardItem: 'cristal', rewardQty: 0, rewardFriend: 0 });
    expect(challengeGalleryUnlocked(state)).toBe(false);
    state.requests.story[0]!.done = true;
    expect(challengeGalleryUnlocked(state)).toBe(true);
  });

  it('expõe somente marcos de modo efetivamente registrados', () => {
    expect(completedChallengeExhibits({})).toEqual([]);
    expect(completedChallengeExhibits({ 'liga-insignia': '2026-10-19', 'pins-perfeito': '', 'resultado-inventado': true }).map(({ achievementId }) => achievementId)).toEqual(['liga-insignia']);
    expect(completedChallengeExhibits({ 'liga-insignia': '2026-10-19', 'pins-perfeito': '2026-10-19', 'torre-chefao': '2026-10-19' })).toHaveLength(3);
  });
});
