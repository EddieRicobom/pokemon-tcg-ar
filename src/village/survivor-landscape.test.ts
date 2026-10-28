import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { SURVIVOR_BIOMES, survivorBiomeZonesOf } from '../core/survivor-biomes';
import { SURVIVOR_REGIONS, REGION_DURATION_MS, survivorRegionAt } from '../core/survivor-regions';
import { SURVIVOR_LANDSCAPE_TILE_H, SURVIVOR_LANDSCAPE_TILE_W } from '../core/survivor-types';
import { ATLAS_SOURCES, packAtlas } from './atlas-spec';
import { SURVIVOR_FLOOR_PALETTES, floorTone } from './survivor-floor-art';
import { FLOOR_CELL, SURVIVOR_REGION_TILESETS, SURVIVOR_REGION_ROUTES, ZONE_SPILL, planSurvivorFloor, routePolyline, trailHalfWidth } from './survivor-landscape';

describe('tilesets regionais da Torre', () => {
  it('cada região tem recortes reais de terreno, trilha, detalhe e cobertura baixa no atlas', () => {
    const available = new Set(ATLAS_SOURCES.map((source) => source.id));
    expect(SURVIVOR_REGION_TILESETS).toHaveLength(SURVIVOR_REGIONS.length);
    for (const tiles of SURVIVOR_REGION_TILESETS) {
      expect(available.has(tiles.ground)).toBe(true);
      expect(available.has(tiles.path)).toBe(true);
      expect(available.has(tiles.detail)).toBe(true);
      expect(available.has(tiles.cover)).toBe(true);
      expect(tiles.trees.length).toBeGreaterThan(0);
      for (const [tree] of tiles.trees) expect(available.has(tree)).toBe(true);
      expect(tiles.forestDepth).toBeGreaterThan(2);
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
    expect(new Set(SURVIVOR_REGION_TILESETS.map((tiles) => tiles.trees.map(([id, tint]) => `${id}:${tint}`).join())).size).toBe(SURVIVOR_REGION_TILESETS.length);
    expect(new Set(SURVIVOR_REGION_TILESETS.map((tiles) => tiles.detail)).size).toBeGreaterThanOrEqual(7);
    expect(SURVIVOR_REGION_TILESETS.filter((tiles) => tiles.cover === 'tall').length).toBeGreaterThanOrEqual(4);
  });

  it('usa rotas autorais que andam retas e viram em ângulo reto, presas ao centro dos blocos', () => {
    expect(SURVIVOR_REGION_ROUTES).toHaveLength(SURVIVOR_REGIONS.length);
    for (const route of SURVIVOR_REGION_ROUTES) {
      expect(route.main.length).toBeGreaterThanOrEqual(4);
      expect(route.width).toBeGreaterThan(90);
      expect(route.branches.length).toBeGreaterThan(0);
      expect(route.main.some(([x, y]) => x < 0 || x > 1 || y < 0 || y > 1)).toBe(true);
      for (const points of [route.main, ...route.branches]) {
        const line = routePolyline(points, SURVIVOR_LANDSCAPE_TILE_W, SURVIVOR_LANDSCAPE_TILE_H);
        for (let i = 1; i < line.length; i++) {
          const a = line[i - 1]!, b = line[i]!;
          expect(a.x === b.x || a.y === b.y).toBe(true);
          expect(((b.x - 8) % 16 + 16) % 16).toBe(0);
          expect(((b.y - 8) % 16 + 16) % 16).toBe(0);
        }
      }
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
      // Canto de fora do 3 × 3: o primeiro pixel já é o chão vizinho (depois da troca de tons da região).
      expect(floorTone(pixel(rect.x, rect.y + (half ? 16 : 0)), tiles.floor), tiles.path).toBe(SURVIVOR_FLOOR_PALETTES[tiles.floor].base);
    }
  });

  it('a rota atravessa a arena sem blocos soltos e as moitas nunca ficam sobre ela', () => {
    SURVIVOR_REGION_TILESETS.forEach((_, index) => {
      const plan = planSurvivorFloor(index, SURVIVOR_LANDSCAPE_TILE_W, SURVIVOR_LANDSCAPE_TILE_H);
      expect(plan.cols * plan.rows).toBe(plan.cells.length);
      expect(plan.solid).toHaveLength(plan.cells.length);
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
        if (plan.cells[i] === FLOOR_CELL.cover || plan.cells[i] === FLOOR_CELL.forest) {
          expect(plan.routeDistance[i]).toBeGreaterThan(trailHalfWidth(SURVIVOR_REGION_ROUTES[index]!.width));
        }
        if (plan.cells[i] === FLOOR_CELL.forest) expect(plan.solid[i]).toBe(1);
      }
      expect(pathCells).toBeGreaterThan(plan.cells.length * 0.04);
      // Rota principal e ramificações formam um caminho só.
      const start = plan.path.indexOf(1);
      const seen = new Uint8Array(plan.path.length);
      const queue = [start];
      seen[start] = 1;
      let reached = 0;
      while (queue.length) {
        const i = queue.pop()!;
        reached += 1;
        const c = i % plan.cols, r = Math.floor(i / plan.cols);
        for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
          const x = c + dc, y = r + dr;
          const j = y * plan.cols + x;
          if (x < 0 || y < 0 || x >= plan.cols || y >= plan.rows || seen[j] || !plan.path[j]) continue;
          seen[j] = 1;
          queue.push(j);
        }
      }
      expect(reached, `região ${index}`).toBe(pathCells);
      expect(plan.cells.some((cell) => cell === FLOOR_CELL.cover)).toBe(true);
    });
  });

  it('cada zona de bioma vira terreno sobre todo o retângulo da mecânica, com orla irregular e curta', () => {
    for (const biome of SURVIVOR_BIOMES) {
      const plan = planSurvivorFloor(biome.regionIndex, SURVIVOR_LANDSCAPE_TILE_W, SURVIVOR_LANDSCAPE_TILE_H);
      const zones = survivorBiomeZonesOf(biome).filter((zone) => zone.x < SURVIVOR_LANDSCAPE_TILE_W && zone.y < SURVIVOR_LANDSCAPE_TILE_H);
      for (const zone of zones) {
        // Todo bloco que a mecânica toca tem o terreno da zona: nenhum perigo fica sem desenho.
        for (let r = Math.floor(zone.y / 16); r < Math.ceil((zone.y + zone.height) / 16); r++) {
          for (let c = Math.floor(zone.x / 16); c < Math.ceil((zone.x + zone.width) / 16); c++) {
            expect(plan.zones[r * plan.cols + c]).toBe(zone.kind);
          }
        }
      }
      // E nada desse terreno longe de uma zona.
      plan.zones.forEach((kind, i) => {
        if (!kind) return;
        const x = (i % plan.cols) * 16 + 8, y = Math.floor(i / plan.cols) * 16 + 8;
        const near = zones.some((zone) => x > zone.x - (ZONE_SPILL + 1) * 16 && x < zone.x + zone.width + (ZONE_SPILL + 1) * 16
          && y > zone.y - (ZONE_SPILL + 1) * 16 && y < zone.y + zone.height + (ZONE_SPILL + 1) * 16);
        expect(near).toBe(true);
      });
    }
  });

  it('fecha a arena com floresta nas bordas, deixando a trilha sair por elas', () => {
    SURVIVOR_REGION_TILESETS.forEach((_, index) => {
      const plan = planSurvivorFloor(index, SURVIVOR_LANDSCAPE_TILE_W, SURVIVOR_LANDSCAPE_TILE_H);
      const edge = Array.from({ length: plan.cols }, (_, c) => plan.cells[plan.cols * 2 + c]);
      expect(edge.filter((cell) => cell === FLOOR_CELL.forest).length).toBeGreaterThan(plan.cols * 0.5);
      const forest = plan.cells.filter((cell) => cell === FLOOR_CELL.forest).length;
      expect(forest).toBeLessThan(plan.cells.length * 0.4);
    });
  });

  it('é determinístico: a mesma região gera sempre o mesmo mapa', () => {
    const a = planSurvivorFloor(4, SURVIVOR_LANDSCAPE_TILE_W, SURVIVOR_LANDSCAPE_TILE_H);
    const b = planSurvivorFloor(4, SURVIVOR_LANDSCAPE_TILE_W, SURVIVOR_LANDSCAPE_TILE_H);
    expect(Array.from(a.cells)).toEqual(Array.from(b.cells));
    expect(Array.from(a.solid)).toEqual(Array.from(b.solid));
    expect(Array.from(a.cells)).not.toEqual(Array.from(planSurvivorFloor(5, SURVIVOR_LANDSCAPE_TILE_W, SURVIVOR_LANDSCAPE_TILE_H).cells));
  });
});
