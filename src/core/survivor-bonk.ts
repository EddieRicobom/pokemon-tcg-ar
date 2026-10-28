import { ARENA_H, ARENA_W, PLAYER_RADIUS } from './survivor-types';
import type { SurvivorPlayer } from './survivor-types';

/**
 * Física do modo BONK. O combate continua no motor de Sobrevivência; este módulo
 * só acrescenta terreno sólido, salto e os dados da câmera em terceira pessoa.
 * Mantê-lo puro permite testar a corrida sem canvas, WebGL ou DOM.
 */

export const BONK_GRAVITY = 1250;
export const BONK_BASE_JUMP_POWER = 470;
/** Câmera em terceira pessoa: atrás e acima do jogador, com o horizonte no terço de cima da tela. */
export const BONK_CAMERA = { distance: 250, height: 120, horizonRatio: 0.3, focalRatio: 1, minFocal: 320, near: 20 } as const;
/** Giro da câmera por segundo com o analógico todo para o lado. */
export const BONK_TURN_RATE = 3.2;
/** Um toque no Pular um pouco antes de pousar ainda vale: o salto fica guardado por esse tempo. */
export const BONK_JUMP_BUFFER_MS = 140;
/** Duração do efeito de pouso (poeira e achatamento do sprite). */
export const BONK_LANDING_MS = 220;
/** Fator de movimento dentro da água rasa do riacho; a ponte mantém a velocidade normal. */
export const BONK_WATER_SPEED_FACTOR = 0.58;
/** Leito vertical do riacho do BONK. A ponte o cruza na altura de `y: 810`. */
export const BONK_STREAM = { x0: 2040, x1: 2260, y0: 280, y1: 1640 } as const;

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
  /** Salto pedido e ainda não executado (ms restantes); ver `BONK_JUMP_BUFFER_MS`. */
  jumpBufferMs: number;
  /** Ms restantes do efeito de pouso, só para o desenho. */
  landingMs: number;
  /** Semente visual/física do cenário desta corrida; não consome o RNG do combate. */
  landscapeSeed: number;
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
  // Piso raso: não bloqueia o passo, mas é a única passagem segura sobre o riacho.
  { id: 'bridge', x: 1980, y: 810, w: 320, h: 84, height: 0, kind: 'bridge' },
  // Cristais e pedras da margem direita fazem o mapa continuar legível e detalhado longe da clareira.
  { id: 'crystal-1', x: 2380, y: 470, w: 56, h: 56, height: 104, kind: 'crystal' },
  { id: 'crystal-2', x: 2470, y: 620, w: 64, h: 64, height: 112, kind: 'crystal' },
  { id: 'crystal-3', x: 2390, y: 1020, w: 54, h: 54, height: 98, kind: 'crystal' },
  { id: 'tree-east-1', x: 2380, y: 1320, w: 98, h: 98, height: 194, kind: 'tree' },
  { id: 'tree-east-2', x: 2580, y: 1480, w: 88, h: 88, height: 180, kind: 'tree' },
  { id: 'stone-east-1', x: 2400, y: 1210, w: 128, h: 82, height: 52, kind: 'boulder' },
  { id: 'stone-east-2', x: 2580, y: 790, w: 110, h: 74, height: 48, kind: 'boulder' },
] as const;

const DEFAULT_LANDSCAPE_SEED = 0x0b0a5eed;
const START_CLEAR_RADIUS = 96;
const JITTER: Record<BonkObstacleKind, number> = {
  tree: 170,
  boulder: 130,
  wall: 52,
  ruin: 92,
  crystal: 150,
  // A ponte ainda precisa cruzar o riacho; a variedade dela vem do tileset.
  bridge: 0,
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const normalizeAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

/** RNG local do cenário: uma nova arena não altera inimigos, drops nem upgrades da mesma seed de combate. */
function landscapeRng(seed: number): () => number {
  let state = (Math.floor(seed) >>> 0) || DEFAULT_LANDSCAPE_SEED;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 0x1_0000_0000;
  };
}

function keepsStartClear(obstacle: Pick<BonkObstacle, 'x' | 'y' | 'w' | 'h'>): boolean {
  const closestX = clamp(ARENA_W / 2, obstacle.x, obstacle.x + obstacle.w);
  const closestY = clamp(ARENA_H / 2, obstacle.y, obstacle.y + obstacle.h);
  return Math.hypot(ARENA_W / 2 - closestX, ARENA_H / 2 - closestY) >= START_CLEAR_RADIUS;
}

function overlapsStream(obstacle: Pick<BonkObstacle, 'x' | 'y' | 'w' | 'h'>): boolean {
  return obstacle.x < BONK_STREAM.x1 && obstacle.x + obstacle.w > BONK_STREAM.x0
    && obstacle.y < BONK_STREAM.y1 && obstacle.y + obstacle.h > BONK_STREAM.y0;
}

/** A água reduz o passo fora da ponte; o piso dela é transitável e nunca vira uma colisão invisível. */
export function bonkWaterAt(x: number, y: number, obstacles: readonly BonkObstacle[]): boolean {
  const inStream = x >= BONK_STREAM.x0 && x <= BONK_STREAM.x1 && y >= BONK_STREAM.y0 && y <= BONK_STREAM.y1;
  if (!inStream) return false;
  return !obstacles.some((obstacle) => obstacle.kind === 'bridge' && x >= obstacle.x && x <= obstacle.x + obstacle.w && y >= obstacle.y && y <= obstacle.y + obstacle.h);
}

/**
 * Mantém os marcos legíveis (ponte, muralhas e clareira inicial), mas dá a cada
 * seed posições e tamanhos diferentes para árvores, pedras, ruínas e cristais.
 */
export function createBonkObstacles(seed: number): readonly BonkObstacle[] {
  const random = landscapeRng(seed);
  return OBSTACLES.map((base) => {
    if (base.kind === 'bridge') return { ...base };
    const spread = JITTER[base.kind];
    const scale = 0.9 + random() * 0.22;
    const w = Math.max(24, Math.round(base.w * scale));
    const h = Math.max(24, Math.round(base.h * scale));
    const height = Math.max(18, Math.round(base.height * (0.92 + random() * 0.16)));
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = {
        ...base,
        x: clamp(Math.round(base.x + (random() - 0.5) * spread), 0, ARENA_W - w),
        y: clamp(Math.round(base.y + (random() - 0.5) * spread), 0, ARENA_H - h),
        w,
        h,
        height,
      };
      if (keepsStartClear(candidate) && !overlapsStream(candidate)) return candidate;
    }
    return { ...base, w, h, height };
  });
}

/** Cria a arena física; ela usa o mesmo mundo amplo (2880×1920) do Survival. */
export function createBonkPhysics(initialYaw = Math.PI / 2, landscapeSeed = DEFAULT_LANDSCAPE_SEED): BonkPhysics {
  const normalizedSeed = Math.floor(landscapeSeed) >>> 0;
  return {
    z: 0,
    verticalVelocity: 0,
    jumpsUsed: 0,
    grounded: true,
    cameraYaw: initialYaw,
    collisionFlashMs: 0,
    jumpBufferMs: 0,
    landingMs: 0,
    landscapeSeed: normalizedSeed,
    obstacles: createBonkObstacles(normalizedSeed),
  };
}

/**
 * Converte o analógico (tela) em direção no mundo, relativa à câmera: para cima avança para onde a câmera olha,
 * para os lados anda de lado enquanto gira a câmera.
 */
export function bonkInputToWorld(physics: Pick<BonkPhysics, 'cameraYaw'>, dx: number, dy: number): { dx: number; dy: number } {
  const forward = -dy;
  const side = dx;
  const cos = Math.cos(physics.cameraYaw);
  const sin = Math.sin(physics.cameraYaw);
  return { dx: cos * forward - sin * side, dy: sin * forward + cos * side };
}

/** Posição da câmera no mundo (atrás do jogador, na direção oposta ao olhar). */
export function bonkCameraPosition(physics: Pick<BonkPhysics, 'cameraYaw'>, player: Pick<SurvivorPlayer, 'x' | 'y'>): { x: number; y: number } {
  return {
    x: player.x - Math.cos(physics.cameraYaw) * BONK_CAMERA.distance,
    y: player.y - Math.sin(physics.cameraYaw) * BONK_CAMERA.distance,
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

  // Obstáculos podem se sobrepor (o jitter do cenário não evita isso). Empurrar para fora de um pode cair dentro de
  // outro, então repete a resolução até uma passada inteira ficar livre (limite pequeno: não trava o quadro).
  for (let pass = 0; pass < 4; pass += 1) {
    const before = x + y;
    ({ x, y } = pushOutOfObstacles(physics, x, y, radius));
    if (x + y === before) break;
    collided = true;
  }
  return { x: clamp(x, radius, ARENA_W - radius), y: clamp(y, radius, ARENA_H - radius), collided };
}

function pushOutOfObstacles(physics: Pick<BonkPhysics, 'z' | 'obstacles'>, x: number, y: number, radius: number): { x: number; y: number } {
  for (const obstacle of physics.obstacles) {
    // A ponte é chão seguro sobre a água, não uma parede para o círculo do jogador.
    if (obstacle.kind === 'bridge') continue;
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
      if (distance >= radius) continue;
      x = nearestX + (dx / distance) * radius;
      y = nearestY + (dy / distance) * radius;
    } else {
      // Dentro do bloco: sai pela face mais próxima que não caia dentro de outro obstáculo (senão, pela mais próxima).
      const exits = [
        { x: minX, y, d: x - minX },
        { x: maxX, y, d: maxX - x },
        { x, y: minY, d: y - minY },
        { x, y: maxY, d: maxY - y },
      ].sort((a, b) => a.d - b.d);
      const free = exits.find((e) => !insideAnyObstacle(physics, e.x, e.y, radius, obstacle));
      const exit = free ?? exits[0]!;
      x = exit.x;
      y = exit.y;
    }
  }
  return { x, y };
}

/** Se (x, y) está dentro de algum obstáculo alto o bastante para bloquear, contando o raio do jogador (exceto `skip`). */
function insideAnyObstacle(physics: Pick<BonkPhysics, 'z' | 'obstacles'>, x: number, y: number, radius: number, skip: BonkObstacle): boolean {
  return physics.obstacles.some((o) => o !== skip && physics.z <= o.height + radius * 0.35 && x > o.x - radius && x < o.x + o.w + radius && y > o.y - radius && y < o.y + o.h + radius);
}

/**
 * Avança gravidade, colisão e a câmera. `input` é o analógico na tela (o mesmo que foi convertido por
 * `bonkInputToWorld` para mover o jogador): o lado gira a câmera aos poucos, frente e trás não giram, então
 * recuar para fugir de um inimigo mantém a mira da câmera.
 */
export function stepBonkPhysics(
  physics: BonkPhysics,
  player: Pick<SurvivorPlayer, 'x' | 'y' | 'bonkGravityFactor' | 'bonkJumpPower' | 'bonkAirJumps'>,
  from: { x: number; y: number },
  input: { dx: number; dy: number; jump?: boolean },
  dtMs: number,
): void {
  const dt = Math.max(0, Math.min(80, dtMs)) / 1000;
  if (input.jump) physics.jumpBufferMs = BONK_JUMP_BUFFER_MS;
  if (physics.jumpBufferMs > 0) {
    if (tryBonkJump(physics, player)) physics.jumpBufferMs = 0;
    else physics.jumpBufferMs = Math.max(0, physics.jumpBufferMs - dtMs);
  }
  if (Math.hypot(input.dx, input.dy) > 0.04) {
    physics.cameraYaw = normalizeAngle(physics.cameraYaw + clamp(input.dx, -1, 1) * BONK_TURN_RATE * dt);
  }

  const wasAirborne = !physics.grounded;
  physics.verticalVelocity -= BONK_GRAVITY * (player.bonkGravityFactor ?? 1) * dt;
  physics.z += physics.verticalVelocity * dt;
  physics.landingMs = Math.max(0, physics.landingMs - dtMs);
  if (physics.z <= 0) {
    physics.z = 0;
    physics.verticalVelocity = 0;
    physics.grounded = true;
    physics.jumpsUsed = 0;
    if (wasAirborne) physics.landingMs = BONK_LANDING_MS;
    // Salto guardado durante a queda sai no mesmo quadro do pouso.
    if (physics.jumpBufferMs > 0 && tryBonkJump(physics, player)) physics.jumpBufferMs = 0;
  }
  const resolved = resolveBonkPosition(physics, player.x, player.y);
  player.x = resolved.x;
  player.y = resolved.y;
  if (resolved.collided && (Math.abs(player.x - from.x) > 0.01 || Math.abs(player.y - from.y) > 0.01)) physics.collisionFlashMs = 130;
  else physics.collisionFlashMs = Math.max(0, physics.collisionFlashMs - dtMs);
  if (bonkWaterAt(player.x, player.y, physics.obstacles)) {
    // A água rasa continua atravessável, só segura o passo. A ponte não entra nesta regra.
    player.x = from.x + (player.x - from.x) * BONK_WATER_SPEED_FACTOR;
    player.y = from.y + (player.y - from.y) * BONK_WATER_SPEED_FACTOR;
  }
}

/** Projeção perspectiva da câmera em terceira pessoa. Retorna null atrás da câmera ou perto demais. */
export function projectBonkPoint(
  physics: Pick<BonkPhysics, 'cameraYaw'>,
  player: Pick<SurvivorPlayer, 'x' | 'y'>,
  point: { x: number; y: number; z?: number },
  viewport: { width: number; height: number },
): BonkProjection | null {
  const yaw = physics.cameraYaw;
  const camera = bonkCameraPosition(physics, player);
  const dx = point.x - camera.x;
  const dy = point.y - camera.y;
  const depth = dx * Math.cos(yaw) + dy * Math.sin(yaw);
  if (depth <= BONK_CAMERA.near) return null;
  const side = -dx * Math.sin(yaw) + dy * Math.cos(yaw);
  const scale = bonkFocal(viewport) / depth;
  const horizon = viewport.height * BONK_CAMERA.horizonRatio;
  return { x: viewport.width / 2 + side * scale, y: horizon + (BONK_CAMERA.height - (point.z ?? 0)) * scale, scale, depth };
}

/** Distância focal em pixels: acompanha a altura da tela para o jogador ficar no mesmo lugar em qualquer aparelho. */
export function bonkFocal(viewport: { height: number }): number {
  return Math.max(BONK_CAMERA.minFocal, viewport.height * BONK_CAMERA.focalRatio);
}

/** Converte coordenadas locais da câmera em mundo, útil para desenhar o terreno em perspectiva. */
export function bonkCameraLocalToWorld(
  physics: Pick<BonkPhysics, 'cameraYaw'>,
  player: Pick<SurvivorPlayer, 'x' | 'y'>,
  forward: number,
  side: number,
): { x: number; y: number } {
  const yaw = physics.cameraYaw;
  const camera = bonkCameraPosition(physics, player);
  return {
    x: camera.x + forward * Math.cos(yaw) - side * Math.sin(yaw),
    y: camera.y + forward * Math.sin(yaw) + side * Math.cos(yaw),
  };
}
