import { describe, expect, it } from 'vitest';
import { ARENA_H, ARENA_W, createSurvivorState, PLAYER_RADIUS, stepSurvivor } from './survivor';
import type { SurvivorEnemy } from './survivor';
import { chooseSurvivorSpecial, SPECIAL_ARRIVAL_MS, SPECIAL_GUARDIANS, SPECIAL_UNLOCK_MS, SURVIVOR_SPECIALS } from './survivor-specials';
import type { SurvivorSpecialId } from './survivor-specials';
import { typesOfDex } from './species-filter';

const idle = { dx: 0, dy: 0 };
function quiet() {
  const state = createSurvivorState(42, { kindCount: 1 });
  state.spawnAccumMs = -1e9;
  state.nextBossAtMs = Infinity;
  state.player.attackTimerMs = Infinity;
  return state;
}
function armed(id: SurvivorSpecialId) {
  const state = quiet();
  state.special.phase = 'choice';
  expect(chooseSurvivorSpecial(state, id)).toBe(true);
  return state;
}
function enemy(id: number, x: number, y: number, extra: Partial<SurvivorEnemy> = {}): SurvivorEnemy {
  return { id, kind: 0, boss: false, grade: 'comum', x, y, hp: 100, maxHp: 100, speed: 0, damage: 10, radius: 13, hitFlashMs: 0, ...extra };
}

describe('orbe e especiais da Torre', () => {
  it('associa os 18 tipos a guardiões que realmente têm a tipagem', () => {
    expect(Object.keys(SPECIAL_GUARDIANS)).toHaveLength(18);
    for (const [type, guardian] of Object.entries(SPECIAL_GUARDIANS)) expect(typesOfDex(guardian.dexId)).toContain(type);
  });

  it('só entrega aos 3 minutos, congela o combate na animação/escolha e exige escolha explícita', () => {
    const state = quiet();
    expect(chooseSurvivorSpecial(state, 'dash')).toBe(false);
    state.elapsedMs = SPECIAL_UNLOCK_MS - 2;
    stepSurvivor(state, idle, 1);
    expect(state.special.phase).toBe('locked');
    stepSurvivor(state, idle, 1);
    expect(state.special.phase).toBe('arrival');
    state.enemies = [enemy(1, state.player.x, state.player.y)];
    stepSurvivor(state, { dx: 1, dy: 1, special: true }, SPECIAL_ARRIVAL_MS);
    expect(state.special.phase).toBe('choice');
    expect(state.player.hp).toBe(100);
    expect(state.elapsedMs).toBe(SPECIAL_UNLOCK_MS);
    stepSurvivor(state, idle, 10_000);
    expect(state.elapsedMs).toBe(SPECIAL_UNLOCK_MS);
    expect(state.special.selected).toBeNull();
    expect(chooseSurvivorSpecial(state, 'shield')).toBe(true);
    expect(chooseSurvivorSpecial(state, 'teleport')).toBe(false);
    stepSurvivor(state, idle, 1);
    expect(state.elapsedMs).toBe(SPECIAL_UNLOCK_MS + 1);
    expect(state.player.hp).toBe(90);
  });

  it('dash usa a última direção, não sai da arena e respeita a recarga de 6,5 segundos', () => {
    const state = armed('dash');
    stepSurvivor(state, { dx: 0, dy: -1 }, 1);
    const fromY = state.player.y;
    stepSurvivor(state, { ...idle, special: true }, 16);
    for (let i = 0; i < 18; i++) stepSurvivor(state, idle, 16);
    expect(fromY - state.player.y).toBeCloseTo(800 * 0.3);
    expect(state.special.activeMs).toBe(0);
    const from = { x: state.player.x, y: state.player.y };
    stepSurvivor(state, { ...idle, special: true }, 1);
    expect(state.player.x).toBe(from.x); expect(state.player.y).toBe(from.y);
    expect(state.special.cooldownMs).toBeGreaterThan(0);
    stepSurvivor(state, idle, state.special.cooldownMs);
    expect(state.special.cooldownMs).toBe(0);
    state.player.x = ARENA_W - PLAYER_RADIUS;
    state.player.y = ARENA_H - PLAYER_RADIUS;
    stepSurvivor(state, { dx: 1, dy: 1, special: true }, 16);
    expect(state.player.x).toBe(ARENA_W - PLAYER_RADIUS);
    expect(state.player.y).toBe(ARENA_H - PLAYER_RADIUS);
    expect(state.special.cooldownMs).toBe(SURVIVOR_SPECIALS.dash.cooldownMs);
  });

  it('escudo bloqueia contato e projéteis por 3 s e volta a receber dano ao terminar', () => {
    const state = armed('shield');
    state.enemies = [enemy(1, state.player.x, state.player.y)];
    state.hostileProjectiles = [{ id: 2, x: state.player.x, y: state.player.y, vx: 0, vy: 0, damage: 99, lifeMs: 6000, size: 5 }];
    stepSurvivor(state, { ...idle, special: true }, 1);
    expect(state.player.hp).toBe(100);
    expect(state.hostileProjectiles).toHaveLength(0);
    expect(state.special.cooldownMs).toBe(12_000);
    stepSurvivor(state, idle, 2998);
    expect(state.player.hp).toBe(100);
    stepSurvivor(state, idle, 1);
    expect(state.player.hp).toBe(90);
    expect(state.special.activeMs).toBe(0);
  });

  it('teleporta e resolve só os quatro selvagens mais próximos, com XP real e sem repetir derrotas', () => {
    const state = armed('teleport');
    state.enemies = [
      enemy(90, 631, 320, { boss: true }), enemy(91, 632, 320, { trainerId: 2, grade: 'elite' }),
      enemy(92, 633, 320, { grade: 'chefao' }),
      ...[100, 95, 90, 85, 80, 75].map((offset, i) => enemy(i + 1, 630 + offset, 320)),
    ];
    stepSurvivor(state, { dx: 1, dy: 0, special: true }, 1);
    expect(state.player.x).toBeCloseTo(630.15); // Deslocamento normal após o salto.
    expect(state.kills).toBe(4);
    expect(state.enemies.map((entry) => entry.id).sort((a,b) => a-b)).toEqual([1, 2, 90, 91, 92]);
    expect(state.orbs).toHaveLength(4);
    expect(state.special.cooldownMs).toBe(25_000);
    stepSurvivor(state, { ...idle, special: true }, 1);
    expect(state.kills).toBe(4);
    expect(state.orbs).toHaveLength(4);
    expect(state.trainersBeaten).toBe(0);
  });

  it('upgrades, fim de corrida e ticks inválidos não avançam encontro ou recarga', () => {
    const state = armed('dash');
    state.special.cooldownMs = 7000;
    state.pendingUpgrade = [];
    stepSurvivor(state, { ...idle, special: true }, 1000);
    expect(state.special.cooldownMs).toBe(7000);
    state.pendingUpgrade = null;
    for (const delta of [NaN, Infinity, -1, 0]) stepSurvivor(state, idle, delta);
    expect(state.special.cooldownMs).toBe(7000);
    state.over = true;
    stepSurvivor(state, { ...idle, special: true }, 1000);
    expect(state.special.cooldownMs).toBe(7000);
    expect(chooseSurvivorSpecial(state, 'shield')).toBe(false);
  });
});
