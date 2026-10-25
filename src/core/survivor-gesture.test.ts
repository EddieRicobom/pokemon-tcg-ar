import { describe, expect, it } from 'vitest';
import { isBonkDoubleTap, isBonkTap } from './survivor-gesture';

describe('gesto de pulo do BONK', () => {
  it('aceita dois toques curtos e próximos', () => {
    const first = { x: 180, y: 300, at: 1_000 };
    const second = { x: 210, y: 290, at: 1_300 };
    expect(isBonkTap(first, { x: 188, y: 306, at: 1_120 })).toBe(true);
    expect(isBonkDoubleTap(first, second)).toBe(true);
  });

  it('não confunde arrastar ou esperar demais com um duplo toque', () => {
    const first = { x: 180, y: 300, at: 1_000 };
    expect(isBonkTap(first, { x: 210, y: 300, at: 1_100 })).toBe(false);
    expect(isBonkTap(first, { x: 180, y: 300, at: 1_300 })).toBe(false);
    expect(isBonkDoubleTap(first, { x: 180, y: 300, at: 1_500 })).toBe(false);
    expect(isBonkDoubleTap(first, { x: 280, y: 300, at: 1_200 })).toBe(false);
  });
});
