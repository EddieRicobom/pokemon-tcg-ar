import { describe, expect, it } from 'vitest';
import { colorGradient } from './quad-lines';

describe('gradiente de cor', () => {
  it('usa a direção do canal com borda mais forte e não inventa direção em área uniforme', () => {
    const width = 12;
    const height = 12;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = x >= 6 ? 200 : 0;
      data[i + 1] = y >= 6 ? 30 : 0;
      data[i + 3] = 255;
    }
    const gradient = colorGradient({ width, height, data });
    expect(gradient.mag[6 * width + 6]).toBeGreaterThan(0);
    expect(gradient.ang[6 * width + 6]).toBeCloseTo(0);
    expect(gradient.mag[2 * width + 2]).toBe(0);
    expect(gradient.ang[2 * width + 2]).toBe(0);
  });
});
