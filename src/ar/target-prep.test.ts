import { describe, expect, it } from 'vitest';
import { cropRect, toLumaGray } from './target-prep';

describe('cropRect', () => {
  it('recorta em pixels inteiros dentro da imagem', () => {
    expect(cropRect(600, 825, [0.06, 0.1, 0.94, 0.56])).toEqual({ x: 36, y: 83, w: 528, h: 379 });
    expect(cropRect(100, 100, [-0.5, -0.5, 2, 2])).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });
});

describe('toLumaGray', () => {
  it('usa luminância e não mexe no alfa', () => {
    const px = new Uint8ClampedArray([255, 0, 0, 200, 0, 255, 0, 255, 0, 0, 255, 10, 90, 90, 90, 255]);
    toLumaGray(px);
    expect(Array.from(px)).toEqual([76, 76, 76, 200, 150, 150, 150, 255, 29, 29, 29, 10, 90, 90, 90, 255]);
  });

  it('difere da média simples em cor viva', () => {
    const px = new Uint8ClampedArray([255, 255, 0, 255]);
    toLumaGray(px);
    expect(px[0]).toBe(226); // média simples daria 170
  });
});
