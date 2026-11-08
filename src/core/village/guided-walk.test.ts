import { describe, expect, it } from 'vitest';
import { GUIDED_WALK_FRIENDSHIP, guidedWalkArrived, guidedWalkProgress, rewardGuidedWalk } from './guided-walk';
import { emptyVillage, friendOf } from './life';

const destination = { x: 10, y: 10 };

describe('passeio guiado', () => {
  it('rende amizade só no primeiro passeio do dia com cada morador', () => {
    const state = emptyVillage(1, { x: 0, y: 0 });
    expect(rewardGuidedWalk(state, 'a', '2026-11-08')).toBe(GUIDED_WALK_FRIENDSHIP);
    expect(rewardGuidedWalk(state, 'a', '2026-11-08')).toBeNull();
    expect(friendOf(state, 'a').points).toBe(GUIDED_WALK_FRIENDSHIP);
    expect(rewardGuidedWalk(state, 'b', '2026-11-08')).toBe(GUIDED_WALK_FRIENDSHIP);
    expect(rewardGuidedWalk(state, 'a', '2026-11-09')).toBe(GUIDED_WALK_FRIENDSHIP);
  });

  it('só conclui quando jogador e companheiro chegam ao destino', () => {
    const player = { x: 10, y: 10, t: 1 };
    expect(guidedWalkArrived(player, undefined, destination)).toBe(false);
    expect(guidedWalkArrived(player, { x: 14, y: 10, t: 1 }, destination)).toBe(false);
    expect(guidedWalkArrived(player, { x: 11, y: 10, t: 1 }, destination)).toBe(true);
  });

  it('expõe distâncias úteis para a interface sem alterar o estado', () => {
    expect(guidedWalkProgress({ x: 7, y: 8, t: 1 }, { x: 13, y: 10, t: 1 }, destination)).toEqual({
      playerDistance: 5, companionDistance: 3, arrived: false,
    });
  });
});
