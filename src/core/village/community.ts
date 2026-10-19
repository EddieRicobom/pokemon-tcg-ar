import { ITEMS, itemDef } from './catalog';
import type { VillageState } from './life';
import { TYPE_AFFINITIES, VILLAGE_ACTIVITIES } from './vocations';
import type { VillageActivity } from './vocations';
import { chooseActivity } from './vocations';
import type { PokemonType } from '../pokemon-data';
import { recordMomentAndMemory } from './social-state';

/** Regras centrais da comunidade: porções e manutenção são liquidadas uma vez por dia local. */
export const COMMUNITY_RULES = {
  mealsPerResident: 1.5,
  dailyMaintenancePerResident: 4,
  dailyTownServiceBase: 10,
  maxCatchUpDays: 7,
  historyLimit: 30,
  reserveDays: 3,
  residentLimit: 100,
  initialEnergy: 70,
  taskEnergyCost: 12,
  restEnergyGain: 18,
} as const;

export interface CommunityResidentProgress {
  energy: number;
  interests: VillageActivity[];
  experience: Partial<Record<VillageActivity, number>>;
  recentActivity: VillageActivity | null;
  rememberedActivity: VillageActivity | null;
  completedActivities: number;
}

export interface CommunityActivityRecord {
  residentId: string;
  activity: VillageActivity;
  icon: string;
  result: string;
  item?: string;
  qty?: number;
  x?: number;
  y?: number;
}

export interface CommunityCycle {
  day: string;
  residents: number;
  foodTarget: number;
  foodServed: number;
  preferredServings: number;
  activities: CommunityActivityRecord[];
  consumed: { item: string; qty: number }[];
  maintenanceDue: number;
  maintenancePaid: number;
  foodShortage: number;
  servicesUnfunded: number;
  welfare: number;
  trust: number;
  shortageDays: number;
  notice: string;
}

export interface CommunityState {
  /** Último ciclo liquidado, por data local YYYY-MM-DD. */
  lastCycleDay: string;
  welfare: number;
  trust: number;
  shortageDays: number;
  /** Só mudanças diárias; limitado para não crescer junto com o save. */
  history: CommunityCycle[];
  /** Energia e interesses aprendidos nas atividades, associados ao ID estável do morador. */
  residents: Record<string, CommunityResidentProgress>;
}

export interface CommunityForecast {
  residents: number;
  foodAvailable: number;
  foodTarget: number;
  mealsAtCurrentStock: number;
  reserveTarget: number;
  reserveDaysAtCurrentStock: number;
  maintenanceDue: number;
  maintenanceFunded: boolean;
}

export interface CommunityResident {
  id: string;
  /** Preferência alimentar já existente na Vila, quando os tipos deste morador estão disponíveis. */
  favoriteFood?: string;
  types?: readonly PokemonType[];
  /** Derived from recent persistent memories with other residents who are active today. */
  socialOpportunity?: number;
}

export const emptyCommunity = (): CommunityState => ({ lastCycleDay: '', welfare: 70, trust: 70, shortageDays: 0, history: [], residents: {} });

function integer(value: unknown, min = 0, max = 999999): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : 0;
}

function activity(value: unknown): value is VillageActivity {
  return typeof value === 'string' && (VILLAGE_ACTIVITIES as readonly string[]).includes(value);
}

function normalizeResidentProgress(raw: unknown): CommunityResidentProgress {
  const base: CommunityResidentProgress = { energy: COMMUNITY_RULES.initialEnergy, interests: [], experience: {}, recentActivity: null, rememberedActivity: null, completedActivities: 0 };
  if (!raw || typeof raw !== 'object') return base;
  const value = raw as Partial<CommunityResidentProgress>;
  const experience: CommunityResidentProgress['experience'] = {};
  if (value.experience && typeof value.experience === 'object') {
    for (const [key, count] of Object.entries(value.experience)) if (activity(key)) experience[key] = integer(count, 0, 999);
  }
  return {
    energy: integer(value.energy, 0, 100) || (value.energy === 0 ? 0 : base.energy),
    interests: Array.isArray(value.interests) ? [...new Set(value.interests.filter(activity))].slice(0, 3) : [],
    experience,
    recentActivity: activity(value.recentActivity) ? value.recentActivity : null,
    rememberedActivity: activity(value.rememberedActivity) ? value.rememberedActivity : null,
    completedActivities: integer(value.completedActivities, 0, 1000000),
  };
}

export function normalizeCommunity(raw: unknown): CommunityState {
  const base = emptyCommunity();
  if (!raw || typeof raw !== 'object') return base;
  const value = raw as Partial<CommunityState>;
  const history = Array.isArray(value.history) ? value.history.filter((entry): entry is CommunityCycle =>
    !!entry && typeof entry === 'object' && typeof entry.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.day),
  ).slice(-COMMUNITY_RULES.historyLimit).map((entry) => ({
    day: entry.day.slice(0, 10), residents: integer(entry.residents, 0, 500), foodTarget: integer(entry.foodTarget),
    foodServed: integer(entry.foodServed), preferredServings: integer(entry.preferredServings), consumed: Array.isArray(entry.consumed) ? entry.consumed.filter((item) => item && typeof item.item === 'string').slice(0, 100).map((item) => ({ item: item.item.slice(0, 60), qty: integer(item.qty, 0, 999) })) : [],
    activities: Array.isArray(entry.activities) ? entry.activities.filter((item) => item && typeof item.residentId === 'string' && activity(item.activity)).slice(0, COMMUNITY_RULES.residentLimit).map((item) => ({ residentId: item.residentId.slice(0, 128), activity: item.activity, icon: typeof item.icon === 'string' ? item.icon.slice(0, 8) : '💭', result: typeof item.result === 'string' ? item.result.slice(0, 240) : '', ...(typeof item.item === 'string' ? { item: item.item.slice(0, 60) } : {}), ...(Number.isInteger(item.qty) ? { qty: integer(item.qty, 0, 999) } : {}), ...(Number.isInteger(item.x) ? { x: integer(item.x, -1000, 1000) } : {}), ...(Number.isInteger(item.y) ? { y: integer(item.y, -1000, 1000) } : {}) })) : [],
    maintenanceDue: integer(entry.maintenanceDue), maintenancePaid: integer(entry.maintenancePaid), foodShortage: integer(entry.foodShortage),
    servicesUnfunded: integer(entry.servicesUnfunded), welfare: integer(entry.welfare, 0, 100), trust: integer(entry.trust, 0, 100),
    shortageDays: integer(entry.shortageDays), notice: typeof entry.notice === 'string' ? entry.notice.slice(0, 240) : '',
  })) : [];
  const lastCycleDay = typeof value.lastCycleDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.lastCycleDay) ? value.lastCycleDay : '';
  const residents: CommunityState['residents'] = {};
  if (value.residents && typeof value.residents === 'object') {
    for (const [id, progress] of Object.entries(value.residents).slice(-COMMUNITY_RULES.residentLimit)) {
      if (id.length > 0 && id.length <= 128) residents[id] = normalizeResidentProgress(progress);
    }
  }
  return {
    lastCycleDay,
    welfare: integer(value.welfare, 0, 100) || (value.welfare === 0 ? 0 : base.welfare),
    trust: integer(value.trust, 0, 100) || (value.trust === 0 ? 0 : base.trust),
    shortageDays: integer(value.shortageDays, 0, 365),
    history,
    residents,
  };
}

function portionsAvailable(state: Pick<VillageState, 'inventory'>): number {
  return ITEMS.reduce((sum, item) => sum + (item.nutrition ?? 0) * (state.inventory[item.id] ?? 0), 0);
}

function residentsOf(input: readonly (string | CommunityResident)[]): CommunityResident[] {
  const residents = new Map<string, CommunityResident>();
  for (const entry of input) {
    const resident = typeof entry === 'string' ? { id: entry } : entry;
    if (!resident || typeof resident.id !== 'string' || !resident.id) continue;
    const existing = residents.get(resident.id);
    residents.set(resident.id, {
      id: resident.id,
      ...(existing?.favoriteFood || resident.favoriteFood ? { favoriteFood: existing?.favoriteFood ?? resident.favoriteFood } : {}),
      ...(existing?.types?.length || resident.types?.length ? { types: existing?.types?.length ? existing.types : resident.types } : {}),
      ...(existing?.socialOpportunity !== undefined || resident.socialOpportunity !== undefined ? { socialOpportunity: existing?.socialOpportunity ?? resident.socialOpportunity } : {}),
    });
  }
  return [...residents.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function activeCount(ids: readonly (string | CommunityResident)[]): number {
  return Math.min(COMMUNITY_RULES.residentLimit, residentsOf(ids).length);
}

export function communityForecast(state: Pick<VillageState, 'inventory' | 'coins'>, residentIds: readonly string[]): CommunityForecast {
  const residents = activeCount(residentIds);
  const foodTarget = Math.ceil(residents * COMMUNITY_RULES.mealsPerResident);
  const maintenanceDue = residents > 0 ? residents * COMMUNITY_RULES.dailyMaintenancePerResident + COMMUNITY_RULES.dailyTownServiceBase : 0;
  return {
    residents,
    foodAvailable: portionsAvailable(state),
    foodTarget,
    mealsAtCurrentStock: foodTarget > 0 ? Math.floor(portionsAvailable(state) / foodTarget) : 0,
    reserveTarget: foodTarget * COMMUNITY_RULES.reserveDays,
    reserveDaysAtCurrentStock: foodTarget > 0 ? Math.floor(portionsAvailable(state) / foodTarget) : 0,
    maintenanceDue,
    maintenanceFunded: state.coins >= maintenanceDue,
  };
}

function nextDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return '';
  const next = new Date(Date.UTC(year, month - 1, date + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

function shortageNotice(days: number): string {
  if (days === 1) return 'A despensa ficou curta hoje; a comunidade percebeu e está preocupada.';
  if (days === 2) return 'A falta de comida continua. Alguns moradores começaram a dividir o que encontraram; a confiança no cuidado da Vila caiu um pouco.';
  if (days === 4) return 'A escassez já dura quatro dias. O mural da praça pede ajuda e os moradores discutem como reorganizar a despensa.';
  if (days === 7) return 'A Vila entrou em crise alimentar. O Conselho prioriza recuperar a reserva comum; nenhuma amizade individual é apagada.';
  return '';
}

function shortagePhase(days: number): number {
  return days === 0 ? 0 : days === 1 ? 1 : days <= 3 ? 2 : days <= 6 ? 3 : 4;
}

const ACTIVITY_ICONS: Record<VillageActivity, string> = {
  agricultura: '🌱', pesca: '🎣', culinaria: '🍲', manutencao: '🛠️', construcao: '🧱', transporte: '📦',
  exploracao: '🧭', pesquisa: '📚', jardinagem: '🌼', vigilancia: '🔎', comercio: '🛒', protecao: '🛡️',
  conservacao: '🧊', reciclagem: '♻️', acolhimento: '🤝', brincadeira: '🎈', descanso: '💤',
};

function rngFor(key: string): () => number {
  let seed = 2166136261;
  for (let i = 0; i < key.length; i++) seed = Math.imul(seed ^ key.charCodeAt(i), 16777619) >>> 0;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
}

function inventoryAdd(state: VillageState, id: string, quantity: number): number {
  if (!itemDef(id) || quantity <= 0) return 0;
  const current = state.inventory[id as keyof typeof state.inventory] ?? 0;
  const added = Math.min(quantity, 999 - current);
  if (added > 0) state.inventory[id as keyof typeof state.inventory] = current + added;
  return added;
}

function needsWater(crop: VillageState['crops'][number]): boolean {
  const growth = itemDef(crop.seed)?.grows;
  return !!growth && crop.stage < growth.stages && crop.wateredAt === null;
}

function recordActivity(state: VillageState, day: string, resident: CommunityResident, residentCount: number, fishLimit: { remaining: number }): CommunityActivityRecord {
  const progress = state.community.residents[resident.id] ??= normalizeResidentProgress(null);
  const waterCrop = state.crops.filter(needsWater).sort((a, b) => a.y - b.y || a.x - b.x)[0];
  const harvestCrop = state.crops.filter((crop) => {
    const growth = itemDef(crop.seed)?.grows;
    return !!growth && crop.stage >= growth.stages && (state.inventory[growth.crop] ?? 0) < 995;
  }).sort((a, b) => a.y - b.y || a.x - b.x)[0];
  const affinityActivities = (resident.types ?? []).flatMap((type) => TYPE_AFFINITIES[type]);
  const interests = state.community.residents[resident.id]?.interests ?? [];
  const canFish = affinityActivities.includes('pesca') || interests.includes('pesca');
  const canCook = affinityActivities.includes('culinaria') || interests.includes('culinaria');
  const cookable = canCook
    ? ITEMS.filter((item) => item.kind === 'food' && item.recipe && (state.inventory[item.id as keyof typeof state.inventory] ?? 0) < 999 && Object.entries(item.recipe).every(([id, qty]) => (state.inventory[id as keyof typeof state.inventory] ?? 0) >= (qty ?? 0)))
      .sort((a, b) => a.id.localeCompare(b.id))[0]
    : undefined;
  const fishItem = itemDef('peixe');
  const fishAvailable = canFish && fishLimit.remaining > 0 && !!fishItem && (state.inventory.peixe ?? 0) < 999;
  const agricultureAvailable = !!(harvestCrop || waterCrop);
  const available: VillageActivity[] = ['descanso'];
  if (agricultureAvailable) available.push('agricultura');
  if (fishAvailable) available.push('pesca');
  if (cookable) available.push('culinaria');
  if (residentCount > 1) available.push('acolhimento', 'brincadeira');
  if (available.length === 1) available.push('exploracao', 'pesquisa');
  const shortageNeed = state.community.shortageDays > 0 ? 4 : 0;
  const choice = chooseActivity({
    available, types: resident.types ?? [], interests: progress.interests, energy: progress.energy,
    socialOpportunity: resident.socialOpportunity ?? (residentCount > 1 ? 1 : 0),
    communityNeeds: [
      ...(agricultureAvailable ? [{ activity: 'agricultura' as const, urgency: (harvestCrop ? 3 : 2) + shortageNeed }] : []),
      ...(fishAvailable ? [{ activity: 'pesca' as const, urgency: shortageNeed + 1 }] : []),
      ...(cookable ? [{ activity: 'culinaria' as const, urgency: shortageNeed + 1 }] : []),
    ],
    recentActivity: progress.recentActivity ?? undefined,
    rememberedActivity: progress.rememberedActivity ?? undefined,
  }, rngFor(`${day}:${resident.id}:${progress.completedActivities}`));

  let result = 'Fez uma pausa tranquila pela Vila.';
  let item: string | undefined;
  let qty: number | undefined;
  let x: number | undefined;
  let y: number | undefined;
  if (choice.activity === 'agricultura') {
    if (harvestCrop) {
      const growth = itemDef(harvestCrop.seed)!.grows!;
      const rng = rngFor(`${day}:${resident.id}:harvest:${harvestCrop.x},${harvestCrop.y}`);
      const requested = growth.yield[0] + Math.floor(rng() * (growth.yield[1] - growth.yield[0] + 1));
      qty = inventoryAdd(state, growth.crop, requested);
      if (qty > 0) {
        state.crops.splice(state.crops.indexOf(harvestCrop), 1);
        item = growth.crop;
        x = harvestCrop.x;
        y = harvestCrop.y;
        result = `Colheu ${qty} ${itemDef(item)?.name ?? item} de um canteiro pronto.`;
      } else result = 'Cuidou da horta, mas o estoque desse cultivo já estava cheio.';
    } else if (waterCrop) {
      waterCrop.wateredAt = Date.parse(`${day}T12:00:00`);
      x = waterCrop.x;
      y = waterCrop.y;
      result = 'Regou uma planta que precisava de água.';
    }
  } else if (choice.activity === 'pesca' && fishAvailable) {
    qty = inventoryAdd(state, 'peixe', 1);
    if (qty > 0) {
      fishLimit.remaining--;
      item = 'peixe';
      result = 'Pescou um peixe no lago da Vila.';
    }
  } else if (choice.activity === 'culinaria' && cookable?.recipe) {
    for (const [id, amount] of Object.entries(cookable.recipe)) {
      const key = id as keyof typeof state.inventory;
      state.inventory[key] = Math.max(0, (state.inventory[key] ?? 0) - (amount ?? 0));
      if (state.inventory[key] === 0) delete state.inventory[key];
    }
    qty = inventoryAdd(state, cookable.id, 1);
    if (qty > 0) {
      item = cookable.id;
      result = `Preparou ${cookable.name} com ingredientes da despensa.`;
    }
  } else if (choice.activity === 'acolhimento') result = 'Fez companhia aos outros moradores na praça.';
  else if (choice.activity === 'brincadeira') result = 'Brincou um pouco com a turma.';
  else if (choice.activity === 'exploracao') result = 'Passeou por uma trilha conhecida da Vila.';
  else if (choice.activity === 'pesquisa') result = 'Leu um livro e descansou a cabeça.';

  progress.energy = choice.activity === 'descanso'
    ? Math.min(100, progress.energy + COMMUNITY_RULES.restEnergyGain)
    : Math.max(0, progress.energy - COMMUNITY_RULES.taskEnergyCost);
  progress.completedActivities = Math.min(1_000_000, progress.completedActivities + 1);
  const experience = (progress.experience[choice.activity] ?? 0) + 1;
  progress.experience[choice.activity] = experience;
  const learned = experience >= 3 && !progress.interests.includes(choice.activity) && progress.interests.length < 3;
  if (learned) progress.interests.push(choice.activity);
  progress.rememberedActivity = experience >= 2 ? choice.activity : progress.rememberedActivity;
  progress.recentActivity = choice.activity;
  if (learned) result += ' Essa atividade está virando um novo interesse.';
  return { residentId: resident.id, activity: choice.activity, icon: ACTIVITY_ICONS[choice.activity], result, ...(item ? { item } : {}), ...(qty !== undefined ? { qty } : {}), ...(x !== undefined ? { x } : {}), ...(y !== undefined ? { y } : {}) };
}

function recordSharedActivities(state: VillageState, day: string, activities: readonly CommunityActivityRecord[]): void {
  const participants = activities.filter((entry) => entry.activity === 'acolhimento' || entry.activity === 'brincadeira').slice(0, 3);
  if (participants.length < 2) return;
  const lastShared = [...state.diary].reverse().find((entry) => entry.tpl === 'comunidade-praca');
  if (lastShared && Date.parse(`${day}T12:00:00Z`) - Date.parse(`${lastShared.day}T12:00:00Z`) < 7 * 86_400_000) return;
  const momentId = `comunidade:${day}:praca`;
  recordMomentAndMemory(state, {
    id: momentId,
    t: Date.parse(`${day}T12:00:00Z`),
    day,
    hour: 12,
    tpl: 'comunidade-praca',
    kind: 'amizade',
    title: 'Encontro na praça',
    emoji: '🤝',
    cast: participants.map((entry) => ({ id: entry.residentId, name: entry.residentId })),
    lines: participants.map((entry, who) => ({ who, text: entry.activity === 'acolhimento' ? 'Fez companhia a outros moradores na praça.' : 'Brincou com a turma na praça.' })),
    result: ['Compartilharam a praça e fortaleceram a amizade.'],
  }, 'amizade');
}

function recordCrisisHelp(
  state: VillageState,
  day: string,
  activities: readonly CommunityActivityRecord[],
  inventoryBefore: VillageState['inventory'],
  consumed: readonly { item: string; qty: number }[],
  crisisActive: boolean,
): void {
  if (!crisisActive) return;
  const lastHelp = [...state.diary].reverse().find((entry) => entry.tpl === 'comunidade-ajuda-despensa');
  if (lastHelp && Date.parse(`${day}T12:00:00Z`) - Date.parse(`${lastHelp.day}T12:00:00Z`) < 3 * 86_400_000) return;
  const newServings = new Map(consumed.map((entry) => [
    entry.item,
    Math.max(0, entry.qty - (inventoryBefore[entry.item as keyof typeof inventoryBefore] ?? 0)),
  ]));
  const participants = activities.flatMap((entry) => {
    if (!entry.item || !entry.qty || !itemDef(entry.item)?.nutrition) return [];
    const remaining = newServings.get(entry.item) ?? 0;
    const helpedQty = Math.min(entry.qty, remaining);
    newServings.set(entry.item, remaining - helpedQty);
    return helpedQty > 0 ? [{ ...entry, helpedQty }] : [];
  }).slice(0, 3);
  if (participants.length === 0) return;
  const portions = participants.reduce((sum, entry) => sum + (itemDef(entry.item!)?.nutrition ?? 0) * entry.helpedQty, 0);
  const momentId = `comunidade:${day}:ajuda-despensa`;
  const names = participants.map((entry) => entry.residentId).join(', ');
  recordMomentAndMemory(state, {
    id: momentId,
    t: Date.parse(`${day}T13:00:00Z`),
    day,
    hour: 13,
    tpl: 'comunidade-ajuda-despensa',
    kind: participants.length > 1 ? 'amizade' : 'solo',
    title: 'Ajuda na despensa',
    emoji: '🥣',
    cast: participants.map((entry) => ({ id: entry.residentId, name: entry.residentId })),
    lines: participants.map((entry, who) => ({ who, text: `${entry.result} Essa produção foi servida à comunidade.` })),
    result: [`A contribuição de ${names} colocou ${portions} porção(ões) de produção de hoje na mesa durante a escassez.`],
  }, participants.length > 1 ? 'amizade' : null);
}

function consumeFood(state: VillageState, target: number, residents: readonly CommunityResident[]): { portions: number; shortage: number; preferredServings: number; consumed: { item: string; qty: number }[] } {
  let remaining = target;
  let served = 0;
  let preferredServings = 0;
  const consumed: { item: string; qty: number }[] = [];
  const preferredItems = new Set<string>();
  for (const resident of residents) {
    if (remaining <= 0) break;
    if (!resident.favoriteFood) continue;
    const favorite = itemDef(resident.favoriteFood);
    const available = favorite ? state.inventory[favorite.id] ?? 0 : 0;
    const nutrition = favorite?.nutrition ?? 0;
    if (!favorite || available <= 0 || nutrition <= 0) continue;
    const left = available - 1;
    if (left <= 0) delete state.inventory[favorite.id];
    else state.inventory[favorite.id] = left;
    const portions = Math.min(remaining, nutrition);
    remaining -= portions;
    served += nutrition;
    preferredServings += portions;
    preferredItems.add(favorite.id);
    const existing = consumed.find((entry) => entry.item === favorite.id);
    if (existing) existing.qty++;
    else consumed.push({ item: favorite.id, qty: 1 });
  }
  const candidates = ITEMS.filter((item) => (item.nutrition ?? 0) > 0).sort((a, b) =>
    (a.sell / (a.nutrition ?? 1)) - (b.sell / (b.nutrition ?? 1)) || a.id.localeCompare(b.id),
  );
  for (const item of candidates) {
    if (remaining <= 0) break;
    // Se a preferência acabou de ser servida, não escolha o mesmo item por preço antes de outros alimentos comuns.
    if (preferredItems.has(item.id)) continue;
    const available = state.inventory[item.id] ?? 0;
    const nutrition = item.nutrition ?? 0;
    if (available <= 0 || nutrition <= 0) continue;
    const qty = Math.min(available, Math.ceil(remaining / nutrition));
    const left = available - qty;
    if (left <= 0) delete state.inventory[item.id];
    else state.inventory[item.id] = left;
    const portions = qty * nutrition;
    remaining -= portions;
    served += portions;
    consumed.push({ item: item.id, qty });
  }
  return { portions: served, shortage: Math.max(0, target - served), preferredServings, consumed };
}

function settleDay(state: VillageState, day: string, residents: readonly CommunityResident[]): CommunityCycle {
  const residentCount = residents.length;
  const target = Math.ceil(residentCount * COMMUNITY_RULES.mealsPerResident);
  if (residentCount === 0) {
    return {
      day, residents: 0, foodTarget: 0, foodServed: 0, preferredServings: 0, activities: [], consumed: [], maintenanceDue: 0, maintenancePaid: 0,
      foodShortage: 0, servicesUnfunded: 0, welfare: state.community.welfare, trust: state.community.trust,
      shortageDays: state.community.shortageDays, notice: '',
    };
  }
  const fishLimit = { remaining: 1 };
  const inventoryBefore = { ...state.inventory };
  const activities = residents.slice(0, COMMUNITY_RULES.residentLimit).map((resident) => recordActivity(state, day, resident, residentCount, fishLimit));
  const food = consumeFood(state, target, residents);
  recordSharedActivities(state, day, activities);
  recordCrisisHelp(state, day, activities, inventoryBefore, food.consumed, state.community.shortageDays > 0 || food.shortage > 0);
  const maintenanceDue = residentCount * COMMUNITY_RULES.dailyMaintenancePerResident + COMMUNITY_RULES.dailyTownServiceBase;
  const maintenancePaid = Math.min(state.coins, maintenanceDue);
  state.coins -= maintenancePaid;
  const servicesUnfunded = maintenanceDue - maintenancePaid;
  const previousPhase = shortagePhase(state.community.shortageDays);
  if (food.shortage > 0) {
    state.community.shortageDays = Math.min(365, state.community.shortageDays + 1);
    const days = state.community.shortageDays;
    const loss = days === 1 ? 1 : days <= 3 ? 2 : days <= 6 ? 3 : 3;
    state.community.welfare = Math.max(0, state.community.welfare - loss);
    if (days === 2 || days === 4 || days === 7) state.community.trust = Math.max(0, state.community.trust - 1);
  } else {
    state.community.shortageDays = 0;
    state.community.welfare = Math.min(100, state.community.welfare + 2);
    if (previousPhase > 0) state.community.trust = Math.min(100, state.community.trust + 1);
  }
  if (servicesUnfunded === 0 && maintenanceDue > 0) state.community.trust = Math.min(100, state.community.trust + 1);

  const notice = shortageNotice(state.community.shortageDays) || (previousPhase > 0 && state.community.shortageDays === 0
    ? 'A reserva de alimentos foi recuperada; a Vila começa a se recompor.'
    : servicesUnfunded > 0 ? `A manutenção da Vila ficou incompleta por falta de ${servicesUnfunded} moedas.` : '');
  return {
    day, residents: residentCount, foodTarget: target, foodServed: food.portions, preferredServings: food.preferredServings, activities, consumed: food.consumed,
    maintenanceDue, maintenancePaid, foodShortage: food.shortage, servicesUnfunded,
    welfare: state.community.welfare, trust: state.community.trust, shortageDays: state.community.shortageDays, notice,
  };
}

export function socialOpportunityFromMemories(state: Pick<VillageState, 'memories'>, residentId: string, activeIds: ReadonlySet<string>): number {
  if (activeIds.size < 2) return 0;
  const latestByPartner = new Map<string, VillageState['memories'][number]['kind']>();
  for (const memory of state.memories) {
    if (memory.mon !== residentId) continue;
    for (const partner of memory.with) if (partner !== residentId && activeIds.has(partner)) latestByPartner.set(partner, memory.kind);
  }
  const influence = [...latestByPartner.values()].reduce((total, kind) =>
    total + (kind === 'amizade' || kind === 'romance' ? 1 : kind === 'rivalidade' ? -1 : 0), 0);
  return Math.max(0, Math.min(4, 1 + influence));
}

/**
 * Liquida ciclos locais uma única vez, com ausência limitada a sete dias. Saves sem o campo novo são apenas
 * inicializados no dia atual, sem cobrança retroativa. Mudar o relógio para trás nunca reabre um ciclo liquidado.
 */
export function advanceCommunity(state: VillageState, today: string, residentIds: readonly (string | CommunityResident)[]): { cycles: CommunityCycle[]; initialized: boolean; skippedDays: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return { cycles: [], initialized: false, skippedDays: 0 };
  if (!state.community.lastCycleDay) {
    state.community.lastCycleDay = today;
    return { cycles: [], initialized: true, skippedDays: 0 };
  }
  if (today <= state.community.lastCycleDay) return { cycles: [], initialized: false, skippedDays: 0 };

  const days: string[] = [];
  let day = nextDay(state.community.lastCycleDay);
  while (day && day <= today && days.length < COMMUNITY_RULES.maxCatchUpDays) {
    days.push(day);
    day = nextDay(day);
  }
  const skippedDays = day && day <= today ? 1 + Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86_400_000) : 0;
  const baseResidents = residentsOf(residentIds).slice(0, COMMUNITY_RULES.residentLimit);
  const activeIds = new Set(baseResidents.map((resident) => resident.id));
  const inactiveCapacity = Math.max(0, COMMUNITY_RULES.residentLimit - activeIds.size);
  const inactiveProfiles = inactiveCapacity > 0
    ? Object.entries(state.community.residents).filter(([id]) => !activeIds.has(id)).slice(-inactiveCapacity)
    : [];
  state.community.residents = Object.fromEntries([
    ...inactiveProfiles,
    ...Object.entries(state.community.residents).filter(([id]) => activeIds.has(id)),
  ]);
  const cycles = days.map((cycleDay) => settleDay(state, cycleDay, baseResidents.map((resident) => ({
    ...resident,
    socialOpportunity: resident.socialOpportunity ?? socialOpportunityFromMemories(state, resident.id, activeIds),
  }))));
  state.community.lastCycleDay = today;
  state.community.history = [...state.community.history, ...cycles].slice(-COMMUNITY_RULES.historyLimit);
  return { cycles, initialized: false, skippedDays };
}

/** Aplica somente perdas da liquidação; não consome itens que não estejam catalogados como alimento. */
export function communityFoodPortions(state: Pick<VillageState, 'inventory'>): number {
  return portionsAvailable(state);
}

