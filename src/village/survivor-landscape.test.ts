import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { SURVIVOR_BIOMES, survivorBiomeZonesOf } from '../core/survivor-biomes';
import { SURVIVOR_REGIONS, REGION_DURATION_MS, survivorRegionAt } from '../core/survivor-regions';
import { ARENA_H, ARENA_W } from '../core/survivor-types';
import { ATLAS_SOURCES, packAtlas } from './atlas-spec';
import { SURVIVOR_FLOOR_PALETTES } from './survivor-floor-art';
import { FLOOR_CELL, SURVIVOR_REGION_ROUTES, SURVIVOR_REGION_TILESETS, planSurvivorFloor } from './survivor-landscape';

describe('tilesets regionais da Torre', () => {
  it('cada região tem recortes reais de terreno, trilha, detalhe e cobertura baixa no atlas', () => {
    const available = new Set(ATLAS_SOURCES.map((source) => source.id));
    expect(SURVIVOR_REGION_TILESETS).toHaveLength(SURVIVOR_REGIONS.length);
    for (const tiles of SURVIVOR_REGION_TILESETS) {
      expect(available.has(tiles.ground)).toBe(true);
      expect(available.has(tiles.path)).toBe(true);
      expect(available.has(tiles.detail)).toBe(true);
      expect(available.has(tiles.cover)).toBe(true);
      expect(available.has(tiles.border)).toBe(true);
      expect(SURVIVOR_FLOOR_PALETTES[tiles.floor]).toBeDefined();
      expect(tiles.coverDensity).toBeGreaterThan(0);
    }
  });

  it('troca o conjunto visual no mesmo marco temporal que muda a região e faz a transição gradualmente', () => {
    const before = survivorRegionAt(REGION_DURATION_MS - 40_001);
    const transition = survivorRegionAt(REGION_DURATION_MS - 20_000);
    const after = survivorRegionAt(REGION_DURATION_MS);
    expect(before.current).toBe(0);
    expect(transition).toMatchObject({ current: 0, next: 1 });
    expect(transition.blend).toBeGreaterThan(0);
    expect(transition.blend).toBeLessThan(1);
    expect(after.current).toBe(1);
    expect(SURVIVOR_REGION_TILESETS[before.current]).not.toEqual(SURVIVOR_REGION_TILESETS[after.current]);
  });

  it('combina base, trilha, detalhe e cobertura para que cada região tenha leitura própria', () => {
    const combinations = new Set(SURVIVOR_REGION_TILESETS.map((tiles) => `${tiles.floor}/${tiles.path}/${tiles.detail}/${tiles.cover}`));
    expect(combinations.size).toBe(SURVIVOR_REGION_TILESETS.length);
    expect(new Set(SURVIVOR_REGION_TILESETS.map((tiles) => tiles.floor)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(SURVIVOR_REGION_TILESETS.map((tiles) => tiles.path)).size).toBe(SURVIVOR_REGION_TILESETS.length);
    expect(new Set(SURVIVOR_REGION_TILESETS.map((tiles) => tiles.detail)).size).toBeGreaterThanOrEqual(7);
    expect(SURVIVOR_REGION_TILESETS.filter((tiles) => tiles.cover === 'tall').length).toBeGreaterThanOrEqual(4);
  });

  it('usa rotas autorais com curvas suaves em vez de corredores ondulados repetidos', () => {
    expect(SURVIVOR_REGION_ROUTES).toHaveLength(SURVIVOR_REGIONS.length);
    for (const route of SURVIVOR_REGION_ROUTES) {
      expect(route.main.length).toBeGreaterThanOrEqual(4);
      expect(route.width).toBeGreaterThan(90);
      expect(route.branches.length).toBeGreaterThan(0);
      expect(route.main.some(([x, y]) => x < 0 || x > 1 || y < 0 || y > 1)).toBe(true);
    }
  });
});

describe('chão da Torre em blocos de 16 px', () => {
  const atlas = PNG.sync.read(readFileSync('src/village/vila-atlas.png'));
  const pixel = (x: number, y: number) => {
    const i = (y * atlas.width + x) * 4;
    return (atlas.data[i]! << 16) | (atlas.data[i + 1]! << 8) | atlas.data[i + 2]!;
  };

  it('a base de cada região tem a mesma cor da borda do autotile da trilha: as duas emendam sem costura', () => {
    const { rects } = packAtlas();
    for (const tiles of SURVIVOR_REGION_TILESETS) {
      const rect = rects.get(tiles.path)!;
      const half = ATLAS_SOURCES.find((source) => source.id === tiles.path)!.half;
      // Canto de fora do 3 × 3: o primeiro pixel já é o chão vizinho.
      expect(pixel(rect.x, rect.y + (half ? 16 : 0)), tiles.path).toBe(SURVIVOR_FLOOR_PALETTES[tiles.floor].base);
    }
  });

  it('a rota atravessa a arena sem blocos soltos e as moitas nunca ficam sobre ela', () => {
    SURVIVOR_REGION_TILESETS.forEach((_, index) => {
      const plan = planSurvivorFloor(index, ARENA_W, ARENA_H);
      expect(plan.cols * plan.rows).toBe(plan.cells.length);
      let pathCells = 0;
      for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) {
        const i = r * plan.cols + c;
        if (plan.path[i]) {
          pathCells += 1;
          const neighbours = [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dc, dr]) => {
            const x = c + dc!, y = r + dr!;
            return x < 0 || y < 0 || x >= plan.cols || y >= plan.rows || plan.path[y * plan.cols + x] === 1;
          }).length;
          expect(neighbours).toBeGreaterThanOrEqual(2);
          expect(plan.cells[i]).not.toBe(FLOOR_CELL.cover);
        }
        if (plan.cells[i] === FLOOR_CELL.cover) expect(plan.routeDistance[i]).toBeGreaterThan(SURVIVOR_REGION_ROUTES[index]!.width / 2);
      }
      expect(pathCells).toBeGreaterThan(plan.cells.length * 0.04);
      expect(plan.cells.some((cell) => cell === FLOOR_CELL.cover)).toBe(true);
    });
  });

  it('cada zona de bioma vira terreno no retângulo da própria mecânica', () => {
    for (const biome of SURVIVOR_BIOMES) {
      const plan = planSurvivorFloor(biome.regionIndex, ARENA_W, ARENA_H);
      for (const zone of survivorBiomeZonesOf(biome)) {
        const c = Math.floor((zone.x + zone.width / 2) / 16);
        const r = Math.floor((zone.y + zone.height / 2) / 16);
        expect(plan.zones[r * plan.cols + c]).toBe(zone.kind);
        expect(plan.cells[r * plan.cols + c]).toBe(FLOOR_CELL.zone);
        // Fora do retângulo (com folga de meio bloco) não há terreno daquela zona.
        const outside = Math.floor((zone.x + zone.width + 24) / 16);
        if (outside < plan.cols) expect(plan.zones[r * plan.cols + outside]).not.toBe(zone.kind);
      }
    }
  });

  it('é determinístico: a mesma região gera sempre o mesmo mapa', () => {
    const a = planSurvivorFloor(4, ARENA_W, ARENA_H);
    const b = planSurvivorFloor(4, ARENA_W, ARENA_H);
    expect(Array.from(a.cells)).toEqual(Array.from(b.cells));
    expect(Array.from(a.cells)).not.toEqual(Array.from(planSurvivorFloor(5, ARENA_W, ARENA_H).cells));
  });
});
