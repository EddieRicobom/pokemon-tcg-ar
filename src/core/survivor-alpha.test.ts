import { describe, expect, it } from 'vitest';
import { rollSurvivorAlpha, survivorAlphaChance, survivorAlphaRng } from './survivor-alpha';
import { createSurvivorState, stepSurvivor, xpForLevel } from './survivor';
import type { SurvivorEnemy, SurvivorState } from './survivor-types';
import { SURVIVOR_THIEF_DEX } from './survivor-extras';

function enemy(overrides: Partial<SurvivorEnemy> = {}): SurvivorEnemy {
  return { id: 10, kind: 0, boss: false, grade: 'comum', x: 100, y: 100, hp: 30, maxHp: 30, damage: 7, radius: 13, speed: 42, hitFlashMs: 0, ...overrides };
}

function quiet(): SurvivorState {
  const state = createSurvivorState(1, { kindCount: 4 });
  state.nextBossAtMs = Infinity;
  state.nextTrainerAtMs = Infinity;
  state.spawnAccumMs = -1e9;
  return state;
}

describe('inimigos alfa', () => {
  it('sorteia 0,2% antes do minuto 3 e 2% a partir dele, sem incluir a borda superior', () => {
    expect(survivorAlphaChance(179_999)).toBe(0.002);
    expect(survivorAlphaChance(180_000)).toBe(0.02);
    for (const [time, chance] of [[0, 0.002], [180_000, 0.02]] as const) {
      const alpha = enemy();
      rollSurvivorAlpha(alpha, time, () => chance - 0.000001);
      expect(alpha.alpha).toBe(true);
      const normal = enemy();
      rollSurvivorAlpha(normal, time, () => chance);
      expect(normal.alpha).toBeUndefined();
      expect(normal.hp).toBe(30);
    }
  });

  it.each([
    {}, { grade: 'elite', trainerId: 5 }, { grade: 'chefao', trainerId: 8 }, { boss: true }, { boss: true, shadowBoss: true },
  ] satisfies Partial<SurvivorEnemy>[])('dobra atributos e colisão preservando o encontro %j', (overrides) => {
    const target = enemy(overrides);
    rollSurvivorAlpha(target, 0, () => 0);
    expect(target).toMatchObject({ ...overrides, alpha: true, hp: 60, maxHp: 60, damage: 14, radius: 26, speed: 42 });
  });

  it('aplica o sorteio no nascimento real sem transformar inimigos anteriores', () => {
    const state = quiet();
    state.rng = () => 0;
    state.spawnAccumMs = 10_000;
    state.enemyDexId = () => 25;
    // Escolhe uma seed cujo próximo nascimento seja alfa, sem tocar o RNG de combate.
    while (survivorAlphaRng(state.runSeed, state.nextId)() >= survivorAlphaChance(16)) state.runSeed++;
    const old = enemy();
    state.enemies.push(old);
    const events = stepSurvivor(state, { dx: 0, dy: 0 }, 16);
    expect(state.enemies.length).toBeGreaterThan(1);
    expect(state.enemies.find((candidate) => candidate !== old)?.alpha).toBe(true);
    expect(old.alpha).toBeUndefined();
    expect(events.filter((event) => event.type === 'alphaSpawn')).toEqual(state.enemies.filter((candidate) => candidate.alpha).map((candidate) => ({ type: 'alphaSpawn', enemyId: candidate.id, dexId: 25 })));
    state.spawnAccumMs = -1e9;
    expect(stepSurvivor(state, { dx: 0, dy: 0 }, 16).filter((event) => event.type === 'alphaSpawn')).toHaveLength(0);
  });

  it('deixa orbe alfa ao morrer e calcula um nível completo no momento da coleta', () => {
    const state = quiet();
    state.enemies.push(enemy({ alpha: true, dexId: 25, hp: 0, x: state.player.x + 300, y: state.player.y }));
    const events = stepSurvivor(state, { dx: 0, dy: 0 }, 16);
    expect(events.filter((event) => event.type === 'alphaDefeated')).toEqual([{ type: 'alphaDefeated', enemyId: 10, dexId: 25 }]);
    expect(state.orbs).toHaveLength(1);
    expect(state.orbs[0]).toMatchObject({ alpha: true, value: xpForLevel(1) });
    expect(state.orbs[0]!.doubleXp).toBeUndefined();

    state.player.level = 7;
    state.player.xpToNext = xpForLevel(7);
    state.player.xp = 12;
    state.player.xpMultiplier = 5;
    state.player.xpCarry = 0.5;
    Object.assign(state.orbs[0]!, { x: state.player.x, y: state.player.y, doubleXp: true });
    expect(stepSurvivor(state, { dx: 0, dy: 0 }, 16).filter((event) => event.type === 'alphaDefeated')).toHaveLength(0);
    expect(state.player.level).toBe(8);
    expect(state.player.xp).toBe(12);
    expect(state.player.xpCarry).toBe(0.5);
    expect(state.orbs).toHaveLength(0);
  });

  it('registra a espécie real do ladrão alfa em vez da espécie sorteada como elite', () => {
    const state = quiet();
    state.enemyDexId = () => 25;
    state.nextThiefAtMs = 0;
    while (survivorAlphaRng(state.runSeed, state.nextId)() >= survivorAlphaChance(16)) state.runSeed++;
    const events = stepSurvivor(state, { dx: 0, dy: 0 }, 16);
    const thief = state.enemies.find((candidate) => candidate.thief)!;
    expect(thief.alpha).toBe(true);
    expect(events).toContainEqual({ type: 'alphaSpawn', enemyId: thief.id, dexId: SURVIVOR_THIEF_DEX });
  });

  it('não registra derrota de um alfa que fugiu vivo da revoada', () => {
    const state = quiet();
    state.enemies.push(enemy({ alpha: true, swarm: { vx: 1, vy: 0, leftMs: 0 } }));
    const events = stepSurvivor(state, { dx: 0, dy: 0 }, 16);
    expect(state.enemies).toHaveLength(0);
    expect(events.filter((event) => event.type === 'alphaDefeated' || event.type === 'alphaSpawn')).toHaveLength(0);
  });

  it('cada orbe alfa coletado junto vale um nível, mesmo com o custo crescente', () => {
    const state = quiet();
    state.orbs.push(...[1, 2, 3].map((id) => ({ id, x: state.player.x, y: state.player.y, value: 1, alpha: true })));
    const events = stepSurvivor(state, { dx: 0, dy: 0 }, 16);
    expect(state.player.level).toBe(4);
    expect(state.player.xp).toBe(0);
    expect(events.filter((event) => event.type === 'levelup')).toHaveLength(3);
  });
});
