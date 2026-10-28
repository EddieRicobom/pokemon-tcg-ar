import { SURVIVOR_REGIONS, survivorRegionAt } from '../core/survivor-regions';
import { SURVIVOR_BIOMES, survivorBiomeZonesOf } from '../core/survivor-biomes';
import type { SurvivorBiomeZoneKind } from '../core/survivor-biomes';
import { ATLAS_SOURCES, packAtlas } from './atlas-spec';
import { quarterCell } from './ground-tiles';
import { SURVIVOR_FLOOR_PALETTES, SURVIVOR_FLOWER_COLORS, floorHash, recolorGrassBase, survivorDecorTile, survivorFloorTexture, tintFoliage } from './survivor-floor-art';
import type { FlowerColors, FoliageTint, SurvivorDecorKind, SurvivorFloorKind } from './survivor-floor-art';

/** Areia das trilhas de Kanto e Johto: o mesmo bloco `sand-grass`, em bege queimado ou amarelo de duna. */
const SAND_TAN = { 0xf0e0c0: 0xe8d4a0, 0xead4a8: 0xd6bc80, 0xf8e8d0: 0xf2e2b8 } as const;
const SAND_YELLOW = { 0xf0e0c0: 0xecdc98, 0xead4a8: 0xd8c47a, 0xf8e8d0: 0xf6ecba } as const;

/**
 * Chão regional da Torre. `floor` é a base em pixel art (a borda do autotile da trilha recebe os mesmos tons, então
 * as duas emendam sem costura); `path` é o autotile da rota (`pathTones` recolore a areia dela); `detail` é o objeto
 * de cenário espalhado; `cover`, a cobertura baixa em manchas; `trees`, as espécies e tons das florestas, que fecham
 * as bordas (`forestDepth` blocos, com a orla irregular) e formam bosques (`groves`, chance por trecho). `ground` é o
 * recorte que o BONK usa como textura.
 */
export const SURVIVOR_REGION_TILESETS = [
  // Kanto: grama verde-água, trilha de areia bege, mato alto, flores laranja e brancas e mata fechada.
  { floor: 'grass', ground: 'at-trail', path: 'sand-grass', pathTones: SAND_TAN, detail: 'tree-big', cover: 'tall', coverDensity: 0.19, trees: [['tree-big', 'green'], ['tree-big', 'deep'], ['pine-m', 'green']], forestDepth: 6, groves: 0.35, decor: ['tuft', 'flowers', 'clover'], flowers: ['orange', 'white'] },
  // Johto: capim verde-amarelado, areia amarela e bosques de outono dourados e laranja.
  { floor: 'autumn', ground: 'at-trail', path: 'sand-grass', pathTones: SAND_YELLOW, detail: 'pine-m', cover: 'tall', coverDensity: 0.14, trees: [['tree-big', 'gold'], ['tree-big', 'orange'], ['tree-big', 'lime'], ['pine-m', 'lime']], forestDepth: 7, groves: 0.4, decor: ['leaves', 'tuft', 'flowers'], flowers: ['red', 'yellow'] },
  // Hoenn: gramado costeiro com rota de areia clara, poças e copas tropicais.
  { floor: 'grass', ground: 'sand-grass', path: 'sand-grass', pathTones: {}, detail: 'bush', cover: 'tall', coverDensity: 0.11, trees: [['tree-big', 'lime'], ['tree-big', 'green'], ['pine-s2', 'green']], forestDepth: 5, groves: 0.25, decor: ['tuft', 'flowers', 'tuft'], flowers: ['yellow', 'red'] },
  // Sinnoh: neve compactada, caminho de pedras frias e pinheiros nevados.
  { floor: 'snow', ground: 'at-snow', path: 'at-snow-rock', pathTones: {}, detail: 'rock-1', cover: 'pine-s1', coverDensity: 0.1, trees: [['pine-m', 'snowy'], ['pine-m', 'deep'], ['pine-s2', 'snowy']], forestDepth: 6, groves: 0.3, decor: ['drift', 'pebbles', 'drift'], flowers: ['white'] },
  // Unova: campo aberto cortado por estradas de pedra lavrada e mata escura.
  { floor: 'grass', ground: 'at-ruins', path: 'at-plaza', pathTones: {}, detail: 'rock-2', cover: 'bush', coverDensity: 0.1, trees: [['tree-big', 'deep'], ['pine-m', 'deep'], ['tree-big', 'green']], forestDepth: 5, groves: 0.25, decor: ['pebbles', 'tuft', 'clover'], flowers: ['blue', 'white'] },
  // Kalos: jardim com caminho de pedra clara, canteiros de flores e copas claras.
  { floor: 'grass', ground: 'at-trail', path: 'at-path', pathTones: {}, detail: 'flowers-white', cover: 'flowers-white', coverDensity: 0.2, trees: [['tree-big', 'green'], ['tree-big', 'lime'], ['tree-big', 'deep']], forestDepth: 5, groves: 0.3, decor: ['flowers', 'tuft', 'flowers'], flowers: ['pink', 'white', 'yellow', 'red'] },
  // Alola: areia dourada com trilha de pedras, conchas e copas cor de lima.
  { floor: 'sand', ground: 'sand-water', path: 'at-harvest-stone', pathTones: {}, detail: 'rock-3', cover: 'bush', coverDensity: 0.08, trees: [['tree-big', 'lime'], ['pine-s2', 'lime']], forestDepth: 4, groves: 0.2, decor: ['shell', 'ripple', 'shell'], flowers: ['pink', 'orange'] },
  // Galar: chão batido de ruínas, estrada de tijolos partidos e mata escura com alguma copa dourada.
  { floor: 'dust', ground: 'at-ruins', path: 'at-ruins-path', pathTones: {}, detail: 'wall', cover: 'tall', coverDensity: 0.12, trees: [['pine-m', 'deep'], ['tree-big', 'deep'], ['tree-big', 'gold']], forestDepth: 6, groves: 0.3, decor: ['crack', 'pebbles', 'tuft'], flowers: ['white'] },
  // Paldea: campo de oliveiras com trilha de terra seca e copas lima e douradas.
  { floor: 'meadow', ground: 'at-trail', path: 'at-trail', pathTones: {}, detail: 'stump', cover: 'bush', coverDensity: 0.14, trees: [['tree-big', 'lime'], ['tree-big', 'gold'], ['tree-big', 'green']], forestDepth: 5, groves: 0.35, decor: ['tuft', 'clover', 'flowers'], flowers: ['yellow', 'white'] },
] as const satisfies readonly {
  floor: SurvivorFloorKind;
  ground: string;
  path: string;
  pathTones: Readonly<Record<number, number>>;
  detail: string;
  cover: string;
  coverDensity: number;
  trees: readonly (readonly [string, FoliageTint])[];
  forestDepth: number;
  groves: number;
  decor: readonly SurvivorDecorKind[];
  flowers: readonly (keyof typeof SURVIVOR_FLOWER_COLORS)[];
}[];

export interface SurvivorRouteDefinition {
  /** Pontos normalizados da rota principal, de uma borda da arena à outra. */
  main: readonly (readonly [number, number])[];
  /** Ramificações curtas que tornam a trilha um caminho, não uma faixa repetida. */
  branches: readonly (readonly (readonly [number, number])[])[];
  width: number;
}

/** Rotas desenhadas à mão; entre um ponto e o seguinte a trilha anda reta e vira em ângulo reto, como nas rotas. */
export const SURVIVOR_REGION_ROUTES: readonly SurvivorRouteDefinition[] = [
  { main: [[-0.06, 0.67], [0.2, 0.6], [0.47, 0.66], [0.73, 0.55], [1.06, 0.59]], branches: [[[0.5, 0.65], [0.53, 0.43], [0.62, 0.28]]], width: 112 },
  { main: [[0.38, -0.06], [0.43, 0.19], [0.36, 0.45], [0.48, 0.68], [0.42, 1.06]], branches: [[[0.38, 0.46], [0.2, 0.5], [0.07, 0.62]]], width: 120 },
  { main: [[-0.06, 0.74], [0.18, 0.7], [0.4, 0.59], [0.67, 0.49], [1.06, 0.43]], branches: [[[0.42, 0.59], [0.54, 0.77], [0.7, 0.9]]], width: 116 },
  { main: [[0.63, -0.06], [0.6, 0.2], [0.69, 0.42], [0.58, 0.68], [0.64, 1.06]], branches: [[[0.6, 0.68], [0.42, 0.79], [0.25, 0.77]]], width: 124 },
  { main: [[-0.06, 0.43], [0.2, 0.48], [0.45, 0.41], [0.72, 0.49], [1.06, 0.42]], branches: [[[0.45, 0.42], [0.47, 0.2], [0.59, 0.08]], [[0.72, 0.49], [0.84, 0.67]]], width: 118 },
  { main: [[-0.06, 0.68], [0.2, 0.62], [0.42, 0.7], [0.67, 0.59], [1.06, 0.66]], branches: [[[0.42, 0.69], [0.39, 0.46], [0.27, 0.29]], [[0.67, 0.59], [0.81, 0.42], [0.91, 0.31]]], width: 106 },
  { main: [[-0.06, 0.34], [0.2, 0.39], [0.43, 0.32], [0.69, 0.43], [1.06, 0.36]], branches: [[[0.69, 0.43], [0.78, 0.61], [0.88, 0.76]]], width: 112 },
  { main: [[-0.06, 0.76], [0.2, 0.67], [0.41, 0.72], [0.66, 0.56], [1.06, 0.48]], branches: [[[0.41, 0.71], [0.35, 0.5], [0.23, 0.36]]], width: 128 },
  { main: [[0.06, -0.06], [0.2, 0.18], [0.38, 0.34], [0.62, 0.5], [0.92, 0.66], [1.06, 0.78]], branches: [[[0.38, 0.34], [0.25, 0.43], [0.13, 0.56]]], width: 114 },
] as const;

/** Lado de uma célula da paisagem e da grade de colisão, em pixels do mundo. */
export const SURVIVOR_LANDSCAPE_CELL = 16;
const T = SURVIVOR_LANDSCAPE_CELL;
const Q = 8;

interface RoutePoint { x: number; y: number }

/** Centro do bloco mais próximo: as retas da rota passam sempre pelo meio de uma fileira ou coluna. */
function snap(value: number): number {
  return Math.round((value - T / 2) / T) * T + T / 2;
}

/**
 * Liga os pontos da rota com trechos retos: anda no eixo dominante até a metade, vira 90°, cruza a diferença e vira
 * de novo. Sem diagonais, a borda do autotile não vira escadinha.
 */
export function routePolyline(points: readonly (readonly [number, number])[], width: number, height: number): RoutePoint[] {
  const p = points.map(([x, y]) => ({ x: snap(x * width), y: snap(y * height) }));
  const out: RoutePoint[] = p.length ? [p[0]!] : [];
  for (let i = 1; i < p.length; i += 1) {
    const a = p[i - 1]!, b = p[i]!;
    if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) {
      const mid = snap((a.x + b.x) / 2);
      out.push({ x: mid, y: a.y }, { x: mid, y: b.y });
    } else {
      const mid = snap((a.y + b.y) / 2);
      out.push({ x: a.x, y: mid }, { x: b.x, y: mid });
    }
    out.push(b);
  }
  return out;
}

/** Distância "quadrada" (maior dos dois eixos) até um trecho reto: a faixa da trilha tem cantos em ângulo reto. */
function boxDistance(x: number, y: number, a: RoutePoint, b: RoutePoint): number {
  const nx = Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), x));
  const ny = Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), y));
  return Math.max(Math.abs(x - nx), Math.abs(y - ny));
}

function distanceToRoutes(x: number, y: number, routes: readonly (readonly RoutePoint[])[]): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const route of routes) {
    for (let i = 1; i < route.length; i += 1) nearest = Math.min(nearest, boxDistance(x, y, route[i - 1]!, route[i]!));
  }
  return nearest;
}

/** Ruído suave (0 a 1) numa grade de `scale` blocos: dá bordas orgânicas, sem pixel solto. */
export function floorNoise(seed: number, c: number, r: number, scale: number, salt: number): number {
  const gx = c / scale, gy = r / scale;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const tx = gx - x0, ty = gy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const h = (i: number, j: number) => floorHash(seed, x0 + i, y0 + j, salt);
  const top = h(0, 0) + (h(1, 0) - h(0, 0)) * sx;
  const bottom = h(0, 1) + (h(1, 1) - h(0, 1)) * sx;
  return top + (bottom - top) * sy;
}

/** O que ocupa cada bloco de 16 px do chão. */
export const FLOOR_CELL = { base: 0, path: 1, cover: 2, zone: 3, forest: 4 } as const;
export type FloorCell = typeof FLOOR_CELL[keyof typeof FLOOR_CELL];

export interface SurvivorFloorPlan {
  cols: number;
  rows: number;
  cells: Uint8Array;
  /** Células que têm um tronco, rocha, muro ou mata fechada; o jogador não as atravessa. */
  solid: Uint8Array;
  /** Blocos da rota (1), inclusive os que passam por baixo de uma zona de bioma. */
  path: Uint8Array;
  /** Bioma mecânico de cada bloco (`null` fora das zonas); vira terreno temático no desenho. */
  zones: readonly (SurvivorBiomeZoneKind | null)[];
  /** Distância (px) de cada bloco até o eixo da rota. */
  routeDistance: Float32Array;
}

/** Meia largura da trilha: as rotas das referências têm 4 a 5 blocos, não uma avenida. */
export function trailHalfWidth(width: number): number {
  return width * 0.36;
}

/** Quantos blocos a mancha orgânica de uma zona pode passar do retângulo da mecânica (que ela sempre cobre inteiro). */
export const ZONE_SPILL = 4;

/**
 * Planta o chão da região em blocos de 16 px: rota, zonas de bioma, florestas e moitas, todas com bordas orgânicas.
 * Pura e determinística, para que a mesma região sempre tenha o mesmo mapa.
 */
export function planSurvivorFloor(index: number, width: number, height: number): SurvivorFloorPlan {
  const cols = Math.ceil(width / T);
  const rows = Math.ceil(height / T);
  const cells = new Uint8Array(cols * rows);
  const zones: (SurvivorBiomeZoneKind | null)[] = new Array(cols * rows).fill(null);
  const routeDistance = new Float32Array(cols * rows);
  const definition = SURVIVOR_REGION_ROUTES[index]!;
  const tiles = SURVIVOR_REGION_TILESETS[index]!;
  const routes = [definition.main, ...definition.branches].map((points) => routePolyline(points, width, height));
  const half = trailHalfWidth(definition.width);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    routeDistance[i] = distanceToRoutes(c * T + 8, r * T + 8, routes);
    // A margem da trilha avança e recua um bloco ao longo do caminho, como uma trilha pisada.
    if (routeDistance[i]! <= half + (floorNoise(index, c, r, 4, 31) - 0.5) * 30) cells[i] = FLOOR_CELL.path;
  }
  // Sem pontas de um bloco nem passagens só pela diagonal: o autotile fica com cantos limpos.
  const isPath = (c: number, r: number) => c < 0 || r < 0 || c >= cols || r >= rows || cells[r * cols + c] === FLOOR_CELL.path;
  for (let pass = 0; pass < 3; pass++) {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const n = isPath(c, r - 1), s = isPath(c, r + 1), w = isPath(c - 1, r), e = isPath(c + 1, r);
      if (cells[i] !== FLOOR_CELL.path && ((n && s) || (w && e))) cells[i] = FLOOR_CELL.path;
      else if (cells[i] === FLOOR_CELL.path && Number(n) + Number(s) + Number(w) + Number(e) <= 1) cells[i] = FLOOR_CELL.base;
    }
  }
  const path = Uint8Array.from(cells, (cell) => (cell === FLOOR_CELL.path ? 1 : 0));

  // Zonas de bioma: o retângulo da mecânica inteiro, mais uma orla ondulada de até `ZONE_SPILL` blocos com cantos
  // arredondados, para a mancha parecer terreno (sem retângulo à vista) e nenhum pedaço da área com efeito ficar sem
  // desenho.
  const biome = SURVIVOR_BIOMES.find((candidate) => candidate.regionIndex === index);
  for (const [z, zone] of (biome ? survivorBiomeZonesOf(biome) : []).entries()) {
    const c0 = Math.floor(zone.x / T), c1 = Math.ceil((zone.x + zone.width) / T);
    const r0 = Math.floor(zone.y / T), r1 = Math.ceil((zone.y + zone.height) / T);
    const mark: number[] = [];
    for (let r = r0 - ZONE_SPILL; r < r1 + ZONE_SPILL; r++) for (let c = c0 - ZONE_SPILL; c < c1 + ZONE_SPILL; c++) {
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      // Distância (em blocos) até o retângulo: nos cantos ela é a diagonal, e a orla faz uma curva em volta deles.
      const out = Math.hypot(Math.max(c0 - c, c - (c1 - 1), 0), Math.max(r0 - r, r - (r1 - 1), 0));
      if (out > 0 && out > 0.6 + floorNoise(index, c, r, 2.5, 41 + z) * 3.4) continue;
      mark.push(r * cols + c);
    }
    // Sem penínsulas de um bloco nem dentes de um bloco na orla.
    const marked = new Set(mark);
    for (let pass = 0; pass < 2; pass++) {
      for (let r = r0 - ZONE_SPILL; r < r1 + ZONE_SPILL; r++) for (let c = c0 - ZONE_SPILL; c < c1 + ZONE_SPILL; c++) {
        if (c < 0 || r < 0 || c >= cols || r >= rows || (c >= c0 && c < c1 && r >= r0 && r < r1)) continue;
        const i = r * cols + c;
        const n = [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dc, dr]) => marked.has((r + dr!) * cols + c + dc!) && c + dc! >= 0 && c + dc! < cols).length;
        if (marked.has(i) && n <= 1) marked.delete(i);
        else if (!marked.has(i) && n >= 3) marked.add(i);
      }
    }
    for (const i of marked) {
      cells[i] = FLOOR_CELL.zone;
      zones[i] = zone.kind;
    }
  }

  // Florestas: orla irregular nas bordas da arena e bosques arredondados no meio, sempre fora da trilha e das zonas.
  const forestAt = (i: number) => cells[i] === FLOOR_CELL.base && routeDistance[i]! > half + 20;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    const edge = Math.min(c, r, cols - 1 - c, rows - 1 - r);
    const depth = tiles.forestDepth + (floorNoise(index, c, r, 6, 51) - 0.5) * 8;
    if (edge < depth && forestAt(i)) cells[i] = FLOOR_CELL.forest;
  }
  for (let gr = 0; gr < rows; gr += 14) for (let gc = 0; gc < cols; gc += 14) {
    if (floorHash(index, gr, gc, 61) > tiles.groves) continue;
    const cx = gc + 3 + Math.floor(floorHash(index, gr, gc, 62) * 8);
    const cy = gr + 3 + Math.floor(floorHash(index, gr, gc, 63) * 8);
    const radius = 2 + floorHash(index, gr, gc, 64) * 2.5;
    for (let r = Math.floor(cy - radius - 2); r <= cy + radius + 2; r++) for (let c = Math.floor(cx - radius - 2); c <= cx + radius + 2; c++) {
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      const d = Math.hypot((c - cx) / 1.3, r - cy) / radius;
      if (d < 0.7 + floorNoise(index, c, r, 2, 65) * 0.5 && forestAt(r * cols + c)) cells[r * cols + c] = FLOOR_CELL.forest;
    }
  }

  // Moitas em manchas de borda orgânica, longe da rota.
  for (let gr = 0; gr < rows; gr += 9) for (let gc = 0; gc < cols; gc += 9) {
    if (floorHash(index, gr, gc, 11) > tiles.coverDensity * 2) continue;
    const cx = gc + 2 + Math.floor(floorHash(index, gr, gc, 12) * 5);
    const cy = gr + 2 + Math.floor(floorHash(index, gr, gc, 13) * 5);
    const rx = 2.2 + floorHash(index, gr, gc, 14) * 2.4;
    const ry = 1.4 + floorHash(index, gr, gc, 15) * 1.6;
    for (let r = Math.floor(cy - ry - 1); r <= Math.ceil(cy + ry + 1); r++) for (let c = Math.floor(cx - rx - 1); c <= Math.ceil(cx + rx + 1); c++) {
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      const i = r * cols + c;
      const d = Math.hypot((c - cx) / rx, (r - cy) / ry);
      if (d > 0.75 + floorNoise(index, c, r, 2, 16) * 0.5 || cells[i] !== FLOOR_CELL.base || routeDistance[i]! <= half + 24) continue;
      cells[i] = FLOOR_CELL.cover;
    }
  }
  // Mata fechada é uma parede contínua de árvores. Objetos soltos usam a mesma
  // grade e o mesmo sorteio do desenho abaixo, para a hitbox acompanhar a arte.
  const solid = new Uint8Array(cols * rows);
  const markSolid = (c: number, r: number, w = 1, h = 1) => {
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) {
      if (x >= 0 && y >= 0 && x < cols && y < rows) solid[y * cols + x] = 1;
    }
  };
  for (let i = 0; i < cells.length; i++) if (cells[i] === FLOOR_CELL.forest) solid[i] = 1;
  const detailFootprint = tiles.detail === 'tree-big' || tiles.detail === 'pine-m'
    ? { w: 2, h: 2 }
    : tiles.detail === 'wall' ? { w: 2, h: 1 }
      : { w: 1, h: 1 };
  for (let r = 4; r < rows - 6; r += 9) for (let c = 4; c < cols - 6; c += 11) {
    const cc = c + Math.floor(floorHash(index, c, r, 7) * 6);
    const rr = r + Math.floor(floorHash(index, c, r, 8) * 5);
    if (floorHash(index, c, r, 9) > 0.5 || tiles.detail === 'flowers-white') continue;
    let free = true;
    for (let y = rr; y < rr + detailFootprint.h && free; y++) for (let x = cc; x < cc + detailFootprint.w && free; x++) {
      const i = y * cols + x;
      free = x >= 0 && y >= 0 && x < cols && y < rows && cells[i] === FLOOR_CELL.base && routeDistance[i]! > trailHalfWidth(SURVIVOR_REGION_ROUTES[index]!.width) + 24;
    }
    if (free) markSolid(cc, rr, detailFootprint.w, detailFootprint.h);
  }
  return { cols, rows, cells, solid, path, zones, routeDistance };
}

/** Retângulo do mundo que aparece na tela (câmera); sem ele a paisagem inteira é desenhada. */
export interface LandscapeView { x: number; y: number; w: number; h: number }

/** Relógio da animação do chão (flores e brilho da água). `animate: false` deixa tudo no primeiro quadro. */
export interface LandscapeMotion { timeMs: number; animate: boolean }

export type SurvivorLandscapeRenderer = ((ctx: CanvasRenderingContext2D, elapsedMs: number, view?: LandscapeView, motion?: LandscapeMotion, runSeed?: number) => void) & {
  setAtlas(image: CanvasImageSource | null): void;
};

const atlasLayout = packAtlas();
const sourceById = new Map(ATLAS_SOURCES.map((source) => [source.id, source]));

/** Autotiles do RPG Maker XP (prévia e cantos de dentro na primeira linha) ou blocos 3 × 3 simples. */
function autotileFormat(id: string): 'rmxp' | 'block' {
  return sourceById.get(id)?.half ? 'rmxp' : 'block';
}

function bufferCanvas(buf: { w: number; h: number; data: Uint8Array | Uint8ClampedArray }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = buf.w;
  canvas.height = buf.h;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(buf.data), buf.w, buf.h), 0, 0);
  return canvas;
}

function hex(rgb: number): string {
  return `#${rgb.toString(16).padStart(6, '0')}`;
}

/** Flores e água ficam fora da camada fixa: são redesenhadas a cada quadro, só as que caem na câmera. */
interface RegionLayer {
  canvas: HTMLCanvasElement;
  /** Por fileira: posição x e os dois quadros de cada canteiro. */
  flowers: { x: number; frames: readonly [HTMLCanvasElement, HTMLCanvasElement] }[][];
  /** Por fileira: colunas com água. */
  water: number[][];
}

/** Quadro das flores: troca a cada 450 ms, como o balanço das flores nas rotas. */
const FLOWER_FRAME_MS = 450;
const WATER_FRAME_MS = 260;

/** Cacheia só a região atual e a próxima; o desenho de tiles ocorre uma vez por região, não a cada quadro. */
export function createSurvivorLandscape(width: number, height: number): SurvivorLandscapeRenderer {
  const layers = new Map<number, RegionLayer>();
  const regionAtlases = new Map<number, CanvasImageSource>();
  let atlas: CanvasImageSource | null = null;

  /**
   * Atlas da região: tons verde-água (borda dos autotiles, sombras e pé do mato) trocados pelos do chão e a areia da
   * trilha recolorida (`pathTones`).
   */
  function regionAtlas(index: number): CanvasImageSource | null {
    if (!atlas) return null;
    const cached = regionAtlases.get(index);
    if (cached) return cached;
    const source = atlas as HTMLImageElement;
    const w = source.width, h = source.height;
    if (!w || !h) return atlas;
    const tiles = SURVIVOR_REGION_TILESETS[index]!;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext('2d')!;
    c.drawImage(source, 0, 0);
    const image = c.getImageData(0, 0, w, h);
    const data = recolorGrassBase({ w, h, data: image.data }, tiles.floor);
    const tones = tiles.pathTones as Readonly<Record<number, number>>;
    const rect = atlasLayout.rects.get(tiles.path);
    if (rect && Object.keys(tones).length) {
      for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) {
        const i = (y * w + x) * 4;
        const tone = tones[(data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!];
        if (tone === undefined) continue;
        data[i] = tone >> 16;
        data[i + 1] = (tone >> 8) & 255;
        data[i + 2] = tone & 255;
      }
    }
    image.data.set(data);
    c.putImageData(image, 0, 0);
    regionAtlases.set(index, canvas);
    return canvas;
  }

  function drawSprite(ctx: CanvasRenderingContext2D, image: CanvasImageSource | null, id: string, x: number, y: number, crop?: { x: number; y: number; w: number; h: number }): boolean {
    const rect = atlasLayout.rects.get(id);
    if (!image || !rect) return false;
    const part = crop ?? { x: 0, y: 0, w: rect.w, h: rect.h };
    ctx.drawImage(image, rect.x + part.x, rect.y + part.y, part.w, part.h, Math.round(x), Math.round(y), part.w, part.h);
    return true;
  }

  /** Bloco de autotile montado em quatro quartos de 8 px, cada um olhando seus vizinhos (como o chão da Vila). */
  function drawAutotile(ctx: CanvasRenderingContext2D, image: CanvasImageSource | null, id: string, x: number, y: number, same: (dx: number, dy: number) => boolean): void {
    const rect = atlasLayout.rects.get(id);
    if (!image || !rect) return;
    const rmxp = autotileFormat(id) === 'rmxp';
    for (const qy of [0, 1] as const) for (const qx of [0, 1] as const) {
      const dxn = qx === 0 ? -1 : 1;
      const dyn = qy === 0 ? -1 : 1;
      const sameV = same(0, dyn);
      const sameH = same(dxn, 0);
      let cx: number;
      let cy: number;
      if (rmxp && sameV && sameH && !same(dxn, dyn)) {
        cx = 2;
        cy = 0;
      } else {
        const cell = quarterCell(qx, qy, sameV, sameH);
        cx = cell.cx;
        cy = cell.cy + (rmxp ? 1 : 0);
      }
      ctx.drawImage(image, rect.x + cx * T + qx * Q, rect.y + cy * T + qy * Q, Q, Q, x + qx * Q, y + qy * Q, Q, Q);
    }
  }

  /**
   * Água das poças: o bloco 3 × 3 do mar (margem rasa e cantos arredondados) e um contorno escuro de 1 px onde a
   * água encosta na terra, como os lagos das rotas.
   */
  function drawWater(ctx: CanvasRenderingContext2D, image: CanvasImageSource | null, c: number, r: number, wet: (dc: number, dr: number) => boolean): void {
    const x = c * T, y = r * T;
    if (image && atlasLayout.rects.get('sea')) drawAutotile(ctx, image, 'sea', x, y, wet);
    else {
      ctx.fillStyle = '#579eae';
      ctx.fillRect(x, y, T, T);
    }
    ctx.fillStyle = '#3c6e7c';
    if (!wet(0, -1)) ctx.fillRect(x, y, T, 1);
    if (!wet(0, 1)) ctx.fillRect(x, y + T - 1, T, 1);
    if (!wet(-1, 0)) ctx.fillRect(x, y, 1, T);
    if (!wet(1, 0)) ctx.fillRect(x + T - 1, y, 1, T);
  }

  function layer(index: number): RegionLayer {
    const cached = layers.get(index);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const region = SURVIVOR_REGIONS[index]!;
    const tiles = SURVIVOR_REGION_TILESETS[index]!;
    const floor: SurvivorFloorKind = tiles.floor;
    const palette = SURVIVOR_FLOOR_PALETTES[floor];
    const art = regionAtlas(index);
    const plan = planSurvivorFloor(index, width, height);
    const { cols, rows, cells, zones } = plan;
    const result: RegionLayer = { canvas, flowers: Array.from({ length: rows }, () => []), water: Array.from({ length: rows }, () => []) };
    const at = (c: number, r: number) => (c < 0 || r < 0 || c >= cols || r >= rows ? null : r * cols + c);
    const cellIs = (c: number, r: number, kind: FloorCell, outside = true) => {
      const i = at(c, r);
      return i === null ? outside : cells[i] === kind;
    };
    const zoneIs = (c: number, r: number, kind: SurvivorBiomeZoneKind) => {
      const i = at(c, r);
      return i === null ? false : zones[i] === kind;
    };
    const flowerColors: FlowerColors[] = tiles.flowers.map((name) => SURVIVOR_FLOWER_COLORS[name]);
    const decorCache = new Map<string, HTMLCanvasElement>();
    const decor = (kind: SurvivorDecorKind, variant: number, frame = 0) => {
      const key = `${kind}:${variant % 6}:${frame}`;
      let tile = decorCache.get(key);
      if (!tile) {
        tile = bufferCanvas(survivorDecorTile(kind, floor, variant % 6, flowerColors, frame));
        decorCache.set(key, tile);
      }
      return tile;
    };
    /** Flores não entram na camada fixa: vão para a lista que balança a cada quadro. */
    const placeFlower = (c: number, r: number, variant: number) => {
      if (r < 0 || r >= rows) return;
      result.flowers[r]!.push({ x: c * T, frames: [decor('flowers', variant, 0), decor('flowers', variant, 1)] });
    };
    const placeDecor = (kind: SurvivorDecorKind, c: number, r: number, variant: number) => {
      if (kind === 'flowers') placeFlower(c, r, variant);
      else ctx.drawImage(decor(kind, variant), c * T, r * T);
    };
    const treeCache = new Map<string, HTMLCanvasElement | null>();
    /** Árvore do atlas com a copa no tom pedido (`tintFoliage`), recortada uma vez por região. */
    const tree = (id: string, tint: FoliageTint): HTMLCanvasElement | null => {
      const key = `${id}:${tint}`;
      if (treeCache.has(key)) return treeCache.get(key)!;
      const rect = atlasLayout.rects.get(id);
      let sprite: HTMLCanvasElement | null = null;
      if (art && rect) {
        sprite = document.createElement('canvas');
        sprite.width = rect.w;
        sprite.height = rect.h;
        const c = sprite.getContext('2d')!;
        c.drawImage(art, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
        const image = c.getImageData(0, 0, rect.w, rect.h);
        image.data.set(tintFoliage(image.data, tint));
        c.putImageData(image, 0, 0);
      }
      treeCache.set(key, sprite);
      return sprite;
    };

    // 1. Base: ladrilho de 64 px repetido, sem transparência e sem cor chapada por baixo aparecendo.
    const texture = ctx.createPattern(bufferCanvas(survivorFloorTexture(floor)), 'repeat');
    ctx.fillStyle = texture ?? hex(palette.base);
    ctx.fillRect(0, 0, width, height);

    // 2. Detalhes miúdos: canteiros pequenos do mesmo tipo (como nas rotas) e plantinhas soltas por toda parte.
    for (let gr = 0; gr < rows; gr += 6) for (let gc = 0; gc < cols; gc += 6) {
      if (floorHash(index, gr, gc, 21) > 0.4) continue;
      const kind = tiles.decor[Math.floor(floorHash(index, gr, gc, 22) * tiles.decor.length)]!;
      const c0 = gc + Math.floor(floorHash(index, gr, gc, 23) * 3);
      const r0 = gr + Math.floor(floorHash(index, gr, gc, 24) * 4);
      const w = 2 + Math.floor(floorHash(index, gr, gc, 25) * 2);
      const h = 1 + Math.floor(floorHash(index, gr, gc, 26) * 2);
      for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) {
        // Canteiro sem cantos: os blocos da quina às vezes ficam de fora.
        const corner = (r === r0 || r === r0 + h - 1) && (c === c0 || c === c0 + w - 1) && h > 1;
        if (corner && floorHash(index, c, r, 27) < 0.5) continue;
        if (cellIs(c, r, FLOOR_CELL.base, false)) placeDecor(kind, c, r, c * 7 + r * 3);
      }
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (cells[r * cols + c] !== FLOOR_CELL.base || (c + r) % 2) continue;
      const h = floorHash(index, c, r, 3);
      if (h > 0.08) continue;
      placeDecor(tiles.decor[Math.floor(floorHash(index, c, r, 4) * tiles.decor.length)]!, c, r, Math.floor(h * 1000));
    }

    // 3. Rota em autotile: borda, cantos de fora e de dentro presos à grade, como nas rotas dos jogos.
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!plan.path[r * cols + c]) continue;
      if (!art) {
        ctx.fillStyle = region.path;
        ctx.fillRect(c * T, r * T, T, T);
        continue;
      }
      // A rota segue por baixo das zonas: o terreno da zona vem depois, por cima.
      drawAutotile(ctx, art, tiles.path, c * T, r * T, (dx, dy) => {
        const i = at(c + dx, r + dy);
        return i === null || plan.path[i] === 1;
      });
    }

    // 4. Zonas de bioma viram terreno de verdade, em manchas que cobrem toda a área da mecânica.
    // Mato alto: corpo no bloco, pontas das folhas sobre o bloco de cima e pé com sombra na última fileira.
    const tallCell = (c: number, r: number, isTall: (c: number, r: number) => boolean) => {
      const column = (c % 3) * T;
      const row = !isTall(c, r + 1) ? 3 : 1 + (r % 2);
      drawSprite(ctx, art, 'tall', c * T, r * T, { x: column, y: row * T, w: T, h: T });
      if (!isTall(c, r - 1)) drawSprite(ctx, art, 'tall', c * T, (r - 1) * T, { x: column, y: 0, w: T, h: T });
    };
    const zoneTall = (c: number, r: number) => zoneIs(c, r, 'folhagem');
    const zoneSoft = (c: number, r: number, kind: SurvivorBiomeZoneKind) =>
      // Na beira da mancha o terreno rareia, em vez de acabar numa linha reta.
      [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dc, dr]) => !zoneIs(c + dc!, r + dr!, kind)).length;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const kind = zones[i];
      if (!kind) continue;
      const x = c * T, y = r * T;
      const variant = Math.floor(floorHash(index, c, r, 5) * 1000);
      const edge = zoneSoft(c, r, kind);
      switch (kind) {
        case 'folhagem':
          tallCell(c, r, zoneTall);
          break;
        case 'poça': {
          const wet = (dc: number, dr: number) => zoneIs(c + dc, r + dr, 'poça');
          drawWater(ctx, art, c, r, wet);
          if (!edge) result.water[r]!.push(c);
          break;
        }
        case 'neve':
          ctx.fillStyle = hex(palette.shade);
          ctx.globalAlpha = edge ? 0.14 : 0.3;
          ctx.fillRect(x, y, T, T);
          ctx.globalAlpha = 1;
          if (!edge || variant % 2) ctx.drawImage(decor('drift', variant), x, y);
          break;
        case 'vento':
          ctx.drawImage(decor('leaves', variant), x, y);
          if (!edge && variant % 2) ctx.drawImage(decor('leaves', variant + 1), x, y);
          break;
        case 'pedra':
          if (!edge || variant % 2) ctx.drawImage(decor('pebbles', variant), x, y);
          if (!edge && variant % 5 === 0) drawSprite(ctx, art, variant % 2 ? 'rock-1' : 'rock-2', x, y);
          break;
        case 'flores':
          if (!edge || variant % 3) placeFlower(c, r, variant);
          break;
        case 'areia':
          ctx.fillStyle = hex(palette.shade);
          ctx.globalAlpha = edge ? 0.2 : 0.4;
          ctx.fillRect(x, y, T, T);
          ctx.globalAlpha = 1;
          ctx.drawImage(decor('ripple', variant), x, y);
          break;
        case 'ruínas':
          drawAutotile(ctx, art, 'at-brick', x, y, (dx, dy) => zoneIs(c + dx, r + dy, 'ruínas'));
          break;
        case 'olival':
          ctx.drawImage(decor((c + r) % 2 ? 'clover' : 'tuft', variant), x, y);
          break;
      }
    }

    // 5. Cobertura baixa em manchas: mato alto encaixado na grade, arbustos, pinheirinhos ou canteiros de flores.
    const coverAt = (c: number, r: number) => cellIs(c, r, FLOOR_CELL.cover, false);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!coverAt(c, r)) continue;
      const variant = Math.floor(floorHash(index, c, r, 6) * 1000);
      if (tiles.cover === 'tall') {
        tallCell(c, r, coverAt);
      } else if (tiles.cover === 'flowers-white') {
        placeFlower(c, r, variant);
      } else if (tiles.cover === 'pine-s1') {
        // Bosque de pinheiros pequenos: um a cada dois blocos, com o tronco na fileira de baixo.
        if (art && (c + r) % 2 === 0 && r % 2 === 0) drawSprite(ctx, art, 'pine-s1', c * T, (r - 1) * T);
        else ctx.drawImage(decor('drift', variant), c * T, r * T);
      } else if (variant % 5 < 3 && art) {
        drawSprite(ctx, art, 'bush', c * T, r * T);
      } else {
        ctx.drawImage(decor('tuft', variant), c * T, r * T);
      }
    }

    // 6. Objetos de cenário soltos, sempre fora da rota e com folga entre eles.
    const detailRect = atlasLayout.rects.get(tiles.detail);
    if (art && detailRect) {
      for (let r = 4; r < rows - 6; r += 9) for (let c = 4; c < cols - 6; c += 11) {
        const cc = c + Math.floor(floorHash(index, c, r, 7) * 6);
        const rr = r + Math.floor(floorHash(index, c, r, 8) * 5);
        if (floorHash(index, c, r, 9) > 0.5) continue;
        const spanC = Math.ceil(detailRect.w / T), spanR = Math.ceil(detailRect.h / T);
        let free = true;
        for (let y = rr; y < rr + spanR && free; y++) for (let x = cc; x < cc + spanC && free; x++) free = cellIs(x, y, FLOOR_CELL.base, false) && plan.routeDistance[at(x, y)!]! > trailHalfWidth(SURVIVOR_REGION_ROUTES[index]!.width) + 24;
        if (!free) continue;
        if (tiles.detail === 'flowers-white') {
          placeFlower(cc, rr, cc + rr);
          placeFlower(cc + 1, rr, cc + rr + 1);
        } else if (tiles.detail === 'tree-big' || tiles.detail === 'pine-m') {
          const [, tint] = tiles.trees[Math.floor(floorHash(index, cc, rr, 10) * tiles.trees.length)]!;
          const sprite = tree(tiles.detail, tint);
          if (sprite) ctx.drawImage(sprite, cc * T, rr * T);
        } else if (tiles.detail === 'wall') {
          // O recorte do muro começa com água e grama da folha de origem: só os tijolos (como no BONK).
          drawSprite(ctx, art, 'wall', cc * T, rr * T, { x: 18, y: 0, w: 32, h: 16 });
        } else {
          drawSprite(ctx, art, tiles.detail, cc * T, rr * T);
        }
      }
    }

    // 7. Florestas: copas em grade desencontrada a cada 2 blocos, espécies e tons misturados, de cima para baixo.
    if (art) {
      const trees: { sprite: HTMLCanvasElement; x: number; y: number }[] = [];
      for (let r = -1; r < rows; r += 2) for (let c = ((r + 1) / 2) % 2 - 1; c < cols; c += 2) {
        // Um tronco por par de blocos; na borda da arena a fileira continua para fora, sem buraco no canto.
        const inside = [[0, 0], [1, 0], [0, 1], [1, 1]].some(([dc, dr]) => cellIs(c + dc!, r + dr!, FLOOR_CELL.forest, false));
        const outside = (c < 0 || r < 0 || c >= cols - 1 || r >= rows - 1)
          && [[0, 0], [1, 0], [0, 1], [1, 1]].every(([dc, dr]) => at(c + dc!, r + dr!) === null || cellIs(c + dc!, r + dr!, FLOOR_CELL.base) || cellIs(c + dc!, r + dr!, FLOOR_CELL.forest));
        if (!inside && !outside) continue;
        const [id, tint] = tiles.trees[Math.floor(floorHash(index, c, r, 70) * tiles.trees.length)]!;
        const sprite = tree(id, tint);
        if (!sprite) continue;
        const jx = Math.floor(floorHash(index, c, r, 71) * 7) - 3;
        const jy = Math.floor(floorHash(index, c, r, 72) * 5) - 2;
        trees.push({ sprite, x: c * T + T - sprite.width / 2 + jx, y: (r + 2) * T - sprite.height + jy });
      }
      trees.sort((a, b) => (a.y + a.sprite.height) - (b.y + b.sprite.height));
      for (const t of trees) ctx.drawImage(t.sprite, Math.round(t.x), Math.round(t.y));
    }

    layers.set(index, result);
    return result;
  }

  function viewRect(view: LandscapeView | undefined): { x: number; y: number; right: number; bottom: number } {
    if (!view) return { x: 0, y: 0, right: width, bottom: height };
    return {
      x: Math.max(0, Math.floor(view.x)),
      y: Math.max(0, Math.floor(view.y)),
      right: Math.min(width, Math.ceil(view.x + view.w)),
      bottom: Math.min(height, Math.ceil(view.y + view.h)),
    };
  }

  /** Desenha um setor 2.880×1.920, ou apenas o retângulo visível dele. */
  function paint(ctx: CanvasRenderingContext2D, region: RegionLayer, view: LandscapeView | undefined, motion: LandscapeMotion): void {
    const { x, y, right, bottom } = viewRect(view);
    if (right <= x || bottom <= y) return;
    if (!view) ctx.drawImage(region.canvas, 0, 0);
    else ctx.drawImage(region.canvas, x, y, right - x, bottom - y, x, y, right - x, bottom - y);
    const r0 = Math.max(0, Math.floor(y / T) - 1), r1 = Math.min(region.flowers.length - 1, Math.floor(bottom / T));
    const flowerFrame = motion.animate ? Math.floor(motion.timeMs / FLOWER_FRAME_MS) % 2 : 0;
    for (let r = r0; r <= r1; r++) {
      for (const flower of region.flowers[r]!) {
        if (flower.x + T < x || flower.x > right) continue;
        // Canteiros vizinhos balançam em contratempo, em vez de todos juntos.
        ctx.drawImage(flower.frames[(flowerFrame + (flower.x / T + r) % 2) % 2]!, flower.x, r * T);
      }
    }
    if (!motion.animate) return;
    // Brilhos curtos que correm pela água, só no miolo das poças (a margem fica parada).
    const phase = Math.floor(motion.timeMs / WATER_FRAME_MS);
    ctx.fillStyle = '#d8f4fc';
    for (let r = r0; r <= r1; r++) {
      for (const c of region.water[r]!) {
        const px = c * T;
        if (px + T < x || px > right) continue;
        const seed = (c * 7 + r * 13) % 8;
        const step = (phase + seed) % 8;
        if (step > 4) continue;
        ctx.fillRect(px + 3 + ((seed + step) % 8), r * T + 4 + (seed % 7), 3, 1);
        if (step % 2 === 0) ctx.fillRect(px + 2 + ((seed * 3 + step) % 9), r * T + 10 + (seed % 3), 2, 1);
      }
    }
  }

  const render = ((ctx: CanvasRenderingContext2D, elapsedMs: number, view?: LandscapeView, motion: LandscapeMotion = { timeMs: 0, animate: false }, runSeed = 0): void => {
    const { current, next, blend } = survivorRegionAt(elapsedMs, runSeed);
    for (const key of layers.keys()) if (key !== current && key !== next) layers.delete(key);
    for (const key of regionAtlases.keys()) if (key !== current && key !== next) regionAtlases.delete(key);
    // A arena pode ser maior que um único canvas de cenário. Repetir o setor
    // preserva tamanho de árvores/itens e evita uma textura de centenas de MB.
    const visible = view ?? { x: 0, y: 0, w: width, h: height };
    const firstX = Math.floor(visible.x / width), lastX = Math.floor((visible.x + visible.w - 1) / width);
    const firstY = Math.floor(visible.y / height), lastY = Math.floor((visible.y + visible.h - 1) / height);
    for (let tileY = firstY; tileY <= lastY; tileY++) for (let tileX = firstX; tileX <= lastX; tileX++) {
      const offsetX = tileX * width, offsetY = tileY * height;
      const localView = { x: visible.x - offsetX, y: visible.y - offsetY, w: visible.w, h: visible.h };
      ctx.save();
      ctx.translate(offsetX, offsetY);
      paint(ctx, layer(current), localView, motion);
      if (blend > 0) {
        ctx.globalAlpha = blend;
        paint(ctx, layer(next), localView, motion);
      }
      ctx.restore();
    }
  }) as SurvivorLandscapeRenderer;

  render.setAtlas = (image) => {
    if (atlas === image) return;
    atlas = image;
    layers.clear();
    regionAtlases.clear();
  };
  return render;
}
