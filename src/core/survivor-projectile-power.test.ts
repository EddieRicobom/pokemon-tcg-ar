import { describe, expect, it } from 'vitest';
import {
  PROJECTILE_TIER_THRESHOLDS,
  projectileTierScale,
  survivorProjectileLook,
  survivorProjectilePower,
  survivorProjectileTier,
  survivorProjectileTierFromPower,
} from './survivor-projectile-power';

const player = (upgradeLevels: Record<string, number>, stage = 0) => ({ upgradeLevels, stage, pierce: 0, critChance: 0 });

describe('evolução visual dos projéteis', () => {
  it('começa no nível 0 sem cartas', () => {
    expect(survivorProjectilePower(player({}))).toBe(0);
    expect(survivorProjectileTier(player({}))).toBe(0);
  });

  it('soma só cartas de ataque e elemento que servem a projéteis, pesando pela raridade', () => {
    // power: raro (2), pierce: lendário (3), damage-projectile: normal x2 (2).
    expect(survivorProjectilePower(player({ power: 1, pierce: 1, 'damage-projectile': 2 }))).toBe(7);
    // Movimento, defesa e cartas de outra forma de golpe não contam.
    expect(survivorProjectilePower(player({ legs: 3, vigor: 2, 'damage-aura': 2 }))).toBe(0);
    // Ids desconhecidos (corridas antigas) são ignorados.
    expect(survivorProjectilePower(player({ 'id-que-nao-existe': 4 }))).toBe(0);
  });

  it('cada evolução da espécie soma poder', () => {
    expect(survivorProjectilePower(player({}, 2))).toBe(4);
  });

  it('o nível sobe nos limiares e para em 4', () => {
    PROJECTILE_TIER_THRESHOLDS.forEach((min, tier) => {
      expect(survivorProjectileTierFromPower(min)).toBe(tier);
      if (min > 0) expect(survivorProjectileTierFromPower(min - 1)).toBe(tier - 1);
    });
    expect(survivorProjectileTierFromPower(999)).toBe(4);
  });

  it('a aparência mostra perfuração e crítico e cresce com o nível', () => {
    const look = survivorProjectileLook({ upgradeLevels: { pierce: 1 }, stage: 0, pierce: 1, critChance: 0.1 });
    expect(look).toEqual({ tier: 1, piercing: true, critical: true });
    expect(projectileTierScale(4)).toBeGreaterThan(projectileTierScale(0));
    expect(projectileTierScale(0)).toBe(1);
  });
});
