import { inSurvivorCone } from './survivor-shapes';

export type SurvivorVegetationHit =
  | { kind: 'area'; x: number; y: number; radius: number }
  | { kind: 'cone'; x: number; y: number; radius: number; angle: number }
  | { kind: 'sweep'; x: number; y: number; toX: number; toY: number; radius: number };

export interface SurvivorVegetationPlan {
  cols: number;
  rows: number;
  /** O mesmo identificador ocupa todas as células de uma árvore. Zero indica que não há árvore. */
  treeCells: Int32Array;
  grass: Uint8Array;
}

export interface SurvivorVegetationSector {
  felledTrees: ReadonlySet<number>;
  clearedGrass: ReadonlySet<number>;
  chunkVersions: ReadonlyMap<number, number>;
}

interface MutableSector extends SurvivorVegetationSector {
  felledTrees: Set<number>;
  clearedGrass: Set<number>;
  chunkVersions: Map<number, number>;
}

export function survivorVegetationHitTest(hit: SurvivorVegetationHit, x: number, y: number, extra = 0): boolean {
  if (hit.kind === 'cone') return inSurvivorCone({ x: hit.x, y: hit.y, aimAngle: hit.angle, facing: 1 }, x, y, hit.radius, extra);
  let cx = hit.x, cy = hit.y;
  if (hit.kind === 'sweep') {
    const dx = hit.toX - cx, dy = hit.toY - cy;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((x - cx) * dx + (y - cy) * dy) / lengthSq)) : 0;
    cx += dx * t;
    cy += dy * t;
  }
  return (x - cx) ** 2 + (y - cy) ** 2 <= (hit.radius + extra) ** 2;
}

/** Guarda só os setores alterados. Um mesmo cenário reaparece intacto em outros setores e na próxima partida. */
export function createSurvivorVegetation(cellSize: number, chunkSize: number, worldWidth: number, worldHeight: number) {
  const sectors = new Map<string, MutableSector>();
  const key = (region: number, tileX: number, tileY: number) => `${region}:${tileX}:${tileY}`;
  const sectorAt = (region: number, tileX: number, tileY: number): SurvivorVegetationSector | undefined => sectors.get(key(region, tileX, tileY));
  let version = 0;

  function impact(region: number, plan: SurvivorVegetationPlan, hit: SurvivorVegetationHit): void {
    const { cols, rows, treeCells, grass } = plan;
    const extra = cellSize / 2;
    const radius = hit.radius + extra;
    const bx = hit.kind === 'sweep' ? hit.toX : hit.x;
    const by = hit.kind === 'sweep' ? hit.toY : hit.y;
    const minCol = Math.max(0, Math.floor((Math.min(hit.x, bx) - radius) / cellSize));
    const minRow = Math.max(0, Math.floor((Math.min(hit.y, by) - radius) / cellSize));
    const maxCol = Math.min(Math.ceil(worldWidth / cellSize) - 1, Math.floor((Math.max(hit.x, bx) + radius) / cellSize));
    const maxRow = Math.min(Math.ceil(worldHeight / cellSize) - 1, Math.floor((Math.max(hit.y, by) + radius) / cellSize));
    const chunkCols = Math.ceil(cols * cellSize / chunkSize);
    const chunkRows = Math.ceil(rows * cellSize / chunkSize);

    for (let tileY = Math.floor(minRow / rows); tileY <= Math.floor(maxRow / rows); tileY++) {
      for (let tileX = Math.floor(minCol / cols); tileX <= Math.floor(maxCol / cols); tileX++) {
        const sectorKey = key(region, tileX, tileY);
        let sector = sectors.get(sectorKey);
        const offsetCol = tileX * cols, offsetRow = tileY * rows;
        for (let r = Math.max(minRow - offsetRow, 0); r <= Math.min(maxRow - offsetRow, rows - 1); r++) {
          for (let c = Math.max(minCol - offsetCol, 0); c <= Math.min(maxCol - offsetCol, cols - 1); c++) {
            const cell = r * cols + c;
            const tree = treeCells[cell]!;
            const fell = tree !== 0 && !sector?.felledTrees.has(tree);
            const cut = grass[cell] === 1 && !sector?.clearedGrass.has(cell);
            if (!fell && !cut) continue;
            if (!survivorVegetationHitTest(hit, (offsetCol + c) * cellSize + extra, (offsetRow + r) * cellSize + extra, extra)) continue;
            if (!sector) {
              sector = { felledTrees: new Set(), clearedGrass: new Set(), chunkVersions: new Map() };
              sectors.set(sectorKey, sector);
            }
            if (fell) sector.felledTrees.add(tree);
            if (cut) sector.clearedGrass.add(cell);
            version++;
            // Uma árvore pode estar ancorada no chunk ao lado. O corte também muda a borda do mato adjacente.
            const chunkAt = (coord: number) => Math.floor(coord * cellSize / chunkSize);
            for (let y = Math.max(0, chunkAt(r - 2)); y <= Math.min(chunkRows - 1, chunkAt(r + 2)); y++) {
              for (let x = Math.max(0, chunkAt(c - 2)); x <= Math.min(chunkCols - 1, chunkAt(c + 2)); x++) {
                sector.chunkVersions.set(y * chunkCols + x, version);
              }
            }
          }
        }
      }
    }
  }

  return { impact, sectorAt };
}

export type SurvivorVegetation = ReturnType<typeof createSurvivorVegetation>;
