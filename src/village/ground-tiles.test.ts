import { describe, expect, it } from 'vitest';
import { generateVillage } from '../core/village/map';
import type { Tile, VillageMap } from '../core/village/map';
import { ATLAS_SOURCES } from './atlas-spec';
import { groundPieces, quarterCell } from './ground-tiles';

function tiny(rows: string[]): VillageMap {
  const key: Record<string, Tile> = { '.': 'grass', '=': 'path', ':': 'sand', '~': 'water', '+': 'plaza', f: 'field' };
  const tiles = rows.flatMap((r) => [...r].map((c) => key[c]!));
  return { w: rows[0]!.length, h: rows.length, tiles, spawn: { x: 0, y: 0 }, plot: { x: 0, y: 0, w: 0, h: 0 }, shop: { x: 0, y: 0, w: 0, h: 0 }, buildings: [], decor: [] };
}

describe('chão da Vila com tileset (autotile por quartos)', () => {
  it('quarto escolhe canto, borda ou miolo do bloco 3×3', () => {
    expect(quarterCell(0, 0, false, false)).toEqual({ cx: 0, cy: 0 });
    expect(quarterCell(1, 1, false, false)).toEqual({ cx: 2, cy: 2 });
    expect(quarterCell(0, 0, true, false)).toEqual({ cx: 0, cy: 1 });
    expect(quarterCell(1, 0, false, true)).toEqual({ cx: 1, cy: 0 });
    expect(quarterCell(0, 1, true, true)).toEqual({ cx: 1, cy: 1 });
  });

  it('trilha isolada usa os 4 cantos de fora; no meio de uma rua, só o miolo', () => {
    const lone = groundPieces(tiny(['...', '.=.', '...']), 1, 1);
    expect(lone.map((p) => [p.src, p.sx, p.sy])).toEqual([['at-path', 0, 16], ['at-path', 40, 16], ['at-path', 0, 56], ['at-path', 40, 56]]);
    const mid = groundPieces(tiny(['===', '===', '===']), 1, 1);
    expect(mid.every((p) => p.sy === 32 || p.sy === 40)).toBe(true);
    expect(mid.every((p) => p.sx === 16 || p.sx === 24)).toBe(true);
  });

  it('canto de dentro quando só a diagonal é diferente', () => {
    const p = groundPieces(tiny(['.==', '===', '===']), 1, 1);
    expect(p[0]).toMatchObject({ src: 'at-path', sx: 32, sy: 0 });
  });

  it('praça e rua emendam sem borda', () => {
    const p = groundPieces(tiny(['+++', '+==', '+++']), 1, 1);
    expect(p.every((q) => q.sx >= 16 && q.sx < 32 && q.sy >= 32 && q.sy < 48)).toBe(true);
  });

  it('areia ganha borda de água do lado da água e de grama do lado da grama', () => {
    const p = groundPieces(tiny(['...', '.:~', '...']), 1, 1);
    expect(p.map((q) => q.src)).toEqual(['sand-grass', 'sand-water', 'sand-grass', 'sand-water']);
  });

  it('todo pedaço do mapa de verdade existe no atlas e cabe no recorte', () => {
    const map = generateVillage(20261014);
    const size = new Map(ATLAS_SOURCES.map((s) => [s.id, s.half ? { w: s.w / 2, h: s.h / 2 } : { w: s.w, h: s.h }]));
    size.set('grass', { w: 32, h: 32 });
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        for (const p of groundPieces(map, x, y)) {
          const s = size.get(p.src);
          expect(s, p.src).toBeDefined();
          expect(p.sx + p.w).toBeLessThanOrEqual(s!.w);
          expect(p.sy + p.h).toBeLessThanOrEqual(s!.h);
        }
      }
    }
  });
});
