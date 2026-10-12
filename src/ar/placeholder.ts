import type { RgbaImage } from '../recognition/types';

/**
 * Marcador neutro para quando não existe sprite do Pokémon (nem GIF nem PNG). É um peão genérico,
 * propositalmente NÃO parecido com um Pokémon: a interface diz que é um marcador, não o Pokémon.
 */
export function makePlaceholder(size = 48): RgbaImage {
  const data = new Uint8ClampedArray(size * size * 4);
  const cx = size / 2;
  const headR = size * 0.18;
  const headY = size * 0.28;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const inHead = Math.hypot(dx, y + 0.5 - headY) <= headR;
      // Corpo: trapézio que alarga para a base.
      const t = (y + 0.5 - size * 0.42) / (size * 0.52);
      const half = size * (0.1 + 0.2 * t);
      const inBody = t >= 0 && t <= 1 && Math.abs(dx) <= half;
      if (inHead || inBody) {
        const o = (y * size + x) * 4;
        data[o] = 120;
        data[o + 1] = 150;
        data[o + 2] = 210;
        data[o + 3] = 255;
      }
    }
  }
  return { width: size, height: size, data };
}
