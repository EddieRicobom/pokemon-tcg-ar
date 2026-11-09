import { describe, expect, it } from 'vitest';
import { POKEMON_TYPES } from './pokemon-data';
import { ARENA_SPECIALS, arenaSpecialOf, planSpecial } from './arena-specials';
import type { SpecialStrike } from './arena-specials';
import { distanceToSegment } from './survivor-charge';
import { inSurvivorCone } from './survivor-shapes';
import { SV_ARENA_H, SV_ARENA_W, SV_DODGE_DISTANCE, SV_MON_RADIUS } from './survivor-pvp';

const FIELD = { w: SV_ARENA_W, h: SV_ARENA_H, margin: SV_MON_RADIUS };
const ME = { x: 320, y: 620 };
const FOE = { x: 320, y: 400 };

/** O alvo em (x, y) entra nesta parte do golpe? As mesmas contas que o motor faz no fim do aviso. */
function hits(strike: SpecialStrike, x: number, y: number, origin: { x: number; y: number }): boolean {
  if (strike.kind === 'circle') return Math.hypot(strike.x - x, strike.y - y) <= strike.radius + SV_MON_RADIUS;
  if (strike.kind === 'cone') return inSurvivorCone({ x: strike.x, y: strike.y, aimAngle: strike.angle, facing: 1 }, x, y, strike.range, SV_MON_RADIUS);
  if (strike.kind === 'beam') return distanceToSegment(x, y, strike.x0, strike.y0, strike.x1, strike.y1) <= strike.width + SV_MON_RADIUS;
  return distanceToSegment(x, y, origin.x, origin.y, strike.x, strike.y) <= SV_MON_RADIUS * 2;
}

describe('Especial de cada elemento', () => {
  it('todo elemento tem o próprio Especial, com nome único', () => {
    expect(Object.keys(ARENA_SPECIALS).sort()).toEqual([...POKEMON_TYPES].sort());
    const names = POKEMON_TYPES.map((t) => arenaSpecialOf(t).name);
    expect(new Set(names).size).toBe(POKEMON_TYPES.length);
    for (const t of POKEMON_TYPES) expect(arenaSpecialOf(t).type).toBe(t);
  });

  it.each([...POKEMON_TYPES])('%s: planeja ao menos um golpe, dentro do campo', (type) => {
    const def = arenaSpecialOf(type);
    expect(def.windupMs).toBeGreaterThanOrEqual(400);
    const strikes = planSpecial(def, ME, FOE, FIELD);
    expect(strikes.length).toBeGreaterThan(0);
    for (const s of strikes) {
      if (s.kind === 'circle' || s.kind === 'cone' || s.kind === 'dash') {
        expect(s.x).toBeGreaterThanOrEqual(SV_MON_RADIUS);
        expect(s.x).toBeLessThanOrEqual(SV_ARENA_W - SV_MON_RADIUS);
        expect(s.y).toBeGreaterThanOrEqual(SV_MON_RADIUS);
        expect(s.y).toBeLessThanOrEqual(SV_ARENA_H - SV_MON_RADIUS);
      }
    }
  });

  it.each([...POKEMON_TYPES])('%s: em nenhum ponto do campo o alvo leva mais do que o golpe vale', (type) => {
    const strikes = planSpecial(arenaSpecialOf(type), ME, FOE, FIELD);
    for (let x = 18; x <= SV_ARENA_W - 18; x += 7) {
      for (let y = 100; y <= 800; y += 7) {
        const total = strikes.reduce((sum, s) => sum + (hits(s, x, y, ME) ? s.share : 0), 0);
        expect(total, `(${x}, ${y})`).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it.each([...POKEMON_TYPES])('%s: dá para escapar com uma esquiva, partindo de onde o golpe mirou', (type) => {
    const strikes = planSpecial(arenaSpecialOf(type), ME, FOE, FIELD);
    const escapes = Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2).some((a) => {
      const x = FOE.x + Math.cos(a) * SV_DODGE_DISTANCE * 1.6;
      const y = FOE.y + Math.sin(a) * SV_DODGE_DISTANCE * 1.6;
      return !strikes.some((s) => hits(s, x, y, ME));
    });
    expect(escapes).toBe(true);
  });

  it('nada persegue o alvo: o plano só depende de onde ele estava', () => {
    const def = arenaSpecialOf('fire');
    expect(planSpecial(def, ME, FOE, FIELD)).toEqual(planSpecial(def, ME, FOE, FIELD));
    expect(planSpecial(def, ME, FOE, FIELD)[0]).toMatchObject({ kind: 'circle', x: FOE.x, y: FOE.y });
  });

  it('o arranque não passa da parede', () => {
    const [dash] = planSpecial(arenaSpecialOf('dark'), { x: 40, y: 40 }, { x: 22, y: 22 }, FIELD);
    expect(dash).toMatchObject({ kind: 'dash' });
    if (dash?.kind === 'dash') expect(Math.min(dash.x, dash.y)).toBeGreaterThanOrEqual(SV_MON_RADIUS);
  });
});
