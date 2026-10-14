import { describe, expect, it } from 'vitest';
import { normalizeVisual } from './visual-settings';

describe('configurações visuais', () => {
  it('aceita só modos de suavização conhecidos', () => {
    expect(normalizeVisual({ smoothing: 'macio' })).toEqual({ smoothing: 'macio', lighting: true });
    expect(normalizeVisual({ smoothing: 'xyz' as never })).toEqual({ smoothing: 'bordas', lighting: true });
    expect(normalizeVisual(null)).toEqual({ smoothing: 'bordas', lighting: true });
  });

  it('a luz dos golpes vem ligada e só desliga com false explícito', () => {
    expect(normalizeVisual({ lighting: false }).lighting).toBe(false);
    expect(normalizeVisual({ lighting: undefined }).lighting).toBe(true);
    expect(normalizeVisual({ lighting: 'x' as never }).lighting).toBe(true);
  });
});
