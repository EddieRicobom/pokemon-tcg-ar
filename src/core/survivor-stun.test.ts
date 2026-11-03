import { describe, expect, it } from 'vitest';
import { createSurvivorState, stepSurvivor } from './survivor';
import type { SurvivorEnemy } from './survivor';
import { attackProfile, moveFor } from './survivor-moves';
import type { MoveCategory } from './survivor-moves';
import type { PokemonType } from './pokemon-data';

function as(type: PokemonType, category: MoveCategory) {
  const move = { ...moveFor([type], null), category, estimated: false };
  return { move, profile: attackProfile(move, null) };
}

/** Golpe de Terra em Ã¡rea (Tremor): atordoa a cada acerto e ataca com recarga curta. */
function tremorRun(seed: number) {
  const tremor = as('ground', 'area');
  const s = createSurvivorState(seed, { kindCount: 1, move: tremor.move, profile: tremor.profile });
  s.nextBossAtMs = Number.POSITIVE_INFINITY;
  s.spawnAccumMs = -1e9;
  s.player.attackCooldownMs = 240;
  s.player.attackTimerMs = 0;
  s.player.attackRadius = 100;
  s.player.attackRange = 170;
  const target: SurvivorEnemy = {
    id: 1, kind: 0, boss: false, grade: 'comum', x: s.player.x + 20, y: s.player.y,
    hp: 1_000_000, maxHp: 1_000_000, speed: 0, damage: 0, radius: 13, hitFlashMs: 0,
  };
  s.enemies.push(target);
  return { s, target };
}

describe('terreno de Terra', () => {
  it('pulsa três vezes, fere inimigos próximos e desaparece sem atordoar', () => {
    const { s, target } = tremorRun(61);
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(s.elementalTerrain).toHaveLength(1);
    expect(target.stunMs ?? 0).toBe(0);
    s.player.attackTimerMs = 1e9;
    const hp = target.hp;
    stepSurvivor(s, { dx: 0, dy: 0 }, 1);
    expect(target.hp).toBeLessThan(hp);
    expect(s.elementalTerrain[0]?.ticksLeft).toBe(2);
    stepSurvivor(s, { dx: 0, dy: 0 }, 420);
    expect(s.elementalTerrain[0]?.ticksLeft).toBe(1);
    stepSurvivor(s, { dx: 0, dy: 0 }, 420);
    expect(s.elementalTerrain).toHaveLength(0);
  });

  it('limita o número de marcas criadas por ataques repetidos', () => {
    const { s } = tremorRun(62);
    for (let t = 0; t < 20000; t += 50) stepSurvivor(s, { dx: 0, dy: 0 }, 50);
    expect(s.elementalTerrain.length).toBeLessThanOrEqual(48);
  });
});
