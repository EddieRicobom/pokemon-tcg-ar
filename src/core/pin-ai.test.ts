import { describe, expect, it } from 'vitest';
import { seededRng } from './battle';
import { bestPlan, candidatePlans, cloneWorld, evaluate, planEnemyShot, SIM_BUDGET, simulate } from './pin-ai';
import type { EnemyPlan } from './pin-ai';
import { aliveOf, ARENA_RADIUS, chooseEnemyShot, createWorld, launch, pinFromSpec, stepWorld } from './pins';
import type { Pin, PinSpec, PinWorld } from './pins';
import type { BaseStats } from './pokemon-data';

const stats = (over: Partial<BaseStats> = {}): BaseStats => ({ hp: 70, attack: 70, defense: 70, spAttack: 70, spDefense: 70, speed: 70, ...over });
const spec = (id: string, over: Partial<PinSpec> = {}): PinSpec => ({ id, name: id, types: ['normal'], stats: stats(), weightKg: 30, ...over });
function pinAt(id: string, side: 0 | 1, x: number, y: number): Pin {
  const pin = pinFromSpec(spec(id), side);
  pin.x = x;
  pin.y = y;
  return pin;
}
const flat = (pins: Pin[]): PinWorld => ({ radius: ARENA_RADIUS, patches: [], pins, time: 0, terrain: null, limit: ARENA_RADIUS });

/** Joga a jogada de verdade (passo do jogo, 1/120 s) e conta quem caiu de cada lado. */
function play(world: PinWorld, plan: EnemyPlan | null): { mine: number; theirs: number } {
  const before = { mine: aliveOf(world, 0).length, theirs: aliveOf(world, 1).length };
  if (plan) launch(world.pins.find((p) => p.id === plan.pinId)!, plan.shot, plan.moveIndex);
  for (let t = 0; t < 4; t += 1 / 120) stepWorld(world, 1 / 120);
  return { mine: before.mine - aliveOf(world, 0).length, theirs: before.theirs - aliveOf(world, 1).length };
}

describe('IA do Pin Mode: simular antes de jogar', () => {
  it('simular não mexe no mundo de verdade', () => {
    const w = flat([pinAt('e', 1, 0, -120), pinAt('m', 0, 0, 200)]);
    const snapshot = JSON.stringify(w.pins);
    simulate(w, { pinId: 'e', shot: { dirX: 0, dirY: 1, power: 1 }, moveIndex: null });
    bestPlan(w, seededRng(1), 50);
    expect(JSON.stringify(w.pins)).toBe(snapshot);
    expect(cloneWorld(w).pins[0]).not.toBe(w.pins[0]);
  });

  it('a nota premia derrubar e pune cair junto', () => {
    const before = flat([pinAt('e', 1, 0, -100), pinAt('m', 0, 0, 100)]);
    const knocked = cloneWorld(before);
    knocked.pins[1]!.alive = false;
    const suicide = cloneWorld(before);
    suicide.pins[0]!.alive = false;
    expect(evaluate(before, knocked)).toBeGreaterThan(evaluate(before, before));
    expect(evaluate(before, suicide)).toBeLessThan(evaluate(before, before));
  });

  it('derruba o seu pin que está perto da borda, no Difícil, quase sempre', () => {
    let outs = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const angle = seed * 0.5;
      const w = flat([pinAt('e', 1, Math.cos(angle) * 60, Math.sin(angle) * 60), pinAt('m', 0, Math.cos(angle + 2.4) * 250, Math.sin(angle + 2.4) * 250)]);
      const plan = planEnemyShot(w, seededRng(seed), 'dificil');
      const r = play(w, plan);
      if (r.mine > 0 && r.theirs === 0) outs++;
    }
    expect(outs).toBeGreaterThanOrEqual(10);
  });

  it('não se joga para fora: com o próprio pin na borda, não cai junto', () => {
    let falls = 0;
    for (let seed = 1; seed <= 10; seed++) {
      // Pin dele colado na borda, o seu no meio, do outro lado: o tiro direto passa reto e cai.
      const w = flat([pinAt('e', 1, 0, -280), pinAt('m', 0, 0, 40), pinAt('m2', 0, 120, 0)]);
      const r = play(w, planEnemyShot(w, seededRng(seed), 'dificil'));
      if (r.theirs > 0) falls++;
    }
    expect(falls).toBeLessThanOrEqual(1);
  });

  it('em mesas sorteadas, derruba bem mais que a mira antiga', () => {
    let smart = 0;
    let old = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const make = () => {
        const w = createWorld({ mine: [spec('m1'), spec('m2'), spec('m3')], enemy: [spec('e1'), spec('e2'), spec('e3')] }, seededRng(seed * 7));
        w.patches = [];
        w.terrain = null;
        // Espalha os pins para a mesa não começar sempre igual.
        const rng = seededRng(seed);
        for (const p of w.pins) {
          const a = rng() * Math.PI * 2;
          const d = 60 + rng() * 200;
          p.x = Math.cos(a) * d;
          p.y = Math.sin(a) * d;
        }
        return w;
      };
      const a = make();
      const ra = play(a, planEnemyShot(a, seededRng(seed), 'dificil'));
      smart += ra.mine - ra.theirs;
      const b = make();
      const rb = play(b, chooseEnemyShot(b, seededRng(seed), 'dificil'));
      old += rb.mine - rb.theirs;
    }
    expect(smart).toBeGreaterThan(old);
    expect(smart).toBeGreaterThanOrEqual(8);
  });

  it('candidatas usam golpes prontos e ignoram o Escudo; respeitam o limite de simulações', () => {
    const w = createWorld({ mine: [spec('m1'), spec('m2')], enemy: [spec('e1', { attacks: [{ name: 'Choque', cost: ['Lightning'], damage: '30' }] as never })] }, seededRng(3));
    const plans = candidatePlans(w);
    const shooter = w.pins.find((p) => p.id === 'e1')!;
    expect(plans.some((p) => p.moveIndex !== null)).toBe(shooter.moves.some((m) => m.effect.kind !== 'escudo'));
    expect(plans.length).toBeGreaterThanOrEqual(24);
    expect(SIM_BUDGET.dificil).toBeGreaterThan(SIM_BUDGET.normal);
    expect(plans.every((p) => p.pinId === 'e1')).toBe(true);
    expect(plans.every((p) => p.shot.power > 0 && p.shot.power <= 1)).toBe(true);
  });

  it('decide rápido o bastante (6 contra 6, Difícil)', () => {
    const w = createWorld({ mine: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => spec(id)), enemy: ['g', 'h', 'i', 'j', 'k', 'l'].map((id) => spec(id)) }, seededRng(9));
    const t0 = performance.now();
    expect(planEnemyShot(w, seededRng(2), 'dificil')).not.toBeNull();
    // No computador do teste; no celular é algumas vezes mais lento (o adversário já espera ~0,9 s "mirando").
    expect(performance.now() - t0).toBeLessThan(1500);
  });

  it('o Fácil continua com a mira simples e sem alvo não joga', () => {
    const w = flat([pinAt('e', 1, 0, -100), pinAt('m', 0, 0, 100)]);
    expect(planEnemyShot(w, seededRng(1), 'facil')?.pinId).toBe('e');
    expect(planEnemyShot(flat([pinAt('e', 1, 0, 0)]), seededRng(1), 'dificil')).toBeNull();
  });
});
