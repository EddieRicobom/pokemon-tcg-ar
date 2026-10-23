import { describe, expect, it } from 'vitest';
import { createSurvivorState, STUN_COOLDOWN_MS, stepSurvivor } from './survivor';
import type { SurvivorEnemy } from './survivor';
import { attackProfile, moveFor } from './survivor-moves';
import type { MoveCategory } from './survivor-moves';
import type { PokemonType } from './pokemon-data';

function as(type: PokemonType, category: MoveCategory) {
  const move = { ...moveFor([type], null), category, estimated: false };
  return { move, profile: attackProfile(move, null) };
}

/** Golpe de Terra em área (Tremor): atordoa a cada acerto e ataca com recarga curta. */
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

describe('recarga de atordoamento', () => {
  it('um inimigo não é atordoado de novo antes de 5 s, mesmo com golpes de área acertando sem parar', () => {
    const { s, target } = tremorRun(61);
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(target.stunMs).toBeGreaterThan(0);
    expect(target.stunCooldownMs).toBe(STUN_COOLDOWN_MS);

    let starts = 0;
    let previous = target.stunMs ?? 0;
    for (let t = 0; t < 4_500; t += 50) {
      stepSurvivor(s, { dx: 0, dy: 0 }, 50);
      const now = target.stunMs ?? 0;
      if (now > 0 && previous <= 0) starts++;
      previous = now;
    }
    expect(target.hp).toBeLessThan(1_000_000);
    expect(starts).toBe(0);
  });

  it('volta a ser atordoado depois que a recarga de 5 s termina', () => {
    const { s, target } = tremorRun(62);
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);

    let starts = 0;
    let previous = target.stunMs ?? 0;
    for (let t = 0; t < 5_500; t += 50) {
      stepSurvivor(s, { dx: 0, dy: 0 }, 50);
      const now = target.stunMs ?? 0;
      if (now > 0 && previous <= 0) starts++;
      previous = now;
    }
    expect(starts).toBe(1);
  });
});
