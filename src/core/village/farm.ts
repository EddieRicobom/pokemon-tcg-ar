import { itemDef, ITEMS } from './catalog';
import { fish, FISH_PER_DAY, harvest, harvestCrop, plant, water } from './life';
import type { Crop, VillageState } from './life';
import { isWalkable, reachableFrom, tileAt } from './map';
import type { VillageMap } from './map';
import { FIELDS, WORK_AREAS } from './town-layout';
import { chooseActivity, TYPE_AFFINITIES } from './vocations';
import type { VillageActivity } from './vocations';
import { COMMUNITY_RULES, normalizeResidentProgress } from './community';
import type { PokemonType } from '../pokemon-data';
import { advance, moving, tryStep } from './actors';
import type { Blocked, Dir, Walker } from './actors';
import { PATH_DEFERRED, pathStepBudgeted } from './pathing';
import { workActivityActive } from './professions';
import { payResidentWork } from './resident-economy';

export const FARM_RULES = { decisionMs: 30_000, workMs: 30_000, travelMs: 120_000, workers: 5, history: 30 } as const;
export const WORK_NAMES = { plant: 'Plantio', water: 'Rega', harvest: 'Colheita', mine: 'Mineração', lumber: 'Madeireira', fish: 'Pescaria' } as const;
export type WorkKind = keyof typeof WORK_NAMES;
const activityOf = (kind: WorkKind): VillageActivity => kind === 'mine' ? 'mineracao' : kind === 'lumber' ? 'madeireira' : kind === 'fish' ? 'pesca' : 'agricultura';
const workCapacity: Partial<Record<WorkKind, readonly (readonly [string, number])[]>> = {
  mine: [['pedra', 2], ['cristal', 1], ['ouro', 1]],
  lumber: [['madeira', 3], ['pena', 1], ['mel', 1]],
  fish: ['alga', 'bota', 'peixe', 'estrela', 'dourado', 'perola', 'cristal'].map((item) => [item, 1] as const),
};
const hasWorkCapacity = (state: VillageState, kind: WorkKind): boolean => (workCapacity[kind] ?? []).every(([item, qty]) => (state.inventory[item] ?? 0) <= 999 - qty);
export interface FarmRecord { residentId: string; at: number; message: string; kind?: WorkKind }
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
  result.history = Array.isArray(value.history) ? value.history.filter((entry) => entry && typeof entry.residentId === 'string' && typeof entry.message === 'string' && Number.isFinite(entry.at) && entry.at >= 0).slice(-FARM_RULES.history).map((entry) => ({ residentId: entry.residentId.slice(0, 128), at: entry.at, message: entry.message.slice(0, 240), ...(entry.kind && Object.hasOwn(WORK_NAMES, entry.kind) ? { kind: entry.kind } : {}) })) : [];
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
  residentId: string; kind: WorkKind; x: number; y: number; seed: string;
  stand: { x: number; y: number }; createdAt: number; workingSince: number | null;
  crop?: Pick<Crop, 'seed' | 'stage' | 'wateredAt'>;
}

export interface FarmTaskProgress {
  phase: 'caminho' | 'trabalho';
  percent: number;
}

/** Resume uma tarefa para a interface sem expor a sessão mutável nem inventar produção. */
export function farmTaskProgress(task: Pick<FarmTask, 'workingSince'>, now: number): FarmTaskProgress {
  if (task.workingSince === null || !Number.isFinite(task.workingSince)) return { phase: 'caminho', percent: 0 };
  const elapsed = Math.max(0, now - task.workingSince);
  return { phase: 'trabalho', percent: Math.min(100, Math.round(elapsed / FARM_RULES.workMs * 100)) };
}

/** Percorre o mapa até o posto reservado e vira para o cultivo, sem teletransportar. */
export function stepFarmWorker(worker: Walker, task: FarmTask, dt: number, map: VillageMap, blocked: Blocked): void {
  advance(worker, dt);
  if (moving(worker)) return;
  const directionTo = (point: { x: number; y: number }): Dir => point.x > worker.x ? 'right' : point.x < worker.x ? 'left' : point.y > worker.y ? 'down' : 'up';
  const distance = Math.abs(worker.x - task.stand.x) + Math.abs(worker.y - task.stand.y);
  if (!distance) { worker.dir = directionTo(task); return; }
  const direction = distance === 1 ? directionTo(task.stand) : pathStepBudgeted(map, worker, task.stand, blocked);
  if (direction && direction !== PATH_DEFERRED) tryStep(worker, direction, map, blocked);
}

const fieldSpots = FIELDS.flatMap((field) => Array.from({ length: field.w * field.h }, (_, n) => ({ x: field.x + n % field.w, y: field.y + Math.floor(n / field.w) })));

/** Sessão ativa da Vila. Tarefas em andamento são descartadas ao sair, sem consumo nem produção offline. */
export class FarmSession {
  readonly tasks: FarmTask[] = [];
  /** Alterna postos quando ainda não temos aptidões carregadas do catálogo. */
  private neutralWorkerRotation = 0;
  cancel(): void { this.tasks.length = 0; }

  tick(state: VillageState, map: VillageMap, workers: readonly FarmWorker[], now: number, rng: () => number, occupied: (x: number, y: number) => boolean, population?: number): boolean {
    let changed = false;
    let completedWork = false;
    const unique = [...new Map(workers.map((worker) => [worker.id, worker])).values()].slice(0, 100);
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      const task = this.tasks[i]!;
      const worker = unique.find((entry) => entry.id === task.residentId);
      const crop = state.crops.find((entry) => entry.x === task.x && entry.y === task.y);
      const tile = tileAt(map, task.x, task.y);
      const valid = task.crop ? crop?.seed === task.crop.seed && crop.stage === task.crop.stage && crop.wateredAt === task.crop.wateredAt
        : task.kind === 'mine' ? tile === 'rock' && state.harvested[`${task.x},${task.y}`] !== localDay(now)
          : task.kind === 'lumber' ? tile === 'tree' && state.harvested[`${task.x},${task.y}`] !== localDay(now)
            : task.kind === 'fish' ? tile === 'water' && (state.fishing.day !== localDay(now) || state.fishing.casts < FISH_PER_DAY) : !crop;
      if (!worker?.available || !valid || population !== undefined && !workActivityActive(activityOf(task.kind), population) || now - task.createdAt > FARM_RULES.travelMs || now < task.createdAt) {
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
      if (!hasWorkCapacity(state, task.kind)) continue;
      const today = localDay(now);
      const result = task.kind === 'plant'
        ? plant({ ...state, inventory: state.farm.seeds }, map, task.seed, task.x, task.y, now, occupied)
        : task.kind === 'water' ? water(state, task.x, task.y, now)
          : task.kind === 'harvest' ? harvestCrop(state, task.x, task.y, rng)
            : task.kind === 'mine' || task.kind === 'lumber' ? harvest(state, map, task.x, task.y, today, rng)
              : fish(state, map, task.x, task.y, today, rng);
      if (!result.ok) continue;
      const role = task.kind === 'mine' ? 'mine' : task.kind === 'lumber' ? 'lumber' : task.kind === 'fish' ? 'fishing' : 'farm';
      payResidentWork(state, worker.id, role, `${task.kind}:${task.x},${task.y}:${task.createdAt}`, today, task.kind === 'water' || task.kind === 'plant' ? 5 : 8);
      const activity = activityOf(task.kind);
      const progress = state.community.residents[worker.id] ??= normalizeResidentProgress(null);
      progress.energy = Math.max(0, progress.energy - COMMUNITY_RULES.taskEnergyCost);
      progress.completedActivities = Math.min(1_000_000, progress.completedActivities + 1);
      progress.experience[activity] = Math.min(1_000_000, (progress.experience[activity] ?? 0) + 1);
      progress.recentActivity = activity;
      if ((progress.experience[activity] ?? 0) >= 3 && !progress.interests.includes(activity) && progress.interests.length < 3) progress.interests.push(activity);
      const delivery = result.got ? ' Os itens foram para sua mochila.' : '';
      const message = task.kind === 'plant' ? `Plantou ${itemDef(task.seed)?.name ?? task.seed} usando a caixa da fazenda.` : task.kind === 'water' ? 'Regou um canteiro da fazenda.' : task.kind === 'mine' ? `Minerou na pedreira: ${result.message}${delivery}` : task.kind === 'lumber' ? `Trabalhou na madeireira: ${result.message}${delivery}` : task.kind === 'fish' ? `Pescou no lago: ${result.message}${delivery}` : `${result.message} A produção foi para sua mochila.`;
      state.farm.history = [...state.farm.history, { residentId: worker.id, at: now, message, kind: task.kind }].slice(-FARM_RULES.history);
      changed = true;
      completedWork = true;
    }
    // Voltar o relógio não bloqueia o trabalho indefinidamente. Nenhum catch-up concede trabalho instantâneo.
    if (state.farm.nextDecisionAt > now + FARM_RULES.decisionMs) { state.farm.nextDecisionAt = now + FARM_RULES.decisionMs; changed = true; }
    // Deixa a conclusão visível antes de reservar outra tarefa para o mesmo
    // ciclo; isso evita que um morador pareça trocar de posto no mesmo instante
    // em que termina e dá espaço para a animação de loot ser percebida.
    if (completedWork || now < state.farm.nextDecisionAt) return changed;
    state.farm.nextDecisionAt = now + FARM_RULES.decisionMs;
    changed = true;
    const lastWorked = new Map(state.farm.history.map((entry) => [entry.residentId, entry.at]));
    const ordered = unique.filter((worker) => worker.available && !this.tasks.some((task) => task.residentId === worker.id))
      .sort((a, b) => (lastWorked.get(a.id) ?? 0) - (lastWorked.get(b.id) ?? 0) || a.id.localeCompare(b.id));
    const staticObstacle = (x: number, y: number) => state.placed.some((item) => item.x === x && item.y === y) || state.crops.some((crop) => crop.x === x && crop.y === y);
    const reachable = reachableFrom(map, map.spawn.x, map.spawn.y, staticObstacle);
    for (const worker of ordered) {
      if (this.tasks.length >= FARM_RULES.workers) break;
      const options = this.findTasks(state, map, worker, now, occupied, reachable).filter((task) => population === undefined || workActivityActive(activityOf(task.kind), population));
      if (!options.length) continue;
      const progress = state.community.residents[worker.id] ??= normalizeResidentProgress(null);
      const resourceOptions = options.filter((task) => task.kind === 'mine' || task.kind === 'lumber' || task.kind === 'fish');
      const resourceActivities = new Set(resourceOptions.map((task) => activityOf(task.kind)));
      const urgentFarmTask = options.some((task) => task.kind === 'harvest' || task.kind === 'water');
      const hasResourcePreference = worker.types.some((type) => {
        const affinities = TYPE_AFFINITIES[type] ?? [];
        return [...resourceActivities].some((activity) => affinities.includes(activity));
      }) || progress.interests.some((activity) => resourceActivities.has(activity));
      const explicitFarmInterest = progress.interests.includes('agricultura');
      const plantSupply = Object.values(state.farm.seeds).reduce((total, qty) => total + Math.max(0, qty ?? 0), 0);
      const reservedPlants = this.tasks.filter((task) => task.kind === 'plant').length;
      const farmQuotaReached = reservedPlants >= Math.min(2, plantSupply) || progress.recentActivity === 'agricultura';
      // Os tipos chegam em segundo plano. Enquanto não chegam, a urgência de
      // colheita acabava vencendo sempre e a vila parecia ter apenas fazenda.
      // Nesse intervalo, os moradores sem aptidão conhecida rodam pelos três
      // postos; o mesmo vale para tipos que não têm afinidade com nenhum
      // recurso. Assim o comportamento continua vivo sem inventar uma espécie,
      // sem tirar a prioridade de uma colheita ou rega que já está pronta.
      const neutralResource = !urgentFarmTask && !explicitFarmInterest && !hasResourcePreference && resourceOptions.length > 0 && farmQuotaReached
        ? resourceOptions[this.neutralWorkerRotation++ % resourceOptions.length]
        : undefined;
      const choice = neutralResource
        ? { activity: activityOf(neutralResource.kind), score: 0, reason: 'curiosidade' as const }
        : chooseActivity({ available: [...options.map((task) => activityOf(task.kind)), 'descanso', 'brincadeira'], types: worker.types, interests: progress.interests, energy: progress.energy, socialOpportunity: 1, communityNeeds: options.map((task) => ({ activity: activityOf(task.kind), urgency: task.kind === 'harvest' ? 5 : task.kind === 'water' ? 4 : 2 })), recentActivity: progress.recentActivity ?? undefined }, rng);
      const task = options.find((option) => activityOf(option.kind) === choice.activity);
      if (task) this.tasks.push(task);
      else if (choice.activity === 'descanso') progress.energy = Math.min(100, progress.energy + COMMUNITY_RULES.restEnergyGain);
    }
    return changed;
  }

  private findTasks(state: VillageState, map: VillageMap, worker: FarmWorker, now: number, occupied: (x: number, y: number) => boolean, reachable: Uint8Array): FarmTask[] {
    const residentId = worker.id;
    const options: FarmTask[] = [];
    const standFor = (x: number, y: number) => [{ x, y: y + 1 }, { x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }].find((at) => isWalkable(map, at.x, at.y) && reachable[at.y * map.w + at.x] === 1 && (!occupied(at.x, at.y) || at.x === worker.x && at.y === worker.y) && !state.placed.some((item) => item.x === at.x && item.y === at.y) && !state.crops.some((crop) => crop.x === at.x && crop.y === at.y) && !this.tasks.some((task) => task.stand.x === at.x && task.stand.y === at.y || task.x === at.x && task.y === at.y));
    const seeds = ITEMS.filter((item) => item.kind === 'seed' && (state.farm.seeds[item.id] ?? 0) > this.tasks.filter((task) => task.kind === 'plant' && task.seed === item.id).length);
    // Colher e regar têm prioridade sobre ocupar novos canteiros.
    farm: for (const kind of ['harvest', 'water', 'plant'] as const) for (const spot of fieldSpots) {
      if (tileAt(map, spot.x, spot.y) !== 'field' || state.placed.some((item) => item.x === spot.x && item.y === spot.y) || this.tasks.some((task) => task.x === spot.x && task.y === spot.y)) continue;
      const crop = state.crops.find((entry) => entry.x === spot.x && entry.y === spot.y);
      const growth = crop && itemDef(crop.seed)?.grows;
      if (kind === 'plant' ? crop || !seeds.length || occupied(spot.x, spot.y)
        : !crop || !growth || (kind === 'water' ? crop.stage >= growth.stages || crop.wateredAt !== null : crop.stage < growth.stages || (state.inventory[growth.crop] ?? 0) > 999 - growth.yield[1] || (state.inventory[crop.seed] ?? 0) >= 999)) continue;
      const stand = standFor(spot.x, spot.y);
      if (!stand || this.tasks.some((task) => task.stand.x === spot.x && task.stand.y === spot.y)) continue;
      options.push({ residentId, kind, ...spot, seed: crop?.seed ?? seeds[0]!.id, stand, createdAt: now, workingSince: null, ...(crop ? { crop: { seed: crop.seed, stage: crop.stage, wateredAt: crop.wateredAt } } : {}) });
      break farm;
    }
    const sites = [
      { kind: 'mine' as const, area: WORK_AREAS.mine, tile: 'rock' as const },
      { kind: 'lumber' as const, area: WORK_AREAS.lumber, tile: 'tree' as const },
      { kind: 'fish' as const, area: WORK_AREAS.fishing, tile: 'water' as const },
    ];
    for (const site of sites) {
      const dailyCasts = state.fishing.day === localDay(now) ? state.fishing.casts : 0;
      if (site.kind === 'fish' && dailyCasts + this.tasks.filter((task) => task.kind === 'fish').length >= FISH_PER_DAY) continue;
      if (!hasWorkCapacity(state, site.kind)) continue;
      const nodes: { x: number; y: number; stand: { x: number; y: number }; distance: number }[] = [];
      for (let y = site.area.y; y < site.area.y + site.area.h; y++) for (let x = site.area.x; x < site.area.x + site.area.w; x++) {
        if (tileAt(map, x, y) !== site.tile || this.tasks.some((task) => task.x === x && task.y === y) || site.kind !== 'fish' && state.harvested[`${x},${y}`] === localDay(now)) continue;
        const stand = standFor(x, y);
        if (stand) nodes.push({ x, y, stand, distance: Math.abs(stand.x - worker.x) + Math.abs(stand.y - worker.y) - (site.kind === 'fish' && tileAt(map, stand.x, stand.y) === 'pier' ? map.w + map.h : 0) });
      }
      const node = nodes.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x)[0];
      if (node) options.push({ residentId, kind: site.kind, x: node.x, y: node.y, seed: '', stand: node.stand, createdAt: now, workingSince: null });
    }
    return options;
  }
}

function localDay(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
