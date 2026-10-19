import { SURVIVOR_REGIONS, survivorRegionAt } from '../core/survivor-regions';
import { SURVIVOR_BIOMES } from '../core/survivor-biomes';
import { ATLAS_SOURCES, packAtlas } from './atlas-spec';

/** Tilesets originais do atlas por região: terreno, trilha e detalhe de cenário. */
export const SURVIVOR_REGION_TILESETS = [
  { ground: 'at-trail', path: 'at-path', detail: 'tree-big' },
  { ground: 'at-trail', path: 'at-path', detail: 'pine-m' },
  { ground: 'sand-grass', path: 'sea', detail: 'bush' },
  { ground: 'at-plaza', path: 'at-path', detail: 'rock-1' },
  { ground: 'at-plaza', path: 'at-trail', detail: 'rock-2' },
  { ground: 'at-trail', path: 'at-plaza', detail: 'flowers-white' },
  { ground: 'sand-grass', path: 'sea', detail: 'rock-3' },
  { ground: 'at-path', path: 'at-trail', detail: 'wall' },
  { ground: 'at-trail', path: 'at-path', detail: 'pine-m' },
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

export type SurvivorLandscapeRenderer = ((ctx: CanvasRenderingContext2D, elapsedMs: number) => void) & {
  setAtlas(image: CanvasImageSource | null): void;
};

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
    ctx.fillStyle = region.ground;
    ctx.fillRect(0, 0, width, height);

    // Textura leve do tileset mantém a paleta regional e tira o aspecto de piso liso/procedural.
    for (let y = 0; y < height; y += 16) {
      for (let x = 0; x < width; x += 16) drawAtlasTile(ctx, tiles.ground, x, y, 16, 16, 0.2);
    }
    // Grão residual barato nos dispositivos sem carregar ou decodificar o atlas.
    if (!atlas) {
      for (let y = 0; y < height; y += 16) {
        for (let x = 0; x < width; x += 16) {
          const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
          ctx.fillStyle = hash % 3 === 0 ? '#ffffff09' : '#00000008';
          ctx.fillRect(x, y, 16, 16);
          ctx.fillStyle = region.accent;
          ctx.globalAlpha = 0.22;
          ctx.fillRect(x + hash % 11, y + (hash >>> 4) % 12, 2, 3);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Trilhas em tiles, mantendo o mesmo percurso e os mesmos limites em todas as regiões.
    ctx.fillStyle = region.path;
    for (let y = 0; y < height; y += 16) {
      const center = width * 0.5 + Math.sin(y / 95) * 100;
      const left = Math.round(center / 8) * 8 - 24;
      ctx.fillRect(left, y, 48, 16);
      drawAtlasTile(ctx, tiles.path, left, y, 48, 16, 0.82);
    }
    ctx.fillRect(0, height / 2 - 16, width, 32);
    for (let x = 0; x < width; x += 16) drawAtlasTile(ctx, tiles.path, x, height / 2 - 16, 16, 32, 0.82);

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
    layers.set(index, canvas);
    return canvas;
  }

  const render = ((ctx: CanvasRenderingContext2D, elapsedMs: number): void => {
    const { current, next, blend } = survivorRegionAt(elapsedMs);
    for (const key of layers.keys()) if (key !== current && key !== next) layers.delete(key);
    ctx.save();
    ctx.drawImage(layer(current), 0, 0);
    if (blend > 0) {
      ctx.globalAlpha = blend;
      ctx.drawImage(layer(next), 0, 0);
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
  const active = SURVIVOR_BIOMES.find((biome) => biome.regionIndex === current);
  const upcoming = blend > 0 ? SURVIVOR_BIOMES.find((biome) => biome.regionIndex === next) : undefined;
  const draw = (biome: typeof active, alpha: number): void => {
    if (!biome || alpha <= 0) return;
    for (const zone of biome.zones) {
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
      ctx.strokeStyle = zone.kind === 'neve' || zone.kind === 'areia' ? '#ffffffcc' : '#ffffff88';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(zone.x + 2, zone.y + 2, zone.width - 4, zone.height - 4);
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffffdd';
      ctx.font = '600 13px sans-serif';
      const icon = zone.kind === 'folhagem' ? '🌿'
        : zone.kind === 'poça' ? '💧'
          : zone.kind === 'neve' ? '❄️'
            : zone.kind === 'vento' ? '🍂'
              : zone.kind === 'pedra' ? '🪨'
                : zone.kind === 'flores' ? '🌸'
                  : zone.kind === 'areia' ? '🏖️'
                    : zone.kind === 'ruínas' ? '🏛️'
                      : '🫒';
      ctx.fillText(icon, zone.x + 9, zone.y + 21);
      ctx.fillText(zone.label, zone.x + 31, zone.y + 20);
      ctx.restore();
    }
  };
  draw(active, 0.18);
  draw(upcoming, blend * 0.18);
}
