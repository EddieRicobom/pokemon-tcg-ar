import { seededRng } from './battle';
import type { Rng } from './battle';

/**
 * Motor puro do modo Sobrevivência (Zona de Sobrevivência, dentro da Vila): você anda pela arena, seu Pokémon ataca
 * sozinho quem estiver mais perto, orbes de XP derrubados pelos inimigos sobem de nível e abrem a escolha de um
 * upgrade, as ondas ficam mais difíceis com o tempo e um chefe aparece de tempos em tempos. Espelha o LAÇO do
 * https://github.com/JayElDragon/poke-survivor (e do PokéSurvivor original) — andar, autoataque, XP, upgrades,
 * ondas, chefes — com números e upgrades próprios, não um port do GDScript; nada do sistema de gacha, missões,
 * 130 conquistas ou fendas de lendários de lá está aqui. Só a lógica; desenho e sprites ficam em `village/`.
 *
 * Sem DOM: funciona em `happy-dom`/`vitest` (ver docs/TESTING.md) e é determinístico com `seededRng`.
 */

export const ARENA_W = 960;
export const ARENA_H = 640;
export const PLAYER_RADIUS = 14;
export const PICKUP_RADIUS = 46;
/** Margem fora da arena onde os inimigos nascem (entram andando, nunca "aparecem" em cima de você). */
const SPAWN_MARGIN = 48;

export interface SurvivorPlayer {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  level: number;
  xp: number;
  xpToNext: number;
  attackDamage: number;
  attackRange: number;
  attackCooldownMs: number;
  attackTimerMs: number;
  projectileSpeed: number;
  /** Quantos inimigos extras um projétil atravessa antes de sumir. */
  pierce: number;
  /** Projéteis disparados por rajada (em leque, a partir de 2). */
  shots: number;
  /** Janela de invencibilidade após levar dano (ms restantes). */
  invulnMs: number;
  /** -1 olhando para a esquerda, 1 para a direita (para virar o sprite). */
  facing: -1 | 1;
  /** Alcance para coletar orbe de XP ao passar perto (sobe com o upgrade "Ímã de XP"). */
  pickupRadius: number;
}

export interface SurvivorEnemy {
  id: number;
  /** Índice da espécie no elenco desta corrida (ver `kindCount` em `createSurvivorState`); chefes usam `kindCount`. */
  kind: number;
  boss: boolean;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  radius: number;
  /** Ms restantes do "flash" de ter sido atingido (só para o desenho). */
  hitFlashMs: number;
}

export interface SurvivorProjectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  pierce: number;
  lifeMs: number;
  /** Inimigos já atingidos por este projétil: atravessar não pode acertar o mesmo de novo a cada quadro. */
  hit: number[];
}

export interface SurvivorOrb {
  id: number;
  x: number;
  y: number;
  value: number;
}

export interface SurvivorUpgradeOption {
  id: string;
  name: string;
  description: string;
}

export interface SurvivorState {
  rng: Rng;
  elapsedMs: number;
  player: SurvivorPlayer;
  enemies: SurvivorEnemy[];
  projectiles: SurvivorProjectile[];
  orbs: SurvivorOrb[];
  kills: number;
  wave: number;
  spawnAccumMs: number;
  nextBossAtMs: number;
  /** Quantas espécies "comuns" existem no elenco desta corrida (chefes usam o índice `kindCount`). */
  kindCount: number;
  over: boolean;
  /** Não-nulo pausa o avanço (ver `stepSurvivor`): espera `applyUpgrade`. */
  pendingUpgrade: SurvivorUpgradeOption[] | null;
  /** Níveis ganhos que ainda vão virar escolha de upgrade (subir 2 níveis de uma vez dá 2 escolhas, uma depois da outra). */
  upgradesOwed: number;
  nextId: number;
}

export interface SurvivorInput {
  /** Vetor de direção do analógico/arraste; não precisa estar normalizado (0,0 = parado). */
  dx: number;
  dy: number;
}

export interface SurvivorSummary {
  survivedMs: number;
  level: number;
  kills: number;
  wave: number;
}

export type SurvivorEvent =
  | { type: 'levelup'; level: number }
  | { type: 'bossSpawn' }
  | { type: 'gameover'; summary: SurvivorSummary };

export interface SurvivorUpgrade {
  id: string;
  name: string;
  description: string;
  apply: (p: SurvivorPlayer) => void;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export const SURVIVOR_UPGRADES: readonly SurvivorUpgrade[] = [
  { id: 'power', name: 'Golpe mais forte', description: '+20% de dano no ataque.', apply: (p) => { p.attackDamage = round1(p.attackDamage * 1.2); } },
  { id: 'haste', name: 'Recarga menor', description: '-15% no tempo entre ataques.', apply: (p) => { p.attackCooldownMs = Math.max(120, Math.round(p.attackCooldownMs * 0.85)); } },
  { id: 'legs', name: 'Passo mais rápido', description: '+12% de velocidade ao andar.', apply: (p) => { p.speed = round1(p.speed * 1.12); } },
  { id: 'vigor', name: 'Mais vida', description: '+25 no HP máximo (e cura na hora).', apply: (p) => { p.maxHp += 25; p.hp = p.maxHp; } },
  { id: 'range', name: 'Alcance maior', description: '+20% no alcance do golpe.', apply: (p) => { p.attackRange = round1(p.attackRange * 1.2); } },
  { id: 'multishot', name: 'Disparo múltiplo', description: '+1 projétil por disparo, em leque.', apply: (p) => { p.shots += 1; } },
  { id: 'pierce', name: 'Golpe perfurante', description: 'O golpe atravessa +1 inimigo antes de sumir.', apply: (p) => { p.pierce += 1; } },
  { id: 'magnet', name: 'Ímã de XP', description: '+30% no alcance para coletar orbes de XP.', apply: (p) => { p.pickupRadius = round1(p.pickupRadius * 1.3); } },
] as const;

export function xpForLevel(level: number): number {
  return Math.round(18 + level * 12);
}

export interface CreateSurvivorOptions {
  /** Quantas espécies "comuns" o elenco desta corrida tem (o chefe usa o índice seguinte). Mínimo 1. */
  kindCount: number;
  player?: Partial<SurvivorPlayer>;
}

export function createSurvivorState(seed: number, options: CreateSurvivorOptions): SurvivorState {
  const player: SurvivorPlayer = {
    x: ARENA_W / 2,
    y: ARENA_H / 2,
    hp: 100,
    maxHp: 100,
    speed: 150,
    level: 1,
    xp: 0,
    xpToNext: xpForLevel(1),
    attackDamage: 9,
    attackRange: 170,
    attackCooldownMs: 650,
    attackTimerMs: 0,
    projectileSpeed: 360,
    pierce: 0,
    shots: 1,
    invulnMs: 0,
    facing: 1,
    pickupRadius: PICKUP_RADIUS,
    ...options.player,
  };
  return {
    rng: seededRng(seed),
    elapsedMs: 0,
    player,
    enemies: [],
    projectiles: [],
    orbs: [],
    kills: 0,
    wave: 1,
    spawnAccumMs: 0,
    nextBossAtMs: 60_000,
    kindCount: Math.max(1, Math.floor(options.kindCount)),
    over: false,
    pendingUpgrade: null,
    upgradesOwed: 0,
    nextId: 1,
  };
}

/** Intervalo entre nascimentos (ms): começa folgado e aperta com o tempo e a onda, nunca abaixo do piso. */
function spawnIntervalMs(state: SurvivorState): number {
  const t = state.elapsedMs / 1000;
  return Math.max(220, 1400 - t * 9 - state.wave * 25);
}

function spawnPoint(rng: Rng): { x: number; y: number } {
  const side = Math.floor(rng() * 4);
  if (side === 0) return { x: rng() * ARENA_W, y: -SPAWN_MARGIN };
  if (side === 1) return { x: ARENA_W + SPAWN_MARGIN, y: rng() * ARENA_H };
  if (side === 2) return { x: rng() * ARENA_W, y: ARENA_H + SPAWN_MARGIN };
  return { x: -SPAWN_MARGIN, y: rng() * ARENA_H };
}

function spawnEnemy(state: SurvivorState, boss: boolean): void {
  const { x, y } = spawnPoint(state.rng);
  const t = state.elapsedMs / 1000;
  if (boss) {
    state.enemies.push({
      id: state.nextId++,
      kind: state.kindCount,
      boss: true,
      x,
      y,
      hp: 260 + state.wave * 60,
      maxHp: 260 + state.wave * 60,
      speed: 70,
      damage: 16 + state.wave * 2,
      radius: 28,
      hitFlashMs: 0,
    });
    return;
  }
  const hp = 14 + Math.floor(t / 20) * 4 + state.wave * 2;
  state.enemies.push({
    id: state.nextId++,
    kind: Math.floor(state.rng() * state.kindCount),
    boss: false,
    x,
    y,
    hp,
    maxHp: hp,
    speed: 55 + state.rng() * 25,
    damage: 6 + Math.floor(t / 40) * 2,
    radius: 13,
    hitFlashMs: 0,
  });
}

export function rollUpgrades(rng: Rng, count = 3): SurvivorUpgradeOption[] {
  const pool = [...SURVIVOR_UPGRADES];
  const picked: SurvivorUpgradeOption[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    const u = pool.splice(idx, 1)[0]!;
    picked.push({ id: u.id, name: u.name, description: u.description });
  }
  return picked;
}

function levelUp(state: SurvivorState, events: SurvivorEvent[]): void {
  while (state.player.xp >= state.player.xpToNext) {
    state.player.xp -= state.player.xpToNext;
    state.player.level += 1;
    state.player.xpToNext = xpForLevel(state.player.level);
    state.upgradesOwed += 1;
    events.push({ type: 'levelup', level: state.player.level });
  }
  offerOwedUpgrade(state);
}

/** Abre a próxima escolha de upgrade devida, se não houver uma aberta. */
function offerOwedUpgrade(state: SurvivorState): void {
  if (state.pendingUpgrade || state.upgradesOwed <= 0) return;
  state.upgradesOwed -= 1;
  state.pendingUpgrade = rollUpgrades(state.rng);
}

/**
 * Aplica o upgrade escolhido e libera o jogo (ver `pendingUpgrade`). `id` fora do catálogo não faz nada. Se ainda
 * houver níveis devidos (subiu mais de um de uma vez), a próxima escolha abre em seguida.
 */
export function applyUpgrade(state: SurvivorState, id: string): void {
  const upgrade = SURVIVOR_UPGRADES.find((u) => u.id === id);
  if (upgrade) upgrade.apply(state.player);
  state.pendingUpgrade = null;
  offerOwedUpgrade(state);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Avança `dtMs` de jogo. Não faz nada (devolve `[]`) se `state.over` ou se há um upgrade pendente — quem chama
 * (o componente Vue) deve pausar o laço de desenho/tempo nesses casos e só retomar depois de `applyUpgrade`.
 */
export function stepSurvivor(state: SurvivorState, input: SurvivorInput, dtMs: number): SurvivorEvent[] {
  const events: SurvivorEvent[] = [];
  if (state.over || state.pendingUpgrade) return events;
  const dt = dtMs / 1000;
  state.elapsedMs += dtMs;
  const p = state.player;

  // Movimento do jogador, com a arena como cerca.
  const len = Math.hypot(input.dx, input.dy);
  if (len > 0.001) {
    const ux = input.dx / len;
    const uy = input.dy / len;
    p.x = clamp(p.x + ux * p.speed * dt, PLAYER_RADIUS, ARENA_W - PLAYER_RADIUS);
    p.y = clamp(p.y + uy * p.speed * dt, PLAYER_RADIUS, ARENA_H - PLAYER_RADIUS);
    if (Math.abs(ux) > 0.01) p.facing = ux < 0 ? -1 : 1;
  }
  if (p.invulnMs > 0) p.invulnMs = Math.max(0, p.invulnMs - dtMs);

  // Nascimento de inimigos (onda cresce com o tempo) e do chefe periódico.
  state.wave = 1 + Math.floor(state.elapsedMs / 30_000);
  state.spawnAccumMs += dtMs;
  const interval = spawnIntervalMs(state);
  while (state.spawnAccumMs >= interval) {
    state.spawnAccumMs -= interval;
    spawnEnemy(state, false);
  }
  if (state.elapsedMs >= state.nextBossAtMs) {
    state.nextBossAtMs += 75_000;
    spawnEnemy(state, true);
    events.push({ type: 'bossSpawn' });
  }

  // Inimigos perseguem o jogador e batem de perto.
  for (const e of state.enemies) {
    if (e.hitFlashMs > 0) e.hitFlashMs = Math.max(0, e.hitFlashMs - dtMs);
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.x += (dx / d) * e.speed * dt;
    e.y += (dy / d) * e.speed * dt;
    if (d < PLAYER_RADIUS + e.radius && p.invulnMs <= 0) {
      p.hp = Math.max(0, p.hp - e.damage);
      p.invulnMs = 500;
    }
  }

  // Autoataque: mira o inimigo mais próximo dentro do alcance.
  p.attackTimerMs = Math.max(0, p.attackTimerMs - dtMs);
  if (p.attackTimerMs <= 0) {
    let nearest: SurvivorEnemy | null = null;
    let nearestD = p.attackRange;
    for (const e of state.enemies) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d <= nearestD) {
        nearest = e;
        nearestD = d;
      }
    }
    if (nearest) {
      const baseAngle = Math.atan2(nearest.y - p.y, nearest.x - p.x);
      const spread = 0.26;
      for (let i = 0; i < p.shots; i++) {
        const offset = p.shots === 1 ? 0 : (i - (p.shots - 1) / 2) * spread;
        const angle = baseAngle + offset;
        state.projectiles.push({
          id: state.nextId++,
          x: p.x,
          y: p.y,
          vx: Math.cos(angle) * p.projectileSpeed,
          vy: Math.sin(angle) * p.projectileSpeed,
          damage: p.attackDamage,
          pierce: p.pierce,
          lifeMs: 1600,
          hit: [],
        });
      }
      p.attackTimerMs = p.attackCooldownMs;
    }
  }

  // Projéteis: avançam, somem com o tempo/fora da arena, acertam o inimigo mais próximo no caminho.
  state.projectiles = state.projectiles.filter((proj) => {
    proj.x += proj.vx * dt;
    proj.y += proj.vy * dt;
    proj.lifeMs -= dtMs;
    if (proj.lifeMs <= 0) return false;
    if (proj.x < -40 || proj.x > ARENA_W + 40 || proj.y < -40 || proj.y > ARENA_H + 40) return false;
    for (const e of state.enemies) {
      if (proj.hit.includes(e.id)) continue;
      if (Math.hypot(e.x - proj.x, e.y - proj.y) < e.radius + 5) {
        e.hp -= proj.damage;
        e.hitFlashMs = 90;
        proj.hit.push(e.id);
        if (proj.pierce <= 0) return false;
        proj.pierce -= 1;
        break;
      }
    }
    return true;
  });

  // Inimigos derrotados viram orbe de XP e contam na pontuação.
  const dead = state.enemies.filter((e) => e.hp <= 0);
  if (dead.length > 0) {
    state.enemies = state.enemies.filter((e) => e.hp > 0);
    state.kills += dead.length;
    for (const e of dead) {
      state.orbs.push({ id: state.nextId++, x: e.x, y: e.y, value: e.boss ? 40 : 6 });
    }
  }

  // Coleta de orbes de XP (e nível, se passou da marca).
  state.orbs = state.orbs.filter((orb) => {
    if (Math.hypot(orb.x - p.x, orb.y - p.y) <= p.pickupRadius) {
      p.xp += orb.value;
      return false;
    }
    return true;
  });
  levelUp(state, events);

  if (p.hp <= 0 && !state.over) {
    state.over = true;
    events.push({
      type: 'gameover',
      summary: { survivedMs: state.elapsedMs, level: p.level, kills: state.kills, wave: state.wave },
    });
  }

  return events;
}
