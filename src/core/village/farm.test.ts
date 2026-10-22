import { describe, expect, it } from 'vitest';
import { emptyVillage, normalizeVillage, tickCrops } from './life';
import { generateVillage, isWalkable, reachableFrom, tileAt } from './map';
import { emptyFarm, FarmSession, FARM_RULES, farmTaskProgress, normalizeFarm, stepFarmWorker, transferFarmSeeds } from './farm';
import type { FarmWorker } from './farm';
import { normalizeResidentProgress } from './community';
import { itemDef } from './catalog';
import { makeWalker } from './actors';

const map = generateVillage(9);
const free = () => false;
const rng = () => 0.4;
function setup() {
  const state = emptyVillage(9, map.spawn);
  state.farm.seeds['sem-tomate'] = 5;
  const worker: FarmWorker = { id: 'digital:bulbasaur', types: ['normal'], x: 45, y: 41, available: true };
  return { state, worker, session: new FarmSession() };
}

describe('caixa de sementes e autonomia da fazenda', () => {
  it('resume a tarefa sem ultrapassar 100% nem mostrar trabalho antes da chegada', () => {
    expect(farmTaskProgress({ workingSince: null }, 10_000)).toEqual({ phase: 'caminho', percent: 0 });
    expect(farmTaskProgress({ workingSince: 10_000 }, 14_999)).toEqual({ phase: 'trabalho', percent: 50 });
    expect(farmTaskProgress({ workingSince: 10_000 }, 99_999)).toEqual({ phase: 'trabalho', percent: 100 });
  });

  it('transfere sementes reais nos dois sentidos sem duplicar ou perder no limite', () => {
    const { state } = setup();
    state.inventory['sem-tomate'] = 7;
    state.farm.seeds['sem-tomate'] = 998;
    expect(transferFarmSeeds(state, 'sem-tomate', 7, true)).toBe(1);
    expect(state.inventory['sem-tomate']).toBe(6);
    expect(transferFarmSeeds(state, 'sem-tomate', 999, false)).toBe(993);
    expect(state.inventory['sem-tomate']).toBe(999);
    expect(state.farm.seeds['sem-tomate']).toBe(6);
    for (const qty of [-1, 0, 0.5, NaN, Infinity]) expect(transferFarmSeeds(state, 'sem-tomate', qty, true)).toBe(0);
    state.inventory.oran = 10;
    expect(transferFarmSeeds(state, 'oran', 1, true)).toBe(0);
  });

  it('migra saves antigos e preserva a caixa, horta e perfis numa ida e volta', () => {
    const { state } = setup();
    state.inventory.oran = 3;
    state.farm.history.push({ residentId: 'digital:bulbasaur', at: 1000, message: 'Regou um canteiro.' });
    const saved = JSON.parse(JSON.stringify(state));
    expect(normalizeVillage(saved, 9, map.spawn)).toEqual(state);
    delete saved.farm;
    const migrated = normalizeVillage(saved, 9, map.spawn);
    expect(migrated.farm).toEqual(emptyFarm());
    expect(migrated.inventory.oran).toBe(3);
    expect(normalizeFarm({ seeds: { 'sem-tomate': 2000, oran: 5, 'sem-milho': -2 }, nextDecisionAt: Infinity }).seeds).toEqual({ 'sem-tomate': 999 });
  });

  it('só planta depois de chegar e trabalhar; repetir o tick não repete o gasto', () => {
    const { state, worker, session } = setup();
    session.tick(state, map, [worker], 1000, rng, free);
    const task = session.tasks[0]!;
    expect(task.kind).toBe('plant');
    session.tick(state, map, [worker], 20_000, rng, free);
    expect(state.crops).toHaveLength(0);
    Object.assign(worker, task.stand);
    session.tick(state, map, [worker], 21_000, rng, free);
    session.tick(state, map, [worker], 31_000, rng, free);
    expect(state.crops).toEqual([{ x: task.x, y: task.y, seed: task.seed, stage: 0, wateredAt: 31_000 }]);
    expect(state.farm.seeds['sem-tomate']).toBe(4);
    session.tick(state, map, [worker], 31_000, rng, free);
    expect(state.farm.seeds['sem-tomate']).toBe(4);
    expect(state.farm.history).toHaveLength(1);
    expect(state.community.residents[worker.id]?.experience.agricultura).toBe(1);
  });

  it('reserva canteiros e sementes entre até 50 moradores sem ultrapassar o estoque', () => {
    const { state, worker, session } = setup();
    state.farm.seeds['sem-tomate'] = 2;
    const workers = Array.from({ length: 50 }, (_, i) => ({ ...worker, id: `mon:${i}` }));
    session.tick(state, map, [...workers, workers[0]!], 1000, rng, free);
    expect(session.tasks.filter((task) => task.kind === 'plant')).toHaveLength(2);
    expect(session.tasks).toHaveLength(FARM_RULES.workers);
    expect(new Set(session.tasks.map((task) => `${task.x},${task.y}`)).size).toBe(session.tasks.length);
    for (const task of session.tasks) Object.assign(workers.find((entry) => entry.id === task.residentId)!, task.stand);
    session.tick(state, map, workers, 2000, rng, free);
    session.tick(state, map, workers, 12_000, rng, free);
    expect(state.crops).toHaveLength(2);
    expect(state.farm.seeds['sem-tomate'] ?? 0).toBe(0);
  });

  it('retirar sementes durante o trajeto ou sair da Vila não entrega plantio grátis', () => {
    const { state, worker, session } = setup();
    session.tick(state, map, [worker], 1000, rng, free);
    Object.assign(worker, session.tasks[0]!.stand);
    transferFarmSeeds(state, 'sem-tomate', 999, false);
    session.tick(state, map, [worker], 2000, rng, free);
    session.tick(state, map, [worker], 12_000, rng, free);
    expect(state.crops).toHaveLength(0);
    expect(state.inventory['sem-tomate']).toBe(5);
    transferFarmSeeds(state, 'sem-tomate', 5, true);
    session.tick(state, map, [worker], 31_000, rng, free);
    session.cancel();
    expect(session.tasks).toHaveLength(0);
    expect(state.farm.seeds['sem-tomate']).toBe(5);
  });

  it('não trabalha se ocupado, respeita descanso e permite interesse fora do tipo', () => {
    const { state, worker, session } = setup();
    session.tick(state, map, [{ ...worker, available: false }], 1000, rng, free);
    expect(session.tasks).toHaveLength(0);
    state.community.residents[worker.id] = normalizeResidentProgress({ energy: 0 });
    session.tick(state, map, [worker], 31_000, rng, free);
    expect(session.tasks).toHaveLength(0);
    expect(state.community.residents[worker.id]?.energy).toBe(18);
    state.community.residents[worker.id] = normalizeResidentProgress({ energy: 70, interests: ['agricultura'] });
    session.tick(state, map, [{ ...worker, types: ['ghost'] }], 61_000, rng, free);
    expect(session.tasks).toHaveLength(1);
    session.tick(state, map, [{ ...worker, available: false }], 62_000, rng, free);
    expect(session.tasks).toHaveLength(0);
    expect(state.farm.seeds['sem-tomate']).toBe(5);
  });

  it('rega, espera crescimento real e colhe para a mochila sem duplicar', () => {
    const { state, worker } = setup();
    state.farm.seeds = {};
    const growth = itemDef('sem-tomate')!.grows!;
    state.crops.push({ x: 78, y: 48, seed: 'sem-tomate', stage: growth.stages - 1, wateredAt: null });
    const session = new FarmSession();
    session.tick(state, map, [worker], 1000, rng, free);
    expect(session.tasks[0]?.kind).toBe('water');
    Object.assign(worker, session.tasks[0]!.stand);
    session.tick(state, map, [worker], 2000, rng, free);
    session.tick(state, map, [worker], 12_000, rng, free);
    expect(state.crops[0]?.wateredAt).toBe(12_000);
    const grownAt = 12_000 + growth.minutes * 60_000;
    tickCrops(state, grownAt);
    session.tick(state, map, [worker], grownAt, rng, free);
    expect(session.tasks[0]?.kind).toBe('harvest');
    Object.assign(worker, session.tasks[0]!.stand);
    session.tick(state, map, [worker], grownAt + 1000, rng, free);
    session.tick(state, map, [worker], grownAt + 11_000, rng, free);
    expect(state.crops).toHaveLength(0);
    expect(state.inventory.tomate).toBeGreaterThanOrEqual(growth.yield[0]);
    const inventory = { ...state.inventory };
    session.tick(state, map, [worker], grownAt + 11_000, rng, free);
    expect(state.inventory).toEqual(inventory);
  });

  it('não destrói cultivos com estoque cheio e descarta tarefas antigas ou alteradas', () => {
    const { state, worker, session } = setup();
    state.farm.seeds = {};
    state.crops.push({ x: 78, y: 48, seed: 'sem-tomate', stage: 3, wateredAt: null });
    state.inventory.tomate = 999;
    session.tick(state, map, [worker], 1000, rng, free);
    expect(session.tasks.some((task) => task.kind === 'harvest')).toBe(false);
    expect(state.crops).toHaveLength(1);
    session.cancel();
    state.inventory.tomate = 0;
    session.tick(state, map, [worker], 31_000, rng, free);
    expect(session.tasks).toHaveLength(1);
    state.crops[0]!.stage = 0;
    session.tick(state, map, [worker], 32_000, rng, free);
    expect(session.tasks).toHaveLength(0);
    expect(state.crops).toHaveLength(1);
    session.tick(state, map, [worker], 61_000, rng, free);
    session.tick(state, map, [{ ...worker, available: false }], 61_000 + FARM_RULES.travelMs + 1, rng, free);
    expect(state.farm.history).toHaveLength(0);
  });

  it('coloca a caixa ao lado dos canteiros com acesso livre pela trilha', () => {
    const box = map.decor.find((entry) => entry.kind === 'seed-box')!;
    expect(box).toMatchObject({ x: 83, y: 46 });
    expect(isWalkable(map, box.x + 1, box.y)).toBe(true);
  });

  it('cria mata de trabalho, mina ao sul e margem de pesca alcançáveis', () => {
    const reached = reachableFrom(map, map.spawn.x, map.spawn.y);
    const mineRocks = map.tiles.flatMap((tile, index) => tile === 'rock' && index % map.w >= 5 && index % map.w < 20 && Math.floor(index / map.w) >= 64 ? [index] : []);
    const lumberTrees = map.tiles.flatMap((tile, index) => tile === 'tree' && index % map.w >= 5 && index % map.w < 18 && Math.floor(index / map.w) >= 6 && Math.floor(index / map.w) < 15 ? [index] : []);
    const lakeWater = map.tiles.flatMap((tile, index) => tile === 'water' && index % map.w >= 72 && index % map.w < 90 && Math.floor(index / map.w) >= 5 && Math.floor(index / map.w) < 20 ? [index] : []);
    expect(mineRocks.length).toBeGreaterThan(0);
    expect(lumberTrees.length).toBeGreaterThan(0);
    expect(lakeWater.length).toBeGreaterThan(0);
    const hasAccessibleNode = (indices: number[]) => indices.some((index) => {
      const x = index % map.w;
      const y = Math.floor(index / map.w);
      return [{ x, y: y + 1 }, { x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }].some((at) => isWalkable(map, at.x, at.y) && reached[at.y * map.w + at.x] === 1);
    });
    expect(hasAccessibleNode(mineRocks)).toBe(true);
    expect(hasAccessibleNode(lumberTrees)).toBe(true);
    expect(tileAt(map, map.spawn.x, map.spawn.y)).toBe('plaza');
  });

  it('faz moradores minerarem e derrubarem árvores com o mesmo loot diário do jogador', () => {
    for (const job of [{ kind: 'mine' as const, types: ['rock'] as const, area: { x: 5, y: 64, w: 15, h: 6 }, item: 'pedra' }, { kind: 'lumber' as const, types: ['grass'] as const, area: { x: 5, y: 6, w: 13, h: 9 }, item: 'madeira' }]) {
      const state = emptyVillage(9, map.spawn);
      const worker: FarmWorker = { id: `worker:${job.kind}`, types: job.types, x: map.spawn.x, y: map.spawn.y, available: true };
      const session = new FarmSession();
      const now = new Date(2026, 9, 19, 12).getTime();
      session.tick(state, map, [worker], now, rng, free);
      const task = session.tasks[0]!;
      expect(task.kind).toBe(job.kind);
      expect(task.x).toBeGreaterThanOrEqual(job.area.x);
      expect(task.x).toBeLessThan(job.area.x + job.area.w);
      Object.assign(worker, task.stand);
      session.tick(state, map, [worker], now + 100, rng, free);
      session.tick(state, map, [worker], now + 10_100, rng, free);
      expect(state.inventory[job.item as keyof typeof state.inventory]).toBeGreaterThan(0);
      expect(state.farm.history.at(-1)?.message).toContain('Os itens foram para sua mochila');
      expect(state.community.residents[worker.id]?.experience[job.kind === 'mine' ? 'mineracao' : 'madeireira']).toBe(1);
    }
  });

  it('permite que moradores pesquem na margem com a tabela e o limite real da pescaria', () => {
    const state = emptyVillage(9, map.spawn);
    const worker: FarmWorker = { id: 'angler:vaporeon', types: ['water'], x: map.spawn.x, y: map.spawn.y, available: true };
    const session = new FarmSession();
    const now = new Date(2026, 9, 19, 12).getTime();
    state.fishing = { day: '2026-10-19', casts: 9 };
    session.tick(state, map, [worker], now, () => 0.4, free);
    const task = session.tasks[0]!;
    expect(task.kind).toBe('fish');
    Object.assign(worker, task.stand);
    session.tick(state, map, [worker], now + 100, () => 0.4, free);
    session.tick(state, map, [worker], now + 10_100, () => 0.4, free);
    expect(state.fishing.casts).toBe(10);
    expect(state.inventory.peixe).toBe(1);
    expect(session.tasks).toHaveLength(0);
  });

  it('caminha da praça até o posto no mapa real e só então planta', () => {
    const { state, worker, session } = setup();
    state.farm.seeds['sem-tomate'] = 1;
    const walker = makeWalker(worker.id, map.spawn.x, map.spawn.y, 3);
    const occupied = (x: number, y: number) => state.crops.some((crop) => crop.x === x && crop.y === y);
    for (let now = 1000; now < 100_000 && !state.farm.history.length; now += 100) {
      Object.assign(worker, { x: walker.x, y: walker.y });
      if (now % 1000 === 0) session.tick(state, map, [worker], now, rng, occupied);
      const task = session.tasks[0];
      if (task) stepFarmWorker(walker, task, 0.1, map, occupied);
    }
    expect(walker.steps).toBeGreaterThan(20);
    expect(state.crops).toHaveLength(1);
    expect(state.farm.history).toHaveLength(1);
    expect(state.farm.seeds['sem-tomate']).toBe(0);
  });

  it('não usa sementes particulares nem fabrica trabalho após reiniciar a sessão', () => {
    const { state, worker, session } = setup();
    state.farm.seeds = {};
    state.inventory['sem-tomate'] = 10;
    session.tick(state, map, [worker], 1000, rng, free);
    expect(session.tasks.some((task) => task.kind === 'plant')).toBe(false);
    session.cancel();
    transferFarmSeeds(state, 'sem-tomate', 1, true);
    session.tick(state, map, [worker], 31_000, rng, free);
    Object.assign(worker, session.tasks[0]!.stand);
    session.tick(state, map, [worker], 32_000, rng, free);
    session.cancel();
    const resumed = new FarmSession();
    resumed.tick(state, map, [worker], 86_400_000, rng, free);
    expect(state.crops).toHaveLength(0);
    expect(state.farm.history).toHaveLength(0);
    expect(state.farm.seeds['sem-tomate']).toBe(1);
    expect(state.inventory['sem-tomate']).toBe(9);
    expect(resumed.tasks[0]?.workingSince).toBeNull();
  });
});
