import { describe, expect, it } from 'vitest';
import { flashAlpha, impactFromFx, moveLight, shadowFrom } from './survivor-impacts';
import type { SurvivorFx } from './survivor-types';

const fx = (over: Partial<SurvivorFx>): SurvivorFx => ({ kind: 'blast', x: 100, y: 100, r: 60, color: '#fff', ageMs: 0, lifeMs: 300, moveType: 'fire', ...over });

describe('impacto dos golpes', () => {
  it('a forma do impacto segue a forma do golpe', () => {
    expect(impactFromFx(fx({}), 0)?.shape).toBe('round');
    expect(impactFromFx(fx({ kind: 'pulse' }), 0)?.shape).toBe('round');
    const cone = impactFromFx(fx({ kind: 'cone', angle: 1, spread: 0.5 }), 0);
    expect(cone).toMatchObject({ shape: 'cone', angle: 1, spread: 0.5 });
    const beam = impactFromFx(fx({ kind: 'beam', r: 12, fromX: 0, fromY: 0, toX: 300, toY: 400 }), 0);
    expect(beam).toMatchObject({ shape: 'line', r: 12, length: 500 });
  });

  it('guarda o tipo do golpe e cresce com a corrida', () => {
    expect(impactFromFx(fx({ moveType: 'ice' }), 0)?.type).toBe('ice');
    expect(impactFromFx(fx({}), 1)!.r).toBeGreaterThan(impactFromFx(fx({}), 0)!.r);
  });

  it('golpe pequeno, sem tipo ou que não acerta o chão não solta partículas', () => {
    expect(impactFromFx(fx({ r: 10 }), 1)).toBeNull();
    expect(impactFromFx(fx({ moveType: undefined }), 1)).toBeNull();
    expect(impactFromFx(fx({ kind: 'heal' }), 1)).toBeNull();
    expect(impactFromFx(fx({ kind: 'beam', fromX: 0, fromY: 0, toX: 5, toY: 5 }), 1)).toBeNull();
  });
});

describe('luz que sai dos golpes', () => {
  it('fogo e raio clareiam mais que sombra', () => {
    expect(moveLight('fire')).toBeGreaterThan(moveLight('normal'));
    expect(moveLight('dark')).toBeLessThan(moveLight('normal'));
  });

  it('o clarão apaga até zero', () => {
    expect(flashAlpha(0, 400)).toBe(1);
    expect(flashAlpha(200, 400)).toBeCloseTo(0.25);
    expect(flashAlpha(400, 400)).toBe(0);
  });

  it('sem luz por perto não há sombra, e com luz ela aponta para longe dela', () => {
    expect(shadowFrom(0, 0, 10, [], 20)).toBeNull();
    expect(shadowFrom(0, 0, 10, [{ x: 500, y: 0, r: 60, alpha: 1 }], 20)).toBeNull();
    const cast = shadowFrom(0, 0, 10, [{ x: -40, y: 0, r: 100, alpha: 1 }], 20);
    expect(cast?.angle).toBeCloseTo(0);
    expect(cast!.reach).toBeGreaterThan(10);
  });
});
