import { describe, expect, it, vi } from 'vitest';
import { firstSpriteFrame, frameIndex, toSprite } from './survivor-sprite';
import { metallicTint } from '../core/metallic';
import { speciesTiles } from '../core/size-scale';
import type { Sprite } from './survivor-sprite';

const first = {} as HTMLCanvasElement;
const second = {} as HTMLCanvasElement;
const sprite: Sprite = { frames: [first, second], delays: [100, 200], durationMs: 300, w: 1, h: 1, bounds: { left: 0, top: 0, right: 1, bottom: 1 }, fit: 1 };

describe('quadros dos sprites da Torre', () => {
  it('respeita a duração dos quadros e repete o ciclo', () => {
    expect([0, 99, 100, 299, 300, -1].map((time) => frameIndex(sprite, time))).toEqual([0, 0, 1, 1, 0, 1]);
  });
  it('mantém a caixa dos pixels, a altura da espécie e a cor metálica opcional', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 0, 200, 50, 30, 255, 0, 0, 0, 0]);
    const gif = { width: 2, height: 2, frames: [{ rgba, delayMs: 100 }], durationMs: 100 };
    const pixels: Uint8ClampedArray[] = [];
    const context = { createImageData: () => ({ data: new Uint8ClampedArray(16) }), putImageData: (image: { data: Uint8ClampedArray }) => pixels.push(image.data) };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    try {
      const plain = toSprite(gif, 25);
      const metal = toSprite(gif, 25, true);
      expect(plain.bounds).toEqual({ left: 0, right: 0.5, top: 0.5, bottom: 1 });
      expect(plain.fit).toBeCloseTo(speciesTiles(25)! * 22);
      expect(metal.fit).toBe(plain.fit);
      expect(pixels[0]).toEqual(rgba);
      expect(pixels[1]).toEqual(metallicTint(rgba));
      expect(rgba[8]).toBe(200);
    } finally { getContext.mockRestore(); }
  });
  it('escolhe uma pose existente e não inventa imagem quando ela falta', () => {
    expect(firstSpriteFrame(sprite)).toBe(first);
    expect(firstSpriteFrame({ right: sprite })).toBe(first);
    expect(firstSpriteFrame({})).toBeNull();
    expect(firstSpriteFrame(null)).toBeNull();
  });
});
