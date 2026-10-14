import { paintTerrainCell, TILE, touchedCells } from '../box/ground-art';
import type { PixelBuf } from '../box/ground-art';
import { createBuf } from '../box/ground-art';
import { terrainHalf } from '../core/pin-terrain';
import type { TerrainGrid } from '../core/terrain';

/**
 * O chão em pixel art da arena do Pin Mode: o mesmo desenho da Caixa (`box/ground-art.ts`), num buffer RGBA que cobre o
 * quadrado de lado 2 × `terrainHalf(radius)` em volta do centro da arena. Sem canvas: a tela só copia o buffer.
 */
export class ArenaTerrainArt {
  readonly buf: PixelBuf;
  /** Sobe a cada repintura, para a tela saber quando copiar de novo. */
  version = 0;
  /** Meia-largura (unidades do mundo) coberta pelo buffer. */
  readonly half: number;

  constructor(readonly grid: TerrainGrid, radius: number, private readonly seed: number) {
    this.half = terrainHalf(radius);
    this.buf = createBuf(grid.cols * TILE, grid.rows * TILE);
    for (let i = 0; i < grid.cols * grid.rows; i++) paintTerrainCell(this.buf, grid, i, seed);
    this.version++;
  }

  /** Repinta os blocos alterados e os vizinhos (a borda da marca muda). */
  repaint(changed: readonly number[]): void {
    for (const i of touchedCells(this.grid, changed)) paintTerrainCell(this.buf, this.grid, i, this.seed);
    this.version++;
  }
}
