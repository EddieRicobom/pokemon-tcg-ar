import { describe, expect, it } from 'vitest';
import { createSurvivorState, stepSurvivor } from './survivor';
import type { SurvivorEnemy, SurvivorEvent, SurvivorState } from './survivor';
import {
  chargeStyleFor,
  createSurvivorCharge,
  distanceToSegment,
  FOCUS_CHARGE_PER_SEC,
  focusBeam,
  RAPID_BURST_CYCLE_MS,
  RAPID_BURST_MIN_CYCLE_MS,
  RAPID_BURST_SHOT_INTERVAL_MS,
  rapidBurstShotsBetween,
  TELEPORT_COOLDOWN_MS,
  TELEPORT_FULL_HOLD_MS,
  TELEPORT_MAX_INVULN_MS,
  TELEPORT_MAX_RANGE,
  TELEPORT_MIN_COOLDOWN_MS,
  TELEPORT_MIN_HOLD_MS,
  TELEPORT_MIN_INVULN_MS,
  cancelTeleportHold,
  stepChargeMeter,
  teleportCooldownMs,
  teleportReach,
  teleportRelease,
} from './survivor-charge';
import { attackProfile, categoryForStats, moveFor } from './survivor-moves';
import type { BaseStats } from './survivor-moves';
import { statsOfDex } from './survivor-stats';

const stats = (over: Partial<BaseStats>): BaseStats => ({ hp: 75, attack: 75, defense: 75, spAttack: 75, spDefense: 75, speed: 75, ...over });

describe('quem ganha golpe de carga', () => {
  it('Foco: lento com um ataque alto; Rajada e Teleporte: Velocidade acima de tudo e ataques baixos', () => {
    expect(chargeStyleFor(stats({ speed: 30, attack: 110 }))).toBe('foco');
    expect(chargeStyleFor(stats({ speed: 45, spAttack: 120 }))).toBe('foco');
    expect(chargeStyleFor(stats({ speed: 150, attack: 50, spAttack: 80 }))).toBe('rapido');
    expect(chargeStyleFor(stats({ speed: 150, attack: 80, spAttack: 50 }))).toBe('teleporte');
    expect(chargeStyleFor(stats({ speed: 120, spAttack: 135 }))).toBeNull(); // rápido, mas ataca forte
    expect(chargeStyleFor(stats({ speed: 100, hp: 95 }))).toBeNull(); // a Velocidade não se destaca
    expect(chargeStyleFor(stats({}))).toBeNull();
    expect(chargeStyleFor(null)).toBeNull();
  });

  it('com stats reais: Snorlax e Golem são Foco; Electrode é Rajada e Ninjask é Teleporte', () => {
    expect(moveFor(['normal'], statsOfDex(143)).category).toBe('foco');
    expect(moveFor(['rock'], statsOfDex(76)).category).toBe('foco');
    expect(moveFor(['electric'], statsOfDex(101)).category).toBe('rapido');
    expect(moveFor(['bug'], statsOfDex(291)).category).toBe('teleporte');
    expect(moveFor(['electric'], statsOfDex(25)).category).toBe('area');
    expect(moveFor(['psychic'], statsOfDex(65)).category).toBe('projetil');
    // A forma pelos stats continua a mesma para quem lê só ela.
    expect(categoryForStats(statsOfDex(143)!)).toBe('aura');
  });

  it('todo Pokémon de carga tem números dentro dos limites', () => {
    for (let dex = 1; dex <= 1025; dex++) {
      const s = statsOfDex(dex);
      const move = moveFor(['normal'], s);
      if (move.category !== 'foco' && move.category !== 'rapido' && move.category !== 'teleporte') continue;
      const p = attackProfile(move, s);
      expect(p.damage).toBeGreaterThan(1.5);
      expect(p.cooldownMs).toBeGreaterThan(300);
      expect(p.range).toBeGreaterThan(100);
    }
  });
});

describe('regras da barra', () => {
  it('Foco: segurar enche devagar, soltar dispara e zera; pouca carga não dispara', () => {
    const c = createSurvivorCharge();
    expect(stepChargeMeter(c, 'foco', true, 0, 1000)).toBeNull();
    expect(c.level).toBeCloseTo(FOCUS_CHARGE_PER_SEC);
    expect(stepChargeMeter(c, 'foco', false, 0, 16)).toEqual({ kind: 'focus-release', level: c.lastRelease });
    expect(c.level).toBe(0);
    stepChargeMeter(c, 'foco', true, 0, 100);
    expect(stepChargeMeter(c, 'foco', false, 0, 16)).toBeNull();
    expect(c.level).toBeGreaterThan(0);
  });

  it('Foco: a carta de concentração acelera a carga', () => {
    const plain = createSurvivorCharge();
    const card = createSurvivorCharge();
    stepChargeMeter(plain, 'foco', true, 0, 1000);
    stepChargeMeter(card, 'foco', true, 0, 1000, 2);
    expect(card.level).toBeGreaterThan(plain.level);
  });

  it('Foco: o feixe cresce com a carga e, cheio, cruza a arena', () => {
    const low = focusBeam(0.2, 200);
    const mid = focusBeam(0.7, 200);
    const full = focusBeam(1, 200);
    expect([low.tier, mid.tier, full.tier]).toEqual([1, 2, 3]);
    expect(mid.damageMultiplier).toBeGreaterThan(low.damageMultiplier);
    expect(full.damageMultiplier).toBeGreaterThan(mid.damageMultiplier);
    expect(full.halfWidth).toBeGreaterThan(mid.halfWidth);
    expect(full.length).toBeGreaterThan(2000);
    expect(full.stunMs).toBeGreaterThan(0);
  });

  it('Teleporte: só uma soltura após 150 ms ativa, entra em recarga e não deixa ação fantasma após cancelamento', () => {
    const c = createSurvivorCharge();
    stepChargeMeter(c, 'teleporte', true, 0, TELEPORT_MIN_HOLD_MS - 1);
    expect(stepChargeMeter(c, 'teleporte', false, 0, 1)).toBeNull();
    stepChargeMeter(c, 'teleporte', true, 0, TELEPORT_MIN_HOLD_MS);
    const action = stepChargeMeter(c, 'teleporte', false, 0, 0);
    expect(action).toMatchObject({ kind: 'teleport-release', invulnMs: TELEPORT_MIN_INVULN_MS, wave: false });
    expect(c.teleportCooldownMs).toBe(TELEPORT_COOLDOWN_MS);
    cancelTeleportHold(c);
    expect(stepChargeMeter(c, 'teleporte', false, 0, 100)).toBeNull();
  });

  it('Teleporte cheio ganha o máximo de proteção e uma única onda; Rajada agenda três tiros e depois pausa', () => {
    expect(teleportRelease(TELEPORT_FULL_HOLD_MS)).toMatchObject({ invulnMs: TELEPORT_MAX_INVULN_MS, wave: true });
    expect(teleportRelease(TELEPORT_MIN_HOLD_MS - 1)).toBeNull();
    expect(rapidBurstShotsBetween(0, 181)).toEqual([0, RAPID_BURST_SHOT_INTERVAL_MS, RAPID_BURST_SHOT_INTERVAL_MS * 2]);
    expect(rapidBurstShotsBetween(RAPID_BURST_SHOT_INTERVAL_MS * 2 + 1, RAPID_BURST_CYCLE_MS - RAPID_BURST_SHOT_INTERVAL_MS * 2 - 2)).toEqual([]);
    expect(rapidBurstShotsBetween(RAPID_BURST_CYCLE_MS - 1, 2)).toEqual([1]);
  });

  it('distância ao segmento do feixe', () => {
    expect(distanceToSegment(50, 10, 0, 0, 100, 0)).toBe(10);
    expect(distanceToSegment(-30, 40, 0, 0, 100, 0)).toBe(50);
    expect(distanceToSegment(5, 5, 0, 0, 0, 0)).toBeCloseTo(Math.SQRT2 * 5);
  });
});

function run(category: 'foco' | 'rapido' | 'teleporte'): SurvivorState {
  const s = category === 'foco'
    ? stats({ speed: 30, attack: 120 })
    : category === 'rapido' ? stats({ speed: 150, attack: 60, spAttack: 60 }) : stats({ speed: 150, attack: 80, spAttack: 60 });
  const move = moveFor(['normal'], s);
  expect(move.category).toBe(category);
  const state = createSurvivorState(9, { kindCount: 1, move, profile: attackProfile(move, s) });
  state.nextBossAtMs = Number.POSITIVE_INFINITY;
  state.spawnAccumMs = -1e9;
  return state;
}
function dummy(id: number, x: number, y: number, hp = 100_000): SurvivorEnemy {
  return { id, kind: 0, boss: false, grade: 'comum', x, y, hp, maxHp: hp, speed: 0, damage: 0, radius: 13, hitFlashMs: 0 };
}
function hold(state: SurvivorState, ms: number, input: { dx?: number; dy?: number; charge?: boolean }): SurvivorEvent[] {
  const events: SurvivorEvent[] = [];
  for (let t = 0; t < ms; t += 50) events.push(...stepSurvivor(state, { dx: input.dx ?? 0, dy: input.dy ?? 0, charge: input.charge }, 50));
  return events;
}

describe('no jogo', () => {
  it('Foco: carregar deixa lento; o canhão cheio atravessa todos na linha e só eles', () => {
    const free = run('foco');
    const charging = run('foco');
    const x0 = free.player.x;
    hold(free, 1000, { dx: 1 });
    hold(charging, 1000, { dx: 1, charge: true });
    expect(charging.player.x - x0).toBeLessThan((free.player.x - x0) * 0.6);

    const state = run('foco');
    const { x, y } = state.player;
    const near = dummy(1, x + 100, y);
    const far = dummy(2, x + 900, y);
    const aside = dummy(3, x + 100, y + 220);
    state.enemies.push(near, far, aside);
    hold(state, 4000, { charge: true });
    expect(state.charge.level).toBe(1);
    expect(far.hp).toBe(far.maxHp); // o disparo normal não chega tão longe
    const events = hold(state, 50, { charge: false });
    expect(events).toContainEqual(expect.objectContaining({ type: 'chargeRelease', style: 'foco', name: 'Canhão total', level: 1 }));
    expect(far.hp).toBeLessThan(far.maxHp);
    expect(aside.hp).toBe(aside.maxHp);
    expect(state.fx.some((f) => f.kind === 'beam')).toBe(true);
  });

  it('Rajada: solta três tiros no tempo e espera antes da próxima onda', () => {
    const state = run('rapido');
    const target = dummy(1, state.player.x + 120, state.player.y);
    state.enemies.push(target);
    hold(state, 1, {});
    const afterFirstShot = state.nextId;
    stepSurvivor(state, { dx: 0, dy: 0 }, 89);
    expect(state.nextId).toBe(afterFirstShot);
    stepSurvivor(state, { dx: 0, dy: 0 }, 1);
    expect(state.nextId).toBe(afterFirstShot + 1);
    hold(state, 90, {});
    expect(state.nextId).toBe(afterFirstShot + 2);
    hold(state, 300, {});
    expect(state.nextId).toBe(afterFirstShot + 2);
  });

  it('Teleporte: uma soltura válida causa um único dano; cheio dá proteção maior e onda sem segundo dano', () => {
    const state = run('teleporte');
    state.player.aimAngle = 0;
    const target = dummy(1, state.player.x + 240, state.player.y);
    const boss = { ...dummy(2, state.player.x + 300, state.player.y), boss: true };
    state.enemies.push(target, boss);
    hold(state, 1200, { charge: true });
    const before = target.hp;
    const bossBefore = boss.x;
    const events = stepSurvivor(state, { charge: false, dx: 0, dy: 0 }, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'chargeRelease', style: 'teleporte', name: 'Onda total' }));
    expect(state.player.invulnMs).toBeGreaterThanOrEqual(TELEPORT_MAX_INVULN_MS - 1);
    expect(target.hp).toBeLessThan(target.maxHp);
    expect(before - target.hp).toBeLessThan(state.player.attackDamage * 10);
    expect(boss.x - bossBefore).toBeGreaterThan(0);
    expect(state.fx.some((f) => f.kind === 'rush')).toBe(true);
  });
});

describe('cartas e entrada do Teleporte e da Rajada', () => {
  it('teleportReach e teleportCooldownMs: padrões, teto, piso e alargamento por disparo extra', () => {
    expect(teleportReach(240, 54, 1)).toEqual({ range: 240, hitRadius: 54, waveRadius: 150 });
    expect(teleportReach(900, 54, 1).range).toBe(TELEPORT_MAX_RANGE);
    expect(teleportReach(Number.NaN, 0, 3)).toMatchObject({ range: 240 });
    expect(teleportReach(240, 54, 3).hitRadius).toBeCloseTo(54 * 1.4, 5);
    expect(teleportReach(240, 54, 99).waveRadius).toBeCloseTo(150 * 1.8, 5);
    expect(teleportCooldownMs(1500, 0)).toBe(1500);
    expect(teleportCooldownMs(1500, 3)).toBe(938);
    expect(teleportCooldownMs(240, 0)).toBe(TELEPORT_MIN_COOLDOWN_MS);
    expect(teleportCooldownMs(Number.NaN, 0)).toBe(TELEPORT_COOLDOWN_MS);
  });

  it('soltar o botão dispara o Teleporte; soltar com cancelamento explícito não dispara', () => {
    const released = (cancel: boolean): boolean => {
      const state = run('teleporte');
      state.player.aimAngle = 0;
      hold(state, 500, { charge: true });
      const events = stepSurvivor(state, { dx: 0, dy: 0, charge: false, ...(cancel ? { cancelCharge: true } : {}) }, 16);
      return events.some((event) => event.type === 'chargeRelease');
    };
    expect(released(false)).toBe(true);
    expect(released(true)).toBe(false);
  });

  it('a recarga do Teleporte vem da cadência do jogador, com piso', () => {
    const cooldownAfterRelease = (attackCooldownMs: number): number => {
      const state = run('teleporte');
      state.player.attackCooldownMs = attackCooldownMs;
      hold(state, 500, { charge: true });
      stepSurvivor(state, { dx: 0, dy: 0, charge: false }, 1);
      return state.charge.teleportCooldownMs;
    };
    expect(cooldownAfterRelease(1500)).toBe(1500);
    expect(cooldownAfterRelease(1200)).toBe(1200);
    expect(cooldownAfterRelease(240)).toBe(TELEPORT_MIN_COOLDOWN_MS);
  });

  it('alcance e disparos extras mudam onde o Teleporte cai e quem ele acerta', () => {
    const landed = (range: number): number => {
      const state = run('teleporte');
      state.player.aimAngle = 0;
      state.player.attackRange = range;
      const x0 = state.player.x;
      hold(state, TELEPORT_FULL_HOLD_MS, { charge: true });
      stepSurvivor(state, { dx: 0, dy: 0, charge: false }, 1);
      return state.player.x - x0;
    };
    expect(landed(240)).toBeCloseTo(240, 3);
    expect(landed(360)).toBeCloseTo(360, 3);
    expect(landed(900)).toBeCloseTo(TELEPORT_MAX_RANGE, 3);

    const hitWith = (shots: number): boolean => {
      const state = run('teleporte');
      state.player.aimAngle = 0;
      state.player.attackRange = 240;
      state.player.attackRadius = 50;
      state.player.shots = shots;
      const side = dummy(1, state.player.x + 240, state.player.y + 70);
      state.enemies.push(side);
      hold(state, TELEPORT_FULL_HOLD_MS, { charge: true });
      stepSurvivor(state, { dx: 0, dy: 0, charge: false }, 1);
      return side.hp < side.maxHp;
    };
    expect(hitWith(1)).toBe(false);
    expect(hitWith(3)).toBe(true);
  });

  it('o dano do Teleporte não cai quando as cartas encurtam a recarga do golpe', () => {
    const damageWith = (attackCooldownMs: number): number => {
      const state = run('teleporte');
      state.player.aimAngle = 0;
      state.player.attackCooldownMs = attackCooldownMs;
      const target = dummy(1, state.player.x + 240, state.player.y);
      state.enemies.push(target);
      hold(state, TELEPORT_FULL_HOLD_MS, { charge: true });
      stepSurvivor(state, { dx: 0, dy: 0, charge: false }, 1);
      return target.maxHp - target.hp;
    };
    expect(damageWith(240)).toBeGreaterThan(0);
    expect(damageWith(240)).toBeCloseTo(damageWith(1500), 5);
  });

  it('Rajada: disparos extras viram leque em cada instante e a cadência tem piso', () => {
    const state = run('rapido');
    state.player.shots = 3;
    state.player.attackCooldownMs = 240;
    state.enemies.push(dummy(1, state.player.x + 120, state.player.y));
    const before = state.nextId;
    stepSurvivor(state, { dx: 0, dy: 0 }, 16);
    expect(state.nextId).toBe(before + 3);
    expect(state.player.attackTimerMs).toBe(RAPID_BURST_MIN_CYCLE_MS);
  });
});
