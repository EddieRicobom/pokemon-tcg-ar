import { beforeEach, describe, expect, it } from 'vitest';
import { battleMode, normalizeBattleMode, setBattleMode } from './battle-mode-store';

describe('modo de batalha escolhido', () => {
  beforeEach(() => localStorage.clear());

  it('aceita só modos conhecidos e cai em todos contra todos', () => {
    expect(normalizeBattleMode('equipes')).toBe('equipes');
    expect(normalizeBattleMode('tres')).toBe('tres');
    expect(normalizeBattleMode('royale')).toBe('royale');
    expect(normalizeBattleMode('qualquer')).toBe('royale');
    expect(normalizeBattleMode(null)).toBe('royale');
  });

  it('lembra da escolha', () => {
    setBattleMode('tres');
    expect(battleMode.value).toBe('tres');
    expect(localStorage.getItem('tcg-ar-battle-mode-v1')).toBe('tres');
  });
});
