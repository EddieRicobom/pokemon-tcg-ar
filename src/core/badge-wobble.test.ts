import { describe, expect, it } from 'vitest';
import { isResting, restingWobble, secondDerivative, SHAKE_DURATION, shakeOffset, stepWobble } from './badge-wobble';

describe('balanço das insígnias na maleta', () => {
  it('parada continua parada sem aceleração', () => {
    const s = [restingWobble(), restingWobble()];
    expect(stepWobble(s, { x: 0, y: 0 }, 0.016)).toEqual([]);
    expect(s.every(isResting)).toBe(true);
  });

  it('a maleta acelera para um lado e a insígnia fica para trás, bate na borda e volta ao centro', () => {
    const s = [restingWobble()];
    const clinks = stepWobble(s, { x: 400, y: 0 }, 0.1);
    expect(s[0]!.x).toBeLessThan(0);
    expect(Math.hypot(s[0]!.x, s[0]!.y)).toBeLessThanOrEqual(1 + 1e-9);
    expect(clinks).toHaveLength(1);
    expect(clinks[0]!.order).toBe(0);
    expect(clinks[0]!.strength).toBeGreaterThan(0);
    expect(clinks[0]!.strength).toBeLessThanOrEqual(1);
    for (let i = 0; i < 300; i++) stepWobble(s, { x: 0, y: 0 }, 1 / 60);
    expect(isResting(s[0]!)).toBe(true);
  });

  it('empurrão fraco balança sem bater', () => {
    const s = [restingWobble()];
    expect(stepWobble(s, { x: 20, y: 0 }, 0.05)).toEqual([]);
    expect(isResting(s[0]!)).toBe(false);
  });

  it('quadro muito longo não faz a mola explodir', () => {
    const s = [restingWobble()];
    stepWobble(s, { x: 1000, y: 500 }, 2);
    expect(Number.isFinite(s[0]!.x)).toBe(true);
    expect(Math.hypot(s[0]!.x, s[0]!.y)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('as insígnias não balançam todas iguais', () => {
    const s = [restingWobble(), restingWobble(), restingWobble()];
    stepWobble(s, { x: 60, y: 0 }, 0.03);
    expect(new Set(s.map((w) => w.x.toFixed(5))).size).toBe(3);
  });

  it('chacoalhada do botão vai e volta e acaba', () => {
    expect(shakeOffset(-0.1)).toBeNull();
    expect(shakeOffset(SHAKE_DURATION + 0.01)).toBeNull();
    const xs = Array.from({ length: 40 }, (_, i) => shakeOffset((i / 40) * SHAKE_DURATION)!.x);
    expect(Math.max(...xs)).toBeGreaterThan(0.02);
    expect(Math.min(...xs)).toBeLessThan(-0.02);
    expect(Math.abs(shakeOffset(SHAKE_DURATION)!.x)).toBeLessThan(1e-9);
  });

  it('segunda derivada numérica', () => {
    expect(secondDerivative(0, 1, 4, 1)).toBe(2);
    expect(secondDerivative(0, 1, 2, 0)).toBe(0);
  });
});
