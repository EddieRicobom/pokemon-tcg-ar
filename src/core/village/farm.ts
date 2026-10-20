import { itemDef, ITEMS } from './catalog';
import { fish, harvest, harvestCrop, plant, water } from './life';
import type { Crop, VillageState } from './life';
import { isWalkable, reachableFrom, tileAt } from './map';
import type { VillageMap } from './map';
import { FIELDS, WORK_AREAS } from './town-layout';
import { chooseActivity, scoreActivity, TYPE_AFFINITIES } from './vocations';
import { COMMUNITY_RULES, normalizeResidentProgress } from './community';
import type { PokemonType } from '../pokemon-data';
import { advance, moving, tryStep } from './actors';
import type { Blocked, Dir, Walker } from './actors';
import { pathStep } from './pathing';

export const FARM_RULES = { decisionMs: 30_000, workMs: 10_000, travelMs: 120_000, workers: 3, history: 30 } as const;
export interface FarmRecord { residentId: string; at: number; message: string }
export interface FarmState {
  seeds: Record<string, number>;
  nextDecisionAt: number;
  history: FarmRecord[];
}
export const emptyFarm = (): FarmState => ({ seeds: {}, nextDecisionAt: 0, history: [] });
export function normalizeFarm(raw: unknown): FarmState {
  const result = emptyFarm();
  if (!raw || typeof raw !== 'object') return result;
  const value = raw as Partial<FarmState>;
  for (const seed of ITEMS.filter((item) => item.kind === 'seed')) {
    const qty = value.seeds?.[seed.id];
    if (typeof qty === 'number' && Number.isInteger(qty) && qty > 0) result.seeds[seed.id] = Math.min(999, qty);
  }
  if (typeof value.nextDecisionAt === 'number' && Number.isFinite(value.nextDecisionAt) && value.nextDecisionAt >= 0) result.nextDecisionAt = value.nextDecisionAt;
  result.history = Array.isArray(value.history) ? value.history.filter((entry) => entry && typeof entry.residentId === 'string' && typeof entry.message === 'string' && Number.isFinite(entry.at) && entry.at >= 0).slice(-FARM_RULES.history).map((entry) => ({ residentId: entry.residentId.slice(0, 128), at: entry.at, message: entry.message.slice(0, 240) })) : [];
  return result;
}

/** Transferência entre a mochila e a caixa; nenhuma semente é criada. */
export function transferFarmSeeds(state: VillageState, seed: string, amount: number, deposit: boolean): number {
  if (itemDef(seed)?.kind !== 'seed' || !Number.isInteger(amount) || amount <= 0) return 0;
  const from = deposit ? state.inventory : state.farm.seeds;
  const to = deposit ? state.farm.seeds : state.inventory;
  const moved = Math.min(amount, from[seed] ?? 0, 999 - (to[seed] ?? 0));
  if (moved <= 0) return 0;
  from[seed] = (from[seed] ?? 0) - moved;
  if (!from[seed]) delete from[seed];
  to[seed] = (to[seed] ?? 0) + moved;
  return moved;
}

export interface FarmWorker { id: string; types: readonly PokemonType[]; x: number; y: number; available: boolean }
export interface FarmTask {
  residentId: string; kind: 'plant' | 'water' | 'harvest' | 'mine' | 'lumber' | 'fish'; x: number; y: number; seed: string;
  stand: { x: number; y: number }; createdAt: number; workingSince: number | null;
  crop?: Pick<Crop, 'seed' | 'stage' | 'wateredAt'>;
}

/** Percorre o mapa até o posto reservado e vira para o cultivo, sem teletransportar. */
export function stepFarmWorker(worker: Walker, task: FarmTask, dt: number, map: VillageMap, blocked: Blocked): void {
  advance(worker, dt);
  if (moving(worker)) return;
  const directionTo = (point: { x: number; y: number }): Dir => point.x > worker.x ? 'right' : point.x < worker.x ? 'left' : point.y > worker.y ? 'down' : 'up';
  const distance = Math.abs(worker.x - task.stand.x) + Math.abs(worker.y - task.stand.y);
  if (!distance) { worker.dir = directionTo(task); return; }
  const direction = distance === 1 ? directionTo(task.stand) : pathStep(map, worker, task.stand, blocked);
  if (direction) tryStep(worker, direction, map, blocked);
}

const fieldSpots = FIELDS.flatMap((field) => Array.from({ length: field.w * field.h }, (_, n) => ({ x: field.x + n % field.w, y: field.y + Math.floor(n / field.w) })));

/** Sessão ativa da Vila. Tarefas em andamento são descartadas ao sair, sem consumo nem produção offline. */
export class FarmSession {
  readonly tasks: FarmTask[] = [];
  cancel(): void { this.tasks.length = 0; }

  tick(state: VillageState, map: VillageMap, workers: readonly FarmWorker[], now: number, rng: () => number, occupied: (x: number, y: number) => boolean): boolean {
    let changed = false;
    const unique = [...new Map(workers.map((worker) => [worker.id, worker])).values()].slice(0, 100);
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      const task = this.tasks[i]!;
      const worker = unique.find((entry) => entry.id === task.residentId);
      const crop = state.crops.find((entry) => entry.x === task.x && entry.y === task.y);
      const tile = tileAt(map, task.x, task.y);
      const valid = task.crop ? crop?.seed === task.crop.seed && crop.stage === task.crop.stage && crop.wateredAt === task.crop.wateredAt
        : task.kind === 'mine' ? tile === 'rock' && state.harvested[`${task.x},${task.y}`] !== localDay(now)
          : task.kind === 'lumber' ? tile === 'tree' && state.harvested[`${task.x},${task.y}`] !== localDay(now)
            : task.kind === 'fish' ? tile === 'water' && (state.fishing.day !== localDay(now) || state.fishing.casts < 10) : !crop;
      if (!worker?.available || !valid || now - task.createdAt > FARM_RULES.travelMs || now < task.createdAt) {
        this.tasks.splice(i, 1);
        continue;
      }
      if (worker.x !== task.stand.x || worker.y !== task.stand.y) { task.workingSince = null; continue; }
      task.workingSince ??= now;
      if (now - task.workingSince < FARM_RULES.workMs) continue;
      this.tasks.splice(i, 1);
      // A capacidade é verificada antes da colheita: não apaga cultivo quando a mochila está cheia.
      const growth = itemDef(task.seed)?.grows;
      if (task.kind === 'harvest' && (!growth || (state.inventory[growth.crop] ?? 0) > 999 - growth.yield[1] || (state.inventory[task.seed] ?? 0) >= 999)) continue;
      const today = localDay(now);
      const result = task.kind === 'plant'
        ? plant({ ...state, inventory: state.farm.seeds }, map, task.seed, task.x, task.y, now, occupied)
        : task.kind === 'water' ? water(state, task.x, task.y, now)
          : task.kind === 'harvest' ? harvestCrop(state, task.x, task.y, rng)
            : task.kind === 'mine' || task.kind === 'lumber' ? harvest(state, map, task.x, task.y, today, rng)
              : fish(state, map, task.x, task.y, today, rng);
      if (!result.ok) continue;
      const activity = task.kind === 'mine' ? 'mineracao' : task.kind === 'lumber' ? 'madeireira' : task.kind === 'fish' ? 'pesca' : 'agricultura';
      const progress = state.community.residents[worker.id] ??= normalizeResidentProgress(null);
      progress.energy = Math.max(0, progress.energy - COMMUNITY_RULES.taskEnergyCost);
      progress.completedActivities = Math.min(1_000_000, progress.completedActivities + 1);
      progress.experience[activity] = Math.min(1_000_000, (progress.experience[activity] ?? 0) + 1);
      progress.recentActivity = activity;
      if ((progress.experience[activity] ?? 0) >= 3 && !progress.interests.includes(activity) && progress.interests.length < 3) progress.interests.push(activity);
      const message = task.kind === 'plant' ? `Plantou ${itemDef(task.seed)?.name ?? task.seed} usando a caixa da fazenda.` : task.kind === 'water' ? 'Regou um canteiro da fazenda.' : task.kind === 'mine' ? `Minerou na pedreira: ${result.message} Os itens foram para sua mochila.` : task.kind === 'lumber' ? `Trabalhou na madeireira: ${result.message} Os itens foram para sua mochila.` : task.kind === 'fish' ? `Pescou no lago: ${result.message} Os itens foram para sua mochila.` : `${result.message} A produção foi para sua mochila.`;
      state.farm.history = [...state.farm.history, { residentId: worker.id, at: now, message }].slice(-FARM_RULES.history);
      changed = true;
    }
    // Voltar o relógio não bloqueia o trabalho indefinidamente. Nenhum catch-up concede trabalho instantâneo.
    if (state.farm.nextDecisionAt > now + FARM_RULES.decisionMs) { state.farm.nextDecisionAt = now + FARM_RULES.decisionMs; changed = true; }
    if (now < state.farm.nextDecisionAt) return changed;
    state.farm.nextDecisionAt = now + FARM_RULES.decisionMs;
    changed = true;
    const lastWorked = new Map(state.farm.history.map((entry) => [entry.residentId, entry.at]));
    const ordered = unique.filter((worker) => worker.available && !this.tasks.some((task) => task.residentId === worker.id))
      .sort((a, b) => (lastWorked.get(a.id) ?? 0) - (lastWorked.get(b.id) ?? 0) || a.id.localeCompare(b.id));
    const reachable = reachableFrom(map, map.spawn.x, map.spawn.y);
    for (const worker of ordered) {
      if (this.tasks.length >= FARM_RULES.workers) break;
      const task = this.findTask(state, map, worker, now, occupied, reachable);
      if (!task) break;
      const progress = state.community.residents[worker.id] ??= normalizeResidentProgress(null);
      const activity = task.kind === 'mine' ? 'mineracao' : task.kind === 'lumber' ? 'madeireira' : task.kind === 'fish' ? 'pesca' : 'agricultura';
      const choice = chooseActivity({ available: [activity, 'descanso', 'brincadeira'], types: worker.types, interests: progress.interests, energy: progress.energy, socialOpportunity: 1, communityNeeds: [{ activity, urgency: 2 }], recentActivity: progress.recentActivity ?? undefined }, rng);
      if (choice.activity === activity) this.tasks.push(task);
      else if (choice.activity === 'descanso') progress.energy = Math.min(100, progress.energy + COMMUNITY_RULES.restEnergyGain);
    }
    return changed;
  }

  private findTask(state: VillageState, map: VillageMap, worker: FarmWorker, now: number, occupied: (x: number, y: number) => boolean, reachable: Uint8Array): FarmTask | null {
    const residentId = worker.id;
    const seeds = ITEMS.filter((item) => item.kind === 'seed' && (state.farm.seeds[item.id] ?? 0) > this.tasks.filter((task) => task.kind === 'plant' && task.seed === item.id).length);
    // Colher e regar têm prioridade sobre ocupar novos canteiros.
    for (const kind of ['harvest', 'water', 'plant'] as const) for (const spot of fieldSpots) {
      if (tileAt(map, spot.x, spot.y) !== 'field' || state.placed.some((item) => item.x === spot.x && item.y === spot.y) || this.tasks.some((task) => task.x === spot.x && task.y === spot.y)) continue;
      const crop = state.crops.find((entry) => entry.x === spot.x && entry.y === spot.y);
      const growth = crop && itemDef(crop.seed)?.grows;
      if (kind === 'plant' ? crop || !seeds.length || occupied(spot.x, spot.y)
        : !crop || !growth || (kind === 'water' ? crop.stage >= growth.stages || crop.wateredAt !== null : crop.stage < growth.stages || (state.inventory[growth.crop] ?? 0) > 999 - growth.yield[1] || (state.inventory[crop.seed] ?? 0) >= 999)) continue;
      const stand = [{ x: spot.x, y: spot.y + 1 }, { x: spot.x - 1, y: spot.y }, { x: spot.x + 1, y: spot.y }, { x: spot.x, y: spot.y - 1 }].find((at) => isWalkable(map, at.x, at.y) && !occupied(at.x, at.y) && !state.placed.some((item) => item.x === at.x && item.y === at.y) && !state.crops.some((entry) => entry.x === at.x && entry.y === at.y) && !this.tasks.some((task) => task.stand.x === at.x && task.stand.y === at.y || task.x === at.x && task.y === at.y));
      if (!stand || this.tasks.some((task) => task.stand.x === spot.x && task.stand.y === spot.y)) continue;
      return { residentId, kind, ...spot, seed: crop?.seed ?? seeds[0]!.id, stand, createdAt: now, workingSince: null, ...(crop ? { crop: { seed: crop.seed, stage: crop.stage, wateredAt: crop.wateredAt } } : {}) };
    }
    const progress = state.community.residents[residentId] ??= normalizeResidentProgress(null);
    const sites = [
      { kind: 'mine' as const, area: WORK_AREAS.mine, tile: 'rock' as const },
      { kind: 'lumber' as const, area: WORK_AREAS.lumber, tile: 'tree' as const },
      { kind: 'fish' as const, area: WORK_AREAS.fishing, tile: 'water' as const },
    ].sort((a, b) => {
      const activity = (kind: typeof a.kind) => kind === 'mine' ? 'mineracao' : kind === 'lumber' ? 'madeireira' : 'pesca';
      const score = (kind: typeof a.kind) => scoreActivity({ available: [activity(kind)], types: worker.types, interests: progress.interests, energy: progress.energy, socialOpportunity: 0, communityNeeds: [{ activity: activity(kind), urgency: 2 }] }, activity(kind)).score;
      return score(b.kind) - score(a.kind) || a.kind.localeCompare(b.kind);
    });
    for (const site of sites) {
      const dailyCasts = state.fishing.day === localDay(now) ? state.fishing.casts : 0;
      if (site.kind === 'fish' && dailyCasts + this.tasks.filter((task) => task.kind === 'fish').length >= 10) continue;
      const activity = site.kind === 'mine' ? 'mineracao' : site.kind === 'lumber' ? 'madeireira' : 'pesca';
      if (!worker.types.some((type) => TYPE_AFFINITIES[type].includes(activity)) && !progress.interests.includes(activity)) continue;
      for (let y = site.area.y; y < site.area.y + site.area.h; y++) for (let x = site.area.x; x < site.area.x + site.area.w; x++) {
        if (tileAt(map, x, y) !== site.tile || this.tasks.some((task) => task.x === x && task.y === y) || site.kind !== 'fish' && state.harvested[`${x},${y}`] === localDay(now)) continue;
        const stand = [{ x, y: y + 1 }, { x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }].find((at) => isWalkable(map, at.x, at.y) && reachable[at.y * map.w + at.x] === 1 && !occupied(at.x, at.y) && !this.tasks.some((task) => task.stand.x === at.x && task.stand.y === at.y));
        if (stand) return { residentId, kind: site.kind, x, y, seed: '', stand, createdAt: now, workingSince: null };
      }
    }
    return null;
  }
}

function localDay(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
