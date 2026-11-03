import { describe, expect, it } from 'vitest';
import { createSurvivorState, rollUpgrades, stepSurvivor } from './survivor';
import { seededRng } from './battle';
import type { SurvivorEnemy, SurvivorState } from './survivor';
import { attackProfile, moveWith } from './survivor-moves';
import type { MoveCategory } from './survivor-moves';
import { SURVIVOR_UPGRADES, cadenceCanImprove } from './survivor-upgrades';
import { survivorOrbitAngularSpeed } from './survivor-shapes';
import { teleportCooldownMs } from './survivor-charge';

const categories: MoveCategory[] = ['projetil', 'aura', 'area', 'cone', 'orbit', 'foco', 'rapido', 'teleporte', 'trilha'];
function stateFor(category: MoveCategory): SurvivorState {
  const move = moveWith('normal', category, null);
  const s = createSurvivorState(17, { kindCount: 1, move, profile: attackProfile(move, null) });
  s.nextBossAtMs = Infinity; s.spawnAccumMs = -1e9; s.player.critChance = 0;
  return s;
}
function apply(s: SurvivorState, id: string): void {
  const upgrade = SURVIVOR_UPGRADES.find((item) => item.id === id);
  expect(upgrade, id).toBeDefined(); upgrade!.apply(s.player);
}
function enemy(id: number, x: number, y: number): SurvivorEnemy {
  return { id, kind: 0, boss: false, grade: 'comum', x, y, hp: 100000, maxHp: 100000, speed: 0, damage: 0, radius: 5, hitFlashMs: 0 };
}

describe('buffs adaptados à forma do ataque', () => {
  it.each(categories)('%s: alcance, tamanho e impacto ampliam uma característica usada pelo golpe', category => {
    const s = stateFor(category), p = s.player;
    const oldRange = p.attackRange, oldRadius = p.attackRadius, oldSize = p.projectileSize, oldShots = p.shots;
    apply(s, 'range');
    if (['aura', 'orbit', 'trilha'].includes(category)) expect(p.attackRadius).toBeGreaterThan(oldRadius);
    else expect(p.attackRange).toBeGreaterThan(oldRange);
    const rangeAfter = p.attackRange, radiusAfter = p.attackRadius;
    apply(s, 'radius');
    if (['projetil', 'rapido', 'foco'].includes(category)) expect(p.projectileSize).toBeGreaterThan(oldSize);
    else if (category === 'cone') expect(p.attackRange).toBeGreaterThan(rangeAfter);
    else expect(p.attackRadius).toBeGreaterThan(radiusAfter);
    const beforeImpact = { range: p.attackRange, radius: p.attackRadius, size: p.projectileSize };
    apply(s, 'multishot');
    if (category === 'aura' || category === 'trilha') expect(p.attackRadius).toBeGreaterThan(beforeImpact.radius);
    else if (category === 'cone') expect(p.attackRange).toBeGreaterThan(beforeImpact.range);
    else if (category === 'foco') expect(p.projectileSize).toBeGreaterThan(beforeImpact.size);
    else expect(p.shots).toBeGreaterThan(oldShots);
  });

  it('cadência acelera os orbitais e a recarga do Teleporte', () => {
    const orbit = stateFor('orbit'), teleport = stateFor('teleporte');
    const speed = survivorOrbitAngularSpeed(orbit.player.attackCooldownMs);
    const cooldown = teleportCooldownMs(teleport.player.attackCooldownMs, 0);
    apply(orbit, 'haste'); apply(teleport, 'haste');
    expect(survivorOrbitAngularSpeed(orbit.player.attackCooldownMs)).toBeGreaterThan(speed);
    expect(teleportCooldownMs(teleport.player.attackCooldownMs, 0)).toBeLessThan(cooldown);
  });

  it('cadência faz a Trilha pulsar mais vezes sem reduzir o dano por pulso', () => {
    const normal = stateFor('trilha'), fast = stateFor('trilha');
    for (const s of [normal, fast]) { s.player.trailCharge = 1; s.enemies.push(enemy(1, s.player.x, s.player.y)); }
    apply(fast, 'haste');
    for (let i = 0; i < 14; i++) for (const s of [normal, fast]) stepSurvivor(s, { dx: 0, dy: 0, charge: true }, 100);
    expect(fast.enemies[0]!.hp).toBeLessThan(normal.enemies[0]!.hp);
    expect(fast.player.attackCooldownMs).toBe(normal.player.attackCooldownMs);
  });

  it('o tamanho do projétil aumenta sua colisão sem alterar o raio inicial', () => {
    const s = stateFor('projetil');
    s.enemies.push(enemy(1, s.player.x + 100, s.player.y));
    stepSurvivor(s, { dx: 0, dy: 0 }, 1);
    expect(s.projectiles[0]!.collisionRadius).toBe(5);
    s.projectiles = []; s.player.attackTimerMs = 0; apply(s, 'radius');
    stepSurvivor(s, { dx: 0, dy: 0 }, 1);
    expect(s.projectiles[0]!.collisionRadius).toBeGreaterThan(5);
  });

  it('o raio ampliado muda de fato a colisão do projétil', () => {
    const normal = stateFor('projetil'), larger = stateFor('projetil');
    apply(larger, 'radius');
    for (const s of [normal, larger]) {
      const p = s.player; p.attackTimerMs = 1e9;
      s.enemies.push(enemy(1, p.x + 50, p.y + 10.5));
      s.projectiles.push({ id: 99, x: p.x + 50, y: p.y, vx: 0, vy: 0, damage: 10, pierce: 0, lifeMs: 1000, hit: [], collisionRadius: 5 * (p.projectileHitRadiusFactor ?? 1), move: p.move });
      stepSurvivor(s, { dx: 0, dy: 0 }, 1);
    }
    expect(normal.enemies[0]!.hp).toBe(100000);
    expect(larger.enemies[0]!.hp).toBeLessThan(100000);
  });

  it('ampliar o Foco alarga o feixe cheio e seus acertos', () => {
    const normal = stateFor('foco'), larger = stateFor('foco');
    apply(larger, 'multishot');
    for (const s of [normal, larger]) {
      const p = s.player; p.attackTimerMs = 1e9;
      s.enemies.push(enemy(1, p.x + 200, p.y), enemy(2, p.x + 300, p.y + 56));
      s.charge.level = 1; s.charge.holding = true;
      stepSurvivor(s, { dx: 0, dy: 0, charge: false }, 1);
    }
    expect(normal.enemies[1]!.hp).toBe(100000);
    expect(larger.enemies[1]!.hp).toBeLessThan(100000);
    expect(larger.fx.find(f => f.kind === 'beam')!.r).toBeGreaterThan(normal.fx.find(f => f.kind === 'beam')!.r);
  });

  it.each(categories)('%s: as finalizações e Arsenal ancestral causam melhoria utilizável', category => {
    for (const id of [`attack-tree-${category}-4`, 'element-tree-normal-4', 'ancestral-arsenal']) {
      const s = stateFor(category); s.player.attackDamage = 180;
      const p = s.player;
      const before = { radius: p.attackRadius, range: p.attackRange, size: p.projectileSize, shots: p.shots };
      apply(s, id);
      expect(p.attackRadius > before.radius || p.attackRange > before.range || p.projectileSize > before.size || p.shots > before.shots, id).toBe(true);
    }
  });

  it('aumentar alcance também dá tempo para o projétil chegar ao alvo', () => {
    const s = stateFor('projetil'); s.player.attackRange = 900;
    s.enemies.push(enemy(1, s.player.x + 800, s.player.y));
    stepSurvivor(s, { dx: 0, dy: 0 }, 1);
    expect(s.projectiles[0]!.lifeMs).toBeGreaterThan(1000 * 900 / s.player.projectileSpeed);
  });

  it('no teto de dano e cadência ainda oferece movimento na carta encadeada', () => {
    const s = stateFor('teleporte'); s.player.attackCooldownMs = 900; s.player.attackDamage = 180;
    const speed = s.player.speed; apply(s, 'attack-tree-teleporte-3');
    expect(s.player.attackDamage).toBe(180);
    expect(s.player.speed).toBeGreaterThan(speed);
  });

  it('não esconde bônus de dano antes do teto anunciado de 180', () => {
    const s = stateFor('projetil'); s.player.level = 20; s.player.attackDamage = 100;
    const offered = new Set(Array.from({ length: 100 }, (_, seed) => rollUpgrades(seededRng(seed + 1), 5, s.player.move, s.player).map(item => item.id)).flat());
    expect(offered.has('power')).toBe(true);
    s.player.attackDamage = 180;
    const capped = new Set(Array.from({ length: 100 }, (_, seed) => rollUpgrades(seededRng(seed + 1), 5, s.player.move, s.player).map(item => item.id)).flat());
    expect(capped.has('power')).toBe(false);
  });

  it('no limite de cadência, uma carta encadeada não piora o jogador', () => {
    const s = stateFor('teleporte'); s.player.attackCooldownMs = 900;
    expect(cadenceCanImprove(s.player)).toBe(false);
    const damage = s.player.attackDamage;
    apply(s, 'attack-tree-teleporte-3');
    expect(s.player.attackDamage).toBeGreaterThan(damage);
    expect(teleportCooldownMs(s.player.attackCooldownMs, 0)).toBe(900);
  });
});
