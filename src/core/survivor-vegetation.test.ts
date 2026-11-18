import { describe, expect, it } from 'vitest';
import { createSurvivorVegetation, survivorVegetationHitTest } from './survivor-vegetation';
import { survivorCircleHitsLandscape } from './survivor-collision';

describe('vegetação do Survivor', () => {
  it('corta a grama e derruba a árvore atingida apenas no setor e região correspondentes', () => {
    const plan = { cols: 2, rows: 2, treeCells: Int32Array.from([1, 1, 0, 0]), grass: Uint8Array.from([0, 0, 1, 0]) };
    const vegetation = createSurvivorVegetation(16, 32, 64, 64);
    vegetation.impact(0, plan, { kind: 'sweep', x: 8, y: 8, toX: 8, toY: 24, radius: 1 });
    const sector = vegetation.sectorAt(0, 0, 0)!;
    expect(sector.felledTrees.has(1)).toBe(true);
    expect(sector.clearedGrass.has(2)).toBe(true);
    expect(sector.chunkVersions.size).toBeGreaterThan(0);
    expect(vegetation.sectorAt(0, 1, 0)).toBeUndefined();
    expect(vegetation.sectorAt(1, 0, 0)).toBeUndefined();
    const grid = { cols: 2, rows: 2, cellSize: 16, solid: Uint8Array.from([1, 1, 0, 0]), isSolid: (col: number, row: number) => {
      const tileX = Math.floor(col / 2), tileY = Math.floor(row / 2);
      const cell = (row - tileY * 2) * 2 + col - tileX * 2;
      return cell < 2 && !vegetation.sectorAt(0, tileX, tileY)?.felledTrees.has(1);
    } };
    expect(survivorCircleHitsLandscape(grid, 8, 8, 4)).toBe(false);
    expect(survivorCircleHitsLandscape(grid, 40, 8, 4)).toBe(true);
  });

  it('respeita a forma e a direção do golpe', () => {
    const cone = { kind: 'cone' as const, x: 0, y: 0, radius: 50, angle: 0 };
    expect(survivorVegetationHitTest(cone, 30, 0)).toBe(true);
    expect(survivorVegetationHitTest(cone, -30, 0)).toBe(false);
    expect(survivorVegetationHitTest({ kind: 'sweep', x: 0, y: 0, toX: 50, toY: 0, radius: 3 }, 25, 2)).toBe(true);
  });
});
