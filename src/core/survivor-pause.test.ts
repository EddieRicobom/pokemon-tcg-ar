import { describe, expect, it } from 'vitest';
import { shouldSurvivorAutoPause } from './survivor-pause';
import type { SurvivorAutoPauseFlags } from './survivor-pause';

const flags = (over: Partial<SurvivorAutoPauseFlags> = {}): SurvivorAutoPauseFlags => ({
  hidden: true,
  ready: true,
  over: false,
  paused: false,
  summary: false,
  pendingUpgrade: false,
  leaveConfirm: false,
  evolving: false,
  trainerPresentation: false,
  specialModal: false,
  blackChest: false,
  typeAffinity: false,
  ...over,
});

describe('pausa automática da Torre', () => {
  it('pausa uma corrida ativa quando o app sai da frente', () => {
    expect(shouldSurvivorAutoPause(flags())).toBe(true);
  });

  it('não pausa antes de carregar, depois do fim nem quando já está pausada', () => {
    expect(shouldSurvivorAutoPause(flags({ hidden: false }))).toBe(false);
    expect(shouldSurvivorAutoPause(flags({ ready: false }))).toBe(false);
    expect(shouldSurvivorAutoPause(flags({ over: true }))).toBe(false);
    expect(shouldSurvivorAutoPause(flags({ paused: true }))).toBe(false);
  });

  it('respeita resumo, escolhas, evolução, chefe, baú e afinidade em andamento', () => {
    for (const key of ['summary', 'pendingUpgrade', 'leaveConfirm', 'evolving', 'trainerPresentation', 'specialModal', 'blackChest', 'typeAffinity'] as const) {
      expect(shouldSurvivorAutoPause(flags({ [key]: true })), key).toBe(false);
    }
  });
});
