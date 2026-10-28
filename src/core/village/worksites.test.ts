import { describe, expect, it } from 'vitest';
import { FarmSession, FARM_RULES, normalizeFarm, stepFarmWorker } from './farm';
import type { FarmWorker } from './farm';
import { emptyVillage, harvest } from './life';
import { makeWalker } from './actors';
import { generateVillage, isWalkable, keyPoints, reachableFrom, tileAt } from './map';
import { WORK_AREAS, WORK_SITES } from './town-layout';
import { normalizeResidentProgress } from './community';
import { WEST } from './west';

const now = new Date(2026, 9, 19, 12).getTime();
const free = () => false;
const rng = () => .5;

describe('postos de trabalho e trajetos reais', () => {
  it('prefere pescar junto ao píer e não inventa entrega quando a linha volta vazia', () => {
    const map = generateVillage(20261014), state = emptyVillage(20261014, map.spawn), session = new FarmSession();
    const worker: FarmWorker = { id: 'angler', types: ['water'], ...map.spawn, available: true };
    session.tick(state, map, [worker], now, () => 0, free);
    const task = session.tasks[0]!;
    expect(task.kind).toBe('fish');
    expect(tileAt(map, task.stand.x, task.stand.y)).toBe('pier');
    Object.assign(worker, task.stand);
    session.tick(state, map, [worker], now + 100, () => 0, free);
    session.tick(state, map, [worker], now + FARM_RULES.workMs + 100, () => 0, free);
    expect(state.fishing.casts).toBe(1);
    expect(state.farm.history[0]?.message).toContain('Nada mordeu');
    expect(state.farm.history[0]?.message).not.toContain('Os itens foram');
    expect(state.inventory.peixe ?? 0).toBe(0);
  });

  it('oferece mineração, madeira e pesca mesmo havendo sementes para plantar', () => {
    const map = generateVillage(9), state = emptyVillage(9, map.spawn), session = new FarmSession();
    state.farm.seeds['sem-tomate'] = 20;
    const workers: FarmWorker[] = [
      { id: 'a', types: ['rock'], ...map.spawn, available: true },
      { id: 'b', types: ['grass'], ...map.spawn, available: true },
      { id: 'c', types: ['water'], ...map.spawn, available: true },
    ];
    state.community.residents.b = normalizeResidentProgress({ interests: ['madeireira'] });
    state.community.residents.c = normalizeResidentProgress({ interests: ['pesca'] });
    session.tick(state, map, workers, now, rng, free);
    expect(session.tasks.map((task) => task.kind)).toEqual(['mine', 'lumber', 'fish']);
    expect(state.farm.seeds['sem-tomate']).toBe(20);
  });

  it('faz moradores sem afinidade por recursos rodarem entre os postos', () => {
    const map = generateVillage(9), state = emptyVillage(9, map.spawn), session = new FarmSession();
    state.farm.seeds['sem-tomate'] = 20;
    const workers: FarmWorker[] = ['a', 'b', 'c'].map((id) => ({ id, types: ['normal'], ...map.spawn, available: true }));
    session.tick(state, map, workers, now, rng, free);
    expect(session.tasks.map((task) => task.kind)).toEqual(['plant', 'plant', 'mine']);
  });

  it('um morador sem tarefa alcançável não impede a escolha do próximo', () => {
    const map = generateVillage(9), state = emptyVillage(9, map.spawn), session = new FarmSession();
    const workers: FarmWorker[] = [
      { id: 'a', types: ['rock'], ...map.spawn, available: true },
      { id: 'b', types: ['rock'], x: WEST + 7, y: 68, available: true },
    ];
    session.tick(state, map, workers, now, rng, () => true);
    expect(session.tasks).toHaveLength(1);
    expect(session.tasks[0]?.residentId).toBe('b');
  });

  it('prefere o píer para pescar quando há um posto livre', () => {
    const map = generateVillage(42), state = emptyVillage(42, map.spawn), session = new FarmSession();
    session.tick(state, map, [{ id: 'fisher', types: ['water'], ...map.spawn, available: true }], now, rng, free);
    const task = session.tasks[0]!;
    expect(task.kind).toBe('fish');
    expect(tileAt(map, task.stand.x, task.stand.y)).toBe('pier');
  });

  it.each([1, 7, 42, 99, 20261014])('semente %i: portas, canteiros, placas e recursos de trabalho têm acesso', (seed) => {
    const map = generateVillage(seed), seen = reachableFrom(map, map.spawn.x, map.spawn.y);
    const reachable = (x: number, y: number) => isWalkable(map, x, y) && seen[y * map.w + x] === 1;
    const adjacent = (x: number, y: number) => [[x, y + 1], [x - 1, y], [x + 1, y], [x, y - 1]].some(([nx, ny]) => reachable(nx!, ny!));
    for (const point of keyPoints(map)) expect(reachable(point.x, point.y), `${point.x},${point.y}`).toBe(true);
    for (const decor of map.decor.filter((item) => item.kind.endsWith('-board') || item.kind === 'seed-box')) {
      expect(Array.from({ length: decor.w }, (_, x) => x + decor.x).some((x) => adjacent(x, decor.y)), decor.kind).toBe(true);
    }
    for (const [area, tile] of [[WORK_AREAS.mine, 'rock'], [WORK_AREAS.lumber, 'tree']] as const) {
      let nodes = 0;
      for (let y = area.y; y < area.y + area.h; y++) for (let x = area.x; x < area.x + area.w; x++) if (tileAt(map, x, y) === tile) { nodes++; expect(adjacent(x, y), `${tile} ${x},${y}`).toBe(true); }
      expect(nodes).toBeGreaterThan(0);
    }
    expect(WORK_SITES.every((site) => reachable(site.visit.x, site.visit.y))).toBe(true);
  });

  it.each(['mine', 'lumber', 'fish'] as const)('%s: anda da praça até o recurso, trabalha e registra só o loot realmente obtido', (kind) => {
    const map = generateVillage(42), state = emptyVillage(42, map.spawn), session = new FarmSession();
    const worker: FarmWorker = { id: kind, types: kind === 'mine' ? ['rock'] : kind === 'lumber' ? ['grass'] : ['water'], ...map.spawn, available: true };
    const walker = makeWalker(kind, worker.x, worker.y, 2.6);
    for (let elapsed = 0; elapsed < FARM_RULES.travelMs && !state.farm.history.length; elapsed += 100) {
      Object.assign(worker, { x: walker.x, y: walker.y });
      if (elapsed % 1000 === 0) session.tick(state, map, [worker], now + elapsed, rng, free);
      const task = session.tasks[0];
      if (task) { expect(task.kind).toBe(kind); stepFarmWorker(walker, task, .1, map, free); }
    }
    expect(walker.steps).toBeGreaterThan(20);
    expect(state.farm.history).toHaveLength(1);
    expect(state.farm.history[0]?.kind).toBe(kind);
    expect(normalizeFarm(JSON.parse(JSON.stringify(state.farm)))).toEqual(state.farm);
    expect(state.inventory[kind === 'mine' ? 'pedra' : kind === 'lumber' ? 'madeira' : 'peixe']).toBeGreaterThan(0);
  });

  it('não duplica coleta manual nem consome o recurso se a mochila encher durante o trajeto', () => {
    const map = generateVillage(9), state = emptyVillage(9, map.spawn), session = new FarmSession();
    const worker: FarmWorker = { id: 'miner', types: ['rock'], ...map.spawn, available: true };
    session.tick(state, map, [worker], now, rng, free);
    const task = session.tasks[0]!;
    Object.assign(worker, task.stand);
    session.tick(state, map, [worker], now + 100, rng, free);
    state.inventory.pedra = 999;
    session.tick(state, map, [worker], now + FARM_RULES.workMs + 100, rng, free);
    expect(state.harvested[`${task.x},${task.y}`]).toBeUndefined();
    expect(state.farm.history).toHaveLength(0);
    state.inventory.pedra = 0;
    session.tick(state, map, [worker], now + 31_000, rng, free);
    const next = session.tasks[0]!;
    Object.assign(worker, next.stand);
    session.tick(state, map, [worker], now + 32_000, rng, free);
    harvest(state, map, next.x, next.y, '2026-10-19', rng);
    const inventory = { ...state.inventory };
    session.tick(state, map, [worker], now + 42_000, rng, free);
    expect(state.inventory).toEqual(inventory);
    expect(state.farm.history).toHaveLength(0);
  });
});
