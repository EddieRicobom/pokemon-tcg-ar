import { describe, expect, it } from 'vitest';
import { seededRng } from './battle';
import { evaluate, planEnemyShot } from './pin-ai';
import { formationSlots } from './pin-formations';
import {
  aboutToFall, advanceRound, ARENA_RADIUS, buildWalls, createWorld, edgeRisk, exitDirection, gapCenters, nearFalls, onWall, pinCoinReward, PIN_COMBO_COINS,
  previewPath, SHRINK_AFTER_ROUND, stepWorld, WALL_COUNT,
} from './pins';
import type { PinSpec, PinWorld, Side } from './pins';

const spec = (id: string): PinSpec => ({ id, name: id, types: ['normal'], stats: null, weightKg: null });

function arena(seed = 3, mine = 1, enemy = 1): PinWorld {
  const specs = {
    mine: Array.from({ length: mine }, (_, i) => spec(`m${i}`)),
    enemy: Array.from({ length: enemy }, (_, i) => spec(`e${i}`)),
  };
  return createWorld(specs, seededRng(seed), { walls: true, marks: false, formations: { 0: 'linha', 1: 'muralha' } });
}

const settle = (world: PinWorld, seconds = 5): void => {
  for (let t = 0; t < seconds; t += 1 / 120) stepWorld(world, 1 / 120);
};

describe('paredes e aberturas do Pin Mode', () => {
  it('alterna 4 paredes e 4 aberturas fechando o círculo, e a posição muda com o sorteio', () => {
    const walls = buildWalls(seededRng(1));
    expect(walls).toHaveLength(WALL_COUNT);
    let covered = 0;
    for (const wall of walls) {
      expect(wall.to).toBeGreaterThan(wall.from);
      covered += wall.to - wall.from;
    }
    // Sobram de 104° a 152° para as quatro aberturas.
    const open = 360 - (covered * 180) / Math.PI;
    expect(open).toBeGreaterThanOrEqual(103.9);
    expect(open).toBeLessThanOrEqual(152.1);
    expect(buildWalls(seededRng(2))[0]!.from).not.toBeCloseTo(walls[0]!.from, 3);
    expect(buildWalls(seededRng(1))).toEqual(walls);
  });

  it('o pin rebate na parede e não sai da arena', () => {
    const world = arena();
    const pin = world.pins[0]!;
    const wall = world.walls![0]!;
    const angle = (wall.from + wall.to) / 2;
    pin.x = Math.cos(angle) * (ARENA_RADIUS - 100);
    pin.y = Math.sin(angle) * (ARENA_RADIUS - 100);
    pin.vx = Math.cos(angle) * 1800;
    pin.vy = Math.sin(angle) * 1800;
    const events = [];
    for (let t = 0; t < 0.5; t += 1 / 120) events.push(...stepWorld(world, 1 / 120));
    expect(events.some((e) => e.type === 'wall')).toBe(true);
    expect(events.some((e) => e.type === 'out')).toBe(false);
    settle(world);
    expect(pin.alive).toBe(true);
    expect(Math.hypot(pin.x, pin.y)).toBeLessThanOrEqual(ARENA_RADIUS);
  });

  it('pela abertura o pin cai', () => {
    const world = arena();
    const pin = world.pins[0]!;
    const gap = gapCenters(world)[1]!;
    pin.x = gap.x * 0.9;
    pin.y = gap.y * 0.9;
    const d = Math.hypot(gap.x, gap.y);
    pin.vx = (gap.x / d) * 1500;
    pin.vy = (gap.y / d) * 1500;
    expect(aboutToFall(world, pin, 0.2)).toBe(true);
    const events = [];
    for (let t = 0; t < 1; t += 1 / 120) events.push(...stepWorld(world, 1 / 120));
    expect(events.some((e) => e.type === 'out')).toBe(true);
    settle(world, 1);
    expect(pin.alive).toBe(false);
  });

  it('avisa quem parou à beira da abertura, e não quem está encostado na parede', () => {
    const world = arena();
    const pin = world.pins[0]!;
    const gap = gapCenters(world)[0]!;
    pin.x = gap.x * 0.97;
    pin.y = gap.y * 0.97;
    expect(nearFalls(world).map((p) => p.id)).toContain(pin.id);
    const wall = world.walls![1]!;
    const angle = (wall.from + wall.to) / 2;
    pin.x = Math.cos(angle) * (ARENA_RADIUS - 60);
    pin.y = Math.sin(angle) * (ARENA_RADIUS - 60);
    expect(onWall(world, angle)).toBe(true);
    expect(nearFalls(world)).toHaveLength(0);
  });

  it('a borda que avança empurra para dentro quem está na frente de uma parede', () => {
    const world = arena();
    world.shrinking = true;
    world.round = SHRINK_AFTER_ROUND;
    const pin = world.pins[0]!;
    const wall = world.walls![0]!;
    const middle = (wall.from + wall.to) / 2;
    pin.x = Math.cos(middle) * (ARENA_RADIUS - 40);
    pin.y = Math.sin(middle) * (ARENA_RADIUS - 40);
    expect(advanceRound(world).some((e) => e.type === 'out')).toBe(false);
    expect(pin.fall).toBe(0);
    expect(Math.hypot(pin.x, pin.y)).toBeLessThanOrEqual(world.limit! - pin.r + 1e-6);
  });

  it('o risco e a direção de saída apontam para a abertura mais perto', () => {
    const world = arena();
    const gap = gapCenters(world)[0]!;
    const near = { x: gap.x * 0.9, y: gap.y * 0.9, r: 30 };
    const out = exitDirection(world, near.x, near.y);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(1, 5);
    expect(out.x * (gap.x - near.x) + out.y * (gap.y - near.y)).toBeGreaterThan(0);
    expect(edgeRisk(world, near)).toBeGreaterThan(edgeRisk(world, { x: 0, y: 0, r: 30 }));
  });

  it('a prévia da mira conta as tabelas', () => {
    const world = arena();
    const pin = world.pins[0]!;
    const wall = world.walls![0]!;
    const angle = (wall.from + wall.to) / 2;
    pin.x = Math.cos(angle) * (ARENA_RADIUS - 200);
    pin.y = Math.sin(angle) * (ARENA_RADIUS - 200);
    const { bounces, falls } = previewPath(world, pin, { dirX: Math.cos(angle), dirY: Math.sin(angle), power: 1 });
    expect(bounces).toBeGreaterThan(0);
    expect(falls).toBe(false);
  });
});

describe('formações em campo', () => {
  it('cada lado começa na formação escolhida, um de frente para o outro', () => {
    const world = arena(5, 3, 3);
    const mine = world.pins.filter((p) => p.side === (0 as Side));
    const theirs = world.pins.filter((p) => p.side === (1 as Side));
    formationSlots('linha', 3).forEach((slot, i) => {
      expect(mine[i]!.x).toBeCloseTo(slot.x * ARENA_RADIUS);
      expect(mine[i]!.y).toBeCloseTo(slot.y * ARENA_RADIUS);
    });
    formationSlots('muralha', 3).forEach((slot, i) => {
      expect(theirs[i]!.y).toBeCloseTo(-slot.y * ARENA_RADIUS);
    });
  });
});

describe('estilos do adversário', () => {
  it('o mesmo resultado vale coisas diferentes para cada estilo', () => {
    const before = arena(7, 2, 2);
    const after = arena(7, 2, 2);
    after.pins[0]!.alive = false;
    expect(evaluate(before, after, 1, 'agressivo')).toBeGreaterThan(evaluate(before, after, 1, 'defensivo'));
    const hurt = arena(7, 2, 2);
    hurt.pins[2]!.alive = false;
    expect(evaluate(before, hurt, 1, 'defensivo')).toBeLessThan(evaluate(before, hurt, 1, 'agressivo'));
  });

  it('com paredes, o adversário simulado continua achando jogada', () => {
    const world = arena(9, 2, 2);
    expect(planEnemyShot(world, seededRng(1), 'normal', 'cacador')).not.toBeNull();
    expect(planEnemyShot(world, seededRng(1), 'facil')).not.toBeNull();
  });
});

describe('combos', () => {
  it('cada combo vale moedas na vitória, com teto, e nada na derrota', () => {
    const base = pinCoinReward(true, 'normal', 50, 3, true, 2, 0);
    expect(pinCoinReward(true, 'normal', 50, 3, true, 2, 2)).toBe(base + 2 * PIN_COMBO_COINS);
    expect(pinCoinReward(true, 'normal', 50, 3, true, 2, 99)).toBe(base + 4 * PIN_COMBO_COINS);
    expect(pinCoinReward(false, 'normal', 50, 3, true, 2, 2)).toBe(pinCoinReward(false, 'normal', 50, 3, true, 2, 0));
  });
});
