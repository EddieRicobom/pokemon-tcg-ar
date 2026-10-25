import { describe, expect, it } from 'vitest';
import { wrappedFocusIndex } from './sheet-focus';

describe('circulação do foco nas folhas', () => {
  it('envolve os extremos e recupera foco vindo de fora', () => {
    expect(wrappedFocusIndex(2, 3, false)).toBe(0);
    expect(wrappedFocusIndex(0, 3, true)).toBe(2);
    expect(wrappedFocusIndex(-1, 3, false)).toBe(0);
    expect(wrappedFocusIndex(-1, 3, true)).toBe(2);
    expect(wrappedFocusIndex(1, 3, false)).toBeNull();
    expect(wrappedFocusIndex(-1, 0, false)).toBeNull();
  });
});
