import { describe, expect, it } from 'vitest';
import { shadeHalftone } from './halftone-sprite-cache';

describe('retícula das sprites da Vila', () => {
  it('escurece pontos alternados sem alterar a transparência', () => {
    const pixels = new Uint8ClampedArray([
      160, 110, 90, 128, 160, 110, 90, 255, 160, 110, 90, 255, 160, 110, 90, 255,
      160, 110, 90, 255, 160, 110, 90, 255, 160, 110, 90, 255, 160, 110, 90, 0,
      160, 110, 90, 255, 255, 255, 255, 255, 160, 110, 90, 255, 160, 110, 90, 255,
    ]);
    const original = pixels.slice();

    shadeHalftone(pixels, 4, 3);

    expect(pixels[0]).toBeLessThan(original[0]!);
    expect(pixels[1]).toBeLessThan(original[1]!);
    expect(pixels[2]).toBeLessThan(original[2]!);
    expect(pixels[3]).toBe(128);
    expect(pixels.slice(4)).toEqual(original.slice(4));
  });
});
