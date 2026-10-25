import { BONK_CAMERA, bonkCameraPosition, bonkFocal, projectBonkPoint } from '../core/survivor-bonk';
import type { BonkObstacle, BonkPhysics, BonkProjection } from '../core/survivor-bonk';
import { ARENA_H, ARENA_W } from '../core/survivor-types';
import type { SurvivorPlayer } from '../core/survivor-types';
import { ATLAS_SOURCES, packAtlas } from './atlas-spec';
import { SURVIVOR_REGION_TILESETS } from './survivor-landscape';

/**
 * Cenário BONK em perspectiva. É Canvas 2D projetado, não WebGL: mantém o carregamento leve da Torre e entrega
 * horizonte, chão e objetos físicos com volume. O chão é uma grade presa ao mundo (as cores não "nadam" quando a
 * câmera anda), as estradas são faixas contínuas e cada tipo de obstáculo tem um desenho próprio, sempre do
 * tamanho da área que ele bloqueia de verdade.
 */

export interface BonkViewport {
  width: number;
  height: number;
}

/** Algo que precisa entrar na ordenação por profundidade junto com os sprites. */
export interface BonkDrawable {
  depth: number;
  draw: () => void;
}

type Rgb = readonly [number, number, number];
type Point = { x: number; y: number };

const TILE = 80;
const FAR = 1500;
/** Direção em que a luz viaja no chão (vem do noroeste): as sombras caem para o sudeste. */
const LIGHT = normalize(0.55, 0.7);
const SKY_TOP: Rgb = [38, 86, 160];
const SKY_LOW: Rgb = [150, 204, 236];
const HAZE: Rgb = [190, 220, 234];
const GRASS_A: Rgb = [84, 150, 74];
const GRASS_B: Rgb = [112, 178, 86];
const GRASS_DARK: Rgb = [64, 124, 64];
const BORDER: Rgb = [46, 84, 58];
const SAND: Rgb = [214, 196, 142];
const WATER_A: Rgb = [52, 140, 196];
const WATER_B: Rgb = [92, 186, 230];
const ROAD: Rgb = [196, 160, 112];
const ROAD_EDGE: Rgb = [146, 112, 76];
const STREAM = { x0: 2020, x1: 2520, y0: 650, y1: 1250 } as const;

function normalize(x: number, y: number): Point {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const hash = (x: number, y: number): number => {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
};
const smooth = (t: number): number => t * t * (3 - 2 * t);
/** Ruído suave de baixa frequência: manchas grandes de grama mais escura, sem ladrilho repetido. */
function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const top = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * fx;
  const bottom = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * fx;
  return top + (bottom - top) * fy;
}
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c: Rgb, f: number): Rgb => [c[0] * f, c[1] * f, c[2] * f];
const css = (c: Rgb, alpha = 1): string => alpha >= 1
  ? `rgb(${Math.round(clamp(c[0], 0, 255))},${Math.round(clamp(c[1], 0, 255))},${Math.round(clamp(c[2], 0, 255))})`
  : `rgba(${Math.round(clamp(c[0], 0, 255))},${Math.round(clamp(c[1], 0, 255))},${Math.round(clamp(c[2], 0, 255))},${alpha})`;
/** Quanto a cor some na névoa com a distância (perto: nada; no fim do chão: quase tudo). */
const fogAmount = (depth: number): number => Math.pow(clamp((depth - 360) / (FAR - 360), 0, 1), 1.3) * 0.66;
const fogged = (c: Rgb, depth: number): Rgb => mix(c, HAZE, fogAmount(depth));

function polygon(ctx: CanvasRenderingContext2D, points: readonly Point[]): void {
  const first = points[0];
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y);
  ctx.closePath();
}

// ----------------------------------------------------------------------------- arte da Vila

/**
 * Mundo por pixel de textura: um bloco de 16 px da Vila vale 40 unidades (o jogador tem raio 14), então a grama de
 * 32 px cobre exatamente um ladrilho do chão (`TILE`).
 */
const WORLD_PER_PX = 2.5;
/** Até onde a textura aparece; mais longe o chão usa a cor média dela (sem mipmap, o pixel distante só cintila). */
const TEXTURE_NEAR = 520;
const TEXTURE_FAR = 1100;

export interface BonkTexture {
  pattern: CanvasPattern;
  w: number;
  h: number;
  /** Cor média, para o chão distante e para a base embaixo da textura. */
  avg: Rgb;
}

type BonkSpriteId = 'tree' | 'pine' | 'pineSmall' | 'rock1' | 'rock2' | 'rock3' | 'bush' | 'tall' | 'flower' | 'stump' | 'orb' | 'pedestal';

/** Texturas e recortes do atlas da Vila usados pelo BONK. Qualquer peça ausente volta para o desenho por código. */
export interface BonkArt {
  grass: BonkTexture | null;
  water: BonkTexture | null;
  sand: BonkTexture | null;
  path: BonkTexture | null;
  wall: BonkTexture | null;
  plaza: BonkTexture | null;
  plank: BonkTexture | null;
  /** Varia por seed para trocar a leitura do cenário, inclusive nas árvores. */
  tilesetIndex: number;
  treeStyle: 'broadleaf' | 'pine';
  sprites: Partial<Record<BonkSpriteId, HTMLCanvasElement>>;
}

/**
 * Mesmas opções de tiles do Survival 2D, embaralhadas pelo seed do BONK. Assim
 * uma partida mantém sua identidade, mas a próxima pode receber outro bioma.
 */
const BONK_TILESET_ORDER = [0, 4, 2, 7, 1, 6, 5, 8, 3] as const;

export function bonkTilesetIndex(seed: number, regionStep = 0): number {
  let value = Math.floor(seed) >>> 0;
  value = Math.imul(value ^ value >>> 16, 0x45d9f3b);
  value = Math.imul(value ^ value >>> 16, 0x45d9f3b);
  value = (value ^ value >>> 16) >>> 0;
  const start = value % BONK_TILESET_ORDER.length;
  return BONK_TILESET_ORDER[(start + Math.floor(regionStep)) % BONK_TILESET_ORDER.length]!;
}

function averageColor(image: CanvasImageSource, fallback: Rgb): Rgb {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const c = canvas.getContext('2d', { willReadFrequently: true });
    if (!c) return fallback;
    c.drawImage(image, 0, 0, 8, 8);
    const data = c.getImageData(0, 0, 8, 8).data;
    let r = 0; let g = 0; let b = 0; let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i + 3] ?? 0) < 128) continue;
      r += data[i] ?? 0; g += data[i + 1] ?? 0; b += data[i + 2] ?? 0; n++;
    }
    return n > 0 ? [r / n, g / n, b / n] : fallback;
  } catch {
    return fallback;
  }
}

function pixelCanvas(w: number, h: number): { canvas: HTMLCanvasElement; c: CanvasRenderingContext2D } | null {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d');
  return c ? { canvas, c } : null;
}

/**
 * Orbe em pixel art (24 × 24) no traço da Vila: contorno escuro, quatro tons com pontilhado nas passagens, luz de
 * cima à esquerda (a mesma das sombras do cenário), brilho branco e um reflexo do chão embaixo.
 */
function makeOrbSprite(): HTMLCanvasElement | null {
  const size = 24;
  const made = pixelCanvas(size, size);
  if (!made) return null;
  const { canvas, c } = made;
  const shades = ['#43298c', '#6447c9', '#8f73f0', '#c4b0ff'] as const;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - size / 2;
      const dy = y + 0.5 - size / 2;
      const r = Math.hypot(dx, dy);
      if (r > 10.6) continue;
      if (r > 9.5) {
        c.fillStyle = '#25174f';
      } else {
        const light = ((-dx * 0.55 - dy * 0.75) / 9.5) * 0.5 + 0.5 - (r / 9.5) * 0.2;
        const dither = ((x + y) % 2) * 0.07;
        c.fillStyle = shades[Math.max(0, Math.min(3, Math.floor((light + dither) * 4)))]!;
      }
      c.fillRect(x, y, 1, 1);
    }
  }
  // Névoa clara dentro do orbe, brilho e o reflexo rebatido do chão.
  c.fillStyle = '#ddd2ff';
  for (const [x, y] of [[7, 7], [8, 6], [9, 6], [7, 8], [10, 6], [6, 9]] as const) c.fillRect(x, y, 1, 1);
  c.fillStyle = '#ffffff';
  c.fillRect(8, 7, 2, 1);
  c.fillRect(8, 8, 1, 1);
  c.fillStyle = '#a58dff';
  for (const [x, y] of [[13, 19], [14, 19], [15, 18], [16, 17], [17, 16]] as const) c.fillRect(x, y, 1, 1);
  return canvas;
}

/** Pedestal de pedra com runa (24 × 14): fica no chão, do tamanho da área sólida, embaixo do orbe flutuante. */
function makePedestalSprite(): HTMLCanvasElement | null {
  const w = 24;
  const h = 14;
  const made = pixelCanvas(w, h);
  if (!made) return null;
  const { canvas, c } = made;
  const filled: (string | null)[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => null));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - w / 2;
      const top = (dx / 10.5) ** 2 + ((y + 0.5 - 4) / 3.4) ** 2 <= 1;
      const body = y >= 4 && y <= 12 && Math.abs(dx) <= 10.5 - (y - 4) * 0.2;
      if (top) filled[y]![x] = (dx < -2 && y < 4) ? '#d6d0de' : '#b7afc4';
      else if (body) filled[y]![x] = dx < -4 ? '#958da3' : dx > 5 ? '#6c657a' : '#837b92';
    }
  }
  // Runa acesa: um anel no topo e um traço na face da frente, na cor do orbe.
  for (const [x, y] of [[9, 3], [10, 2], [11, 2], [12, 2], [13, 2], [14, 3], [9, 5], [10, 6], [11, 6], [12, 6], [13, 6], [14, 5], [8, 4], [15, 4]] as const) filled[y]![x] = '#a88cff';
  for (const [x, y] of [[10, 9], [11, 8], [12, 8], [13, 9], [11, 10], [12, 10]] as const) filled[y]![x] = '#b9a2ff';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const color = filled[y]![x];
      if (color) {
        c.fillStyle = color;
        c.fillRect(x, y, 1, 1);
        continue;
      }
      // Contorno de um pixel em volta da pedra, como nas peças da Vila.
      const neighbour = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([nx, ny]) => !!filled[ny!]?.[nx!]);
      if (neighbour) {
        c.fillStyle = '#332b40';
        c.fillRect(x, y, 1, 1);
      }
    }
  }
  return canvas;
}

/**
 * Monta a arte a partir do atlas da Vila (`vila-atlas.png`) e da grama do Survival (`survivor-grass.png`). As peças
 * saem pelo mesmo mapa de posições que a Vila usa (`atlas-spec.ts`); os autotiles usam a célula do meio do 3 × 3.
 */
export function createBonkArt(ctx: CanvasRenderingContext2D, atlas: CanvasImageSource | null, grass: HTMLImageElement | HTMLCanvasElement | null, landscapeSeed = 0, regionStep = 0): BonkArt {
  const layout = packAtlas();
  const sources = new Map(ATLAS_SOURCES.map((source) => [source.id, source]));
  const tilesetIndex = bonkTilesetIndex(landscapeSeed, regionStep);
  const tiles = SURVIVOR_REGION_TILESETS[tilesetIndex]!;
  const crop = (id: string, region?: 'center' | { x: number; y: number; w: number; h: number }): HTMLCanvasElement | null => {
    const rect = layout.rects.get(id);
    const source = sources.get(id);
    if (!atlas || !rect || !source) return null;
    let sx = rect.x;
    let sy = rect.y;
    let w = rect.w;
    let h = rect.h;
    if (region === 'center') {
      sx += source.half ? 16 : Math.max(0, Math.floor((w - 16) / 2));
      sy += source.half ? 32 : Math.max(0, Math.floor((h - 16) / 2));
      w = 16;
      h = 16;
    } else if (region) {
      sx += region.x; sy += region.y; w = region.w; h = region.h;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext('2d');
    if (!c) return null;
    c.imageSmoothingEnabled = false;
    c.drawImage(atlas, sx, sy, w, h, 0, 0, w, h);
    return canvas;
  };
  const texture = (image: HTMLImageElement | HTMLCanvasElement | null, fallback: Rgb): BonkTexture | null => {
    if (!image || image.width === 0) return null;
    const pattern = ctx.createPattern(image, 'repeat');
    return pattern ? { pattern, w: image.width, h: image.height, avg: averageColor(image, fallback) } : null;
  };
  const sprites: BonkArt['sprites'] = {};
  const sprite = (id: BonkSpriteId, atlasId: string, region?: { x: number; y: number; w: number; h: number }): void => {
    const canvas = crop(atlasId, region);
    if (canvas) sprites[id] = canvas;
  };
  sprite('tree', 'tree-big');
  sprite('pine', 'pine-m');
  sprite('pineSmall', 'pine-s2');
  sprite('rock1', 'rock-1');
  sprite('rock2', 'rock-2');
  sprite('rock3', 'rock-3');
  sprite('bush', 'bush');
  sprite('tall', 'tall', { x: 0, y: 16, w: 16, h: 32 });
  sprite('flower', 'flowers-white', { x: 0, y: 0, w: 16, h: 16 });
  sprite('stump', 'stump');
  // Nenhuma folha da Vila tem um cristal: o orbe e o pedestal são pixel art desenhada aqui, no mesmo traço.
  const orb = makeOrbSprite();
  const pedestal = makePedestalSprite();
  if (orb) sprites.orb = orb;
  if (pedestal) sprites.pedestal = pedestal;
  const ground = crop(tiles.ground, 'center');
  const path = crop(tiles.path, 'center');
  const waterId = tiles.ground === 'sand-water' ? tiles.ground : 'sea';
  return {
    // O atlas disponível determina os tiles reais; sem ele, a grama original continua como fallback honesto.
    grass: texture(ground ?? grass, GRASS_A),
    water: texture(crop(waterId, 'center'), WATER_A),
    sand: texture(tilesetIndex === 2 ? ground : crop('sand-grass', 'center'), SAND),
    path: texture(path, ROAD),
    // A peça `wall` começa com 16 px de água e grama e um acabamento: a textura usa só os tijolos.
    wall: texture(crop('wall', { x: 18, y: 0, w: 32, h: 16 }), PALETTES.wall.side),
    plaza: texture(ground ?? crop('at-plaza', 'center'), PALETTES.ruin.side),
    plank: texture(crop('pier-deck'), PALETTES.bridge.top),
    tilesetIndex,
    treeStyle: tilesetIndex === 1 || tilesetIndex === 4 || tilesetIndex === 8 ? 'pine' : 'broadleaf',
    sprites,
  };
}

/**
 * Preenche um polígono com a textura mapeada por uma transformação afim: `u` e `v` são o deslocamento na tela de um
 * pixel da textura em cada eixo. Em pedaços pequenos (um ladrilho, um trecho de muro) a diferença para a perspectiva
 * verdadeira não aparece.
 */
function fillTextured(ctx: CanvasRenderingContext2D, texture: BonkTexture, origin: Point, u: Point, v: Point, points: readonly Point[], alpha = 1): void {
  if (alpha <= 0.02) return;
  texture.pattern.setTransform(new DOMMatrix([u.x, u.y, v.x, v.y, origin.x, origin.y]));
  const previous = ctx.globalAlpha;
  ctx.globalAlpha = previous * alpha;
  ctx.fillStyle = texture.pattern;
  polygon(ctx, points);
  ctx.fill();
  ctx.globalAlpha = previous;
}

const textureFade = (depth: number): number => (1 - clamp((depth - TEXTURE_NEAR) / (TEXTURE_FAR - TEXTURE_NEAR), 0, 1)) * (1 - fogAmount(depth) * 1.2);

/** Recorte da Vila em pé no mundo (como um sprite), com os pés no ponto do chão e pixel nítido. */
function drawAtlasBillboard(view: View, image: HTMLCanvasElement, x: number, y: number, worldWidth: number, worldHeight: number, depth: number, z = 0): void {
  const p = project(view, x, y, z);
  if (!p) return;
  const w = worldWidth * p.scale;
  const h = worldHeight * p.scale;
  if (w < 1 || h < 1) return;
  const { ctx } = view;
  const previous = ctx.globalAlpha;
  ctx.globalAlpha = previous * clamp(1 - fogAmount(depth) * 0.9, 0.15, 1);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, Math.round(p.x - w / 2), Math.round(p.y - h), Math.round(w), Math.round(h));
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = previous;
}

/** Raios na tela de um círculo deitado no chão: na perspectiva ele vira uma elipse achatada pela distância. */
export function bonkGroundEllipse(point: BonkProjection, worldRadius: number): { rx: number; ry: number } {
  const rx = worldRadius * point.scale;
  return { rx, ry: rx * clamp(BONK_CAMERA.height / point.depth, 0.12, 0.9) };
}

interface View {
  ctx: CanvasRenderingContext2D;
  physics: BonkPhysics;
  player: SurvivorPlayer;
  viewport: BonkViewport;
  camera: Point;
  forward: Point;
  focal: number;
  elapsedMs: number;
  art: BonkArt | null;
  /** Muda junto com o tileset: os detalhes decorativos ganham nova posição a cada região. */
  decorSeed: number;
}

function makeView(ctx: CanvasRenderingContext2D, physics: BonkPhysics, player: SurvivorPlayer, viewport: BonkViewport, elapsedMs: number, art: BonkArt | null): View {
  return {
    ctx, physics, player, viewport, elapsedMs, art,
    decorSeed: art?.tilesetIndex ?? 0,
    camera: bonkCameraPosition(physics, player),
    forward: { x: Math.cos(physics.cameraYaw), y: Math.sin(physics.cameraYaw) },
    focal: bonkFocal(viewport),
  };
}

const project = (view: View, x: number, y: number, z = 0): BonkProjection | null =>
  projectBonkPoint(view.physics, view.player, { x, y, z }, view.viewport);

function depthOf(view: View, x: number, y: number): number {
  return (x - view.camera.x) * view.forward.x + (y - view.camera.y) * view.forward.y;
}

// ----------------------------------------------------------------------------- céu e horizonte

/** Posição na tela de algo muito distante numa direção (azimute) do mundo; null fora do campo de visão. */
function azimuthX(view: View, azimuth: number): number | null {
  const diff = Math.atan2(Math.sin(azimuth - view.physics.cameraYaw), Math.cos(azimuth - view.physics.cameraYaw));
  if (Math.cos(diff) < 0.25) return null;
  return view.viewport.width / 2 + Math.tan(diff) * view.focal;
}

function drawSky(view: View): number {
  const { ctx, viewport } = view;
  const horizon = viewport.height * BONK_CAMERA.horizonRatio;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon + 30);
  sky.addColorStop(0, css(SKY_TOP));
  sky.addColorStop(1, css(SKY_LOW));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, viewport.width, horizon + 30);

  // O sol fica a noroeste, de onde vem a luz das sombras: girar a câmera o tira e o devolve à tela.
  const sunX = azimuthX(view, Math.atan2(-LIGHT.y, -LIGHT.x));
  if (sunX !== null) {
    const sunY = horizon * 0.34;
    const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, horizon * 0.55);
    glow.addColorStop(0, 'rgba(255, 248, 214, .95)');
    glow.addColorStop(0.18, 'rgba(255, 236, 170, .55)');
    glow.addColorStop(1, 'rgba(255, 236, 170, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, viewport.width, horizon + 30);
  }

  // Nuvens presas a direções do mundo, com deriva lenta.
  for (let i = 0; i < 9; i++) {
    const x = azimuthX(view, i * 0.71 + view.elapsedMs / 240_000);
    if (x === null) continue;
    const y = horizon * (0.22 + hash(i, 3) * 0.42);
    const w = 38 + hash(i, 7) * 60;
    ctx.fillStyle = 'rgba(255, 255, 255, .78)';
    ctx.beginPath();
    ctx.ellipse(x, y, w, w * 0.22, 0, 0, Math.PI * 2);
    ctx.ellipse(x - w * 0.35, y + 2, w * 0.45, w * 0.2, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.3, y - w * 0.08, w * 0.5, w * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Serras: altura em função do azimute (periódica), então giram junto com a câmera sem emenda.
  const layers: readonly { amp: number; color: Rgb; off: number }[] = [
    { amp: 0.13, color: [128, 162, 186], off: 0.4 },
    { amp: 0.09, color: [90, 132, 150], off: 2.1 },
    { amp: 0.05, color: [76, 128, 96], off: 4.3 },
  ];
  for (const layer of layers) {
    ctx.fillStyle = css(layer.color);
    ctx.beginPath();
    ctx.moveTo(0, horizon + 4);
    for (let x = 0; x <= viewport.width + 8; x += 8) {
      const az = view.physics.cameraYaw + Math.atan((x - viewport.width / 2) / view.focal);
      const h = 0.55 + 0.25 * Math.sin(3 * az + layer.off) + 0.15 * Math.sin(7 * az + layer.off * 2) + 0.05 * Math.sin(17 * az);
      ctx.lineTo(x, horizon - h * layer.amp * viewport.height);
    }
    ctx.lineTo(viewport.width, horizon + 4);
    ctx.closePath();
    ctx.fill();
  }
  // Chão distante: cobre a faixa entre o horizonte e o fim da grade com a cor da névoa.
  ctx.fillStyle = css(mix(GRASS_A, HAZE, 0.78));
  ctx.fillRect(0, horizon, viewport.width, viewport.height - horizon);
  return horizon;
}

// ----------------------------------------------------------------------------- chão

function insideArena(x: number, y: number): boolean {
  return x >= 0 && x <= ARENA_W && y >= 0 && y <= ARENA_H;
}

function streamDistance(x: number, y: number): number {
  const dx = Math.max(STREAM.x0 - x, 0, x - STREAM.x1);
  const dy = Math.max(STREAM.y0 - y, 0, y - STREAM.y1);
  return dx === 0 && dy === 0 ? -Math.min(x - STREAM.x0, STREAM.x1 - x, y - STREAM.y0, STREAM.y1 - y) : Math.hypot(dx, dy);
}

function groundColor(x: number, y: number, t: number): Rgb {
  if (!insideArena(x, y)) return mix(BORDER, GRASS_DARK, hash(Math.floor(x / TILE), Math.floor(y / TILE)) * 0.3);
  const stream = streamDistance(x, y);
  if (stream < 0) {
    const wave = Math.sin(t / 650 + x / 90 + y / 70) * 0.5 + 0.5;
    return mix(WATER_A, WATER_B, 0.25 + wave * 0.45);
  }
  const n = hash(Math.floor(x / TILE), Math.floor(y / TILE));
  if (stream < TILE * 0.75) return mix(SAND, [196, 178, 124], n * 0.6);
  const patches = valueNoise(x / 430, y / 430);
  return mix(mix(GRASS_A, GRASS_B, n * 0.7), GRASS_DARK, clamp((patches - 0.45) * 1.6, 0, 0.55));
}

function drawGroundTiles(view: View): void {
  const { ctx, camera, viewport } = view;
  const tanHalf = viewport.width / 2 / view.focal;
  const minX = Math.max(-6 * TILE, Math.floor((camera.x - FAR) / TILE) * TILE);
  const maxX = Math.min(ARENA_W + 6 * TILE, camera.x + FAR);
  const minY = Math.max(-6 * TILE, Math.floor((camera.y - FAR) / TILE) * TILE);
  const maxY = Math.min(ARENA_H + 6 * TILE, camera.y + FAR);
  ctx.lineWidth = 1;
  ctx.lineJoin = 'round';
  for (let x = minX; x < maxX; x += TILE) {
    for (let y = minY; y < maxY; y += TILE) {
      const cx = x + TILE / 2;
      const cy = y + TILE / 2;
      const depth = depthOf(view, cx, cy);
      if (depth < 60 || depth > FAR) continue;
      const side = -(cx - camera.x) * view.forward.y + (cy - camera.y) * view.forward.x;
      if (Math.abs(side) > depth * tanHalf + TILE * 1.5) continue;
      const a = project(view, x, y);
      const b = project(view, x + TILE, y);
      const c = project(view, x + TILE, y + TILE);
      const d = project(view, x, y + TILE);
      if (!a || !b || !c || !d) continue;
      const texture = groundTexture(view.art, cx, cy);
      const patches = texture === view.art?.grass ? clamp((valueNoise(cx / 430, cy / 430) - 0.45) * 1.6, 0, 0.55) : 0;
      // Base lisa (cor média da textura) com contorno da mesma cor: tapa as frestas entre ladrilhos.
      const base = texture ? mix(texture.avg, GRASS_DARK, patches) : groundColor(cx, cy, view.elapsedMs);
      const color = css(fogged(base, depth));
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      polygon(ctx, [a, b, c, d]);
      ctx.fill();
      ctx.stroke();
      if (!texture) continue;
      const fade = textureFade(depth);
      if (fade <= 0.02) continue;
      const span = TILE / WORLD_PER_PX;
      const u = { x: (b.x - a.x) / span, y: (b.y - a.y) / span };
      const v = { x: (d.x - a.x) / span, y: (d.y - a.y) / span };
      // A água corre devagar ao longo do riacho; o resto fica preso ao chão.
      const flow = texture === view.art?.water ? (view.elapsedMs / 110) % texture.w : 0;
      ctx.imageSmoothingEnabled = false;
      fillTextured(ctx, texture, { x: a.x - u.x * flow, y: a.y - u.y * flow }, u, v, [a, b, c, d], fade);
      ctx.imageSmoothingEnabled = true;
      if (patches > 0.05) {
        ctx.fillStyle = css(GRASS_DARK, patches * 0.55 * fade);
        polygon(ctx, [a, b, c, d]);
        ctx.fill();
      }
    }
  }
}

function groundTexture(art: BonkArt | null, x: number, y: number): BonkTexture | null {
  if (!art || !insideArena(x, y)) return null;
  const stream = streamDistance(x, y);
  if (stream < 0) return art.water;
  if (stream < TILE * 0.75) return art.sand;
  return art.grass;
}

/** Faixa contínua (estrada) ao longo de uma linha central, com bordas mais escuras. */
function drawRibbon(view: View, points: readonly Point[], halfWidth: number, normals: readonly Point[], distances: readonly number[]): void {
  const { ctx } = view;
  const texture = view.art?.path ?? null;
  for (let i = 0; i < points.length - 1; i++) {
    const p = points[i]!;
    const q = points[i + 1]!;
    const np = normals[i]!;
    const nq = normals[i + 1]!;
    const depth = depthOf(view, (p.x + q.x) / 2, (p.y + q.y) / 2);
    if (depth < 60 || depth > FAR) continue;
    // A estrada para na margem: a água não fica pintada de terra (quem atravessa o riacho é a ponte).
    if (streamDistance((p.x + q.x) / 2, (p.y + q.y) / 2) < TILE * 0.4) continue;
    const l1 = project(view, p.x + np.x * halfWidth, p.y + np.y * halfWidth);
    const l2 = project(view, q.x + nq.x * halfWidth, q.y + nq.y * halfWidth);
    const r2 = project(view, q.x - nq.x * halfWidth, q.y - nq.y * halfWidth);
    const r1 = project(view, p.x - np.x * halfWidth, p.y - np.y * halfWidth);
    if (!l1 || !l2 || !r1 || !r2) continue;
    const color = css(fogged(texture ? texture.avg : mix(ROAD, [210, 176, 128], hash(i, 11) * 0.5), depth));
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    polygon(ctx, [l1, l2, r2, r1]);
    ctx.fill();
    ctx.stroke();
    const fade = texture ? textureFade(depth) : 0;
    if (texture && fade > 0.02) {
      // Calçamento da Vila ao longo da estrada: `u` segue o trajeto (contínuo entre trechos), `v` atravessa.
      const along = Math.hypot(q.x - p.x, q.y - p.y) / WORLD_PER_PX;
      const across = (halfWidth * 2) / WORLD_PER_PX;
      const u = { x: (l2.x - l1.x) / along, y: (l2.y - l1.y) / along };
      const v = { x: (r1.x - l1.x) / across, y: (r1.y - l1.y) / across };
      const offset = ((distances[i] ?? 0) / WORLD_PER_PX) % texture.w;
      ctx.imageSmoothingEnabled = false;
      fillTextured(ctx, texture, { x: l1.x - u.x * offset, y: l1.y - u.y * offset }, u, v, [l1, l2, r2, r1], fade);
      ctx.imageSmoothingEnabled = true;
    }
    ctx.strokeStyle = css(fogged(ROAD_EDGE, depth), 0.85);
    ctx.lineWidth = clamp(l1.y > 0 ? 6 / Math.max(1, depth / 120) : 1, 1, 4);
    ctx.beginPath(); ctx.moveTo(l1.x, l1.y); ctx.lineTo(l2.x, l2.y); ctx.moveTo(r1.x, r1.y); ctx.lineTo(r2.x, r2.y); ctx.stroke();
    ctx.lineWidth = 1;
  }
}

const ROAD_STEP = 40;
const MAIN_ROAD: readonly Point[] = Array.from({ length: Math.ceil(ARENA_W / ROAD_STEP) + 1 }, (_, i) => ({ x: i * ROAD_STEP, y: 970 + Math.sin((i * ROAD_STEP) / 260) * 120 }));
const MAIN_ROAD_NORMALS: readonly Point[] = MAIN_ROAD.map((_, i) => {
  const a = MAIN_ROAD[Math.max(0, i - 1)]!;
  const b = MAIN_ROAD[Math.min(MAIN_ROAD.length - 1, i + 1)]!;
  const t = normalize(b.x - a.x, b.y - a.y);
  return { x: -t.y, y: t.x };
});
const CROSS_ROAD: readonly Point[] = Array.from({ length: Math.ceil(ARENA_H / ROAD_STEP) + 1 }, (_, i) => ({ x: 1440, y: i * ROAD_STEP }));
const CROSS_ROAD_NORMALS: readonly Point[] = CROSS_ROAD.map(() => ({ x: 1, y: 0 }));
/** Distância percorrida ao longo de cada estrada, para a textura continuar sem emenda entre os trechos. */
function cumulative(points: readonly Point[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) out.push(out[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y));
  return out;
}
const MAIN_ROAD_DISTANCES = cumulative(MAIN_ROAD);
const CROSS_ROAD_DISTANCES = cumulative(CROSS_ROAD);

function onRoad(x: number, y: number): boolean {
  return Math.abs(y - (970 + Math.sin(x / 260) * 120)) < 92 || Math.abs(x - 1440) < 60;
}

/** Tufos de grama, flores e pedrinhas presos ao mundo: dão escala e sensação de movimento ao correr. */
function drawGroundDetails(view: View): void {
  const { ctx, camera } = view;
  const reach = view.art ? 1000 : 900;
  const minX = Math.max(0, Math.floor((camera.x - reach) / TILE) * TILE);
  const maxX = Math.min(ARENA_W, camera.x + reach);
  const minY = Math.max(0, Math.floor((camera.y - reach) / TILE) * TILE);
  const maxY = Math.min(ARENA_H, camera.y + reach);
  // Os recortes em pé se sobrepõem: junta tudo e desenha do mais longe para o mais perto.
  const items: { depth: number; draw: () => void }[] = [];
  for (let x = minX; x < maxX; x += TILE) {
    for (let y = minY; y < maxY; y += TILE) {
      const tx = x / TILE;
      const ty = y / TILE;
      for (let k = 0; k < 2; k++) {
        const kind = hash(tx * 3.1 + k + view.decorSeed * 17.3, ty * 1.7 - k - view.decorSeed * 11.7);
        if (kind < 0.42) continue;
        const wx = x + hash(tx + k * 5 + view.decorSeed * 7.1, ty + 9 - view.decorSeed * 3.7) * TILE;
        const wy = y + hash(tx + 4 - view.decorSeed * 5.3, ty - k * 3 + view.decorSeed * 9.1) * TILE;
        if (streamDistance(wx, wy) < TILE * 0.8 || onRoad(wx, wy)) continue;
        const depth = depthOf(view, wx, wy);
        // Colado na câmera, um tufo vira uma parede na tela: os detalhes começam um pouco antes do jogador.
        if (depth < 215 || depth > reach) continue;
        const p = project(view, wx, wy);
        if (!p || p.x < -40 || p.x > view.viewport.width + 40) continue;
        const s = p.scale;
        const alpha = 1 - fogAmount(depth);
        const sprites = view.art?.sprites;
        // Com o atlas: o mesmo mato, arbusto, pedra, flor e toco da Vila, em pé no chão.
        const decor = !sprites ? null
          : kind > 0.985 ? { image: sprites.stump, w: 30, h: 30 }
            : kind > 0.95 ? { image: sprites.flower, w: 26, h: 26 }
              : kind > 0.91 ? { image: sprites.rock1, w: 22, h: 22 }
                : kind > 0.85 ? { image: sprites.bush, w: 34, h: 34 }
                  // Mato alto forma moitas reconhecíveis em qualquer região; flores e pedras continuam raras.
                  : kind > 0.66 ? { image: sprites.tall, w: 22, h: 34 }
                    : null;
        const image = decor?.image;
        if (decor && image) {
          items.push({ depth, draw: () => drawAtlasBillboard(view, image, wx, wy, decor.w, decor.h, depth) });
          continue;
        }
        items.push({ depth, draw: () => {
          if (kind > 0.94) {
            ctx.fillStyle = css(kind > 0.97 ? [255, 214, 92] : [246, 140, 196], alpha);
            ctx.beginPath(); ctx.arc(p.x, p.y - 2.4 * s, Math.max(1, 2.2 * s), 0, Math.PI * 2); ctx.fill();
          } else if (kind > 0.88) {
            ctx.fillStyle = css([150, 152, 150], alpha * 0.9);
            ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(1, 3.4 * s), Math.max(0.8, 1.8 * s), 0, 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.strokeStyle = css(kind > 0.65 ? [58, 118, 56] : [136, 196, 98], alpha * 0.9);
            ctx.lineWidth = Math.max(1, 1.1 * s);
            ctx.beginPath();
            for (const lean of [-1, 0, 1]) {
              ctx.moveTo(p.x + lean * 1.6 * s, p.y);
              ctx.lineTo(p.x + lean * 3.4 * s, p.y - (6 + (lean === 0 ? 3 : 0)) * s);
            }
            ctx.stroke();
          }
        } });
      }
    }
  }
  items.sort((a, b) => b.depth - a.depth).forEach((item) => item.draw());
  ctx.lineWidth = 1;
}

// ----------------------------------------------------------------------------- obstáculos

interface Palette { side: Rgb; top: Rgb; detail: Rgb }

const PALETTES: Record<BonkObstacle['kind'], Palette> = {
  tree: { side: [112, 78, 52], top: [62, 136, 78], detail: [128, 192, 104] },
  boulder: { side: [128, 136, 150], top: [196, 204, 214], detail: [84, 90, 104] },
  wall: { side: [130, 114, 142], top: [178, 164, 190], detail: [92, 80, 104] },
  ruin: { side: [152, 126, 100], top: [198, 172, 134], detail: [104, 150, 82] },
  crystal: { side: [116, 92, 206], top: [222, 206, 255], detail: [168, 140, 246] },
  bridge: { side: [124, 82, 52], top: [190, 138, 84], detail: [110, 72, 44] },
};

/** Luz de uma face pela normal: a que encara o noroeste fica clara, a do sudeste fica na sombra. */
const faceLight = (nx: number, ny: number): number => 0.6 + 0.4 * Math.max(0, -(nx * LIGHT.x + ny * LIGHT.y));

const FACES = [
  { a: 0, b: 1, nx: 0, ny: -1 },
  { a: 1, b: 2, nx: 1, ny: 0 },
  { a: 2, b: 3, nx: 0, ny: 1 },
  { a: 3, b: 0, nx: -1, ny: 0 },
] as const;

interface Box { x: number; y: number; w: number; h: number; z0: number; z1: number }

/** Trechos de até 80 unidades: a transformação afim de cada um não entorta a textura na perspectiva. */
const TEXTURE_PIECE = 80;

/** Face vertical com textura da Vila, com a luz da face por cima (as folhas da Vila vêm iluminadas por igual). */
function drawTexturedFace(view: View, texture: BonkTexture, a: Point, b: Point, z0: number, z1: number, depth: number, light: number, wpp: number): void {
  const { ctx } = view;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const pieces = Math.max(1, Math.ceil(length / TEXTURE_PIECE));
  const fade = textureFade(depth);
  const base = css(fogged(shade(texture.avg, light), depth));
  for (let i = 0; i < pieces; i++) {
    const t0 = i / pieces;
    const t1 = (i + 1) / pieces;
    const p0 = { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 };
    const p1 = { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 };
    const top0 = project(view, p0.x, p0.y, z1);
    const top1 = project(view, p1.x, p1.y, z1);
    const bottom0 = project(view, p0.x, p0.y, z0);
    const bottom1 = project(view, p1.x, p1.y, z0);
    if (!top0 || !top1 || !bottom0 || !bottom1) continue;
    const quad = [top0, top1, bottom1, bottom0];
    ctx.fillStyle = base;
    ctx.strokeStyle = base;
    polygon(ctx, quad);
    ctx.fill();
    ctx.stroke();
    if (fade <= 0.02) continue;
    const along = length / pieces / wpp;
    const tall = (z1 - z0) / wpp;
    const u = { x: (top1.x - top0.x) / along, y: (top1.y - top0.y) / along };
    const v = { x: (bottom0.x - top0.x) / tall, y: (bottom0.y - top0.y) / tall };
    const offset = ((length * t0) / wpp) % texture.w;
    ctx.imageSmoothingEnabled = false;
    fillTextured(ctx, texture, { x: top0.x - u.x * offset, y: top0.y - u.y * offset }, u, v, quad, fade);
    ctx.imageSmoothingEnabled = true;
    if (light < 0.98) {
      ctx.fillStyle = `rgba(16, 14, 30, ${((1 - light) * 0.85 * fade).toFixed(3)})`;
      polygon(ctx, quad);
      ctx.fill();
    }
  }
}

/** Topo com textura, em trechos ao longo do lado mais comprido. `uAlongX` diz para onde corre o eixo x da textura. */
function drawTexturedTop(view: View, texture: BonkTexture, box: Box, depth: number, wpp: number, uAlongX: boolean): void {
  const { ctx } = view;
  const splitX = box.w >= box.h;
  const length = splitX ? box.w : box.h;
  const pieces = Math.max(1, Math.ceil(length / TEXTURE_PIECE));
  const fade = textureFade(depth);
  const base = css(fogged(texture.avg, depth));
  for (let i = 0; i < pieces; i++) {
    const s0 = (length * i) / pieces;
    const s1 = (length * (i + 1)) / pieces;
    const x0 = splitX ? box.x + s0 : box.x;
    const x1 = splitX ? box.x + s1 : box.x + box.w;
    const y0 = splitX ? box.y : box.y + s0;
    const y1 = splitX ? box.y + box.h : box.y + s1;
    const c0 = project(view, x0, y0, box.z1);
    const c1 = project(view, x1, y0, box.z1);
    const c2 = project(view, x1, y1, box.z1);
    const c3 = project(view, x0, y1, box.z1);
    if (!c0 || !c1 || !c2 || !c3) continue;
    const quad = [c0, c1, c2, c3];
    ctx.fillStyle = base;
    ctx.strokeStyle = base;
    polygon(ctx, quad);
    ctx.fill();
    ctx.stroke();
    if (fade <= 0.02) continue;
    const xAxis = { x: (c1.x - c0.x) / ((x1 - x0) / wpp), y: (c1.y - c0.y) / ((x1 - x0) / wpp) };
    const yAxis = { x: (c3.x - c0.x) / ((y1 - y0) / wpp), y: (c3.y - c0.y) / ((y1 - y0) / wpp) };
    const u = uAlongX ? xAxis : yAxis;
    const v = uAlongX ? yAxis : xAxis;
    // O deslocamento do trecho cai no eixo da textura que corre na mesma direção do corte.
    const shift = (s0 / wpp) % (uAlongX === splitX ? texture.w : texture.h);
    const origin = uAlongX === splitX
      ? { x: c0.x - u.x * shift, y: c0.y - u.y * shift }
      : { x: c0.x - v.x * shift, y: c0.y - v.y * shift };
    ctx.imageSmoothingEnabled = false;
    fillTextured(ctx, texture, origin, u, v, quad, fade);
    ctx.imageSmoothingEnabled = true;
  }
}

interface BoxOptions {
  top?: boolean;
  courses?: number;
  /** Textura das faces (da Vila); sem ela, cor lisa com fiadas desenhadas. */
  texture?: BonkTexture | null;
  topTexture?: BonkTexture | null;
  /** Unidades do mundo por pixel da textura deste bloco. */
  wpp?: number;
  topUAlongX?: boolean;
}

/** Bloco com só as faces que encaram a câmera (antes, uma face de trás podia cobrir a da frente). */
function drawBox(view: View, box: Box, palette: Palette, depth: number, options: BoxOptions = {}): boolean {
  const { ctx, camera } = view;
  const corners: Point[] = [
    { x: box.x, y: box.y }, { x: box.x + box.w, y: box.y }, { x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h },
  ];
  const base = corners.map((c) => project(view, c.x, c.y, box.z0));
  const top = corners.map((c) => project(view, c.x, c.y, box.z1));
  if (base.some((p) => !p) || top.some((p) => !p)) return false;
  const b = base as BonkProjection[];
  const u = top as BonkProjection[];
  const visible = FACES
    .map((face) => {
      const ca = corners[face.a]!;
      const cb = corners[face.b]!;
      const mx = (ca.x + cb.x) / 2;
      const my = (ca.y + cb.y) / 2;
      return { face, facing: face.nx * (mx - camera.x) + face.ny * (my - camera.y) < 0, distance: Math.hypot(mx - camera.x, my - camera.y) };
    })
    .filter((item) => item.facing)
    .sort((p, q) => q.distance - p.distance);
  ctx.lineWidth = 1;
  const wpp = options.wpp ?? WORLD_PER_PX;
  for (const { face } of visible) {
    if (options.texture) {
      drawTexturedFace(view, options.texture, corners[face.a]!, corners[face.b]!, box.z0, box.z1, depth, faceLight(face.nx, face.ny), wpp);
      polygon(ctx, [b[face.a]!, b[face.b]!, u[face.b]!, u[face.a]!]);
      ctx.strokeStyle = css(fogged(shade(palette.detail, 0.7), depth), 0.5);
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = css(fogged(shade(palette.side, faceLight(face.nx, face.ny)), depth));
    polygon(ctx, [b[face.a]!, b[face.b]!, u[face.b]!, u[face.a]!]);
    ctx.fill();
    ctx.strokeStyle = css(fogged(shade(palette.detail, 0.8), depth), 0.55);
    ctx.stroke();
    // Fiadas de pedra: linhas na altura real da face, para a parede ter escala.
    if (options.courses) {
      ctx.beginPath();
      for (let z = box.z0 + options.courses; z < box.z1 - 4; z += options.courses) {
        const pa = project(view, corners[face.a]!.x, corners[face.a]!.y, z);
        const pb = project(view, corners[face.b]!.x, corners[face.b]!.y, z);
        if (!pa || !pb) continue;
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
      }
      ctx.strokeStyle = css(fogged(palette.detail, depth), 0.5);
      ctx.stroke();
    }
  }
  if (options.top !== false && box.z1 < BONK_CAMERA.height - 4 && options.topTexture) {
    drawTexturedTop(view, options.topTexture, box, depth, wpp, options.topUAlongX ?? true);
    polygon(ctx, u);
    ctx.strokeStyle = css(fogged(shade(palette.detail, 0.8), depth), 0.45);
    ctx.stroke();
  } else if (options.top !== false && box.z1 < BONK_CAMERA.height - 4) {
    ctx.fillStyle = css(fogged(palette.top, depth));
    polygon(ctx, u);
    ctx.fill();
    ctx.strokeStyle = css(fogged(shade(palette.detail, 0.8), depth), 0.45);
    ctx.stroke();
  }
  return true;
}

function drawWall(view: View, o: BonkObstacle, depth: number): void {
  // Muro de pedra da Vila nas faces e calçamento no topo das muretas baixas.
  drawBox(view, { x: o.x, y: o.y, w: o.w, h: o.h, z0: 0, z1: o.height }, PALETTES.wall, depth, {
    courses: 21, texture: view.art?.wall, topTexture: view.art?.plaza, wpp: 2.6,
  });
}

function drawRuin(view: View, o: BonkObstacle, depth: number): void {
  const palette = PALETTES.ruin;
  const options: BoxOptions = { courses: 18, texture: view.art?.plaza, topTexture: view.art?.plaza, wpp: 2.2 };
  if (!drawBox(view, { x: o.x, y: o.y, w: o.w, h: o.h, z0: 0, z1: o.height * 0.82 }, palette, depth, options)) return;
  // Topo quebrado: blocos soltos de alturas diferentes e musgo, para não parecer uma caixa lisa.
  const long = o.w >= o.h;
  const count = 4;
  for (let i = 0; i < count; i++) {
    if (hash(o.x + i, o.y) < 0.35) continue;
    const t0 = i / count;
    const size = (long ? o.w : o.h) / count;
    const block: Box = long
      ? { x: o.x + t0 * o.w + 2, y: o.y, w: size - 4, h: o.h, z0: o.height * 0.82, z1: o.height * (0.88 + hash(i, o.y) * 0.12) }
      : { x: o.x, y: o.y + t0 * o.h + 2, w: o.w, h: size - 4, z0: o.height * 0.82, z1: o.height * (0.88 + hash(i, o.x) * 0.12) };
    drawBox(view, block, { ...palette, top: mix(palette.top, palette.detail, 0.55) }, depth, { texture: options.texture, wpp: options.wpp });
  }
}

function drawBridge(view: View, o: BonkObstacle, depth: number): void {
  const { ctx } = view;
  const palette = PALETTES.bridge;
  const along = o.w >= o.h;
  // Tábuas do píer da Vila atravessando a ponte (o eixo x da textura corre na largura, não no comprimento).
  const plank = view.art?.plank ?? null;
  if (!drawBox(view, { x: o.x, y: o.y, w: o.w, h: o.h, z0: 0, z1: o.height }, palette, depth, { topTexture: plank, topUAlongX: !along, wpp: 2.2 })) return;
  const length = along ? o.w : o.h;
  ctx.beginPath();
  for (let s = 16; s < length && !plank; s += 16) {
    const a = along ? project(view, o.x + s, o.y, o.height) : project(view, o.x, o.y + s, o.height);
    const b = along ? project(view, o.x + s, o.y + o.h, o.height) : project(view, o.x + o.w, o.y + s, o.height);
    if (a && b) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
  }
  ctx.strokeStyle = css(fogged(palette.detail, depth), 0.7);
  ctx.stroke();
  // Corrimão só visual (a ponte continua pulável): postes e uma barra em cada lateral.
  ctx.beginPath();
  for (const edge of [0, along ? o.h : o.w]) {
    const rail: Point[] = [];
    for (let s = 0; s <= length; s += 40) {
      const wx = along ? o.x + s : o.x + edge;
      const wy = along ? o.y + edge : o.y + s;
      const foot = project(view, wx, wy, o.height);
      const head = project(view, wx, wy, o.height + 22);
      if (!foot || !head) continue;
      ctx.moveTo(foot.x, foot.y);
      ctx.lineTo(head.x, head.y);
      rail.push(head);
    }
    for (let i = 0; i < rail.length - 1; i++) { ctx.moveTo(rail[i]!.x, rail[i]!.y); ctx.lineTo(rail[i + 1]!.x, rail[i + 1]!.y); }
  }
  ctx.strokeStyle = css(fogged(shade(palette.side, 0.75), depth));
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.lineWidth = 1;
}

function drawTree(view: View, o: BonkObstacle, depth: number): void {
  const { ctx } = view;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const ground = project(view, cx, cy);
  if (!ground) return;
  const sprite = o.id.startsWith('tree-east') || view.art?.treeStyle === 'pine' ? view.art?.sprites.pine : view.art?.sprites.tree;
  if (sprite) {
    // A mesma árvore da Vila, em pé: os pés do recorte no centro da área sólida.
    const solid = bonkGroundEllipse(ground, o.w * 0.5);
    ctx.fillStyle = css(fogged([40, 80, 46], depth), 0.35);
    ctx.beginPath(); ctx.ellipse(ground.x, ground.y, solid.rx, solid.ry, 0, 0, Math.PI * 2); ctx.fill();
    const worldHeight = o.height * (sprite === view.art?.sprites.pine ? 1.1 : 1);
    drawAtlasBillboard(view, sprite, cx, cy, worldHeight * (sprite.width / sprite.height), worldHeight, depth);
    return;
  }
  // Base de raízes e capim alto do tamanho da área sólida: mostra onde a árvore bloqueia.
  const base = bonkGroundEllipse(ground, o.w * 0.55);
  ctx.fillStyle = css(fogged([54, 96, 54], depth), 0.85);
  ctx.beginPath(); ctx.ellipse(ground.x, ground.y, base.rx, base.ry, 0, 0, Math.PI * 2); ctx.fill();
  const trunk = o.w * 0.38;
  drawBox(view, { x: cx - trunk / 2, y: cy - trunk / 2, w: trunk, h: trunk, z0: 0, z1: o.height * 0.6 }, PALETTES.tree, depth, { top: false });
  const crown = project(view, cx, cy, o.height * 0.74);
  if (!crown) return;
  const r = o.w * 0.8 * crown.scale;
  const dark = fogged([40, 98, 62], depth);
  const mid = fogged(PALETTES.tree.top, depth);
  const light = fogged(PALETTES.tree.detail, depth);
  ctx.fillStyle = css(dark);
  ctx.beginPath();
  ctx.arc(crown.x, crown.y + r * 0.12, r, 0, Math.PI * 2);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + hash(o.x, i) * 0.5;
    ctx.moveTo(crown.x + Math.cos(a) * r * 0.86 + r * 0.42, crown.y + Math.sin(a) * r * 0.62);
    ctx.arc(crown.x + Math.cos(a) * r * 0.86, crown.y + Math.sin(a) * r * 0.62, r * 0.42, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = css(mid);
  ctx.beginPath(); ctx.arc(crown.x - r * 0.12, crown.y - r * 0.12, r * 0.78, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = css(light, 0.9);
  ctx.beginPath(); ctx.arc(crown.x - r * 0.32, crown.y - r * 0.36, r * 0.36, 0, Math.PI * 2); ctx.fill();
}

function drawBoulder(view: View, o: BonkObstacle, depth: number): void {
  const { ctx } = view;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const rocks = [view.art?.sprites.rock1, view.art?.sprites.rock2, view.art?.sprites.rock3].filter((rock): rock is HTMLCanvasElement => !!rock);
  if (rocks.length > 0) {
    // Pedras da Vila agrupadas sobre a área sólida, na altura do obstáculo (dá para ver que se pula por cima).
    const along = o.w >= o.h;
    const length = along ? o.w : o.h;
    const size = o.height * 1.3;
    const count = Math.max(1, Math.round(length / (size * 0.8)));
    const pieces = Array.from({ length: count }, (_, i) => {
      const t = (i + 0.5) / count;
      const x = along ? o.x + o.w * t : o.x + o.w / 2 + (hash(i, o.x) - 0.5) * o.w * 0.2;
      const y = along ? o.y + o.h / 2 + (hash(i, o.y) - 0.5) * o.h * 0.2 : o.y + o.h * t;
      return { x, y, s: size * (0.85 + hash(o.x, i) * 0.3), image: rocks[Math.floor(hash(o.y, i) * rocks.length)]!, depth: depthOf(view, x, y) };
    }).sort((a, b) => b.depth - a.depth);
    for (const piece of pieces) drawAtlasBillboard(view, piece.image, piece.x, piece.y, piece.s, piece.s, depth);
    return;
  }
  const ground = project(view, cx, cy);
  const peak = project(view, cx, cy, o.height);
  if (!ground || !peak) return;
  const rx = ((o.w + o.h) / 4) * ground.scale;
  const ry = bonkGroundEllipse(ground, (o.w + o.h) / 4).ry;
  const tall = ground.y - peak.y;
  // Silhueta irregular estável (por id), desenhada na tela: uma pedra parece pedra de qualquer lado.
  const points: Point[] = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI + (i / steps) * Math.PI;
    const jitter = 0.86 + hash(o.x + i, o.y) * 0.22;
    points.push({ x: ground.x + Math.cos(a) * rx * jitter, y: ground.y + Math.sin(a) * tall * jitter * (i === 0 || i === steps ? 0.1 : 1) });
  }
  for (let i = 1; i < steps; i++) {
    const a = (i / steps) * Math.PI;
    points.push({ x: ground.x + Math.cos(a) * rx, y: ground.y + Math.sin(a) * ry });
  }
  const gradient = ctx.createLinearGradient(ground.x - rx, peak.y, ground.x + rx, ground.y);
  gradient.addColorStop(0, css(fogged(PALETTES.boulder.top, depth)));
  gradient.addColorStop(0.55, css(fogged(PALETTES.boulder.side, depth)));
  gradient.addColorStop(1, css(fogged(PALETTES.boulder.detail, depth)));
  ctx.fillStyle = gradient;
  polygon(ctx, points);
  ctx.fill();
  ctx.strokeStyle = css(fogged(shade(PALETTES.boulder.detail, 0.7), depth), 0.6);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ground.x - rx * 0.1, peak.y + tall * 0.25);
  ctx.lineTo(ground.x + rx * 0.08, peak.y + tall * 0.55);
  ctx.lineTo(ground.x - rx * 0.05, peak.y + tall * 0.8);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, .22)';
  ctx.beginPath(); ctx.ellipse(ground.x - rx * 0.32, peak.y + tall * 0.3, rx * 0.26, tall * 0.13, -0.3, 0, Math.PI * 2); ctx.fill();
}

/** Cristal com arte: orbe em pixel art flutuando sobre um pedestal com runa, com brilho que pulsa e faíscas. */
function drawFloatingOrb(view: View, o: BonkObstacle, depth: number, orb: HTMLCanvasElement, pedestal: HTMLCanvasElement): void {
  const { ctx } = view;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const t = view.elapsedMs;
  const phase = o.x * 0.013 + o.y * 0.007;
  const pulse = 0.55 + 0.45 * Math.sin(t / 650 + phase);
  const bob = Math.sin(t / 720 + phase) * 7;
  const size = o.w * 1.05;
  const floatZ = o.height * 0.5 + bob;
  const ground = project(view, cx, cy);
  if (!ground) return;
  // Luz da runa no chão e a sombra do orbe, que encolhe quando ele sobe.
  const glow = bonkGroundEllipse(ground, o.w * 1.1);
  const light = ctx.createRadialGradient(ground.x, ground.y, 1, ground.x, ground.y, Math.max(2, glow.rx));
  light.addColorStop(0, `rgba(196, 170, 255, ${(0.4 * pulse).toFixed(3)})`);
  light.addColorStop(1, 'rgba(196, 170, 255, 0)');
  ctx.fillStyle = light;
  ctx.beginPath(); ctx.ellipse(ground.x, ground.y, glow.rx, glow.ry, 0, 0, Math.PI * 2); ctx.fill();
  const shadow = bonkGroundEllipse(ground, size * 0.5 * (1 - bob / 40));
  ctx.fillStyle = 'rgba(30, 16, 64, .28)';
  ctx.beginPath(); ctx.ellipse(ground.x, ground.y, shadow.rx, shadow.ry, 0, 0, Math.PI * 2); ctx.fill();
  drawAtlasBillboard(view, pedestal, cx, cy, o.w * 1.15, o.w * 1.15 * (pedestal.height / pedestal.width), depth);
  const center = project(view, cx, cy, floatZ + size / 2);
  if (center) {
    const radius = size * center.scale;
    const halo = ctx.createRadialGradient(center.x, center.y, radius * 0.2, center.x, center.y, radius);
    halo.addColorStop(0, `rgba(205, 182, 255, ${(0.5 * pulse).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(205, 182, 255, 0)');
    const previous = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(center.x, center.y, radius, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = previous;
  }
  drawAtlasBillboard(view, orb, cx, cy, size, size, depth, floatZ);
  if (!center) return;
  // Faíscas em órbita: quadradinhos de pixel, não círculos, para combinar com o recorte.
  const pixel = Math.max(1.5, size * center.scale / 12);
  ctx.fillStyle = `rgba(240, 232, 255, ${(0.6 + 0.4 * pulse).toFixed(3)})`;
  for (let i = 0; i < 3; i++) {
    const a = t / 900 + phase + (i * Math.PI * 2) / 3;
    const sx = center.x + Math.cos(a) * size * center.scale * 0.72;
    const sy = center.y + Math.sin(a) * size * center.scale * 0.22 - Math.sin(t / 400 + i) * pixel;
    ctx.fillRect(Math.round(sx - pixel / 2), Math.round(sy - pixel / 2), Math.round(pixel), Math.round(pixel));
  }
}

function drawCrystal(view: View, o: BonkObstacle, depth: number): void {
  const { ctx } = view;
  const orb = view.art?.sprites.orb;
  const pedestal = view.art?.sprites.pedestal;
  if (orb && pedestal) {
    drawFloatingOrb(view, o, depth, orb, pedestal);
    return;
  }
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const spikes = [
    { ox: -0.26, oy: 0.12, h: 0.66, r: 0.24 },
    { ox: 0.24, oy: -0.14, h: 0.58, r: 0.22 },
    { ox: 0, oy: 0, h: 1, r: 0.32 },
  ].map((spike) => ({ ...spike, depth: depthOf(view, cx + spike.ox * o.w, cy + spike.oy * o.h) }))
    .sort((a, b) => b.depth - a.depth);
  const pulse = 0.55 + 0.45 * Math.sin(view.elapsedMs / 650 + o.x);
  const ground = project(view, cx, cy);
  if (ground) {
    const glow = bonkGroundEllipse(ground, o.w * 0.9);
    const gradient = ctx.createRadialGradient(ground.x, ground.y, 1, ground.x, ground.y, Math.max(2, glow.rx));
    gradient.addColorStop(0, `rgba(205, 180, 255, ${0.35 * pulse})`);
    gradient.addColorStop(1, 'rgba(205, 180, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.ellipse(ground.x, ground.y, glow.rx, glow.ry, 0, 0, Math.PI * 2); ctx.fill();
  }
  for (const spike of spikes) {
    const bx = cx + spike.ox * o.w;
    const by = cy + spike.oy * o.h;
    const foot = project(view, bx, by);
    const tip = project(view, bx, by, o.height * spike.h);
    if (!foot || !tip) continue;
    const half = spike.r * o.w * foot.scale;
    ctx.fillStyle = css(fogged(PALETTES.crystal.detail, depth));
    polygon(ctx, [{ x: foot.x - half, y: foot.y }, { x: tip.x, y: tip.y }, { x: foot.x, y: foot.y + half * 0.18 }]);
    ctx.fill();
    ctx.fillStyle = css(fogged(PALETTES.crystal.side, depth));
    polygon(ctx, [{ x: foot.x + half, y: foot.y }, { x: tip.x, y: tip.y }, { x: foot.x, y: foot.y + half * 0.18 }]);
    ctx.fill();
    ctx.strokeStyle = css(fogged(PALETTES.crystal.top, depth), 0.8);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(foot.x - half * 0.15, foot.y); ctx.stroke();
  }
}

/** O segmento câmera → jogador passa pelo retângulo? Usado para deixar transparente o que tampa a visão. */
function blocksView(camera: Point, player: Point, o: BonkObstacle): boolean {
  const pad = 12;
  let t0 = 0;
  let t1 = 1;
  const dx = player.x - camera.x;
  const dy = player.y - camera.y;
  const checks: readonly [number, number][] = [
    [-dx, camera.x - (o.x - pad)], [dx, o.x + o.w + pad - camera.x],
    [-dy, camera.y - (o.y - pad)], [dy, o.y + o.h + pad - camera.y],
  ];
  for (const [p, q] of checks) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

function drawShadow(view: View, o: BonkObstacle): void {
  const { ctx } = view;
  const length = Math.min(140, o.height * 0.42);
  const sx = LIGHT.x * length;
  const sy = LIGHT.y * length;
  if (o.kind === 'tree' || o.kind === 'boulder' || o.kind === 'crystal') {
    const center = project(view, o.x + o.w / 2 + sx, o.y + o.h / 2 + sy);
    if (!center) return;
    const size = bonkGroundEllipse(center, (o.kind === 'tree' ? o.w * 0.85 : o.w * 0.6));
    ctx.beginPath(); ctx.ellipse(center.x, center.y, size.rx, size.ry, 0, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const corners: Point[] = [
    { x: o.x, y: o.y }, { x: o.x + o.w, y: o.y }, { x: o.x + o.w, y: o.y + o.h }, { x: o.x, y: o.y + o.h },
  ];
  // Fecho convexo do pé do bloco com a mesma forma deslocada pela luz.
  const hull = convexHull([...corners, ...corners.map((c) => ({ x: c.x + sx, y: c.y + sy }))]);
  const projected = hull.map((c) => project(view, c.x, c.y));
  if (projected.some((p) => !p)) return;
  polygon(ctx, projected as BonkProjection[]);
  ctx.fill();
}

function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Profundidade do ponto do obstáculo mais perto da câmera: paredes longas ordenam certo com os sprites. */
function nearestDepth(view: View, o: BonkObstacle): number {
  const nx = clamp(view.camera.x, o.x, o.x + o.w);
  const ny = clamp(view.camera.y, o.y, o.y + o.h);
  return depthOf(view, nx, ny);
}

// ----------------------------------------------------------------------------- API

/** Céu, serras, chão, estradas, detalhes e sombras: tudo que fica atrás dos sprites e obstáculos. */
export function drawBonkGround(
  ctx: CanvasRenderingContext2D,
  physics: BonkPhysics,
  player: SurvivorPlayer,
  viewport: BonkViewport,
  elapsedMs: number,
  art: BonkArt | null = null,
  nextArt: BonkArt | null = null,
  transition = 0,
): void {
  const drawLayer = (layer: BonkArt | null, alpha: number): void => {
    const view = makeView(ctx, physics, player, viewport, elapsedMs, layer);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = true;
    const horizon = drawSky(view);
    drawGroundTiles(view);
    drawRibbon(view, MAIN_ROAD, 84, MAIN_ROAD_NORMALS, MAIN_ROAD_DISTANCES);
    drawRibbon(view, CROSS_ROAD, 52, CROSS_ROAD_NORMALS, CROSS_ROAD_DISTANCES);
    drawGroundDetails(view);
    ctx.fillStyle = 'rgba(18, 36, 40, .2)';
    for (const obstacle of physics.obstacles) {
      const depth = nearestDepth(view, obstacle);
      if (depth > 40 && depth < FAR) drawShadow(view, obstacle);
    }
    // Névoa baixa no horizonte junta o fim do chão às serras.
    const fog = ctx.createLinearGradient(0, horizon - 12, 0, horizon + viewport.height * 0.1);
    fog.addColorStop(0, css(HAZE, 0.55));
    fog.addColorStop(1, css(HAZE, 0));
    ctx.fillStyle = fog;
    ctx.fillRect(0, horizon - 12, viewport.width, viewport.height * 0.1 + 12);
    ctx.restore();
  };
  drawLayer(art, 1);
  if (nextArt && transition > 0) drawLayer(nextArt, clamp(transition, 0, 1));
}

/**
 * Obstáculos prontos para entrar na mesma ordenação dos sprites. O que fica entre a câmera e o jogador, ou colado na
 * câmera, é desenhado meio transparente para nunca esconder o Pokémon.
 */
export function bonkObstacleDrawables(
  ctx: CanvasRenderingContext2D,
  physics: BonkPhysics,
  player: SurvivorPlayer,
  viewport: BonkViewport,
  elapsedMs: number,
  art: BonkArt | null = null,
  nextArt: BonkArt | null = null,
  transition = 0,
): BonkDrawable[] {
  const out: BonkDrawable[] = [];
  const appendLayer = (layer: BonkArt | null, alpha: number): void => {
    const view = makeView(ctx, physics, player, viewport, elapsedMs, layer);
    for (const obstacle of physics.obstacles) {
      const depth = nearestDepth(view, obstacle);
      if (depth > FAR + 200) continue;
      const centerDepth = depthOf(view, obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2);
      if (centerDepth < BONK_CAMERA.near + 10) continue;
      const occludes = (blocksView(view.camera, player, obstacle) && obstacle.height > 30) || depth < 110;
      out.push({
        depth: obstacle.kind === 'tree' ? centerDepth - obstacle.w * 0.5 : depth,
        draw: () => {
          ctx.save();
          ctx.globalAlpha *= alpha;
          if (occludes) ctx.globalAlpha *= 0.38;
          if (obstacle.kind === 'tree') drawTree(view, obstacle, centerDepth);
          else if (obstacle.kind === 'boulder') drawBoulder(view, obstacle, centerDepth);
          else if (obstacle.kind === 'crystal') drawCrystal(view, obstacle, centerDepth);
          else if (obstacle.kind === 'bridge') drawBridge(view, obstacle, centerDepth);
          else if (obstacle.kind === 'ruin') drawRuin(view, obstacle, centerDepth);
          else drawWall(view, obstacle, centerDepth);
          ctx.restore();
        },
      });
    }
  };
  appendLayer(art, 1);
  if (nextArt && transition > 0) appendLayer(nextArt, clamp(transition, 0, 1));
  return out;
}
