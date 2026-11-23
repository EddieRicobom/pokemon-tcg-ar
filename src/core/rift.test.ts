import { describe, expect, it } from 'vitest';
import {
  createRiftState, createRiftWorld, riftAttack, riftCapture, riftMove, riftRespawn, riftSanctuary, riftSpawnEnemy,
  riftTile, riftWalkable, RIFT_H, RIFT_SANCTUARY, RIFT_TILE, RIFT_W, stepRift, type RiftEnemy, type RiftEvent,
} from './rift';
let seed = 987654321;
const rng = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

function enemy(overrides: Partial<RiftEnemy> = {}): RiftEnemy {
  return { id: 'e1', dexId: 25, name: 'Pikachu', level: 3, hp: 40, maxHp: 40, x: 0, y: 0, radius: 14, attackMs: 0, boss: false, elite: false, ...overrides };
}

describe('Fenda do Mew', () => {
  it('gera um mapa grande com clareira segura e obstáculos', () => {
    const world = createRiftWorld();
    expect(riftSanctuary(RIFT_SANCTUARY.x * RIFT_TILE + 16, RIFT_SANCTUARY.y * RIFT_TILE + 16)).toBe(true);
    expect(riftWalkable(world, RIFT_SANCTUARY.x * RIFT_TILE + 16, RIFT_SANCTUARY.y * RIFT_TILE + 16)).toBe(true);
    expect(riftTile(world, 22, 52)).toBe(2); // lago
    expect(riftWalkable(world, 22 * RIFT_TILE + 16, 52 * RIFT_TILE + 16)).toBe(false);
    // A estrada ao norte sai da clareira.
    expect(riftTile(world, 60, 50)).toBe(1);
  });

  it('move o treinador e para na borda da água', () => {
    const world = createRiftWorld();
    let edge = { x: 0, y: 0 };
    for (let ty = 0; ty < 90 && !edge.x; ty++) for (let tx = 0; tx < 119; tx++) {
      if (riftWalkable(world, tx * RIFT_TILE + 16, ty * RIFT_TILE + 16) && !riftWalkable(world, (tx + 1) * RIFT_TILE + 16, ty * RIFT_TILE + 16)) {
        edge = { x: tx * RIFT_TILE + 16, y: ty * RIFT_TILE + 16 };
        break;
      }
    }
    expect(edge.x).toBeGreaterThan(0);
    const before = edge.x;
    riftMove(world, edge, 20, 0, 6);
    expect(edge.x).toBe(before);
    expect(riftWalkable(world, edge.x, edge.y)).toBe(true);
  });

  it('sorteia inimigos andáveis, fora da clareira e com nível que sobe', () => {
    const world = createRiftWorld();
    const state = createRiftState();
    state.player.x = 50 * RIFT_TILE;
    state.player.y = 40 * RIFT_TILE;
    const first = riftSpawnEnemy(world, state, rng)!;
    expect(first).not.toBeNull();
    expect(riftWalkable(world, first.x, first.y)).toBe(true);
    expect(riftSanctuary(first.x, first.y)).toBe(false);
    const levels = Array.from({ length: 8 }, () => riftSpawnEnemy(world, state, () => Math.random())!.level);
    expect(Math.max(...levels)).toBeGreaterThan(1);
  });

  it('o golpe corpo a corpo atinge só a frente', () => {
    const state = createRiftState();
    state.player.facing = 0;
    const front = enemy({ x: state.player.x + 50, y: state.player.y });
    const behind = enemy({ id: 'e2', x: state.player.x - 50, y: state.player.y });
    state.enemies = [front, behind];
    const events: RiftEvent[] = [];
    expect(riftAttack(state, events)).toBe(true);
    expect(front.hp).toBeLessThan(40);
    expect(behind.hp).toBe(40);
    expect(events.some((e) => e.kind === 'hit')).toBe(true);
  });

  it('a arma à distância cria projétil e acerta no passo', () => {
    const world = createRiftWorld();
    const state = createRiftState();
    state.player.weapon = 'emissor';
    state.player.facing = 0;
    state.player.x = 60 * RIFT_TILE + 16;
    state.player.y = 60 * RIFT_TILE + 16;
    state.enemies = [enemy({ x: state.player.x + 120, y: state.player.y, hp: 99, maxHp: 99 })];
    expect(riftAttack(state, [])).toBe(true);
    expect(state.projectiles).toHaveLength(1);
    for (let i = 0; i < 12 && state.enemies.length > 0; i++) stepRift(world, state, { moveX: 0, moveY: 0, attack: false, dodge: false }, 50);
    expect(state.enemies[0]?.hp ?? 0).toBeLessThan(99);
  });

  it('captura só abaixo de 35% e gasta a bola', () => {
    const state = createRiftState();
    const weak = enemy({ x: state.player.x + 30, y: state.player.y, hp: 10, maxHp: 100 });
    state.enemies = [weak];
    expect(riftCapture(state, () => 0, [])).toBe(true);
    expect(state.allies).toHaveLength(1);
    expect(state.player.balls).toBe(4);
    state.enemies = [enemy({ id: 'e2', x: state.player.x + 30, y: state.player.y, hp: 80, maxHp: 100 })];
    expect(riftCapture(state, () => 0, [])).toBe(false);
  });

  it('tem biomas decorados e cada tipo respeita a colisão', () => {
    const world = createRiftWorld();
    const find = (type: number): { x: number; y: number } | null => {
      for (let ty = 0; ty < RIFT_H; ty++) for (let tx = 0; tx < RIFT_W; tx++) {
        if (riftTile(world, tx, ty) === type) return { x: tx * RIFT_TILE + 16, y: ty * RIFT_TILE + 16 };
      }
      return null;
    };
    for (const type of [6, 7, 8, 9, 10, 11, 12, 13]) expect(find(type), `tipo ${type}`).not.toBeNull();
    for (const type of [2, 3, 5, 6, 8]) {
      const point = find(type)!;
      expect(riftWalkable(world, point.x, point.y), `bloqueado ${type}`).toBe(false);
    }
    for (const type of [7, 9, 10, 11, 12, 13]) {
      const point = find(type)!;
      expect(riftWalkable(world, point.x, point.y), `andável ${type}`).toBe(true);
    }
    const bridge = { x: 85 * RIFT_TILE + 16, y: 19 * RIFT_TILE + 16 };
    expect(riftTile(world, 85, 19)).toBe(10);
    expect(riftWalkable(world, bridge.x, bridge.y)).toBe(true);
  });

  it('a clareira da Vila é segura e cura o treinador', () => {
    const world = createRiftWorld();
    const state = createRiftState();
    state.player.hp = 50;
    state.enemies = [enemy({ x: state.player.x + 10, y: state.player.y })];
    const events = stepRift(world, state, { moveX: 0, moveY: 0, attack: false, dodge: false }, 1000);
    expect(state.player.hp).toBeGreaterThan(50);
    expect(events.some((e) => e.kind === 'hurt')).toBe(false);
  });

  it('sobe de nível ao derrotar e ressuscita na clareira', () => {
    const state = createRiftState();
    state.player.xp = state.player.xpNext - 1;
    const target = enemy({ x: state.player.x + 40, y: state.player.y, hp: 1, maxHp: 1, level: 1 });
    state.enemies = [target];
    state.player.facing = 0;
    const events: RiftEvent[] = [];
    riftAttack(state, events);
    expect(state.enemies).toHaveLength(0);
    expect(state.player.level).toBe(2);
    expect(events.some((e) => e.kind === 'level')).toBe(true);
    state.dead = true;
    state.player.hp = 0;
    riftRespawn(state);
    expect(state.dead).toBe(false);
    expect(state.player.hp).toBe(state.player.maxHp);
    expect(riftSanctuary(state.player.x, state.player.y)).toBe(true);
  });
});
