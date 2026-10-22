import { describe, expect, it } from 'vitest';
import { harmonizePlayerSprite, pixelatePlayerSprite } from './player-filter';

describe('filtro de sprite do treinador', () => {
  it('quantiza a paleta sem alterar transparência ou dimensões', () => {
    const result = harmonizePlayerSprite({ w: 2, h: 1, data: Uint8Array.from([241, 117, 33, 255, 20, 30, 40, 0]) });
    expect(result).toMatchObject({ w: 2, h: 1 });
    expect([...result.data]).toEqual([240, 120, 48, 255, 20, 30, 40, 0]);
  });

  it('agrupa cores em blocos 2×2 e preserva pixels transparentes', () => {
    const result = pixelatePlayerSprite({ w: 4, h: 2, data: Uint8Array.from([
      240, 0, 0, 255, 0, 240, 0, 255, 0, 0, 240, 0, 0, 0, 240, 255,
      240, 0, 0, 255, 0, 240, 0, 255, 0, 0, 240, 0, 0, 0, 240, 255,
    ]) }, 2);
    expect([...result.data]).toEqual([
      120, 120, 0, 255, 120, 120, 0, 255, 0, 0, 240, 0, 0, 0, 240, 255,
      120, 120, 0, 255, 120, 120, 0, 255, 0, 0, 240, 0, 0, 0, 240, 255,
    ]);
  });
});
