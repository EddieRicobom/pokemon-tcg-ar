import { describe, expect, it } from 'vitest';
import { createSurvivorState, stepSurvivor } from './survivor';
import type { SurvivorEnemy, SurvivorEvent, SurvivorState } from './survivor';
import {
  chargeStyleFor,
  createSurvivorCharge,
  distanceToSegment,
  FOCUS_CHARGE_PER_SEC,
  focusBeam,
  RUSH_FILL_DISTANCE,
  RUSH_INVULN_MS,
  rushDamageTakenMultiplier,
  rushDurationMs,
  stepChargeMeter,
} from './survivor-charge';
import { attackProfile, categoryForStats, moveFor } from './survivor-moves';
import type { BaseStats } from './survivor-moves';
import { statsOfDex } from './survivor-stats';

const stats = (over: Partial<BaseStats>): BaseStats => ({ hp: 75, attack: 75, defense: 75, spAttack: 75, spDefense: 75, speed: 75, ...over });

describe('quem ganha golpe de carga', () => {
  it('Foco: lento com um ataque alto; Rápido: Velocidade acima de tudo e ataques baixos', () => {
    expect(chargeStyleFor(stats({ speed: 30, attack: 110 }))).toBe('foco');
    expect(chargeStyleFor(stats({ speed: 45, spAttack: 120 }))).toBe('foco');
    expect(chargeStyleFor(stats({ speed: 150, attack: 50, spAttack: 80 }))).toBe('rapido');
    expect(chargeStyleFor(stats({ speed: 120, spAttack: 135 }))).toBeNull(); // rápido, mas ataca forte
    expect(chargeStyleFor(stats({ speed: 100, hp: 95 }))).toBeNull(); // a Velocidade não se destaca
    expect(chargeStyleFor(stats({}))).toBeNull();
    expect(chargeStyleFor(null)).toBeNull();
  });

  it('com stats reais: Snorlax e Golem são Foco, Electrode e Ninjask são Rápido, Pikachu e Alakazam não mudam', () => {
    expect(moveFor(['normal'], statsOfDex(143)).category).toBe('foco');
    expect(moveFor(['rock'], statsOfDex(76)).category).toBe('foco');
    expect(moveFor(['electric'], statsOfDex(101)).category).toBe('rapido');
    expect(moveFor(['bug'], statsOfDex(291)).category).toBe('rapido');
    expect(moveFor(['electric'], statsOfDex(25)).category).toBe('area');
    expect(moveFor(['psychic'], statsOfDex(65)).category).toBe('projetil');
    // A forma pelos stats continua a mesma para quem lê só ela.
    expect(categoryForStats(statsOfDex(143)!)).toBe('aura');
  });

  it('todo Pokémon de carga tem números dentro dos limites', () => {
    for (let dex = 1; dex <= 1025; dex++) {
      const s = statsOfDex(dex);
      const move = moveFor(['normal'], s);
      if (move.category !== 'foco' && move.category !== 'rapido') continue;
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

  it('Rápido: andar enche, apertar da metade em diante inicia os teleportes; durante eles a barra não enche', () => {
    expect(RUSH_FILL_DISTANCE).toBe(15_000);
    const c = createSurvivorCharge();
    stepChargeMeter(c, 'rapido', false, RUSH_FILL_DISTANCE / 4, 16);
    expect(stepChargeMeter(c, 'rapido', true, 0, 16)).toBeNull(); // só um quarto
    stepChargeMeter(c, 'rapido', false, RUSH_FILL_DISTANCE, 16);
    expect(c.level).toBe(1);
    const action = stepChargeMeter(c, 'rapido', true, 0, 16);
    expect(action).toEqual({ kind: 'rush-start', level: 1, durationMs: 10_000 });
    expect(c.level).toBe(0);
    stepChargeMeter(c, 'rapido', false, 500, 1000);
    expect(c.level).toBe(0);
    expect(c.rushMs).toBe(9000);
  });

  it('Rápido: dura 10 s cheio, metade com meia barra, e as cartas até dobram', () => {
    expect(rushDurationMs(1, 0)).toBe(10_000);
    expect(rushDurationMs(0.5, 0)).toBe(5000);
    expect(rushDurationMs(0.4, 0)).toBe(0);
    expect(rushDurationMs(1, 4)).toBe(20_000);
    expect(rushDurationMs(1, 9)).toBe(20_000);
  });

  it('Rápido: quanto mais rápido se move, mais dano recebe (no máximo o dobro)', () => {
    expect(rushDamageTakenMultiplier(0)).toBe(1);
    expect(rushDamageTakenMultiplier(1)).toBeCloseTo(1.5);
    expect(rushDamageTakenMultiplier(0.5)).toBeLessThan(rushDamageTakenMultiplier(1));
    expect(rushDamageTakenMultiplier(10)).toBe(2);
    expect(rushDamageTakenMultiplier(Number.NaN)).toBe(1);
  });

  it('distância ao segmento do feixe', () => {
    expect(distanceToSegment(50, 10, 0, 0, 100, 0)).toBe(10);
    expect(distanceToSegment(-30, 40, 0, 0, 100, 0)).toBe(50);
    expect(distanceToSegment(5, 5, 0, 0, 0, 0)).toBeCloseTo(Math.SQRT2 * 5);
  });
});

function run(category: 'foco' | 'rapido'): SurvivorState {
  const s = category === 'foco' ? stats({ speed: 30, attack: 120 }) : stats({ speed: 150, attack: 60, spAttack: 60 });
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

  it('Rápido: andar enche a barra; com ela cheia, o golpe vira teleportes que acertam forte e protegem por 2 s', () => {
    const state = run('rapido');
    hold(state, 1000, { dx: 1 });
    expect(state.charge.level).toBeGreaterThan(0);
    expect(state.charge.level).toBeLessThan(0.02);
    expect(state.charge.moveRatio).toBeGreaterThan(0.5);

    state.charge.level = 1;
    const target = dummy(1, state.player.x + 200, state.player.y);
    state.enemies.push(target);
    const events = hold(state, 100, { charge: true });
    expect(events).toContainEqual(expect.objectContaining({ type: 'chargeRelease', style: 'rapido' }));
    expect(state.charge.rushMs).toBeGreaterThan(9000);
    expect(Math.hypot(state.player.x - target.x, state.player.y - target.y)).toBeLessThan(60);
    expect(state.player.invulnMs).toBeGreaterThan(RUSH_INVULN_MS - 200);
    expect(target.hp).toBeLessThan(target.maxHp);
    expect(state.fx.some((f) => f.kind === 'rush')).toBe(true);
  });
});
