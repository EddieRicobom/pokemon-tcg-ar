import { bonkCameraLocalToWorld, projectBonkPoint } from '../core/survivor-bonk';
import type { BonkObstacle, BonkPhysics } from '../core/survivor-bonk';
import type { SurvivorPlayer } from '../core/survivor-types';

/**
 * Cenário BONK em perspectiva. É Canvas 2D projetado, não WebGL: mantém o
 * carregamento leve da Torre, mas entrega profundidade, horizonte e terreno
 * físico sem a pixelização do Survival padrão.
 */

export interface BonkViewport {
  width: number;
  height: number;
}

type Point = { x: number; y: number };

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const hash = (x: number, y: number): number => {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
};

function terrainColor(x: number, y: number, t: number): string {
  const stream = x > 2020 && x < 2520 && y > 650 && y < 1250;
  if (stream) return hash(x / 80, y / 80) > 0.5 ? '#3f9bc7' : '#4cafe0';
  const road = Math.abs(y - (970 + Math.sin(x / 260) * 120)) < 84 || Math.abs(x - 1440) < 52;
  if (road) return hash(x / 80, y / 80) > 0.55 ? '#b78b5f' : '#c89d6a';
  const noise = hash(Math.floor(x / 58), Math.floor(y / 58));
  const shimmer = Math.sin(t / 900 + x / 130 + y / 110) * 0.025;
  const light = clamp(0.75 + noise * 0.14 + shimmer, 0, 1);
  return `hsl(${112 + Math.round(noise * 10)} 38% ${Math.round(light * 48)}%)`;
}

function polygon(ctx: CanvasRenderingContext2D, points: readonly Point[]): void {
  const first = points[0];
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
}

function projectLocal(physics: BonkPhysics, player: SurvivorPlayer, forward: number, side: number, viewport: BonkViewport, z = 0): Point | null {
  const world = bonkCameraLocalToWorld(physics, player, forward, side);
  const p = projectBonkPoint(physics, player, { ...world, z }, viewport);
  return p ? { x: p.x, y: p.y } : null;
}

function obstacleColors(kind: BonkObstacle['kind']): { side: string; top: string; accent: string } {
  switch (kind) {
    case 'tree': return { side: '#71503c', top: '#367f58', accent: '#94dc80' };
    case 'boulder': return { side: '#5d6780', top: '#9ba5b5', accent: '#dce7ed' };
    case 'wall': return { side: '#6d5b75', top: '#a493ad', accent: '#d7c6dc' };
    case 'ruin': return { side: '#705a4b', top: '#b59576', accent: '#e3c89b' };
    case 'crystal': return { side: '#5062a5', top: '#a983eb', accent: '#e4d5ff' };
    case 'bridge': return { side: '#7c5134', top: '#c69057', accent: '#f1c987' };
  }
}

function drawObstacle(ctx: CanvasRenderingContext2D, physics: BonkPhysics, player: SurvivorPlayer, viewport: BonkViewport, obstacle: BonkObstacle): void {
  const corners = [
    { x: obstacle.x, y: obstacle.y },
    { x: obstacle.x + obstacle.w, y: obstacle.y },
    { x: obstacle.x + obstacle.w, y: obstacle.y + obstacle.h },
    { x: obstacle.x, y: obstacle.y + obstacle.h },
  ];
  const base = corners.map((point) => projectBonkPoint(physics, player, point, viewport));
  const top = corners.map((point) => projectBonkPoint(physics, player, { ...point, z: obstacle.height }, viewport));
  if (base.some((point) => !point) || top.some((point) => !point)) return;
  const b = base as NonNullable<typeof base[number]>[];
  const u = top as NonNullable<typeof top[number]>[];
  const colors = obstacleColors(obstacle.kind);
  ctx.save();
  ctx.fillStyle = colors.side;
  polygon(ctx, [b[0]!, b[1]!, u[1]!, u[0]!]);
  ctx.fill();
  ctx.fillStyle = `${colors.side}cc`;
  polygon(ctx, [b[1]!, b[2]!, u[2]!, u[1]!]);
  ctx.fill();
  ctx.fillStyle = colors.top;
  polygon(ctx, u);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20, 29, 54, .42)';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (obstacle.kind === 'tree') {
    const center = projectBonkPoint(physics, player, { x: obstacle.x + obstacle.w / 2, y: obstacle.y + obstacle.h / 2, z: obstacle.height + 42 }, viewport);
    if (center) {
      ctx.fillStyle = colors.accent;
      ctx.globalAlpha = 0.82;
      ctx.beginPath();
      ctx.arc(center.x, center.y, Math.max(3, center.scale * obstacle.w * 0.58), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (obstacle.kind === 'crystal') {
    ctx.fillStyle = colors.accent;
    ctx.globalAlpha = 0.72;
    polygon(ctx, [u[0]!, u[1]!, { x: (u[1]!.x + u[2]!.x) / 2, y: Math.min(u[1]!.y, u[2]!.y) - 12 }, u[2]!, u[3]!]);
    ctx.fill();
  }
  ctx.restore();
}

/** Desenha horizonte, chão detalhado e obstáculos físicos do mapa amplo da variante BONK. */
export function drawBonkLandscape(
  ctx: CanvasRenderingContext2D,
  physics: BonkPhysics,
  player: SurvivorPlayer,
  viewport: BonkViewport,
  elapsedMs: number,
): void {
  const { width, height } = viewport;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  const sky = ctx.createLinearGradient(0, 0, 0, height * 0.58);
  sky.addColorStop(0, '#142c59');
  sky.addColorStop(0.56, '#457cbb');
  sky.addColorStop(1, '#b5dcef');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // Camadas de serra e neblina para tornar o horizonte profundo sem carregar um atlas pesado.
  const horizon = height * 0.34;
  for (const [offset, color, amplitude] of [[0, '#4f6f7b', 22], [80, '#385863', 38], [150, '#213e4d', 58]] as const) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, horizon + offset * 0.02);
    for (let x = 0; x <= width + 40; x += 36) ctx.lineTo(x, horizon - amplitude + Math.sin(x / 90 + elapsedMs / 5000 + offset) * amplitude * 0.32);
    ctx.lineTo(width, horizon + 58);
    ctx.lineTo(0, horizon + 58);
    ctx.closePath();
    ctx.fill();
  }

  // Grade de quads: de longe para perto, cada célula é um pedaço real do mundo.
  const cell = 92;
  const far = 1380;
  const side = 930;
  for (let forward = far; forward >= 42; forward -= cell) {
    for (let lateral = -side; lateral < side; lateral += cell) {
      const world = bonkCameraLocalToWorld(physics, player, forward + cell * 0.5, lateral + cell * 0.5);
      const p1 = projectLocal(physics, player, forward, lateral, viewport);
      const p2 = projectLocal(physics, player, forward, lateral + cell, viewport);
      const p3 = projectLocal(physics, player, forward + cell, lateral + cell, viewport);
      const p4 = projectLocal(physics, player, forward + cell, lateral, viewport);
      if (!p1 || !p2 || !p3 || !p4) continue;
      ctx.fillStyle = terrainColor(world.x, world.y, elapsedMs);
      polygon(ctx, [p1, p2, p3, p4]);
      ctx.fill();
      if (forward > 260 && hash(Math.floor(world.x / 70), Math.floor(world.y / 70)) > 0.94) {
        ctx.fillStyle = 'rgba(236, 255, 178, .52)';
        ctx.beginPath();
        ctx.arc((p1.x + p3.x) / 2, (p1.y + p3.y) / 2, Math.max(1, (p3.y - p1.y) * 0.05), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const ordered = [...physics.obstacles]
    .map((obstacle) => ({ obstacle, depth: projectBonkPoint(physics, player, { x: obstacle.x + obstacle.w / 2, y: obstacle.y + obstacle.h / 2 }, viewport)?.depth ?? -1 }))
    .filter(({ depth }) => depth > 0)
    .sort((a, b) => b.depth - a.depth);
  for (const { obstacle } of ordered) drawObstacle(ctx, physics, player, viewport, obstacle);

  // Vinheta e névoa baixa diminuem a leitura de ruído e deixam os efeitos do combate mais limpos do que o pixelado.
  const fog = ctx.createLinearGradient(0, horizon - 20, 0, horizon + 120);
  fog.addColorStop(0, 'rgba(226, 245, 255, .36)');
  fog.addColorStop(1, 'rgba(226, 245, 255, 0)');
  ctx.fillStyle = fog;
  ctx.fillRect(0, horizon - 22, width, 140);
  ctx.restore();
}
