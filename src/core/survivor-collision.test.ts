import { describe, expect, it } from 'vitest';
import { nearestSurvivorLandscapeFreePoint, resolveSurvivorLandscapeMove, survivorCircleHitsLandscape } from './survivor-collision';

const grid = {
  cols: 4,
  rows: 3,
  cellSize: 16,
  // Uma rocha na segunda coluna, segunda linha.
  solid: new Uint8Array([
    0, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 0, 0,
  ]),
};

describe('colisão da paisagem da Torre', () => {
  it('detecta obstáculos circulares e repete a grade entre os setores', () => {
    expect(survivorCircleHitsLandscape(grid, 24, 24, 6)).toBe(true);
    expect(survivorCircleHitsLandscape(grid, 24 + 64, 24 + 48, 6)).toBe(true);
    expect(survivorCircleHitsLandscape(grid, 8, 8, 6)).toBe(false);
  });

  it('leva o jogador para a clareira mais próxima se uma troca de região nascer sobre ele', () => {
    const cleared = nearestSurvivorLandscapeFreePoint(grid, { x: 24, y: 24 }, 6);
    expect(cleared).not.toEqual({ x: 24, y: 24 });
    expect(survivorCircleHitsLandscape(grid, cleared.x, cleared.y, 6)).toBe(false);
  });

  it('barra o avanço pela rocha, mas deixa o jogador deslizar pela lateral', () => {
    const stopped = resolveSurvivorLandscapeMove(grid, { x: 8, y: 24 }, { x: 40, y: 24 }, 6);
    expect(stopped.x).toBeLessThanOrEqual(10);
    expect(stopped.y).toBe(24);

    const sliding = resolveSurvivorLandscapeMove(grid, { x: 8, y: 8 }, { x: 40, y: 40 }, 6);
    expect(sliding.y).toBeGreaterThan(8);
    expect(survivorCircleHitsLandscape(grid, sliding.x, sliding.y, 6)).toBe(false);
  });
});
