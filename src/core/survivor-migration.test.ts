import { describe, expect, it } from 'vitest';
import { createSurvivorState, ENEMY_BEHAVIOR_LIMITS, stepSurvivor } from './survivor';
import { REGION_DURATION_MS as D, SURVIVOR_MIGRATION_MS as M, survivorMigrationOverlapMs, survivorMigrationRemainingMs } from './survivor-regions';

const idle = { dx: 0, dy: 0 };
function runAt(elapsedMs: number) {
  const s = createSurvivorState(1234, { kindCount: 1 });
  s.elapsedMs = elapsedMs;
  s.nextBossAtMs = s.nextTrainerAtMs = s.nextFieldEventAtMs = s.nextThiefAtMs = s.nextChestAtMs = s.nextBlackChestAtMs = s.nextShadowBallAtMs = Infinity;
  s.finalBossAtMs = null;
  s.special.phase = 'ready';
  s.surges = undefined;
  s.player.attackTimerMs = Infinity;
  s.player.hp = s.player.maxHp = 1e9;
  return s;
}

describe('Migração do Survivor', () => {
  it('começa 30 s antes da geração e termina exatamente na troca, em todas as voltas', () => {
    for (const step of [1, 2, 9, 10, 20]) {
      expect(survivorMigrationRemainingMs(step * D - M - 1)).toBe(0);
      expect(survivorMigrationRemainingMs(step * D - M)).toBe(M);
      expect(survivorMigrationRemainingMs(step * D - 1)).toBe(1);
      expect(survivorMigrationRemainingMs(step * D)).toBe(0);
    }
    for (const time of [-1, NaN, Infinity]) expect(survivorMigrationRemainingMs(time)).toBe(0);
  });

  it('conta somente o trecho dentro da janela quando um passo atravessa suas bordas', () => {
    expect(survivorMigrationOverlapMs(D - M - 500, D - M + 500)).toBe(500);
    expect(survivorMigrationOverlapMs(D - 500, D + 500)).toBe(500);
    expect(survivorMigrationOverlapMs(0, 10 * D)).toBe(10 * M);
    expect(survivorMigrationOverlapMs(D, D + 500)).toBe(0);
    expect(survivorMigrationOverlapMs(NaN, D)).toBe(0);
  });

  it('anuncia uma vez por janela e volta a anunciar na geração seguinte', () => {
    const s = runAt(D - M - 50);
    expect(stepSurvivor(s, idle, 50).filter(e => e.type === 'migration')).toEqual([{ type: 'migration', remainingMs: M }]);
    expect(stepSurvivor(s, idle, 50).some(e => e.type === 'migration')).toBe(false);
    s.elapsedMs = 2 * D - M - 50;
    expect(stepSurvivor(s, idle, 50).filter(e => e.type === 'migration')).toHaveLength(1);
  });

  it('triplica os nascimentos comuns e preserva a taxa normal depois da geração', () => {
    const migration = runAt(D - 2000);
    const laboratory = runAt(migration.elapsedMs);
    laboratory.debugLaboratory = true;
    stepSurvivor(migration, idle, 1000);
    stepSurvivor(laboratory, idle, 1000);
    expect(migration.enemies.length).toBeGreaterThanOrEqual(laboratory.enemies.length * 3);
    expect(migration.enemies.length).toBeLessThanOrEqual(laboratory.enemies.length * 3 + 2);
    const after = runAt(D);
    const afterLab = runAt(D);
    afterLab.debugLaboratory = true;
    stepSurvivor(after, idle, 1000);
    stepSurvivor(afterLab, idle, 1000);
    expect(after.enemies.length).toBe(afterLab.enemies.length);
  });

  it('mantém o limite de inimigos e não guarda ondas extras para depois', () => {
    const s = runAt(D - 2000);
    stepSurvivor(s, idle, 100);
    const enemy = s.enemies[0]!;
    s.enemies = Array.from({ length: ENEMY_BEHAVIOR_LIMITS.maxEnemies }, (_, i) => ({ ...enemy, id: 1000 + i, hp: 1e9, speed: 0, damage: 0 }));
    stepSurvivor(s, idle, 1000);
    expect(s.enemies).toHaveLength(ENEMY_BEHAVIOR_LIMITS.maxEnemies);
    expect(s.spawnAccumMs).toBeLessThan(1000);
  });

  it('em um passo que cruza a troca, amplia só a metade ainda em migração', () => {
    const migration = runAt(D - 500);
    const laboratory = runAt(D - 500);
    laboratory.debugLaboratory = true;
    const events = stepSurvivor(migration, idle, 1000);
    stepSurvivor(laboratory, idle, 1000);
    expect(migration.enemies.length).toBeGreaterThanOrEqual(laboratory.enemies.length * 2);
    expect(migration.enemies.length).toBeLessThanOrEqual(laboratory.enemies.length * 2 + 1);
    expect(events.some(e => e.type === 'migration')).toBe(false);
    expect(survivorMigrationRemainingMs(migration.elapsedMs)).toBe(0);
  });

  it('a pausa por upgrade não avança a migração nem gera um novo aviso', () => {
    const s = runAt(D - M - 50);
    s.pendingUpgrade = [];
    expect(stepSurvivor(s, idle, 1000)).toEqual([]);
    expect(s.elapsedMs).toBe(D - M - 50);
    expect(s.enemies).toHaveLength(0);
  });
});
