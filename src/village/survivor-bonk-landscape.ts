import { BONK_CAMERA, bonkCameraPosition, bonkFocal, projectBonkPoint } from '../core/survivor-bonk';
import type { BonkObstacle, BonkPhysics, BonkProjection } from '../core/survivor-bonk';
import { ARENA_H, ARENA_W } from '../core/survivor-types';
import type { SurvivorPlayer } from '../core/survivor-types';

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
}

function makeView(ctx: CanvasRenderingContext2D, physics: BonkPhysics, player: SurvivorPlayer, viewport: BonkViewport, elapsedMs: number): View {
  return {
    ctx, physics, player, viewport, elapsedMs,
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
      const color = css(fogged(groundColor(cx, cy, view.elapsedMs), depth));
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      polygon(ctx, [a, b, c, d]);
      ctx.fill();
      ctx.stroke();
    }
  }
}

/** Faixa contínua (estrada) ao longo de uma linha central, com bordas mais escuras. */
function drawRibbon(view: View, points: readonly Point[], halfWidth: number, normals: readonly Point[]): void {
  const { ctx } = view;
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
    const color = css(fogged(mix(ROAD, [210, 176, 128], hash(i, 11) * 0.5), depth));
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    polygon(ctx, [l1, l2, r2, r1]);
    ctx.fill();
    ctx.stroke();
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

function onRoad(x: number, y: number): boolean {
  return Math.abs(y - (970 + Math.sin(x / 260) * 120)) < 92 || Math.abs(x - 1440) < 60;
}

/** Tufos de grama, flores e pedrinhas presos ao mundo: dão escala e sensação de movimento ao correr. */
function drawGroundDetails(view: View): void {
  const { ctx, camera } = view;
  const reach = 900;
  const minX = Math.max(0, Math.floor((camera.x - reach) / TILE) * TILE);
  const maxX = Math.min(ARENA_W, camera.x + reach);
  const minY = Math.max(0, Math.floor((camera.y - reach) / TILE) * TILE);
  const maxY = Math.min(ARENA_H, camera.y + reach);
  for (let x = minX; x < maxX; x += TILE) {
    for (let y = minY; y < maxY; y += TILE) {
      const tx = x / TILE;
      const ty = y / TILE;
      for (let k = 0; k < 2; k++) {
        const kind = hash(tx * 3.1 + k, ty * 1.7 - k);
        if (kind < 0.42) continue;
        const wx = x + hash(tx + k * 5, ty + 9) * TILE;
        const wy = y + hash(tx + 4, ty - k * 3) * TILE;
        if (streamDistance(wx, wy) < TILE * 0.8 || onRoad(wx, wy)) continue;
        const depth = depthOf(view, wx, wy);
        if (depth < 150 || depth > reach) continue;
        const p = project(view, wx, wy);
        if (!p || p.x < -20 || p.x > view.viewport.width + 20) continue;
        const s = p.scale;
        const alpha = 1 - fogAmount(depth);
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
      }
    }
  }
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

/** Bloco com só as faces que encaram a câmera (antes, uma face de trás podia cobrir a da frente). */
function drawBox(view: View, box: Box, palette: Palette, depth: number, options: { top?: boolean; courses?: number } = {}): boolean {
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
  for (const { face } of visible) {
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
  if (options.top !== false && box.z1 < BONK_CAMERA.height - 4) {
    ctx.fillStyle = css(fogged(palette.top, depth));
    polygon(ctx, u);
    ctx.fill();
    ctx.strokeStyle = css(fogged(shade(palette.detail, 0.8), depth), 0.45);
    ctx.stroke();
  }
  return true;
}

function drawWall(view: View, o: BonkObstacle, depth: number): void {
  drawBox(view, { x: o.x, y: o.y, w: o.w, h: o.h, z0: 0, z1: o.height }, PALETTES.wall, depth, { courses: 21 });
}

function drawRuin(view: View, o: BonkObstacle, depth: number): void {
  const palette = PALETTES.ruin;
  if (!drawBox(view, { x: o.x, y: o.y, w: o.w, h: o.h, z0: 0, z1: o.height * 0.82 }, palette, depth, { courses: 18 })) return;
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
    drawBox(view, block, { ...palette, top: mix(palette.top, palette.detail, 0.55) }, depth);
  }
}

function drawBridge(view: View, o: BonkObstacle, depth: number): void {
  const { ctx } = view;
  const palette = PALETTES.bridge;
  if (!drawBox(view, { x: o.x, y: o.y, w: o.w, h: o.h, z0: 0, z1: o.height }, palette, depth)) return;
  const along = o.w >= o.h;
  const length = along ? o.w : o.h;
  ctx.beginPath();
  for (let s = 16; s < length; s += 16) {
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

function drawCrystal(view: View, o: BonkObstacle, depth: number): void {
  const { ctx } = view;
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
): void {
  const view = makeView(ctx, physics, player, viewport, elapsedMs);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  const horizon = drawSky(view);
  drawGroundTiles(view);
  drawRibbon(view, MAIN_ROAD, 84, MAIN_ROAD_NORMALS);
  drawRibbon(view, CROSS_ROAD, 52, CROSS_ROAD_NORMALS);
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
): BonkDrawable[] {
  const view = makeView(ctx, physics, player, viewport, elapsedMs);
  const out: BonkDrawable[] = [];
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
        if (occludes) ctx.globalAlpha = 0.38;
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
  return out;
}
