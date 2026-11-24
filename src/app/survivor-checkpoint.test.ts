import { beforeEach, describe, expect, it } from 'vitest';
import { clearSurvivorCheckpoint, readSurvivorCheckpoint, writeSurvivorCheckpoint } from './survivor-checkpoint';

const checkpoint = {
  version: 1 as const,
  at: 1_700_000_000_000,
  label: 'Pikachu · 3:20 · Nv 7',
  options: {
    dexId: 25, name: 'Pikachu', picked: 'electric', infinite: false, bonk: false, companion: null,
    preparation: 'classica', supportCandidates: [], typeAffinityChoices: ['electric'], fast: false,
    shiny: false, accessory: null, mega: null, swapped: false,
  },
  state: { elapsedMs: 200_000, player: { level: 7 } },
};

describe('checkpoint da Torre', () => {
  beforeEach(() => { localStorage.clear(); });

  it('ida e volta preserva build, tempo e opções', () => {
    expect(writeSurvivorCheckpoint(checkpoint)).toBe(true);
    const loaded = readSurvivorCheckpoint()!;
    expect(loaded.label).toBe(checkpoint.label);
    expect(loaded.options.dexId).toBe(25);
    expect(loaded.state).toEqual(checkpoint.state);
  });

  it('recusa lixo e limpa', () => {
    expect(readSurvivorCheckpoint()).toBeNull();
    localStorage.setItem('tcg-ar-survivor-checkpoint-v1', '{"version":2}');
    expect(readSurvivorCheckpoint()).toBeNull();
    writeSurvivorCheckpoint(checkpoint);
    clearSurvivorCheckpoint();
    expect(readSurvivorCheckpoint()).toBeNull();
  });
});
