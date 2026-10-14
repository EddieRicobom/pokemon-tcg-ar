import { describe, expect, it } from 'vitest';
import { adaptiveTauMs, FAST_ERROR, smoothingAlpha, TAU_FAST_MS, TAU_SLOW_MS } from './smoothing';

describe('suavização adaptativa', () => {
  it('parado usa a constante longa e em movimento a curta', () => {
    expect(adaptiveTauMs(0, 0)).toBe(TAU_SLOW_MS);
    expect(adaptiveTauMs(FAST_ERROR, 0)).toBe(TAU_FAST_MS);
    expect(adaptiveTauMs(5, 3)).toBe(TAU_FAST_MS);
  });

  it('é monótona: quanto maior o erro, menor a constante', () => {
    let last = Infinity;
    for (const e of [0, 0.02, 0.05, 0.08, 0.12]) {
      const tau = adaptiveTauMs(e, 0);
      expect(tau).toBeLessThanOrEqual(last);
      last = tau;
    }
  });

  it('ângulo também conta, e valores negativos são tratados como zero', () => {
    expect(adaptiveTauMs(0, 0.2)).toBeLessThan(TAU_SLOW_MS);
    expect(adaptiveTauMs(-1, -1)).toBe(TAU_SLOW_MS);
  });

  it('alpha cresce com o tempo e fica entre 0 e 1', () => {
    expect(smoothingAlpha(0, 50)).toBe(0);
    const a = smoothingAlpha(16, 50);
    expect(a).toBeGreaterThan(0);
    expect(smoothingAlpha(160, 50)).toBeGreaterThan(a);
    expect(smoothingAlpha(1e6, 50)).toBeLessThanOrEqual(1);
  });
});
