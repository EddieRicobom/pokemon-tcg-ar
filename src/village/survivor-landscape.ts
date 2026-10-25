import { SURVIVOR_REGIONS, survivorRegionAt } from '../core/survivor-regions';
import { SURVIVOR_BIOMES, survivorBiomeZonesOf } from '../core/survivor-biomes';
import type { SurvivorBiomeZoneKind } from '../core/survivor-biomes';
import { ATLAS_SOURCES, packAtlas } from './atlas-spec';
import { quarterCell } from './ground-tiles';
import { SURVIVOR_FLOOR_PALETTES, SURVIVOR_FLOWER_COLORS, floorHash, recolorGrassBase, survivorDecorTile, survivorFloorTexture } from './survivor-floor-art';
import type { FlowerColors, SurvivorDecorKind, SurvivorFloorKind } from './survivor-floor-art';

/**
 * Chão regional da Torre. `floor` é a base em pixel art (mesma cor da borda do autotile da trilha, então as duas
 * emendam sem costura); `path` é o autotile da rota; `detail` é o objeto de cenário espalhado; `cover`, a cobertura
 * baixa em aglomerados; `border`, as árvores que fecham a arena. `ground` é o recorte que o BONK usa como textura.
 */
export const SURVIVOR_REGION_TILESETS = [
  // Kanto: grama de rota com trilha de terra, moitas de mato alto e flores vermelhas.
  { floor: 'grass', ground: 'at-trail', path: 'at-plot', detail: 'tree-big', cover: 'tall', coverDensity: 0.19, border: 'tree-big', decor: ['tuft', 'flowers', 'clover'], flowers: ['red', 'white'] },
  // Johto: capim dourado de outono, trilha de terra escura e folhas caídas.
  { floor: 'autumn', ground: 'at-trail', path: 'at-harvest', detail: 'pine-m', cover: 'tall', coverDensity: 0.12, border: 'pine-m', decor: ['leaves', 'tuft', 'leaves'], flowers: ['yellow'] },
  // Hoenn: gramado costeiro com rota de areia clara e poças.
  { floor: 'grass', ground: 'sand-grass', path: 'sand-grass', detail: 'bush', cover: 'tall', coverDensity: 0.11, border: 'tree-big', decor: ['tuft', 'flowers', 'tuft'], flowers: ['yellow', 'red'] },
  // Sinnoh: neve compactada, caminho de pedras frias e montes de neve.
  { floor: 'snow', ground: 'at-snow', path: 'at-snow-rock', detail: 'rock-1', cover: 'pine-s1', coverDensity: 0.1, border: 'pine-m', decor: ['drift', 'pebbles', 'drift'], flowers: ['white'] },
  // Unova: campo aberto cortado por estradas de pedra lavrada.
  { floor: 'grass', ground: 'at-ruins', path: 'at-plaza', detail: 'rock-2', cover: 'bush', coverDensity: 0.1, border: 'tree-big', decor: ['pebbles', 'tuft', 'clover'], flowers: ['blue'] },
  // Kalos: jardim com caminho de pedra clara e canteiros de flores.
  { floor: 'grass', ground: 'at-trail', path: 'at-path', detail: 'flowers-white', cover: 'flowers-white', coverDensity: 0.2, border: 'tree-big', decor: ['flowers', 'tuft', 'flowers'], flowers: ['pink', 'white', 'yellow', 'red'] },
  // Alola: areia dourada com trilha de pedras e conchas.
  { floor: 'sand', ground: 'sand-water', path: 'at-harvest-stone', detail: 'rock-3', cover: 'bush', coverDensity: 0.08, border: 'pine-s2', decor: ['shell', 'ripple', 'shell'], flowers: ['pink'] },
  // Galar: chão batido de ruínas, estrada de tijolos partidos e mato alto.
  { floor: 'dust', ground: 'at-ruins', path: 'at-ruins-path', detail: 'wall', cover: 'tall', coverDensity: 0.12, border: 'pine-m', decor: ['crack', 'pebbles', 'tuft'], flowers: ['white'] },
  // Paldea: campo de oliveiras com trilha de terra seca.
  { floor: 'meadow', ground: 'at-trail', path: 'at-trail', detail: 'stump', cover: 'bush', coverDensity: 0.14, border: 'tree-big', decor: ['tuft', 'clover', 'flowers'], flowers: ['yellow', 'white'] },
] as const satisfies readonly {
  floor: SurvivorFloorKind;
  ground: string;
  path: string;
  detail: string;
  cover: string;
  coverDensity: number;
  border: string;
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

/** Rotas desenhadas à mão: curvas suaves, sem a ondulação periódica do cenário antigo. */
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

const T = 16;
const Q = 8;

interface RoutePoint { x: number; y: number }

/** Amostra a mesma curva suave (quadráticas entre pontos médios) que a rota tinha quando era um traço vetorial. */
function sampleRoute(points: readonly (readonly [number, number])[], width: number, height: number): RoutePoint[] {
  const p = points.map(([x, y]) => ({ x: x * width, y: y * height }));
  if (p.length < 3) return p;
  const out: RoutePoint[] = [p[0]!];
  let start = p[0]!;
  for (let i = 1; i < p.length - 1; i += 1) {
    const control = p[i]!;
    const end = i === p.length - 2 ? p[i + 1]! : { x: (control.x + p[i + 1]!.x) / 2, y: (control.y + p[i + 1]!.y) / 2 };
    for (let s = 1; s <= 12; s += 1) {
      const t = s / 12;
      const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      out.push({ x: a * start.x + b * control.x + c * end.x, y: a * start.y + b * control.y + c * end.y });
    }
    start = end;
  }
  return out;
}

function distanceToSegment(x: number, y: number, a: RoutePoint, b: RoutePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared));
  return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
}

function distanceToRoutes(x: number, y: number, routes: readonly (readonly RoutePoint[])[]): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const route of routes) {
    for (let i = 1; i < route.length; i += 1) nearest = Math.min(nearest, distanceToSegment(x, y, route[i - 1]!, route[i]!));
  }
  return nearest;
}

/** O que ocupa cada bloco de 16 px do chão. */
export const FLOOR_CELL = { base: 0, path: 1, cover: 2, zone: 3 } as const;
export type FloorCell = typeof FLOOR_CELL[keyof typeof FLOOR_CELL];

export interface SurvivorFloorPlan {
  cols: number;
  rows: number;
  cells: Uint8Array;
  /** Blocos da rota (1), inclusive os que passam por baixo de uma zona de bioma. */
  path: Uint8Array;
  /** Bioma mecânico de cada bloco (`null` fora das zonas); vira terreno temático no desenho. */
  zones: readonly (SurvivorBiomeZoneKind | null)[];
  /** Distância (px) de cada bloco até a rota. */
  routeDistance: Float32Array;
}

/** Faixa das bordas reservada às copas das árvores que fecham a arena. */
export const FLOOR_BORDER_PX = 24;

/**
 * Planta o chão da região em blocos de 16 px: rota, zonas de bioma (no mesmo retângulo da mecânica) e moitas.
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
  const routes = [definition.main, ...definition.branches].map((points) => sampleRoute(points, width, height));
  const half = definition.width / 2;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    routeDistance[i] = distanceToRoutes(c * T + 8, r * T + 8, routes);
    if (routeDistance[i]! <= half) cells[i] = FLOOR_CELL.path;
  }
  // Sem pontas de um bloco nem passagens só pela diagonal: o autotile fica com cantos limpos.
  const isPath = (c: number, r: number) => c < 0 || r < 0 || c >= cols || r >= rows || cells[r * cols + c] === FLOOR_CELL.path;
  for (let pass = 0; pass < 2; pass++) {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const n = isPath(c, r - 1), s = isPath(c, r + 1), w = isPath(c - 1, r), e = isPath(c + 1, r);
      if (cells[i] !== FLOOR_CELL.path && ((n && s) || (w && e))) cells[i] = FLOOR_CELL.path;
      else if (cells[i] === FLOOR_CELL.path && Number(n) + Number(s) + Number(w) + Number(e) <= 1) cells[i] = FLOOR_CELL.base;
    }
  }
  const path = Uint8Array.from(cells, (cell) => (cell === FLOOR_CELL.path ? 1 : 0));
  const biome = SURVIVOR_BIOMES.find((candidate) => candidate.regionIndex === index);
  for (const zone of biome ? survivorBiomeZonesOf(biome) : []) {
    const c0 = Math.max(0, Math.round(zone.x / T)), c1 = Math.min(cols, Math.round((zone.x + zone.width) / T));
    const r0 = Math.max(0, Math.round(zone.y / T)), r1 = Math.min(rows, Math.round((zone.y + zone.height) / T));
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
      cells[r * cols + c] = FLOOR_CELL.zone;
      zones[r * cols + c] = zone.kind;
    }
  }
  // Moitas em manchas arredondadas (nunca um bloco solto), longe da rota e das bordas.
  const border = Math.ceil(FLOOR_BORDER_PX / T) + 1;
  for (let gr = 0; gr < rows; gr += 9) for (let gc = 0; gc < cols; gc += 9) {
    if (floorHash(index, gr, gc, 11) > tiles.coverDensity * 2) continue;
    const cx = gc + 2 + Math.floor(floorHash(index, gr, gc, 12) * 5);
    const cy = gr + 2 + Math.floor(floorHash(index, gr, gc, 13) * 5);
    const rx = 2.2 + floorHash(index, gr, gc, 14) * 2.4;
    const ry = 1.4 + floorHash(index, gr, gc, 15) * 1.6;
    for (let r = Math.floor(cy - ry); r <= Math.ceil(cy + ry); r++) for (let c = Math.floor(cx - rx); c <= Math.ceil(cx + rx); c++) {
      if (c < border || r < border || c >= cols - border || r >= rows - border) continue;
      const i = r * cols + c;
      const dx = (c - cx) / rx, dy = (r - cy) / ry;
      if (dx * dx + dy * dy > 1 || cells[i] !== FLOOR_CELL.base || routeDistance[i]! <= half + 24) continue;
      cells[i] = FLOOR_CELL.cover;
    }
  }
  return { cols, rows, cells, path, zones, routeDistance };
}

/** Retângulo do mundo que aparece na tela (câmera); sem ele a paisagem inteira é desenhada. */
export interface LandscapeView { x: number; y: number; w: number; h: number }

export type SurvivorLandscapeRenderer = ((ctx: CanvasRenderingContext2D, elapsedMs: number, view?: LandscapeView) => void) & {
  setAtlas(image: CanvasImageSource | null): void;
};

function drawBiomeOverlayLayer(ctx: CanvasRenderingContext2D, biome: typeof SURVIVOR_BIOMES[number] | undefined, alpha: number): void {
  if (!biome || alpha <= 0) return;
  for (const zone of survivorBiomeZonesOf(biome)) {
    const color = zone.kind === 'folhagem' ? '#245d3a'
      : zone.kind === 'poça' ? '#2e8db8'
        : zone.kind === 'neve' ? '#d9f3ff'
          : zone.kind === 'vento' ? '#b5a85f'
            : zone.kind === 'pedra' ? '#706b62'
              : zone.kind === 'flores' ? '#9c688f'
                : zone.kind === 'areia' ? '#c6a85c'
                  : zone.kind === 'ruínas' ? '#5d6670'
                    : '#667d48';
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
    // Cantos e marcas quadradas preservam a leitura da área mecânica sem caixas tracejadas ou emoji.
    ctx.globalAlpha = Math.min(1, alpha * 4);
    ctx.fillStyle = zone.kind === 'neve' || zone.kind === 'areia' ? '#ffffffcc' : '#ffffff9c';
    const corner = 12;
    for (const [x, y, dx, dy] of [
      [zone.x + 3, zone.y + 3, 1, 1], [zone.x + zone.width - 3, zone.y + 3, -1, 1],
      [zone.x + 3, zone.y + zone.height - 3, 1, -1], [zone.x + zone.width - 3, zone.y + zone.height - 3, -1, -1],
    ] as const) {
      for (let step = 0; step < corner; step += 3) {
        ctx.fillRect(x + step * dx, y, 2, 2);
        ctx.fillRect(x, y + step * dy, 2, 2);
      }
    }
    const markX = zone.x + Math.floor(zone.width / 2) - 5;
    const markY = zone.y + Math.floor(zone.height / 2) - 5;
    ctx.fillStyle = '#ffffff88';
    ctx.fillRect(markX, markY + 4, 10, 2);
    ctx.fillRect(markX + 4, markY, 2, 10);
    ctx.restore();
  }
}

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

/** Cacheia só a região atual e a próxima; o desenho de tiles ocorre uma vez por região, não a cada quadro. */
export function createSurvivorLandscape(width: number, height: number): SurvivorLandscapeRenderer {
  const layers = new Map<number, HTMLCanvasElement>();
  const objectAtlases = new Map<SurvivorFloorKind, CanvasImageSource>();
  let atlas: CanvasImageSource | null = null;

  /** Atlas com as sombras verde-água dos objetos trocadas pelos tons do chão da região. */
  function objectAtlas(floor: SurvivorFloorKind): CanvasImageSource | null {
    if (!atlas || floor === 'grass') return atlas;
    const cached = objectAtlases.get(floor);
    if (cached) return cached;
    const source = atlas as HTMLImageElement;
    const w = source.width, h = source.height;
    if (!w || !h) return atlas;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext('2d')!;
    c.drawImage(source, 0, 0);
    const image = c.getImageData(0, 0, w, h);
    image.data.set(recolorGrassBase({ w, h, data: image.data }, floor));
    c.putImageData(image, 0, 0);
    objectAtlases.set(floor, canvas);
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
  function drawAutotile(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, same: (dx: number, dy: number) => boolean): void {
    const rect = atlasLayout.rects.get(id);
    if (!atlas || !rect) return;
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
      ctx.drawImage(atlas, rect.x + cx * T + qx * Q, rect.y + cy * T + qy * Q, Q, Q, x + qx * Q, y + qy * Q, Q, Q);
    }
  }

  function layer(index: number): HTMLCanvasElement {
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
    const objects = objectAtlas(floor);
    const plan = planSurvivorFloor(index, width, height);
    const { cols, rows, cells, zones } = plan;
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
    const decor = (kind: SurvivorDecorKind, variant: number, colors = flowerColors) => {
      const key = `${kind}:${variant % 6}:${colors.length}`;
      let tile = decorCache.get(key);
      if (!tile) {
        tile = bufferCanvas(survivorDecorTile(kind, floor, variant % 6, colors));
        decorCache.set(key, tile);
      }
      return tile;
    };

    // 1. Base: ladrilho de 64 px repetido, sem transparência e sem cor chapada por baixo aparecendo.
    const texture = ctx.createPattern(bufferCanvas(survivorFloorTexture(floor)), 'repeat');
    ctx.fillStyle = texture ?? hex(palette.base);
    ctx.fillRect(0, 0, width, height);

    // 2. Detalhes miúdos espalhados pela base: tufos, flores, pedrinhas, folhas... nunca colados um no outro.
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (cells[r * cols + c] !== FLOOR_CELL.base) continue;
      const h = floorHash(index, c, r, 3);
      if (h > 0.085 || (c + r) % 2) continue;
      const kind = tiles.decor[Math.floor(floorHash(index, c, r, 4) * tiles.decor.length)]!;
      ctx.drawImage(decor(kind, Math.floor(h * 1000)), c * T, r * T);
    }

    // 3. Rota em autotile: borda, cantos de fora e de dentro presos à grade, como nas rotas dos jogos.
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!plan.path[r * cols + c]) continue;
      if (!atlas) {
        ctx.fillStyle = region.path;
        ctx.fillRect(c * T, r * T, T, T);
        continue;
      }
      // A rota segue por baixo das zonas: o terreno da zona vem depois, por cima.
      drawAutotile(ctx, tiles.path, c * T, r * T, (dx, dy) => {
        const i = at(c + dx, r + dy);
        return i === null || plan.path[i] === 1;
      });
    }

    // 4. Zonas de bioma viram terreno de verdade, no retângulo exato da mecânica (as marcas de canto vêm no fim).
    // Mato alto: corpo no bloco, pontas das folhas sobre o bloco de cima e pé com sombra na última fileira.
    const tallCell = (c: number, r: number, isTall: (c: number, r: number) => boolean) => {
      const column = (c % 3) * T;
      const row = !isTall(c, r + 1) ? 3 : 1 + (r % 2);
      drawSprite(ctx, objects, 'tall', c * T, r * T, { x: column, y: row * T, w: T, h: T });
      if (!isTall(c, r - 1)) drawSprite(ctx, objects, 'tall', c * T, (r - 1) * T, { x: column, y: 0, w: T, h: T });
    };
    const zoneTall = (c: number, r: number) => zoneIs(c, r, 'folhagem');
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const kind = zones[i];
      if (!kind) continue;
      const x = c * T, y = r * T;
      const variant = Math.floor(floorHash(index, c, r, 5) * 1000);
      switch (kind) {
        case 'folhagem':
          if (!atlas) break;
          tallCell(c, r, zoneTall);
          break;
        case 'poça':
          drawWater(ctx, c, r, (dc, dr) => zoneIs(c + dc, r + dr, 'poça'));
          break;
        case 'neve':
          ctx.fillStyle = hex(palette.shade);
          ctx.globalAlpha = 0.35;
          ctx.fillRect(x, y, T, T);
          ctx.globalAlpha = 1;
          ctx.drawImage(decor('drift', variant), x, y);
          break;
        case 'vento':
          ctx.drawImage(decor('leaves', variant), x, y);
          if (variant % 2) ctx.drawImage(decor('leaves', variant + 1), x, y);
          break;
        case 'pedra':
          ctx.drawImage(decor('pebbles', variant), x, y);
          if (variant % 5 === 0 && atlas) drawSprite(ctx, objects, variant % 2 ? 'rock-1' : 'rock-2', x, y);
          break;
        case 'flores':
          ctx.drawImage(decor('flowers', variant, flowerColors), x, y);
          break;
        case 'areia':
          ctx.fillStyle = hex(palette.shade);
          ctx.globalAlpha = 0.45;
          ctx.fillRect(x, y, T, T);
          ctx.globalAlpha = 1;
          ctx.drawImage(decor('ripple', variant), x, y);
          break;
        case 'ruínas':
          if (atlas) drawAutotile(ctx, 'at-brick', x, y, (dx, dy) => zoneIs(c + dx, r + dy, 'ruínas'));
          break;
        case 'olival':
          ctx.drawImage(decor((c + r) % 2 ? 'clover' : 'tuft', variant), x, y);
          break;
      }
    }
    // Oliveiras em fileiras dentro do olival, com o mesmo passo das plantações.
    if (atlas) {
      for (let r = 0; r < rows; r += 2) for (let c = (r / 2) % 2; c < cols; c += 3) {
        if (zoneIs(c, r, 'olival') && zoneIs(c, r + 1, 'olival')) drawSprite(ctx, objects, 'bush', c * T, r * T + 4);
      }
    }

    // 5. Cobertura baixa em manchas: mato alto encaixado na grade, arbustos ou canteiros de flores.
    const coverAt = (c: number, r: number) => cellIs(c, r, FLOOR_CELL.cover, false);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!coverAt(c, r)) continue;
      const variant = Math.floor(floorHash(index, c, r, 6) * 1000);
      if (tiles.cover === 'tall') {
        if (atlas) tallCell(c, r, coverAt);
      } else if (tiles.cover === 'flowers-white') {
        ctx.drawImage(decor('flowers', variant, flowerColors), c * T, r * T);
      } else if (tiles.cover === 'pine-s1') {
        // Bosque de pinheiros pequenos: um a cada dois blocos, com o tronco na fileira de baixo.
        if (atlas && (c + r) % 2 === 0 && r % 2 === 0) drawSprite(ctx, objects, 'pine-s1', c * T, (r - 1) * T);
        else ctx.drawImage(decor('drift', variant), c * T, r * T);
      } else if (variant % 5 < 3 && atlas) {
        drawSprite(ctx, objects, 'bush', c * T, r * T);
      } else {
        ctx.drawImage(decor('tuft', variant), c * T, r * T);
      }
    }

    // 6. Objetos de cenário soltos, sempre fora da rota e com folga entre eles.
    const detailRect = atlasLayout.rects.get(tiles.detail);
    if (atlas && detailRect) {
      for (let r = 4; r < rows - 6; r += 9) for (let c = 4; c < cols - 6; c += 11) {
        const cc = c + Math.floor(floorHash(index, c, r, 7) * 6);
        const rr = r + Math.floor(floorHash(index, c, r, 8) * 5);
        if (floorHash(index, c, r, 9) > 0.5) continue;
        const spanC = Math.ceil(detailRect.w / T), spanR = Math.ceil(detailRect.h / T);
        let free = true;
        for (let y = rr; y < rr + spanR && free; y++) for (let x = cc; x < cc + spanC && free; x++) free = cellIs(x, y, FLOOR_CELL.base, false) && plan.routeDistance[at(x, y)!]! > SURVIVOR_REGION_ROUTES[index]!.width / 2 + 16;
        if (!free) continue;
        if (tiles.detail === 'flowers-white') {
          ctx.drawImage(decor('flowers', cc + rr, flowerColors), cc * T, rr * T);
          ctx.drawImage(decor('flowers', cc + rr + 1, flowerColors), (cc + 1) * T, rr * T);
        } else {
          drawSprite(ctx, objects, tiles.detail, cc * T, rr * T);
        }
      }
    }

    // 7. Árvores fechando a arena: copas cortadas pela borda, de cima para baixo para sobrepor certo.
    const borderRect = atlasLayout.rects.get(tiles.border);
    if (atlas && borderRect) {
      const trees: { x: number; y: number }[] = [];
      const stepX = Math.max(16, borderRect.w - 10);
      const stepY = Math.max(16, borderRect.h - 18);
      for (let x = -stepX / 2; x < width; x += stepX) {
        trees.push({ x, y: -borderRect.h + FLOOR_BORDER_PX + Math.floor(floorHash(index, x, 1) * 6) });
        trees.push({ x: x + stepX / 2, y: height - FLOOR_BORDER_PX - 8 - Math.floor(floorHash(index, x, 2) * 6) });
      }
      for (let y = 0; y < height; y += stepY) {
        trees.push({ x: -borderRect.w + FLOOR_BORDER_PX + Math.floor(floorHash(index, y, 3) * 6), y });
        trees.push({ x: width - FLOOR_BORDER_PX - Math.floor(floorHash(index, y, 4) * 6), y });
      }
      trees.sort((a, b) => a.y - b.y);
      for (const tree of trees) drawSprite(ctx, objects, tiles.border, tree.x, tree.y);
    }

    // 8. A área mecânica de cada bioma continua marcada nos cantos, por cima do terreno temático.
    drawBiomeOverlayLayer(ctx, SURVIVOR_BIOMES.find((biome) => biome.regionIndex === index), 0.1);
    layers.set(index, canvas);
    return canvas;
  }

  /**
   * Água das poças: o bloco 3 × 3 do mar (margem rasa e cantos arredondados) e um contorno escuro de 1 px onde a
   * água encosta na terra, como os lagos das rotas.
   */
  function drawWater(ctx: CanvasRenderingContext2D, c: number, r: number, wet: (dc: number, dr: number) => boolean): void {
    const x = c * T, y = r * T;
    if (atlas && atlasLayout.rects.get('sea')) drawAutotile(ctx, 'sea', x, y, wet);
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

  /** Desenha uma camada da arena inteira, ou só o retângulo visível: o resto nunca chega à tela, e a arena tem 2880×1920. */
  function paint(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, view: LandscapeView | undefined): void {
    if (!view) {
      ctx.drawImage(canvas, 0, 0);
      return;
    }
    const x = Math.max(0, Math.floor(view.x));
    const y = Math.max(0, Math.floor(view.y));
    const right = Math.min(width, Math.ceil(view.x + view.w));
    const bottom = Math.min(height, Math.ceil(view.y + view.h));
    if (right <= x || bottom <= y) return;
    ctx.drawImage(canvas, x, y, right - x, bottom - y, x, y, right - x, bottom - y);
  }

  const render = ((ctx: CanvasRenderingContext2D, elapsedMs: number, view?: LandscapeView): void => {
    const { current, next, blend } = survivorRegionAt(elapsedMs);
    for (const key of layers.keys()) if (key !== current && key !== next) layers.delete(key);
    ctx.save();
    paint(ctx, layer(current), view);
    if (blend > 0) {
      ctx.globalAlpha = blend;
      paint(ctx, layer(next), view);
    }
    ctx.restore();
  }) as SurvivorLandscapeRenderer;

  render.setAtlas = (image) => {
    if (atlas === image) return;
    atlas = image;
    layers.clear();
    objectAtlases.clear();
  };
  return render;
}

/** Marca as áreas com efeito mecânico para que nenhum perigo fique invisível ao jogador. */
export function drawSurvivorBiomeOverlay(ctx: CanvasRenderingContext2D, elapsedMs: number): void {
  const { current, next, blend } = survivorRegionAt(elapsedMs);
  drawBiomeOverlayLayer(ctx, SURVIVOR_BIOMES.find((biome) => biome.regionIndex === current), 0.18);
  drawBiomeOverlayLayer(ctx, blend > 0 ? SURVIVOR_BIOMES.find((biome) => biome.regionIndex === next) : undefined, blend * 0.18);
}
