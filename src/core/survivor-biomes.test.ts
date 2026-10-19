import { describe, expect, it } from 'vitest';
import {
  survivorBiomeAt,
  survivorBiomeDamageMultiplier,
  survivorBiomeMovementMultiplier,
  survivorBiomeProjectileSpeedMultiplier,
  survivorBiomeZoneAt,
} from './survivor-biomes';
import { REGION_DURATION_MS } from './survivor-regions';

describe('biomas mecânicos da Torre', () => {
  it('mantém zonas determinísticas e antecipa a região atual', () => {
    expect(survivorBiomeAt(0)?.name).toBe('Bosques de Kanto');
    expect(survivorBiomeZoneAt(0, 100, 120)?.label).toBe('Folhagem densa');
    expect(survivorBiomeZoneAt(0, 480, 320)).toBeNull();
    expect(survivorBiomeAt(REGION_DURATION_MS)).toBeNull();
    expect(survivorBiomeAt(REGION_DURATION_MS * 2)?.name).toBe('Poças de Hoenn');
  });

  it('aplica efeitos distintos sem bloquear a arena', () => {
    expect(survivorBiomeMovementMultiplier(0, 100, 120)).toBe(0.88);
    expect(survivorBiomeProjectileSpeedMultiplier(0, 100, 120)).toBe(0.82);
    expect(survivorBiomeMovementMultiplier(REGION_DURATION_MS * 2, 140, 450)).toBe(0.9);
    expect(survivorBiomeDamageMultiplier(REGION_DURATION_MS * 2, 140, 450, 'electric')).toBe(1.2);
    expect(survivorBiomeDamageMultiplier(REGION_DURATION_MS * 2, 140, 450, 'water')).toBe(1);
    expect(survivorBiomeMovementMultiplier(REGION_DURATION_MS * 3, 120, 120)).toBe(0.76);
  });
});

