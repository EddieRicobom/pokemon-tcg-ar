import { ARENA_H, ARENA_W, PLAYER_RADIUS } from './survivor-types';
import type { SurvivorPlayer } from './survivor-types';

/**
 * Física do modo BONK. O combate continua no motor de Sobrevivência; este módulo
 * só acrescenta terreno sólido, salto e os dados da câmera em terceira pessoa.
 * Mantê-lo puro permite testar a corrida sem canvas, WebGL ou DOM.
 */

export const BONK_GRAVITY = 1250;
export const BONK_BASE_JUMP_POWER = 470;

export type BonkObstacleKind = 'tree' | 'boulder' | 'wall' | 'ruin' | 'crystal' | 'bridge';

export interface BonkObstacle {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Altura visual e física: obstáculos baixos podem ser pulados. */
  height: number;
  kind: BonkObstacleKind;
}

export interface BonkPhysics {
  /** Altura atual acima do chão. */
  z: number;
  /** Velocidade vertical. */
  verticalVelocity: number;
  /** Salto já usado desde o último pouso. */
  jumpsUsed: number;
  grounded: boolean;
  /** Direção em radianos em que a câmera olha; ela gira atrás do movimento. */
  cameraYaw: number;
  collisionFlashMs: number;
  obstacles: readonly BonkObstacle[];
}

export interface BonkProjection {
  x: number;
  y: number;
  scale: number;
  depth: number;
}

const OBSTACLES: readonly BonkObstacle[] = [
  // Clareira inicial: espaço amplo para aprender salto e câmera.
  { id: 'north-ruin', x: 1360, y: 690, w: 170, h: 44, height: 88, kind: 'ruin' },
  { id: 'south-ruin', x: 1390, y: 1250, w: 190, h: 48, height: 88, kind: 'ruin' },
  // Bosque da esquerda: troncos altos e pedras baixas para testar pulo.
  { id: 'oak-1', x: 400, y: 420, w: 86, h: 86, height: 178, kind: 'tree' },
  { id: 'oak-2', x: 610, y: 560, w: 92, h: 92, height: 186, kind: 'tree' },
  { id: 'oak-3', x: 470, y: 770, w: 78, h: 78, height: 172, kind: 'tree' },
  { id: 'oak-4', x: 720, y: 920, w: 96, h: 96, height: 188, kind: 'tree' },
  { id: 'oak-5', x: 355, y: 1160, w: 88, h: 88, height: 180, kind: 'tree' },
  { id: 'stone-1', x: 830, y: 405, w: 92, h: 70, height: 44, kind: 'boulder' },
  { id: 'stone-2', x: 910, y: 690, w: 112, h: 78, height: 48, kind: 'boulder' },
  { id: 'stone-3', x: 730, y: 1390, w: 118, h: 76, height: 48, kind: 'boulder' },
  // Corredor de ruínas: paredes altas, muretas puláveis e uma ponte baixa.
  { id: 'wall-west', x: 1070, y: 260, w: 46, h: 360, height: 126, kind: 'wall' },
  { id: 'wall-east', x: 1765, y: 300, w: 48, h: 330, height: 126, kind: 'wall' },
  { id: 'wall-south', x: 1110, y: 1540, w: 650, h: 48, height: 126, kind: 'wall' },
  { id: 'low-wall-1', x: 1150, y: 900, w: 180, h: 34, height: 38, kind: 'wall' },
  { id: 'low-wall-2', x: 1560, y: 1060, w: 180, h: 34, height: 38, kind: 'wall' },
  { id: 'bridge', x: 1980, y: 810, w: 320, h: 84, height: 18, kind: 'bridge' },
  // Cristais e pedras da margem direita fazem o mapa continuar legível e detalhado longe da clareira.
  { id: 'crystal-1', x: 2120, y: 470, w: 56, h: 56, height: 104, kind: 'crystal' },
  { id: 'crystal-2', x: 2330, y: 620, w: 64, h: 64, height: 112, kind: 'crystal' },
  { id: 'crystal-3', x: 2470, y: 1020, w: 54, h: 54, height: 98, kind: 'crystal' },
  { id: 'tree-east-1', x: 2380, y: 1320, w: 98, h: 98, height: 194, kind: 'tree' },
  { id: 'tree-east-2', x: 2580, y: 1480, w: 88, h: 88, height: 180, kind: 'tree' },
  { id: 'stone-east-1', x: 2180, y: 1210, w: 128, h: 82, height: 52, kind: 'boulder' },
  { id: 'stone-east-2', x: 2580, y: 790, w: 110, h: 74, height: 48, kind: 'boulder' },
] as const;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const normalizeAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

function approachAngle(current: number, target: number, amount: number): number {
  return current + normalizeAngle(target - current) * clamp(amount, 0, 1);
}

/** Cria a arena física; ela usa o mesmo mundo amplo (2880×1920) do Survival. */
export function createBonkPhysics(initialYaw = Math.PI / 2): BonkPhysics {
  return {
    z: 0,
    verticalVelocity: 0,
    jumpsUsed: 0,
    grounded: true,
    cameraYaw: initialYaw,
    collisionFlashMs: 0,
    obstacles: OBSTACLES,
  };
}

/** Quantos saltos ainda podem ser dados no ar. */
export function bonkJumpsRemaining(physics: BonkPhysics, player: Pick<SurvivorPlayer, 'bonkAirJumps'>): number {
  const maximum = 1 + Math.max(0, player.bonkAirJumps ?? 0);
  return physics.grounded ? maximum : Math.max(0, maximum - physics.jumpsUsed);
}

/** Tenta iniciar um salto. Devolve false se todos os saltos disponíveis já foram usados. */
export function tryBonkJump(physics: BonkPhysics, player: Pick<SurvivorPlayer, 'bonkJumpPower' | 'bonkAirJumps'>): boolean {
  const maximum = 1 + Math.max(0, player.bonkAirJumps ?? 0);
  if (!physics.grounded && physics.jumpsUsed >= maximum) return false;
  physics.verticalVelocity = player.bonkJumpPower ?? BONK_BASE_JUMP_POWER;
  physics.jumpsUsed = physics.grounded ? 1 : physics.jumpsUsed + 1;
  physics.grounded = false;
  return true;
}

/** Resolve um círculo contra os retângulos sólidos da arena. Obstáculo baixo só bloqueia quem está no chão. */
export function resolveBonkPosition(
  physics: Pick<BonkPhysics, 'z' | 'obstacles'>,
  desiredX: number,
  desiredY: number,
  radius = PLAYER_RADIUS,
): { x: number; y: number; collided: boolean } {
  let x = clamp(desiredX, radius, ARENA_W - radius);
  let y = clamp(desiredY, radius, ARENA_H - radius);
  let collided = x !== desiredX || y !== desiredY;

  for (const obstacle of physics.obstacles) {
    // O centro do jogador está acima do topo: pedras e muretas tornam-se puláveis,
    // árvores, ruínas e muros altos continuam sendo barreiras reais.
    if (physics.z > obstacle.height + radius * 0.35) continue;
    const minX = obstacle.x - radius;
    const maxX = obstacle.x + obstacle.w + radius;
    const minY = obstacle.y - radius;
    const maxY = obstacle.y + obstacle.h + radius;
    if (x <= minX || x >= maxX || y <= minY || y >= maxY) continue;

    const nearestX = clamp(x, obstacle.x, obstacle.x + obstacle.w);
    const nearestY = clamp(y, obstacle.y, obstacle.y + obstacle.h);
    const dx = x - nearestX;
    const dy = y - nearestY;
    if (dx !== 0 || dy !== 0) {
      const distance = Math.hypot(dx, dy) || 1;
      x = nearestX + (dx / distance) * radius;
      y = nearestY + (dy / distance) * radius;
    } else {
      const left = x - minX;
      const right = maxX - x;
      const top = y - minY;
      const bottom = maxY - y;
      const minimum = Math.min(left, right, top, bottom);
      if (minimum === left) x = minX;
      else if (minimum === right) x = maxX;
      else if (minimum === top) y = minY;
      else y = maxY;
    }
    collided = true;
  }
  return { x: clamp(x, radius, ARENA_W - radius), y: clamp(y, radius, ARENA_H - radius), collided };
}

/** Avança gravidade, colisão e a câmera que se posiciona atrás da direção de movimento. */
export function stepBonkPhysics(
  physics: BonkPhysics,
  player: Pick<SurvivorPlayer, 'x' | 'y' | 'bonkGravityFactor' | 'bonkJumpPower' | 'bonkAirJumps'>,
  from: { x: number; y: number },
  input: { dx: number; dy: number; jump?: boolean },
  dtMs: number,
): void {
  const dt = Math.max(0, Math.min(80, dtMs)) / 1000;
  if (input.jump) tryBonkJump(physics, player);
  const length = Math.hypot(input.dx, input.dy);
  if (length > 0.04) {
    const targetYaw = Math.atan2(input.dy, input.dx);
    physics.cameraYaw = approachAngle(physics.cameraYaw, targetYaw, 1 - Math.exp(-dt * 8));
  }

  physics.verticalVelocity -= BONK_GRAVITY * (player.bonkGravityFactor ?? 1) * dt;
  physics.z += physics.verticalVelocity * dt;
  if (physics.z <= 0) {
    physics.z = 0;
    physics.verticalVelocity = 0;
    physics.grounded = true;
    physics.jumpsUsed = 0;
  }
  const resolved = resolveBonkPosition(physics, player.x, player.y);
  player.x = resolved.x;
  player.y = resolved.y;
  if (resolved.collided && (Math.abs(player.x - from.x) > 0.01 || Math.abs(player.y - from.y) > 0.01)) physics.collisionFlashMs = 130;
  else physics.collisionFlashMs = Math.max(0, physics.collisionFlashMs - dtMs);
}

/** Projeção perspectiva da câmera em terceira pessoa. Retorna null atrás da câmera ou perto demais. */
export function projectBonkPoint(
  physics: Pick<BonkPhysics, 'cameraYaw'>,
  player: Pick<SurvivorPlayer, 'x' | 'y'>,
  point: { x: number; y: number; z?: number },
  viewport: { width: number; height: number },
): BonkProjection | null {
  const yaw = physics.cameraYaw;
  const cameraDistance = 175;
  const cameraHeight = 110;
  const cameraX = player.x - Math.cos(yaw) * cameraDistance;
  const cameraY = player.y - Math.sin(yaw) * cameraDistance;
  const dx = point.x - cameraX;
  const dy = point.y - cameraY;
  const depth = dx * Math.cos(yaw) + dy * Math.sin(yaw);
  if (depth <= 20) return null;
  const side = -dx * Math.sin(yaw) + dy * Math.cos(yaw);
  const focal = Math.max(320, viewport.height * 1.08);
  const scale = focal / depth;
  const horizon = viewport.height * 0.34;
  return { x: viewport.width / 2 + side * scale, y: horizon + (cameraHeight - (point.z ?? 0)) * scale, scale, depth };
}

/** Converte coordenadas locais da câmera em mundo, útil para desenhar o terreno em perspectiva. */
export function bonkCameraLocalToWorld(
  physics: Pick<BonkPhysics, 'cameraYaw'>,
  player: Pick<SurvivorPlayer, 'x' | 'y'>,
  forward: number,
  side: number,
): { x: number; y: number } {
  const yaw = physics.cameraYaw;
  const cameraX = player.x - Math.cos(yaw) * 175;
  const cameraY = player.y - Math.sin(yaw) * 175;
  return {
    x: cameraX + forward * Math.cos(yaw) - side * Math.sin(yaw),
    y: cameraY + forward * Math.sin(yaw) + side * Math.cos(yaw),
  };
}
