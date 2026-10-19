import { describe, expect, it } from 'vitest';
import { ELEMENTAL_BURST_PROFILES, elementalBurstFrame, elementalBurstKinds } from './pin-visual-effects';
import { TERRAIN_KINDS } from './terrain';

describe('efeitos elementais de Pins', () => {
  it('define uma silhueta temática e partículas para cada tipo de terreno', () => {
    expect(elementalBurstKinds()).toEqual(TERRAIN_KINDS);
    for (const kind of TERRAIN_KINDS) {
      const profile = ELEMENTAL_BURST_PROFILES[kind];
      expect(profile.particles).toBeGreaterThanOrEqual(7);
      expect(profile.rings).toBeGreaterThanOrEqual(1);
      expect(profile.shape).toBeTruthy();
    }
    expect(ELEMENTAL_BURST_PROFILES.static.shape).toBe('lightning');
    expect(ELEMENTAL_BURST_PROFILES.puddle.shape).toBe('splash');
    expect(ELEMENTAL_BURST_PROFILES.frost.shape).toBe('ice');
  });

  it('anima o impacto dentro da janela e mantém um quadro discreto com movimento reduzido', () => {
    expect(elementalBurstFrame(0.25, 1)).toEqual({ progress: 0.25, opacity: 0.75 ** 1.4 });
    expect(elementalBurstFrame(0.25, 1, true)).toEqual({ progress: 0.55, opacity: 0.24 });
    expect(elementalBurstFrame(1, 1)).toBeNull();
    expect(elementalBurstFrame(0, 0)).toBeNull();
  });
});
