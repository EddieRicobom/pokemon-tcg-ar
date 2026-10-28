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
    expect(survivorBiomeAt(REGION_DURATION_MS)?.name).toBe('Ventos de Johto');
    expect(survivorBiomeAt(REGION_DURATION_MS * 2)?.name).toBe('Poças de Hoenn');
    expect(survivorBiomeAt(REGION_DURATION_MS * 4)?.name).toBe('Pedras de Unova');
    expect(survivorBiomeAt(REGION_DURATION_MS * 8)?.name).toBe('Olivais de Paldea');
    expect(survivorBiomeZoneAt(0, 100 + 7680, 120 + 5120)?.label).toBe('Folhagem densa');
  });

  it('aplica efeitos distintos sem bloquear a arena', () => {
    expect(survivorBiomeMovementMultiplier(0, 100, 120)).toBe(0.88);
    expect(survivorBiomeProjectileSpeedMultiplier(0, 100, 120)).toBe(0.82);
    expect(survivorBiomeMovementMultiplier(REGION_DURATION_MS * 2, 140, 450)).toBe(0.9);
    expect(survivorBiomeDamageMultiplier(REGION_DURATION_MS * 2, 140, 450, 'electric')).toBe(1.2);
    expect(survivorBiomeDamageMultiplier(REGION_DURATION_MS * 2, 140, 450, 'water')).toBe(1);
    expect(survivorBiomeMovementMultiplier(REGION_DURATION_MS * 3, 120, 120)).toBe(0.76);
    expect(survivorBiomeMovementMultiplier(REGION_DURATION_MS, 100, 320)).toBe(1.05);
    expect(survivorBiomeProjectileSpeedMultiplier(REGION_DURATION_MS, 100, 320)).toBe(1.12);
    expect(survivorBiomeMovementMultiplier(REGION_DURATION_MS * 4, 120, 140)).toBe(0.86);
    expect(survivorBiomeDamageMultiplier(REGION_DURATION_MS * 4, 120, 140, 'rock')).toBe(1.15);
    expect(survivorBiomeDamageMultiplier(REGION_DURATION_MS * 5, 120, 430, 'fairy')).toBe(1.15);
    expect(survivorBiomeMovementMultiplier(REGION_DURATION_MS * 6, 140, 450)).toBe(0.84);
    expect(survivorBiomeProjectileSpeedMultiplier(REGION_DURATION_MS * 6, 140, 450)).toBe(0.88);
    expect(survivorBiomeDamageMultiplier(REGION_DURATION_MS * 7, 120, 140, 'steel')).toBe(1.15);
    expect(survivorBiomeMovementMultiplier(REGION_DURATION_MS * 8, 700, 450)).toBe(1.04);
    expect(survivorBiomeDamageMultiplier(REGION_DURATION_MS * 8, 700, 450, 'grass')).toBe(1.12);
  });
});

