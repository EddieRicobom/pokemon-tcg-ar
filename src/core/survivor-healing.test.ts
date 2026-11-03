import { describe, expect, it } from 'vitest';
import { applyUpgrade, createSurvivorState, stepSurvivor } from './survivor';
import type { SurvivorEnemy } from './survivor';
import { healSurvivor } from './survivor-healing';
import { stepSurvivorSpecial } from './survivor-specials';

describe('bloqueio de cura digital', () => {
  it('atinge por contato e impede cura, depois expira', () => {
    const s = createSurvivorState(10, { kindCount: 1 });
    s.spawnAccumMs = -1e9; s.nextBossAtMs = Infinity;
    s.player.attackTimerMs = 1e9; s.player.hp = 70;
    const enemy: SurvivorEnemy = { id: 44, kind: 0, boss: false, grade: 'elite', digitalThreat: true, x: s.player.x, y: s.player.y, hp: 1000, maxHp: 1000, speed: 0, damage: 1, radius: 13, hitFlashMs: 0 };
    s.enemies = [enemy]; stepSurvivor(s, { dx: 0, dy: 0 }, 1);
    expect(s.player.healBlockMs).toBe(8000);
    const hp = s.player.hp;
    expect(healSurvivor(s.player, 30)).toBe(0);
    s.pendingUpgrade = [{ id: 'heal-30', name: '', description: '' }]; applyUpgrade(s, 'heal-30');
    expect(s.player.hp).toBe(hp);
    s.special.selected = 'stasis'; s.special.branch = 'stasis-mend'; s.special.phase = 'ready';
    stepSurvivorSpecial(s, { dx: 0, dy: 0, special: true }, 1, 3000, 3000, 10);
    expect(s.player.hp).toBe(hp);
    s.enemies = []; stepSurvivor(s, { dx: 0, dy: 0 }, 8000);
    expect(s.player.healBlockMs).toBe(0);
    expect(healSurvivor(s.player, 10)).toBeGreaterThan(0);
  });
  it('bloqueia regeneração e artefato de cura sem consumir a cura da marmita', () => {
    const s = createSurvivorState(10, { kindCount: 1 }); s.spawnAccumMs = -1e9; s.nextBossAtMs = Infinity;
    s.player.hp = 20; s.player.healBlockMs = 5000; s.player.regenPerSec = 10;
    s.artifacts.push({ id: 77, x: s.player.x, y: s.player.y, kind: 'heal' });
    stepSurvivor(s, { dx: 0, dy: 0 }, 1000);
    expect(s.player.hp).toBe(20);
    expect(s.player.healBlockMs).toBe(4000);
    expect(s.artifacts).toHaveLength(0);
    stepSurvivor(s, { dx: 0, dy: 0 }, 4000);
    expect(s.player.hp).toBe(20);
    stepSurvivor(s, { dx: 0, dy: 0 }, 1000);
    expect(s.player.hp).toBeGreaterThan(20);
  });
  it('projétil digital leva o bloqueio mesmo depois de seu atacante desaparecer', () => {
    const s = createSurvivorState(10, { kindCount: 1 }); s.spawnAccumMs = -1e9; s.nextBossAtMs = Infinity;
    s.hostileProjectiles.push({ id: 55, x: s.player.x, y: s.player.y, vx: 0, vy: 0, damage: 10, size: 4, lifeMs: 1000, source: { boss: false, grade: 'elite', digitalThreat: true } });
    stepSurvivor(s, { dx: 0, dy: 0 }, 1);
    expect(s.player.healBlockMs).toBe(8000);
  });
});
