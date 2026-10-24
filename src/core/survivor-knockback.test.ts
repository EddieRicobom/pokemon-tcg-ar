import { describe, expect, it } from 'vitest';
import { createSurvivorState, KNOCKBACK_COOLDOWN_MS, stepSurvivor } from './survivor';
import type { SurvivorEnemy } from './survivor';
import { attackProfile, moveFor } from './survivor-moves';
import type { MoveCategory } from './survivor-moves';
import type { PokemonType } from './pokemon-data';

function as(type: PokemonType, category: MoveCategory) {
  const move = { ...moveFor([type], null), category, estimated: false };
  return { move, profile: attackProfile(move, null) };
}

/** Jato de Água (projétil que empurra): acerta o alvo parado a cada 240 ms, sem matar nem deixar o alvo andar. */
function pushRun(seed: number, boss = false) {
  const jet = as('water', 'projetil');
  const s = createSurvivorState(seed, { kindCount: 1, move: jet.move, profile: jet.profile });
  s.nextBossAtMs = Number.POSITIVE_INFINITY;
  s.spawnAccumMs = -1e9;
  s.player.attackCooldownMs = 240;
  s.player.attackTimerMs = 0;
  s.player.attackRadius = 400;
  s.player.attackRange = 400;
  const target: SurvivorEnemy = {
    id: 1, kind: 0, boss, grade: 'comum', x: s.player.x + 120, y: s.player.y,
    hp: 1_000_000, maxHp: 1_000_000, speed: 0, damage: 0, radius: 13, hitFlashMs: 0,
  };
  s.enemies.push(target);
  return { s, target };
}

/** Anda o jogo até o primeiro empurrão e devolve onde o inimigo parou (falha se o jato nunca o empurrar). */
function untilPushed(s: ReturnType<typeof pushRun>['s'], target: SurvivorEnemy): number {
  const startX = target.x;
  for (let t = 0; t < 3_000 && target.x === startX; t += 16) stepSurvivor(s, { dx: 0, dy: 0 }, 16);
  return target.x;
}

describe('recarga de empurrão dos inimigos', () => {
  it('um inimigo é empurrado uma vez e não de novo antes de 5 s, mesmo com golpes acertando sem parar', () => {
    const { s, target } = pushRun(71);
    const startX = target.x;
    const pushedX = untilPushed(s, target);
    expect(pushedX).toBeGreaterThan(startX);
    expect(target.knockbackCooldownMs).toBeGreaterThan(KNOCKBACK_COOLDOWN_MS - 100);
    for (let t = 0; t < 4_500; t += 50) stepSurvivor(s, { dx: 0, dy: 0 }, 50);
    expect(target.hp).toBeLessThan(1_000_000);
    expect(target.x).toBe(pushedX);
  });

  it('volta a ser empurrado quando a recarga de 5 s termina', () => {
    const { s, target } = pushRun(72);
    const pushedX = untilPushed(s, target);
    for (let t = 0; t < 5_500; t += 50) stepSurvivor(s, { dx: 0, dy: 0 }, 50);
    expect(target.x).toBeGreaterThan(pushedX);
  });

  it('a recarga também vale para chefes', () => {
    const { s, target } = pushRun(73, true);
    const pushedX = untilPushed(s, target);
    expect(pushedX).toBeGreaterThan(s.player.x + 120);
    expect(target.knockbackCooldownMs).toBeGreaterThan(KNOCKBACK_COOLDOWN_MS - 100);
    for (let t = 0; t < 4_500; t += 50) stepSurvivor(s, { dx: 0, dy: 0 }, 50);
    expect(target.x).toBe(pushedX);
  });

  it('golpes sem empurrão não iniciam a recarga', () => {
    const fire = as('fire', 'area');
    const s = createSurvivorState(74, { kindCount: 1, move: fire.move, profile: fire.profile });
    s.nextBossAtMs = Number.POSITIVE_INFINITY;
    s.spawnAccumMs = -1e9;
    s.player.attackTimerMs = 0;
    const target: SurvivorEnemy = { id: 1, kind: 0, boss: false, grade: 'comum', x: s.player.x + 20, y: s.player.y, hp: 1_000_000, maxHp: 1_000_000, speed: 0, damage: 0, radius: 13, hitFlashMs: 0 };
    s.enemies.push(target);
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(target.knockbackCooldownMs ?? 0).toBe(0);
  });
});
