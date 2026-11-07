import { describe, expect, it } from 'vitest';
import { dodgeStep, leadTarget, slotTarget, squadIntent } from './survivor-digital-squad';
import { createSurvivorState, stepSurvivor } from './survivor';
import { DIGITAL_DANGER_MAX, DIGITAL_DANGER_UNLOCK_MS } from './survivor-types';
import type { SurvivorState } from './survivor-types';

describe('táticas do grupo do Perigo digital', () => {
  it('mira onde você vai estar', () => {
    const aim = leadTarget({ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 0, y: 100 }, 300);
    expect(aim.x).toBe(300);
    expect(aim.y).toBeCloseTo(100);
  });

  it('cerca em triângulo, não em fila', () => {
    const player = { x: 500, y: 500 };
    const angles = ([0, 1, 2] as const).map((role) => {
      const slot = slotTarget(player, 0, role);
      return Math.atan2(slot.y - player.y, slot.x - player.x);
    });
    const gap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    expect(gap(angles[0]!, angles[1]!)).toBeGreaterThan(1.5);
    expect(gap(angles[0]!, angles[2]!)).toBeGreaterThan(1.5);
    expect(gap(angles[1]!, angles[2]!)).toBeGreaterThan(1.5);
  });

  it('sai do caminho só do golpe que vai acertar', () => {
    const enemy = { x: 100, y: 100, radius: 16 };
    expect(dodgeStep(enemy, [{ x: 100, y: 0, vx: 0, vy: 300, size: 5 }])).not.toBeNull();
    expect(dodgeStep(enemy, [{ x: 200, y: 0, vx: 0, vy: 300, size: 5 }])).toBeNull();
    expect(dodgeStep(enemy, [{ x: 100, y: 200, vx: 0, vy: 300, size: 5 }])).toBeNull();
  });

  it('o atirador mantém distância, quem apanha recua e o time entra junto com você fraco', () => {
    const player = { x: 0, y: 0, hpRatio: 1 };
    expect(squadIntent({ x: 100, y: 0, role: 1, hp: 10, maxHp: 10 }, player, 2000)).toBe('kite');
    expect(squadIntent({ x: 100, y: 0, role: 0, hp: 2, maxHp: 10 }, player, 2000)).toBe('retreat');
    expect(squadIntent({ x: 100, y: 0, role: 0, hp: 10, maxHp: 10 }, { ...player, hpRatio: 0.3 }, 2000)).toBe('engage');
    expect(squadIntent({ x: 100, y: 0, role: 2, hp: 10, maxHp: 10 }, player, 2000)).toBe('position');
  });
});

describe('o grupo do Perigo digital na corrida', () => {
  function summon(seed: number): SurvivorState {
    const s = createSurvivorState(seed, { kindCount: 1 });
    s.elapsedMs = DIGITAL_DANGER_UNLOCK_MS;
    s.special.phase = 'ready';
    s.nextTrainerAtMs = Number.POSITIVE_INFINITY;
    s.finalBossAtMs = null;
    s.nextBossAtMs = Number.POSITIVE_INFINITY;
    s.spawnAccumMs = -1e9;
    s.player.level = 12;
    s.kills = 200;
    s.digitalDanger = DIGITAL_DANGER_MAX - 1;
    stepSurvivor(s, { dx: 0, dy: 0, visibleEnemies: 0 }, 1_000);
    return s;
  }

  /** Foge em círculo por 30 s com vida de sobra e sem atacar; devolve o dano que levou. */
  function chase(s: SurvivorState): number {
    s.player.maxHp = s.player.hp = 1e7;
    s.player.attackDamage = 0;
    const start = s.player.hp;
    for (let t = 0; t < 30_000; t += 50) {
      if (s.pendingUpgrade) s.pendingUpgrade = null;
      const a = t / 2500;
      stepSurvivor(s, { dx: Math.cos(a), dy: Math.sin(a) }, 50);
    }
    return start - s.player.hp;
  }

  it('cada um recebe um papel: linha de frente, atirador e assassino', () => {
    const s = summon(41);
    expect(s.enemies.filter((e) => e.digitalThreat).map((e) => e.digitalRole).sort()).toEqual([0, 1, 2]);
  });

  it('joga bem melhor que o mesmo grupo sem tática', () => {
    let smart = 0;
    let plain = 0;
    for (const seed of [41, 42, 43, 44, 45, 46]) {
      smart += chase(summon(seed));
      const dumb = summon(seed);
      for (const e of dumb.enemies) delete e.digitalRole;
      plain += chase(dumb);
    }
    expect(smart).toBeGreaterThan(plain * 1.25);
  }, 60_000);

  /** Agora atacando de verdade: quanto de vida do grupo sobra depois de 25 s. */
  function fight(s: SurvivorState): number {
    s.player.maxHp = s.player.hp = 1e7;
    s.player.attackDamage = 80;
    s.player.attackRange = 320;
    for (let t = 0; t < 25_000; t += 50) {
      if (s.pendingUpgrade) s.pendingUpgrade = null;
      const a = t / 2500;
      stepSurvivor(s, { dx: Math.cos(a), dy: Math.sin(a) }, 50);
    }
    return s.enemies.filter((e) => e.trainerId !== undefined).reduce((sum, e) => sum + Math.max(0, e.hp), 0);
  }

  it('desvia e recua: aguenta mais tempo de pé que o mesmo grupo sem tática', () => {
    let smart = 0;
    let plain = 0;
    for (const seed of [51, 52, 53, 54, 55, 56]) {
      smart += fight(summon(seed));
      const dumb = summon(seed);
      for (const e of dumb.enemies) delete e.digitalRole;
      plain += fight(dumb);
    }
    expect(smart).toBeGreaterThan(plain * 1.5);
  }, 60_000);
});
