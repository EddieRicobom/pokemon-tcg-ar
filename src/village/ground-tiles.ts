import { tileAt } from '../core/village/map';
import type { Tile, VillageMap } from '../core/village/map';

/**
 * Qual pedaço do atlas (`atlas-spec.ts`) vai em cada bloco do chão da Vila. Função pura: o desenho em si (canvas) fica
 * em `village-game.ts`. Cada bloco de 16 px é montado em 4 quartos de 8 px, como no autotile do RPG Maker XP: cada
 * quarto olha os dois vizinhos do seu lado (vertical e horizontal) e a diagonal, e escolhe canto de fora, borda,
 * miolo ou canto de dentro. Assim a trilha, a praça, os canteiros e a areia ganham a borda certa em qualquer formato.
 */

export interface GroundPiece {
  /** Id do recorte no atlas, ou `grass` (o ladrilho de grama à parte, `survivor-grass.png`, 32×32). */
  src: string;
  sx: number;
  sy: number;
  w: number;
  h: number;
  /** Posição dentro do bloco (0 ou 8). */
  dx: number;
  dy: number;
}

const T = 16;
const Q = 8;

/** Autotiles (formato RPG Maker XP, já em 1×: 48×64) usados por cada tipo de chão. */
const AUTOTILE: Partial<Record<Tile, string>> = { path: 'at-path', shop: 'at-path', trail: 'at-trail', plaza: 'at-plaza', field: 'at-plot' };

/** Com quem cada chão emenda sem borda (fora do mapa conta como igual, para não desenhar borda na beira). */
function joins(tile: Tile, other: Tile | null): boolean {
  if (other === null) return true;
  switch (tile) {
    case 'path':
    case 'shop':
    case 'plaza':
      return other === 'path' || other === 'shop' || other === 'plaza' || other === 'trail';
    case 'trail':
      return other === 'trail' || other === 'path' || other === 'plaza';
    default:
      return other === tile;
  }
}

function neighbor(map: VillageMap, x: number, y: number): Tile | null {
  return x < 0 || y < 0 || x >= map.w || y >= map.h ? null : tileAt(map, x, y);
}

/**
 * Em que célula de um bloco 3×3 (de 16 px) fica o quarto (qx, qy): canto, borda ou miolo. Nos autotiles do RPG Maker
 * o 3×3 começa uma linha abaixo (a primeira é a prévia e os cantos de dentro).
 */
export function quarterCell(qx: 0 | 1, qy: 0 | 1, sameV: boolean, sameH: boolean): { cx: number; cy: number } {
  const col = sameH ? 1 : qx === 0 ? 0 : 2;
  const row = sameV ? 1 : qy === 0 ? 0 : 2;
  return { cx: col, cy: row };
}

/** Os pedaços que formam o bloco (x, y) do chão, de baixo para cima. */
export function groundPieces(map: VillageMap, x: number, y: number): GroundPiece[] {
  const tile = tileAt(map, x, y);
  // Os outros quadrantes têm preenchimentos de outra cor: sorteá-los criava grandes manchas quadradas.
  const grass: GroundPiece = { src: 'grass', sx: 0, sy: 0, w: T, h: T, dx: 0, dy: 0 };
  const at = AUTOTILE[tile];
  if (at) return autotile(map, x, y, tile, at);
  switch (tile) {
    case 'pier':
      return [{ src: 'pier-deck', sx: 16, sy: 16, w: T, h: T, dx: 0, dy: 0 }];
    case 'tall':
      return [grass, { src: 'tall', sx: T, sy: T + (y % 2) * T, w: T, h: T, dx: 0, dy: 0 }];
    case 'flower':
      return [grass, { src: 'flowers-white', sx: ((x * 7 + y * 3) % 3) * T, sy: 0, w: T, h: T, dx: 0, dy: 0 }];
    case 'water':
      // Só o miolo do bloco do mar: as células da beira têm um contorno claro que, repetido, vira grade.
      return [{ src: 'sea', sx: T, sy: T, w: T, h: T, dx: 0, dy: 0 }];
    case 'sand':
      return sand(map, x, y);
    default:
      return [grass];
  }
}

function autotile(map: VillageMap, x: number, y: number, tile: Tile, src: string): GroundPiece[] {
  const out: GroundPiece[] = [];
  for (const qy of [0, 1] as const) {
    for (const qx of [0, 1] as const) {
      const dxn = qx === 0 ? -1 : 1;
      const dyn = qy === 0 ? -1 : 1;
      const sameV = joins(tile, neighbor(map, x, y + dyn));
      const sameH = joins(tile, neighbor(map, x + dxn, y));
      const sameD = joins(tile, neighbor(map, x + dxn, y + dyn));
      let cx: number;
      let cy: number;
      if (sameV && sameH && !sameD) {
        // Canto de dentro: o bloco (2, 0) do autotile guarda os quatro, um em cada quarto.
        cx = 2;
        cy = 0;
      } else {
        const c = quarterCell(qx, qy, sameV, sameH);
        cx = c.cx;
        cy = c.cy + 1;
      }
      out.push({ src, sx: cx * T + qx * Q, sy: cy * T + qy * Q, w: Q, h: Q, dx: qx * Q, dy: qy * Q });
    }
  }
  return out;
}

/** Areia: borda de água onde encosta na água, borda de grama onde encosta no resto (blocos 3×3 da Route 224). */
function sand(map: VillageMap, x: number, y: number): GroundPiece[] {
  const out: GroundPiece[] = [];
  const isSand = (t: Tile | null) => t === null || t === 'sand';
  for (const qy of [0, 1] as const) {
    for (const qx of [0, 1] as const) {
      const v = neighbor(map, x, y + (qy === 0 ? -1 : 1));
      const hn = neighbor(map, x + (qx === 0 ? -1 : 1), y);
      const water = v === 'water' || hn === 'water';
      const c = quarterCell(qx, qy, isSand(v), isSand(hn));
      out.push({ src: water ? 'sand-water' : 'sand-grass', sx: c.cx * T + qx * Q, sy: c.cy * T + qy * Q, w: Q, h: Q, dx: qx * Q, dy: qy * Q });
    }
  }
  return out;
}
