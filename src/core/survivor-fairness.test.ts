import { describe, expect, it } from 'vitest';
import { ARENA_H, ARENA_W, createSurvivorState, stepSurvivor } from './survivor';
import type { SurvivorEnemy, SurvivorState } from './survivor';
import { MAX_SIM_STEP_MS, presentationMayResume, simulationSteps } from './survivor-cinema';

const idle = { dx: 0, dy: 0 };
function quiet(seed = 91): SurvivorState {
  const s = createSurvivorState(seed, { kindCount: 1 });
  s.spawnAccumMs = -1e9;
  s.nextBossAtMs = Infinity;
  s.nextTrainerAtMs = Infinity;
  s.player.attackTimerMs = Infinity;
  return s;
}
function foe(id: number, x: number, y: number, extra: Partial<SurvivorEnemy> = {}): SurvivorEnemy {
  return { id, kind: 0, boss: false, grade: 'comum', x, y, hp: 100, maxHp: 100, speed: 0, damage: 10, radius: 13, hitFlashMs: 0, ...extra };
}
function shot(id: number, x: number, y: number): SurvivorState['projectiles'][number] {
  return { id, x, y, vx: 1, vy: 0, damage: 50, pierce: 0, lifeMs: 1000, hit: [] };
}

describe('justiça do loop da Torre', () => {
  it('tiro não é gasto em quem já caiu neste passo', () => {
    const s = quiet();
    const px = s.player.x + 120;
    const dying = foe(1, px, s.player.y, { hp: 10, maxHp: 100 });
    const behind = foe(2, px, s.player.y);
    s.enemies = [dying, behind];
    s.projectiles = [shot(1, px, s.player.y), shot(2, px, s.player.y)];
    stepSurvivor(s, idle, 16);
    expect(dying.hp).toBeLessThanOrEqual(0);
    expect(behind.hp).toBeLessThan(100);
    expect(s.projectiles).toHaveLength(0);
  });

  it('o Relógio parado suspende os tiros inimigos em vez de deixá-los ferir', () => {
    const s = quiet();
    s.special.selected = 'stasis';
    s.special.activeMs = 1000;
    s.hostileProjectiles = [{ id: 7, x: s.player.x, y: s.player.y, vx: 50, vy: 0, damage: 40, lifeMs: 2000, size: 5 }];
    const hp = s.player.hp;
    const x = s.player.x;
    stepSurvivor(s, idle, 100);
    expect(s.player.hp).toBe(hp);
    expect(s.hostileProjectiles[0]!.x).toBe(x);
    expect(s.hostileProjectiles[0]!.lifeMs).toBe(2000);
  });

  it('a Inversão polar não joga inimigos para fora da arena', () => {
    const s = quiet();
    s.special.selected = 'gravity';
    s.special.branch = 'gravity-repel';
    s.special.activeMs = 4000;
    s.player.x = ARENA_W - 300;
    s.player.y = ARENA_H / 2;
    s.player.invulnMs = 1e6;
    const near = foe(1, ARENA_W - 4, ARENA_H / 2, { speed: 0 });
    s.enemies = [near];
    for (let i = 0; i < 30; i++) stepSurvivor(s, idle, 100);
    expect(near.x).toBeLessThanOrEqual(ARENA_W);
  });

  it('morrer no mesmo quadro de um orbe não abre carta por cima do resultado', () => {
    const s = quiet();
    s.player.xp = s.player.xpToNext - 2;
    s.player.hp = 1;
    s.orbs = [{ id: 1, x: s.player.x, y: s.player.y, value: 8 }];
    s.enemies = [foe(1, s.player.x, s.player.y, { damage: 999 })];
    const events = stepSurvivor(s, idle, 16);
    expect(s.over).toBe(true);
    expect(s.pendingUpgrade).toBeNull();
    expect(events.some((e) => e.type === 'gameover')).toBe(true);
  });

  it('quadro longo vira passos curtos que somam o mesmo tempo', () => {
    for (const dt of [1, 16, 33, 60, 120]) {
      const { count, stepMs } = simulationSteps(dt);
      expect(stepMs).toBeLessThanOrEqual(MAX_SIM_STEP_MS);
      expect(count * stepMs).toBeCloseTo(dt, 6);
    }
  });

  it('a apresentação de treinador não solta o jogo com a escolha de afinidade aberta', () => {
    const none = { leaveConfirm: false, summary: false, typeAffinityOffer: false };
    expect(presentationMayResume(none)).toBe(true);
    expect(presentationMayResume({ ...none, typeAffinityOffer: true })).toBe(false);
    expect(presentationMayResume({ ...none, leaveConfirm: true })).toBe(false);
    expect(presentationMayResume({ ...none, summary: true })).toBe(false);
  });
});
