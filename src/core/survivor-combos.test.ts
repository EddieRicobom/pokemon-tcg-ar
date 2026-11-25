import { describe, expect, it } from 'vitest';
import { seededRng } from './battle';
import { createSurvivorState, rollUpgrades } from './survivor';

function offerIds(state: ReturnType<typeof createSurvivorState>): string[] {
  return Array.from({ length: 80 }, (_, seed) =>
    rollUpgrades(seededRng(seed + 1), 5, state.player.move, state.player, { variety: true }).map((option) => option.id),
  ).flat();
}

describe('cartas de combo', () => {
  it('só aparecem quando as duas peças já estão na build', () => {
    const state = createSurvivorState(21, { kindCount: 1 });
    state.player.level = 10;
    expect(offerIds(state)).not.toContain('combo-rhythm');

    state.player.upgradeLevels.power = 1;
    state.player.upgradeLevels.haste = 1;
    const offered = Array.from({ length: 80 }, (_, seed) =>
      rollUpgrades(seededRng(seed + 1), 5, state.player.move, state.player, { variety: true }),
    ).flat();
    expect(offered.map((option) => option.id)).toContain('combo-rhythm');
    expect(offered.find((option) => option.id === 'combo-rhythm')?.synergy).toEqual(['power', 'haste']);
  });

  it('mantém cada combo limitado a uma escolha', () => {
    const state = createSurvivorState(22, { kindCount: 1 });
    state.player.level = 10;
    state.player.upgradeLevels['guard-physical'] = 2;
    state.player.upgradeLevels['guard-special'] = 2;
    state.player.upgradeLevels['combo-bastion'] = 1;
    expect(offerIds(state)).not.toContain('combo-bastion');
  });
});
