import { describe, expect, it } from 'vitest';
import { arLookFromOrientation } from './ar-look';

describe('janela de visão do AR Beta da Vila', () => {
  it('fica centrada no aparelho na pose inicial', () => {
    expect(arLookFromOrientation({ alpha: 120, beta: 70 }, { alpha: 120, beta: 70 })).toEqual({ x: 0, y: 0 });
  });

  it('trata a volta do ângulo sem saltar pelo círculo inteiro', () => {
    expect(arLookFromOrientation({ alpha: 2, beta: 70 }, { alpha: 358, beta: 70 }).x).toBeCloseTo(-0.48);
  });

  it('limita o deslocamento para não perder o mapa', () => {
    expect(arLookFromOrientation({ alpha: 20, beta: 160 }, { alpha: 200, beta: 0 })).toEqual({ x: 8, y: 5 });
  });
});
