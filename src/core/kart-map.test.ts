import { describe, expect, it } from 'vitest';
import { kartMapProjection } from './kart-map';
import { trackPoint } from './kart-race';

describe('minimapa do Kart', () => {
  it('desenha a pista inteira dentro do viewBox', () => {
    const map = kartMapProjection();
    expect(map.path.startsWith('M')).toBe(true);
    expect(map.path.endsWith(' Z')).toBe(true);
    for (let i = 0; i < 96; i++) {
      const point = trackPoint((i / 96) * Math.PI * 2);
      const p = map.project(point.x, point.z);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(100);
    }
  });
});
