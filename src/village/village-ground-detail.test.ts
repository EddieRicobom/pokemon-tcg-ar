import { describe, expect, it } from 'vitest';
import { generateVillage } from '../core/village/map';
import type { Tile, VillageMap } from '../core/village/map';
import { groundDetails, grassToneAt } from './village-ground-detail';

function tiny(rows: string[]): VillageMap {
  const key: Record<string, Tile> = { '.': 'grass', '=': 'path', ':': 'sand', '~': 'water', f: 'field', T: 'tall', b: 'building' };
  const tiles = rows.flatMap((r) => [...r].map((c) => key[c]!));
  return { w: rows[0]!.length, h: rows.length, tiles, spawn: { x: 0, y: 0 }, plot: { x: 0, y: 0, w: 0, h: 0 }, shop: { x: 0, y: 0, w: 0, h: 0 }, buildings: [], decor: [] };
}

const KINDS = new Set(['blade', 'tuft', 'speck', 'clover', 'flower', 'pebble', 'gravel', 'crack', 'moss', 'ripple', 'shell', 'wet', 'fringe', 'leaf', 'inset', 'mushroom']);

describe('detalhes do chão da Vila', () => {
  it('é determinístico e cabe dentro do bloco', () => {
    const map = generateVillage(20261014);
    for (let y = 0; y < map.h; y += 7) {
      for (let x = 0; x < map.w; x += 5) {
        const a = groundDetails(map, x, y);
        expect(groundDetails(map, x, y)).toEqual(a);
        for (const d of a) {
          expect(KINDS.has(d.kind)).toBe(true);
          expect(d.x).toBeGreaterThanOrEqual(0);
          expect(d.x).toBeLessThan(16);
          expect(d.y).toBeGreaterThanOrEqual(0);
          expect(d.y).toBeLessThan(16);
        }
      }
    }
  });

  it('mato alto, água e construções não ganham detalhes (o chão deles já é outra camada)', () => {
    const map = tiny(['T~b']);
    expect(groundDetails(map, 0, 0)).toEqual([]);
    expect(groundDetails(map, 1, 0)).toEqual([]);
    expect(groundDetails(map, 2, 0)).toEqual([]);
  });

  it('a grama ganha tufos e, de vez em quando, florzinhas ou pedrinhas', () => {
    const map = tiny(['.', '.']);
    const all = [...groundDetails(map, 0, 0), ...groundDetails(map, 0, 1)];
    expect(all.some((d) => d.kind === 'blade' || d.kind === 'tuft')).toBe(true);
    expect(all.every((d) => ['blade', 'tuft', 'speck', 'clover', 'flower', 'pebble', 'leaf', 'mushroom'].includes(d.kind))).toBe(true);
  });

  it('a trilha solta franja de grama no lado que encosta no gramado', () => {
    const map = tiny(['===', '===']);
    expect(groundDetails(map, 1, 0).some((d) => d.kind === 'fringe')).toBe(false);
    const side = tiny(['.=', '..']);
    const fringe = groundDetails(side, 1, 0).filter((d) => d.kind === 'fringe');
    expect(fringe.some((d) => d.x === 1)).toBe(true);
    expect(fringe.some((d) => d.y === 15)).toBe(true);
  });

  it('a areia molhada marca o lado da água', () => {
    const map = tiny([':~', '::']);
    const wet = groundDetails(map, 0, 0).filter((d) => d.kind === 'wet');
    expect(wet).toHaveLength(1);
    expect(wet[0]!.v).toBe(1);
    expect(groundDetails(map, 0, 1).some((d) => d.kind === 'wet')).toBe(false);
  });

  it('o tom da grama é suave e fica entre 0 e 1', () => {
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 30; x++) {
        const tone = grassToneAt(x, y);
        expect(tone).toBeGreaterThanOrEqual(0);
        expect(tone).toBeLessThanOrEqual(1);
        expect(Math.abs(tone - grassToneAt(x + 1, y))).toBeLessThan(0.2);
      }
    }
  });
});
