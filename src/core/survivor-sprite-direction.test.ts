import { describe, expect, it } from 'vitest';
import { survivorSpriteDirection, survivorSpriteDirectionFromAngle } from './survivor-sprite-direction';

describe('direção do sprite da Torre', () => {
  it('usa o eixo dominante e mantém a horizontal em diagonais empatadas', () => {
    expect(survivorSpriteDirection(4, 1)).toBe('right');
    expect(survivorSpriteDirection(-4, 1)).toBe('left');
    expect(survivorSpriteDirection(1, -4)).toBe('up');
    expect(survivorSpriteDirection(1, 4)).toBe('down');
    expect(survivorSpriteDirection(-2, 2)).toBe('left');
  });

  it('preserva a última frente quando não há deslocamento válido', () => {
    expect(survivorSpriteDirection(0, 0, 'up')).toBe('up');
    expect(survivorSpriteDirection(Number.NaN, 1, 'left')).toBe('left');
    expect(survivorSpriteDirectionFromAngle(undefined, -1)).toBe('left');
    expect(survivorSpriteDirectionFromAngle(Math.PI / 2, 1)).toBe('down');
  });
});
