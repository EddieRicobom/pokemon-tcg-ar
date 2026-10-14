import { describe, expect, it } from 'vitest';
import { normalizeVisual } from './visual-settings';

describe('configurações visuais', () => {
  it('aceita só modos de suavização conhecidos', () => {
    expect(normalizeVisual({ smoothing: 'macio' })).toEqual({ smoothing: 'macio' });
    expect(normalizeVisual({ smoothing: 'xyz' as never })).toEqual({ smoothing: 'bordas' });
    expect(normalizeVisual(null)).toEqual({ smoothing: 'bordas' });
  });
});
