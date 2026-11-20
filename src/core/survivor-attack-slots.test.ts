import { describe, expect, it } from 'vitest';
import {
  applyUpgrade, createSurvivorState, deferSurvivorUpgrade, resumeSurvivorUpgrade, stepSurvivor,
  survivorPlayerAttacks, survivorUpgradeAttackTargets, switchSurvivorAttack, SURVIVOR_SIMULTANEOUS_ATTACKS_MS,
  type SurvivorInput, type SurvivorState,
} from './survivor';
import { survivorAttackChoices, survivorAttackOf } from './survivor-loadout';
import { attackProfile, moveWith, type MoveCategory } from './survivor-moves';
import { FOCUS_HIT_CHARGE } from './survivor-charge';

const idle: SurvivorInput = { dx: 0, dy: 0 };

function createRun(first: MoveCategory, second: MoveCategory, fast = false): SurvivorState {
  const move = moveWith('normal', first, null);
  const alternate = moveWith('fire', second, null);
  const state = createSurvivorState(7, { kindCount: 1, noHeld: true, fast, move, profile: attackProfile(move, null), secondAttack: { move: alternate, profile: attackProfile(alternate, null) } });
  state.debugLaboratory = true;
  state.nextBossAtMs = Number.POSITIVE_INFINITY;
  state.nextTrainerAtMs = Number.POSITIVE_INFINITY;
  state.finalBossAtMs = null;
  state.spawnAccumMs = -1e9;
  return state;
}

function enemy(state: SurvivorState, distance: number) {
  const target = { id: 1, kind: 0, boss: false, grade: 'comum' as const, x: state.player.x + distance, y: state.player.y, hp: 5_000, maxHp: 5_000, speed: 0, damage: 0, radius: 13, hitFlashMs: 0 };
  state.enemies.push(target);
  return target;
}

function offer(state: SurvivorState, id: string, value?: number): void {
  state.pendingUpgrade = [{ id, name: id, description: '', value }];
}

describe('dois golpes da Sobrevivência', () => {
  it.each([1, 25])('leva exatamente as duas opções exibidas para a corrida de espécie %i', (dexId) => {
    const choices = survivorAttackChoices(dexId);
    const normal = survivorAttackOf(dexId);
    const swapped = survivorAttackOf(dexId, undefined, true);
    expect(normal.move).toEqual(choices.current.move);
    expect(normal.secondAttack).toEqual(choices.alternative);
    expect(swapped.move).toEqual(choices.alternative.move);
    expect(swapped.secondAttack).toEqual(choices.current);
  });

  it('aplica melhorias ao primeiro golpe mesmo após adiar, trocar e reabrir a oferta', () => {
    const state = createRun('projetil', 'area');
    const initial = survivorPlayerAttacks(state)!;
    const firstDamage = initial.players[0].attackDamage;
    const secondDamage = initial.players[1].attackDamage;
    offer(state, 'power', 40);
    expect(deferSurvivorUpgrade(state)).toBe(true);
    expect(switchSurvivorAttack(state)).toBe(true);
    expect(resumeSurvivorUpgrade(state)).toBe(true);
    expect(survivorUpgradeAttackTargets(state, 'power')).toEqual([0]);
    applyUpgrade(state, 'power', 1);
    expect(state.pendingUpgrade).not.toBeNull();
    applyUpgrade(state, 'power');
    const upgraded = survivorPlayerAttacks(state)!;
    expect(upgraded.active).toBe(1);
    expect(upgraded.players[1].attackDamage).toBe(secondDamage);
    expect(upgraded.players[0].attackDamage).toBeCloseTo(firstDamage * 1.4, 1);
    expect(upgraded.players[0].upgradeLevels.power).toBe(1);
    expect(upgraded.players[1].upgradeLevels.power).toBeUndefined();
  });

  it('escolhe o destino aos dez minutos e compartilha crítico, vida e melhorias defensivas', () => {
    const state = createRun('projetil', 'area');
    const firstDamage = state.player.attackDamage;
    state.elapsedMs = SURVIVOR_SIMULTANEOUS_ATTACKS_MS;
    state.player.level = 30;
    offer(state, 'ancestral-precision');
    expect(survivorUpgradeAttackTargets(state, 'ancestral-precision')).toEqual([0, 1]);
    expect(switchSurvivorAttack(state)).toBe(false);
    applyUpgrade(state, 'ancestral-precision', 1);
    expect(state.player.attackDamage).toBe(firstDamage);
    expect(state.player.critChance).toBe(0.3);
    const hp = state.player.maxHp;
    for (const id of ['vigor', 'orb-medicine', 'contact-guard']) {
      offer(state, id);
      expect(survivorUpgradeAttackTargets(state, id)).toEqual([]);
      applyUpgrade(state, id);
    }
    expect(switchSurvivorAttack(state)).toBe(true);
    expect(state.player.maxHp).toBe(hp + 25);
    expect(state.player.critChance).toBe(0.3);
    expect(state.player.upgradeLevels).toMatchObject({ 'ancestral-precision': 1, 'orb-medicine': 1, 'contact-guard': 1 });
  });

  it.each([false, true])('executa apenas o golpe ativo até dez minutos e ambos a partir do marco, acelerado %s', (fast) => {
    const state = createRun('projetil', 'projetil', fast);
    state.elapsedMs = SURVIVOR_SIMULTANEOUS_ATTACKS_MS - 32;
    enemy(state, 100);
    stepSurvivor(state, idle, 16);
    expect(state.projectiles.map((projectile) => projectile.attackIndex)).toEqual([0]);
    state.player.attackTimerMs = 0;
    stepSurvivor(state, idle, 16);
    expect(state.projectiles.map((projectile) => projectile.attackIndex)).toEqual([0, 0, 1]);
    expect(survivorPlayerAttacks(state)?.simultaneous).toBe(true);
  });

  it('preserva a carga do Foco na sua origem quando o disparo acerta após a troca', () => {
    const state = createRun('foco', 'teleporte');
    enemy(state, 90);
    stepSurvivor(state, idle, 16);
    expect(state.projectiles[0]).toMatchObject({ attackIndex: 0, move: { category: 'foco' } });
    switchSurvivorAttack(state);
    for (let frame = 0; frame < 40; frame++) stepSurvivor(state, idle, 16);
    const attacks = survivorPlayerAttacks(state)!;
    expect(attacks.charges[0].level).toBeCloseTo(FOCUS_HIT_CHARGE);
    expect(attacks.charges[1].level).toBe(0);
  });

  it('cancela o Teleporte na troca prévia e preserva a carga correta na passagem dos dez minutos', () => {
    const state = createRun('teleporte', 'foco');
    const x = state.player.x;
    stepSurvivor(state, { ...idle, chargeByAttack: [true, false] }, 300);
    switchSurvivorAttack(state);
    stepSurvivor(state, idle, 16);
    switchSurvivorAttack(state);
    expect(stepSurvivor(state, idle, 16)).not.toContainEqual(expect.objectContaining({ type: 'chargeRelease' }));
    expect(state.player.x).toBe(x);

    state.elapsedMs = SURVIVOR_SIMULTANEOUS_ATTACKS_MS - 400;
    stepSurvivor(state, { ...idle, chargeByAttack: [true, false] }, 300);
    stepSurvivor(state, { ...idle, chargeByAttack: [true, true] }, 600);
    const released = stepSurvivor(state, { ...idle, chargeByAttack: [false, true] }, 16);
    expect(released).toContainEqual(expect.objectContaining({ type: 'chargeRelease', style: 'teleporte' }));
    expect(released).not.toContainEqual(expect.objectContaining({ style: 'foco' }));
    expect(state.player.x).toBeGreaterThan(x);
    expect(stepSurvivor(state, { ...idle, chargeByAttack: [false, false] }, 16)).toContainEqual(expect.objectContaining({ type: 'chargeRelease', style: 'foco' }));
  });

  it('carrega e ativa a trilha alternativa por comando próprio com ambos os golpes ativos', () => {
    const state = createRun('projetil', 'trilha');
    state.elapsedMs = SURVIVOR_SIMULTANEOUS_ATTACKS_MS;
    stepSurvivor(state, { ...idle, dx: 1 }, 100);
    expect(survivorPlayerAttacks(state)?.players[1].trailCharge).toBeGreaterThan(0);
    state.attackSlots!.stored.trailCharge = 1;
    stepSurvivor(state, { ...idle, chargeByAttack: [true, false] }, 16);
    expect(survivorPlayerAttacks(state)?.players[1].trailPath).toHaveLength(0);
    stepSurvivor(state, { ...idle, chargeByAttack: [false, true] }, 16);
    expect(survivorPlayerAttacks(state)?.players[1].trailPath).toHaveLength(1);
    expect(state.player.trailPath).toBeUndefined();
  });

  it('aplica a Presa de Dragão nos dois golpes e cura apenas uma vez', () => {
    const state = createRun('projetil', 'area');
    const stats = survivorPlayerAttacks(state)!.players.map((player) => player.attackDamage);
    const hp = state.player.maxHp;
    state.player.hp -= 20;
    offer(state, 'held:presa-dragao');
    applyUpgrade(state, 'held:presa-dragao');
    expect(state.player.maxHp).toBe(hp + 8);
    expect(state.player.hp).toBe(hp - 12);
    expect(survivorPlayerAttacks(state)!.players.map((player) => player.attackDamage)).toEqual(stats.map((damage) => Math.round(damage * 110) / 100));
  });

  it.each(['mina', 'poço', 'bolha'] as const)('preserva o elemento do golpe que criou %s após a troca', (kind) => {
    const state = createRun('projetil', 'projetil');
    const target = enemy(state, 80);
    const origin = { id: 12, attackIndex: 1 as const, x: target.x, y: target.y, damage: 20, radius: 45 };
    if (kind === 'mina') state.heldMines = [{ ...origin, timerMs: 10, enemyId: target.id }];
    if (kind === 'poço') state.gravityWells = [{ ...origin, ageMs: 0, lifeMs: 10, pull: 5 }];
    if (kind === 'bolha') state.timeBubbles = [{ ...origin, ageMs: 0, lifeMs: 10, repeats: 1 }];
    state.player.attackTimerMs = 1000;
    stepSurvivor(state, idle, 16);
    expect(target).toMatchObject({ burnMs: expect.any(Number) });
    expect(target.hp).toBeLessThan(5000);
    expect(state.player.move.type).toBe('normal');
    expect(state.attackSlots?.loaded).toBe(0);
  });

  it('deixa o segundo autoataque mirar um inimigo vivo se o primeiro já derrubou o mais próximo', () => {
    const state = createRun('area', 'projetil');
    state.elapsedMs = SURVIVOR_SIMULTANEOUS_ATTACKS_MS;
    const weakest = enemy(state, 55);
    weakest.hp = 1;
    const surviving = { ...enemy(state, 95), id: 2, x: state.player.x + 70, y: state.player.y + 70 };
    state.enemies[1] = surviving;
    stepSurvivor(state, idle, 16);
    expect(weakest.hp).toBeLessThanOrEqual(0);
    expect(state.projectiles.some((projectile) => projectile.attackIndex === 1 && projectile.vy > 0)).toBe(true);
  });
});
