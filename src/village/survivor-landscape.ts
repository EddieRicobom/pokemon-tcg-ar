import { SURVIVOR_REGIONS, survivorRegionAt } from '../core/survivor-regions';
import { SURVIVOR_BIOMES, survivorBiomeZonesOf } from '../core/survivor-biomes';
import { ATLAS_SOURCES, packAtlas } from './atlas-spec';

/** Tilesets originais do atlas por região: terreno, trilha, cenário e cobertura baixa do chão. */
export const SURVIVOR_REGION_TILESETS = [
  // Kanto: terra batida entre prados e árvores altas.
  { ground: 'at-trail', path: 'at-plot', detail: 'tree-big', cover: 'tall', coverDensity: 0.19 },
  // Johto: chão quente de folhas, com trilha de terra escura.
  { ground: 'at-trail', path: 'at-harvest', detail: 'pine-m', cover: 'tall', coverDensity: 0.15 },
  // Hoenn: areia clara de rota costeira sobre a grama úmida.
  { ground: 'sand-grass', path: 'at-sand', detail: 'bush', cover: 'tall', coverDensity: 0.11 },
  // Sinnoh: neve compactada e pedras frias para o caminho de altitude.
  { ground: 'at-snow', path: 'at-snow-rock', detail: 'rock-1', cover: 'bush', coverDensity: 0.13 },
  // Unova: piso de ruínas com faixas de tijolo antigo.
  { ground: 'at-ruins', path: 'at-brick', detail: 'rock-2', cover: 'bush', coverDensity: 0.1 },
  // Kalos: jardim com caminho de pedra clara e flores baixas.
  { ground: 'at-trail', path: 'at-path', detail: 'flowers-white', cover: 'flowers-white', coverDensity: 0.23 },
  // Alola: faixa de areia entre o gramado costeiro e as lagoas.
  { ground: 'sand-water', path: 'at-sand', detail: 'rock-3', cover: 'bush', coverDensity: 0.08 },
  // Galar: passagem de ruínas com pedras de estrada irregulares.
  { ground: 'at-ruins', path: 'at-ruins-path', detail: 'wall', cover: 'tall', coverDensity: 0.12 },
  // Paldea: campo seco de oliveiras com trilha de pedra e terra.
  { ground: 'at-trail', path: 'at-harvest-stone', detail: 'pine-m', cover: 'bush', coverDensity: 0.14 },
] as const;

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

const atlasLayout = packAtlas();
const sourceById = new Map(ATLAS_SOURCES.map((source) => [source.id, source]));

/** Patch de 16 × 16 sem borda do recorte (autotiles usam a célula central do 3 × 3). */
function tilePatch(id: string): { sx: number; sy: number } | null {
  const source = sourceById.get(id);
  const rect = atlasLayout.rects.get(id);
  if (!source || !rect) return null;
  return source.half
    ? { sx: rect.x + 16, sy: rect.y + 32 }
    : { sx: rect.x + Math.max(0, Math.floor((rect.w - 16) / 2)), sy: rect.y + Math.max(0, Math.floor((rect.h - 16) / 2)) };
}

interface RoutePoint { x: number; y: number }

function routePoints(points: readonly (readonly [number, number])[], width: number, height: number): RoutePoint[] {
  return points.map(([x, y]) => ({ x: x * width, y: y * height }));
}

function traceRoute(ctx: CanvasRenderingContext2D, points: readonly RoutePoint[]): void {
  const first = points[0];
  if (!first) return;
  ctx.moveTo(first.x, first.y);
  if (points.length === 1) return;
  for (let i = 1; i < points.length - 1; i += 1) {
    const current = points[i]!;
    const next = points[i + 1]!;
    const midpoint = { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 };
    ctx.quadraticCurveTo(current.x, current.y, midpoint.x, midpoint.y);
  }
  const penultimate = points[points.length - 2]!;
  ctx.quadraticCurveTo(penultimate.x, penultimate.y, points[points.length - 1]!.x, points[points.length - 1]!.y);
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

/** Cacheia só a região atual e a próxima; o desenho de tiles ocorre uma vez por região, não a cada quadro. */
export function createSurvivorLandscape(width: number, height: number): SurvivorLandscapeRenderer {
  const layers = new Map<number, HTMLCanvasElement>();
  let atlas: CanvasImageSource | null = null;

  function drawAtlasTile(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, h: number, alpha = 1): boolean {
    if (!atlas) return false;
    const source = sourceById.get(id);
    const rect = atlasLayout.rects.get(id);
    if (!source || !rect) return false;
    const cell = tilePatch(id);
    if (!cell) return false;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (id === 'wall' || id === 'tree-big' || id === 'pine-m' || id === 'flowers-white' || id === 'tall') {
      const sw = source.half ? source.w / 2 : source.w;
      const sh = source.half ? source.h / 2 : source.h;
      ctx.drawImage(atlas, rect.x, rect.y, sw, sh, x, y, w, h);
    } else {
      ctx.drawImage(atlas, cell.sx, cell.sy, 16, 16, x, y, w, h);
    }
    ctx.restore();
    return true;
  }

  function layer(index: number): HTMLCanvasElement {
    const cached = layers.get(index);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const region = SURVIVOR_REGIONS[index]!;
    const tiles = SURVIVOR_REGION_TILESETS[index]!;
    const hash = (n: number): number => {
      let h = n ^ 0x9e3779b9;
      h = Math.imul(h ^ h >>> 16, 0x7feb352d);
      h = Math.imul(h ^ h >>> 15, 0x846ca68b);
      return ((h ^ h >>> 16) >>> 0) / 0x100000000;
    };
    ctx.fillStyle = region.ground;
    ctx.fillRect(0, 0, width, height);

    // O recorte de terreno domina a camada: menos ruído procedural, mais identidade de tileset.
    for (let y = 0; y < height; y += 16) {
      for (let x = 0; x < width; x += 16) drawAtlasTile(ctx, tiles.ground, x, y, 16, 16, 0.42);
    }
    // Pequenos pixels de contraste quebram a repetição sem desenhar manchas vetoriais sobre o mapa.
    for (let i = 0; i < 920; i++) {
      const x = Math.floor(hash(i * 3) * width), y = Math.floor(hash(i * 3 + 1) * height);
      ctx.fillStyle = i % 3 ? '#213d2624' : '#f0edac2b';
      ctx.fillRect(x, y, 1, 2);
      if (i % 11 === 0) { ctx.fillRect(x - 2, y - 1, 1, 2); ctx.fillRect(x + 2, y - 2, 1, 2); }
    }

    // Uma rota principal e ramificações curtas dão leitura de caminho natural; não há mais ondas periódicas.
    const routeDefinition = SURVIVOR_REGION_ROUTES[index]!;
    const routes = [routeDefinition.main, ...routeDefinition.branches]
      .map((points) => routePoints(points, width, height));
    const nearRoute = (x: number, y: number, extra = 0): boolean => distanceToRoutes(x, y, routes) <= routeDefinition.width / 2 + extra;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = routeDefinition.width + 8;
    ctx.strokeStyle = '#231d1738';
    for (const route of routes) {
      ctx.beginPath();
      traceRoute(ctx, route);
      ctx.stroke();
    }
    ctx.lineWidth = routeDefinition.width;
    ctx.strokeStyle = region.path;
    for (const route of routes) {
      ctx.beginPath();
      traceRoute(ctx, route);
      ctx.stroke();
    }
    // Repete células de 16 px sem esticar a arte; o recorte regional agora acompanha a rota escolhida acima.
    for (let y = 0; y < height; y += 16) for (let x = 0; x < width; x += 16) {
      if (nearRoute(x + 8, y + 8, 15)) drawAtlasTile(ctx, tiles.path, x, y, 16, 16, 0.82);
    }
    for (let i = 0; i < 420; i++) {
      const x = Math.floor(hash(i * 7) * width), y = Math.floor(hash(i * 7 + 1) * height);
      if (nearRoute(x, y, 10)) {
        ctx.fillStyle = i % 2 ? '#6d573021' : '#fff0cc30';
        ctx.fillRect(x, y, 2, 1);
      }
    }
    ctx.restore();

    // Cobertura baixa presa à grade: mato alto, arbustos ou flores vindos do atlas, como nas rotas de GBA.
    // Fica fora dos dois corredores para a leitura do combate e dos golpes continuar limpa.
    const coverSize = tiles.cover === 'tall' ? { w: 48, h: 64 }
      : tiles.cover === 'flowers-white' ? { w: 32, h: 18 }
        : { w: 24, h: 22 };
    for (let y = 24; y < height - coverSize.h; y += 48) {
      for (let x = 20; x < width - coverSize.w; x += 48) {
        const row = Math.floor(y / 48);
        const col = Math.floor(x / 48);
        if (hash((index + 1) * 1103 + row * 71 + col * 17) > tiles.coverDensity) continue;
        const px = x + Math.floor(hash((index + 1) * 3109 + row * 13 + col) * 18);
        const py = y + Math.floor(hash((index + 1) * 1013 + row + col * 29) * 18);
        if (!nearRoute(px + coverSize.w / 2, py + coverSize.h / 2, 34)) drawAtlasTile(ctx, tiles.cover, px, py, coverSize.w, coverSize.h, 0.92);
      }
    }

    // O centro permanece livre; cada bioma usa seu recorte temático junto às bordas.
    for (let i = 0; i < 24; i++) {
      const x = i % 2 === 0 ? 22 + (i * 47) % 100 : width - 120 + (i * 31) % 90;
      const y = 24 + (i * 83) % (height - 64);
      ctx.fillStyle = '#243b3330';
      ctx.fillRect(x - 2, y + 10, 24, 8);
      if (!atlas) {
        if (region.detail === 'tree') {
          ctx.fillStyle = '#76624a';
          ctx.fillRect(x + 8, y + 8, 5, 12);
          ctx.fillStyle = region.accent;
          ctx.fillRect(x, y - 7, 22, 18);
          ctx.fillRect(x + 5, y - 14, 12, 9);
        } else if (region.detail === 'pool') {
          ctx.fillStyle = region.path;
          ctx.fillRect(x - 4, y - 4, 34, 24);
          ctx.fillStyle = region.accent;
          ctx.fillRect(x, y, 26, 16);
          ctx.fillStyle = '#a3d3cd';
          ctx.fillRect(x + 4, y + 4, 13, 2);
        } else if (region.detail === 'flower') {
          for (let f = 0; f < 5; f++) {
            ctx.fillStyle = f % 2 ? '#e5c2cc' : region.accent;
            ctx.fillRect(x + f * 5, y + f % 3 * 5, 3, 3);
          }
        } else {
          ctx.fillStyle = region.accent;
          ctx.fillRect(x, y, 22, 15);
          ctx.fillStyle = '#ffffff35';
          ctx.fillRect(x + 3, y + 2, 12, 3);
        }
        continue;
      }
      const id = tiles.detail;
      if (id === 'tree-big' || id === 'pine-m' || id === 'wall') {
        drawAtlasTile(ctx, id, x - 3, y - 14, id === 'wall' ? 32 : 30, 32, 0.96);
      } else if (id === 'flowers-white') {
        drawAtlasTile(ctx, id, x - 2, y - 5, 28, 18, 0.95);
      } else if (id === 'bush') {
        drawAtlasTile(ctx, id, x, y - 2, 25, 22, 0.96);
      } else {
        drawAtlasTile(ctx, id, x, y, 22, 15, 0.96);
      }
    }
    // O bioma vai assado na própria camada: uma blitagem por região a cada quadro, em vez de camada + sobreposição.
    drawBiomeOverlayLayer(ctx, SURVIVOR_BIOMES.find((biome) => biome.regionIndex === index), 0.18);
    layers.set(index, canvas);
    return canvas;
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
  };
  return render;
}

/** Marca as áreas com efeito mecânico para que nenhum perigo fique invisível ao jogador. */
export function drawSurvivorBiomeOverlay(ctx: CanvasRenderingContext2D, elapsedMs: number): void {
  const { current, next, blend } = survivorRegionAt(elapsedMs);
  drawBiomeOverlayLayer(ctx, SURVIVOR_BIOMES.find((biome) => biome.regionIndex === current), 0.18);
  drawBiomeOverlayLayer(ctx, blend > 0 ? SURVIVOR_BIOMES.find((biome) => biome.regionIndex === next) : undefined, blend * 0.18);
}
