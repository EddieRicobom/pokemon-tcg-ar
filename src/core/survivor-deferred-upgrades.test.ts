import { describe, expect, it } from 'vitest';
import {
  applyUpgrade, createSurvivorState, deferSurvivorUpgrade, resolveBlackChest, resumeSurvivorUpgrade, stepSurvivor, xpForLevel,
} from './survivor';
import { HELD_OFFER_PREFIX } from './survivor-held';
import { attackProfile, moveFor } from './survivor-moves';
import type { SurvivorState } from './survivor-types';

const idle = { dx: 0, dy: 0 };

function gainLevel(state: SurvivorState): void {
  state.player.xp = state.player.xpToNext;
  stepSurvivor(state, idle, 16);
}

describe('melhorias guardadas do Survival', () => {
  it('deixa o combate avançar, preserva as cartas e enfileira os níveis seguintes', () => {
    const state = createSurvivorState(8, { kindCount: 1 });
    gainLevel(state);
    const original = state.pendingUpgrade!;
    expect(deferSurvivorUpgrade(state)).toBe(true);
    expect(state.pendingUpgrade).toBeNull();
    expect(deferSurvivorUpgrade(state)).toBe(false);

    const elapsed = state.elapsedMs;
    gainLevel(state);
    expect(state.elapsedMs).toBeGreaterThan(elapsed);
    expect(state.player.level).toBe(3);
    expect(state.pendingUpgrade).toBeNull();
    expect(state.upgradesOwed).toBe(1);

    expect(resumeSurvivorUpgrade(state)).toBe(true);
    expect(state.pendingUpgrade).toBe(original);
    expect(state.deferredUpgrade).toBeNull();
    applyUpgrade(state, original[0]!.id);
    expect(state.pendingUpgrade).not.toBe(original);
    expect(state.pendingUpgrade).not.toBeNull();
    expect(state.upgradesOwed).toBe(0);
    applyUpgrade(state, state.pendingUpgrade![0]!.id);
    expect(state.pendingUpgrade).toBeNull();
  });

  it.each(['regular', 'black'] as const)('preserva o apoio garantido ao abrir um baú %s', (kind) => {
    const move = moveFor(['electric'], null);
    const support = { dexId: 25, name: 'Pikachu', move, profile: attackProfile(move, null) };
    const state = createSurvivorState(9, { kindCount: 1, supportCandidates: [support] });
    state.player.level = 5;
    state.player.xpToNext = xpForLevel(5);
    gainLevel(state);
    expect(state.pendingUpgrade?.some((option) => option.id === 'second-attack')).toBe(true);
    expect(deferSurvivorUpgrade(state)).toBe(true);

    state.keys = 1;
    state.chests = [{ id: 101, x: state.player.x, y: state.player.y, ...(kind === 'black' ? { kind } : {}) }];
    stepSurvivor(state, idle, 16);
    if (kind === 'black') {
      expect(state.pendingBlackChest).toBe(101);
      expect(resumeSurvivorUpgrade(state)).toBe(false);
      resolveBlackChest(state, true);
      expect(state.blackChestCurses).toBe(1);
      expect(state.keys).toBe(1);
    } else expect(state.keys).toBe(0);

    const item = state.pendingUpgrade?.[0];
    expect(item?.id.startsWith(HELD_OFFER_PREFIX)).toBe(true);
    expect(resumeSurvivorUpgrade(state)).toBe(false);
    expect(deferSurvivorUpgrade(state)).toBe(false);
    expect(applyUpgrade(state, item!.id).some((event) => event.type === 'heldItem')).toBe(true);
    expect(state.pendingUpgrade).toBeNull();

    expect(resumeSurvivorUpgrade(state)).toBe(true);
    expect(state.supportCandidate).toBe(support);
    expect(state.supportCandidateGuaranteed).toBe(true);
    applyUpgrade(state, 'second-attack');
    expect(state.supports[0]?.dexId).toBe(support.dexId);
  });

  it.each([false, true])('entrega o nível ganho no quadro do baú negro após resolver o baú (%s)', (accept) => {
    const state = createSurvivorState(12, { kindCount: 1 });
    state.chests = [{ id: 102, x: state.player.x, y: state.player.y, kind: 'black' }];
    gainLevel(state);
    expect(state.pendingBlackChest).toBe(102);
    expect(state.player.level).toBe(2);
    expect(state.upgradesOwed).toBe(1);
    expect(state.pendingUpgrade).toBeNull();

    resolveBlackChest(state, accept);
    if (accept) applyUpgrade(state, state.pendingUpgrade![0]!.id);
    else stepSurvivor(state, idle, 16);
    expect(state.pendingBlackChest).toBeNull();
    expect(state.upgradesOwed).toBe(0);
    expect(state.pendingUpgrade?.length).toBeGreaterThan(0);
    expect(state.pendingUpgrade?.some((option) => option.id.startsWith(HELD_OFFER_PREFIX))).toBe(false);
  });

  it('aguarda encontros obrigatórios e não reabre uma melhoria com a corrida encerrada', () => {
    const state = createSurvivorState(10, { kindCount: 1 });
    gainLevel(state);
    expect(deferSurvivorUpgrade(state)).toBe(true);
    state.special.phase = 'choice';
    expect(resumeSurvivorUpgrade(state)).toBe(false);
    state.special.phase = 'branch-arrival';
    expect(resumeSurvivorUpgrade(state)).toBe(false);
    state.special.phase = 'ready';
    state.shadowEncounter.phase = 'arrival';
    expect(resumeSurvivorUpgrade(state)).toBe(false);
    state.shadowEncounter.phase = 'battle';

    state.player.hp = 0;
    expect(stepSurvivor(state, idle, 16).some((event) => event.type === 'gameover')).toBe(true);
    expect(resumeSurvivorUpgrade(state)).toBe(false);
    expect(state.pendingUpgrade).toBeNull();
  });

  it('mantém a evolução escolhível sem evoluir antes de confirmar', () => {
    const state = createSurvivorState(11, {
      kindCount: 1,
      dexId: 1,
      evolutions: (dexId) => dexId === 1 ? [{ dexId: 2, name: 'Ivysaur' }] : [],
    });
    state.player.level = 7;
    state.player.xpToNext = xpForLevel(7);
    gainLevel(state);
    expect(state.pendingUpgrade?.some((option) => option.id === 'evolve:2')).toBe(true);
    expect(deferSurvivorUpgrade(state)).toBe(true);
    gainLevel(state);
    expect(state.player.dexId).toBe(1);
    expect(resumeSurvivorUpgrade(state)).toBe(true);
    expect(applyUpgrade(state, 'evolve:2')).toContainEqual({ type: 'evolve', dexId: 2, name: 'Ivysaur' });
    expect(state.player.dexId).toBe(2);
  });
});
