import { SURVIVOR_REGIONS, survivorRegionAt } from '../core/survivor-regions';
import { SURVIVOR_BIOMES, survivorBiomeZonesOf } from '../core/survivor-biomes';
import { ATLAS_SOURCES, packAtlas } from './atlas-spec';

/** Tilesets originais do atlas por região: terreno, trilha e detalhe de cenário. */
export const SURVIVOR_REGION_TILESETS = [
  { ground: 'at-trail', path: 'at-path', detail: 'tree-big' },
  { ground: 'at-plaza', path: 'at-trail', detail: 'pine-m' },
  { ground: 'sand-grass', path: 'sand-water', detail: 'bush' },
  { ground: 'at-path', path: 'at-plaza', detail: 'rock-1' },
  { ground: 'at-plot', path: 'at-trail', detail: 'rock-2' },
  { ground: 'at-trail', path: 'at-plaza', detail: 'flowers-white' },
  { ground: 'sand-water', path: 'sea', detail: 'rock-3' },
  { ground: 'at-plaza', path: 'at-path', detail: 'wall' },
  { ground: 'at-plot', path: 'at-trail', detail: 'pine-m' },
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
    if (id === 'wall' || id === 'tree-big' || id === 'pine-m' || id === 'flowers-white') {
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

    // Recorta corredores curvos e repete células de 16 px: o tileset não é esticado na trilha.
    for (const horizontal of [false, true]) {
      const points: { x: number; y: number }[] = [];
      const extent = horizontal ? width : height;
      const half = horizontal ? 16 : 24;
      for (let coordinate = -16; coordinate <= extent + 16; coordinate += 8) {
        const center = horizontal ? height * 0.5 + Math.sin(coordinate / 190) * 19 : width * 0.5 + Math.sin(coordinate / 95) * 100;
        points.push({ x: horizontal ? coordinate : center, y: horizontal ? center : coordinate });
      }
      ctx.save();
      ctx.beginPath();
      for (const [i, point] of points.entries()) {
        const x = point.x - (horizontal ? 0 : half), y = point.y - (horizontal ? half : 0);
        if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      for (const point of points.reverse()) ctx.lineTo(point.x + (horizontal ? 0 : half), point.y + (horizontal ? half : 0));
      ctx.closePath();
      ctx.strokeStyle = '#293d2825'; ctx.lineWidth = 3; ctx.stroke();
      ctx.clip();
      ctx.fillStyle = region.path; ctx.fillRect(0, 0, width, height);
      for (let y = 0; y < height; y += 16) for (let x = 0; x < width; x += 16) {
        const center = horizontal ? height * 0.5 + Math.sin(x / 190) * 19 : width * 0.5 + Math.sin(y / 95) * 100;
        if (Math.abs((horizontal ? y : x) - center) <= half + 32) drawAtlasTile(ctx, tiles.path, x, y, 16, 16, 0.82);
      }
      for (let i = 0; i < 420; i++) {
        ctx.fillStyle = i % 2 ? '#6d573021' : '#fff0cc30';
        ctx.fillRect(Math.floor(hash(i * 7) * width), Math.floor(hash(i * 7 + 1) * height), 2, 1);
      }
      ctx.restore();
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
