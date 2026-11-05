import { EDGE, paintOverlay, TILE, touchedCells } from '../box/ground-art';
import type { PixelBuf } from '../box/ground-art';
import { createBuf } from '../box/ground-art';
import { seededRng } from '../core/battle';
import { terrainHalf } from '../core/pin-terrain';
import type { TerrainGrid, TerrainKind } from '../core/terrain';

/** Cor chapada de cada marca: dá para saber de longe onde o chão muda, e o desenho da marca vai por cima. */
const MARK_TINT: Record<TerrainKind, readonly [number, number, number]> = {
  scorch: [0x5a, 0x4a, 0x44],
  puddle: [0x4a, 0xa3, 0xe8],
  thicket: [0x2f, 0x7d, 0x3a],
  frost: [0xbf, 0xea, 0xff],
  static: [0xf2, 0xd6, 0x4a],
  crack: [0xa5, 0x8a, 0x5f],
  rubble: [0x9a, 0x8a, 0x76],
  toxic: [0x8f, 0x4f, 0xc0],
  psy: [0xe8, 0x7a, 0xb0],
  shade: [0x4a, 0x45, 0x60],
  bloom: [0xf5, 0xa8, 0xcf],
};

/** Só as marcas: sem marca, o bloco fica transparente e aparece o gramado limpo de `paintArena`. */
function paintMarkCell(buf: PixelBuf, grid: TerrainGrid, i: number, seed: number): void {
  const c = i % grid.cols;
  const r = Math.floor(i / grid.cols);
  const ox = c * TILE;
  const oy = r * TILE;
  for (let y = 0; y < TILE; y++) buf.data.fill(0, ((oy + y) * buf.w + ox) * 4, ((oy + y) * buf.w + ox + TILE) * 4);
  const kind = grid.overlayAt(i);
  if (!kind || !grid.inside[i]) return;
  const [cr, cg, cb] = MARK_TINT[kind];
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const at = ((oy + y) * buf.w + ox + x) * 4;
      buf.data[at] = cr;
      buf.data[at + 1] = cg;
      buf.data[at + 2] = cb;
      buf.data[at + 3] = 210;
    }
  }
  let edges = 0;
  const around = [[EDGE.north, 0, -1], [EDGE.east, 1, 0], [EDGE.south, 0, 1], [EDGE.west, -1, 0]] as const;
  for (const [bit, dc, dr] of around) {
    const nc = c + dc;
    const nr = r + dr;
    if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows || grid.over[grid.index(nc, nr)] !== grid.over[i]) edges |= bit;
  }
  paintOverlay(buf, ox, oy, kind, edges, seededRng(((seed * 31 + i * 2654435761) >>> 0) ^ 0x1234567));
}

/**
 * As marcas do chão da arena do Pin Mode, com o desenho da Caixa (`box/ground-art.ts`), num buffer RGBA que cobre o
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
    for (let i = 0; i < grid.cols * grid.rows; i++) paintMarkCell(this.buf, grid, i, seed);
    this.version++;
  }

  /** Repinta os blocos alterados e os vizinhos (a borda da marca muda). */
  repaint(changed: readonly number[]): void {
    for (const i of touchedCells(this.grid, changed)) paintMarkCell(this.buf, this.grid, i, this.seed);
    this.version++;
  }
}
