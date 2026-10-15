import { describe, expect, it } from 'vitest';
import { BOX_FRAME_BUDGET_BYTES, frameCacheFor } from './creature';

describe('memória dos quadros por Pokémon na caixa', () => {
  it('com poucos Pokémon, cada um tem o teto de 6 MB', () => {
    expect(frameCacheFor(1)).toBe(6 * 1024 * 1024);
    expect(frameCacheFor(6)).toBe(6 * 1024 * 1024);
  });

  it('com 40, a memória total fica dentro do orçamento', () => {
    const each = frameCacheFor(40);
    expect(each).toBeLessThan(6 * 1024 * 1024);
    expect(each * 40).toBeLessThanOrEqual(BOX_FRAME_BUDGET_BYTES);
    expect(each).toBeGreaterThan(512 * 1024 - 1);
  });

  it('nunca passa do orçamento além do piso e trata contagem inválida', () => {
    for (const n of [7, 10, 20, 30, 40]) expect(frameCacheFor(n) * n).toBeLessThanOrEqual(BOX_FRAME_BUDGET_BYTES);
    expect(frameCacheFor(0)).toBe(6 * 1024 * 1024);
    expect(frameCacheFor(Number.NaN)).toBeGreaterThan(0);
  });
});
