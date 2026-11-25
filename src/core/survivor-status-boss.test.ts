import { describe, expect, it } from 'vitest';
import { createSurvivorState, stepSurvivor } from './survivor';
import type { SurvivorBossAttack, SurvivorEnemy, SurvivorState } from './survivor-types';

function quiet(state: SurvivorState): SurvivorState {
  state.nextBossAtMs = Number.POSITIVE_INFINITY;
  state.nextTrainerAtMs = Number.POSITIVE_INFINITY;
  state.finalBossAtMs = null;
  state.spawnAccumMs = -1e9;
  return state;
}

function boss(state: SurvivorState, dexId: number): SurvivorEnemy {
  return {
    id: 900, kind: 0, boss: true, grade: 'comum', dexId,
    x: state.player.x + 240, y: state.player.y, hp: 1000, maxHp: 1000, speed: 0, damage: 10, radius: 28, hitFlashMs: 0,
  };
}

const shot = (state: SurvivorState, effect: 'burn' | 'slow' | 'stun'): SurvivorState['hostileProjectiles'][number] => ({
  id: 77, x: state.player.x, y: state.player.y, vx: 0, vy: 0, damage: 20, lifeMs: 1000, size: 6, effect,
});

describe('status dos tiros inimigos', () => {
  it('a queimadura fere aos poucos e some no tempo certo', () => {
    const s = quiet(createSurvivorState(31, { kindCount: 1 }));
    const hp = s.player.hp;
    s.hostileProjectiles = [shot(s, 'burn')];
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(s.player.hp).toBeLessThan(hp);
    expect(s.player.burnMs).toBe(3000);
    const afterHit = s.player.hp;
    s.hostileProjectiles = [];
    stepSurvivor(s, { dx: 0, dy: 0 }, 1000);
    expect(s.player.hp).toBeLessThan(afterHit);
    expect(s.runStats?.taken['projétil']).toBeGreaterThan(0);
    expect(s.runStats?.taken['queimadura']).toBeGreaterThan(0);
    stepSurvivor(s, { dx: 0, dy: 0 }, 2100);
    expect(s.player.burnMs).toBe(0);
    expect(s.player.burnDps).toBe(0);
  });

  it('a lentidão reduz o passo e o atordoamento trava por pouco tempo', () => {
    const normal = quiet(createSurvivorState(32, { kindCount: 1 }));
    const start = normal.player.x;
    stepSurvivor(normal, { dx: 1, dy: 0 }, 100);
    const free = normal.player.x - start;

    const slow = quiet(createSurvivorState(32, { kindCount: 1 }));
    slow.player.slowMs = 1000;
    const slowStart = slow.player.x;
    stepSurvivor(slow, { dx: 1, dy: 0 }, 100);
    expect(slow.player.x - slowStart).toBeLessThan(free);
    expect((slow.player.x - slowStart) / free).toBeCloseTo(0.65, 1);

    const stunned = quiet(createSurvivorState(32, { kindCount: 1 }));
    stunned.player.stunMs = 250;
    const stunStart = stunned.player.x;
    stepSurvivor(stunned, { dx: 1, dy: 0 }, 100);
    expect(stunned.player.x).toBe(stunStart);
    stepSurvivor(stunned, { dx: 1, dy: 0 }, 150);
    stepSurvivor(stunned, { dx: 1, dy: 0 }, 100);
    expect(stunned.player.x).toBeGreaterThan(stunStart);
  });

  it('não aplica status quando o dano não entrou', () => {
    const s = quiet(createSurvivorState(33, { kindCount: 1 }));
    s.player.invulnMs = 1000;
    s.hostileProjectiles = [shot(s, 'burn')];
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(s.player.burnMs).toBeUndefined();
  });
});

describe('ataques-assinatura dos chefes', () => {
  const kinds = [
    [7, 'tsunami'],
    [74, 'boulders'],
    [1, 'vines'],
    [4, 'shockwave'],
  ] as const;

  it('cada tipo de chefe escolhe o ataque próprio e começa telegrafado', () => {
    for (const [dexId, kind] of kinds) {
      const s = quiet(createSurvivorState(41, { kindCount: 1 }));
      s.enemies = [boss(s, dexId)];
      s.nextBossAttackAtMs = 0;
      stepSurvivor(s, { dx: 0, dy: 0 }, 16);
      expect(s.bossAttack?.kind, String(dexId)).toBe(kind);
      expect(s.bossAttack?.phase).toBe('telegraph');
      expect(s.bossAttack?.bossId).toBe(900);
    }
  });

  it('Arceus alterna lasers girando, onda dourada e estrelas', () => {
    const s = quiet(createSurvivorState(90, { kindCount: 1 }));
    s.player.invulnMs = 1e9;
    s.enemies = [{ ...boss(s, 493), arceus: true }];
    s.nextBossAttackAtMs = 0;
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(s.bossAttack).toMatchObject({ kind: 'lasers', phase: 'telegraph', beams: 3 });

    stepSurvivor(s, { dx: 0, dy: 0 }, 1600);
    expect(s.bossAttack?.phase).toBe('active');
    const beforeRotation = s.bossAttack?.rotation ?? 0;
    stepSurvivor(s, { dx: 0, dy: 0 }, 500);
    expect(s.bossAttack?.rotation ?? 0).toBeGreaterThan(beforeRotation);

    const attack = s.bossAttack!;
    const beamAngle = attack.angle + (attack.rotation ?? 0);
    s.player.x = attack.x + Math.cos(beamAngle) * 300;
    s.player.y = attack.y + Math.sin(beamAngle) * 300;
    s.player.hp = s.player.maxHp = 1000;
    s.player.invulnMs = 0;
    attack.hitCooldownMs = 0;
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(s.player.hp).toBeLessThan(1000);

    s.bossAttack = null; s.nextBossAttackAtMs = 0;
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect((s.bossAttack as SurvivorBossAttack | null)?.kind).toBe('shockwave');
    s.bossAttack = null; s.nextBossAttackAtMs = 0;
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect((s.bossAttack as SurvivorBossAttack | null)?.kind).toBe('stars');
    expect((s.bossAttack as SurvivorBossAttack | null)?.circles).toHaveLength(5);
  });

  it('o tsunami fere quem fica na faixa e erra quem sai dela', () => {
    const hit = quiet(createSurvivorState(42, { kindCount: 1 }));
    hit.enemies = [boss(hit, 7)];
    hit.nextBossAttackAtMs = 0;
    stepSurvivor(hit, { dx: 0, dy: 0 }, 16);
    const hp = hit.player.hp;
    stepSurvivor(hit, { dx: 0, dy: 0 }, 1300);
    expect(hit.player.hp).toBeLessThan(hp);
    expect(hit.player.slowMs).toBeGreaterThan(0);
    expect(hit.bossAttack?.phase).toBe('active');

    const dodge = quiet(createSurvivorState(42, { kindCount: 1 }));
    dodge.enemies = [boss(dodge, 7)];
    dodge.nextBossAttackAtMs = 0;
    stepSurvivor(dodge, { dx: 0, dy: 0 }, 16);
    dodge.player.y += 400;
    const safeHp = dodge.player.hp;
    stepSurvivor(dodge, { dx: 0, dy: 0 }, 1300);
    expect(dodge.player.hp).toBe(safeHp);
  });

  it('pedras e vinhas miram círculos que dá para abandonar; o chefe some sem ataque pendente', () => {
    for (const dexId of [74, 1]) {
      const s = quiet(createSurvivorState(43, { kindCount: 1 }));
      s.enemies = [boss(s, dexId)];
      s.nextBossAttackAtMs = 0;
      stepSurvivor(s, { dx: 0, dy: 0 }, 16);
      expect(s.bossAttack?.circles.length).toBeGreaterThanOrEqual(3);
      s.player.x += 500;
      const hp = s.player.hp;
      stepSurvivor(s, { dx: 0, dy: 0 }, 1300);
      expect(s.player.hp).toBe(hp);
      s.enemies = [];
      stepSurvivor(s, { dx: 0, dy: 0 }, 16);
      expect(s.bossAttack).toBeNull();
    }
  });

  it('não começa sem chefe e espera o intervalo depois do ataque', () => {
    const s = quiet(createSurvivorState(44, { kindCount: 1 }));
    s.nextBossAttackAtMs = 0;
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(s.bossAttack).toBeNull();

    s.enemies = [boss(s, 4)];
    s.nextBossAttackAtMs = s.elapsedMs + 100;
    stepSurvivor(s, { dx: 0, dy: 0 }, 50);
    expect(s.bossAttack).toBeNull();
    stepSurvivor(s, { dx: 0, dy: 0 }, 100);
    expect(s.bossAttack?.kind).toBe('shockwave');
    s.player.x += 1000;
    stepSurvivor(s, { dx: 0, dy: 0 }, 1300);
    stepSurvivor(s, { dx: 0, dy: 0 }, 600);
    expect(s.bossAttack).toBeNull();
    expect(s.nextBossAttackAtMs).toBeGreaterThan(s.elapsedMs);
  });
});
