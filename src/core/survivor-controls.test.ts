import { describe, expect, it } from 'vitest';
import { survivorStick } from './survivor-controls';

describe('analógico da Torre', () => {
  it('ignora tremores e preserva direção e limite do gesto', () => {
    expect(survivorStick(3, 4, 50)).toEqual({ dx: 0, dy: 0 });
    const diagonal = survivorStick(60, 80, 50);
    expect(diagonal.dx).toBeCloseTo(0.6);
    expect(diagonal.dy).toBeCloseTo(0.8);
    expect(survivorStick(0, -20, 50).dy).toBeCloseTo(-1 / 3);
  });
});
