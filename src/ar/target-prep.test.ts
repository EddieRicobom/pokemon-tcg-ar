import { describe, expect, it } from 'vitest';
import { toLumaGray } from './target-prep';

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
