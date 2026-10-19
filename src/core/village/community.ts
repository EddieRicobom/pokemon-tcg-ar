import { ITEMS, itemDef } from './catalog';
import type { VillageState } from './life';

/** Regras centrais da comunidade: porções e manutenção são liquidadas uma vez por dia local. */
export const COMMUNITY_RULES = {
  mealsPerResident: 1.5,
  dailyMaintenancePerResident: 4,
  dailyTownServiceBase: 10,
  maxCatchUpDays: 7,
  historyLimit: 30,
} as const;

export interface CommunityCycle {
  day: string;
  residents: number;
  foodTarget: number;
  foodServed: number;
  preferredServings: number;
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
}

export interface CommunityForecast {
  residents: number;
  foodAvailable: number;
  foodTarget: number;
  mealsAtCurrentStock: number;
  maintenanceDue: number;
  maintenanceFunded: boolean;
}

export interface CommunityResident {
  id: string;
  /** Preferência alimentar já existente na Vila, quando os tipos deste morador estão disponíveis. */
  favoriteFood?: string;
}

export const emptyCommunity = (): CommunityState => ({ lastCycleDay: '', welfare: 70, trust: 70, shortageDays: 0, history: [] });

function integer(value: unknown, min = 0, max = 999999): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : 0;
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
    maintenanceDue: integer(entry.maintenanceDue), maintenancePaid: integer(entry.maintenancePaid), foodShortage: integer(entry.foodShortage),
    servicesUnfunded: integer(entry.servicesUnfunded), welfare: integer(entry.welfare, 0, 100), trust: integer(entry.trust, 0, 100),
    shortageDays: integer(entry.shortageDays), notice: typeof entry.notice === 'string' ? entry.notice.slice(0, 240) : '',
  })) : [];
  const lastCycleDay = typeof value.lastCycleDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.lastCycleDay) ? value.lastCycleDay : '';
  return {
    lastCycleDay,
    welfare: integer(value.welfare, 0, 100) || (value.welfare === 0 ? 0 : base.welfare),
    trust: integer(value.trust, 0, 100) || (value.trust === 0 ? 0 : base.trust),
    shortageDays: integer(value.shortageDays, 0, 365),
    history,
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
    if (!existing?.favoriteFood && typeof resident.favoriteFood === 'string') residents.set(resident.id, { id: resident.id, favoriteFood: resident.favoriteFood });
    else if (!existing) residents.set(resident.id, { id: resident.id });
  }
  return [...residents.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function activeCount(ids: readonly (string | CommunityResident)[]): number {
  return residentsOf(ids).length;
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
      day, residents: 0, foodTarget: 0, foodServed: 0, preferredServings: 0, consumed: [], maintenanceDue: 0, maintenancePaid: 0,
      foodShortage: 0, servicesUnfunded: 0, welfare: state.community.welfare, trust: state.community.trust,
      shortageDays: state.community.shortageDays, notice: '',
    };
  }
  const food = consumeFood(state, target, residents);
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
    day, residents: residentCount, foodTarget: target, foodServed: food.portions, preferredServings: food.preferredServings, consumed: food.consumed,
    maintenanceDue, maintenancePaid, foodShortage: food.shortage, servicesUnfunded,
    welfare: state.community.welfare, trust: state.community.trust, shortageDays: state.community.shortageDays, notice,
  };
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
  const residents = residentsOf(residentIds);
  const cycles = days.map((cycleDay) => settleDay(state, cycleDay, residents));
  state.community.lastCycleDay = today;
  state.community.history = [...state.community.history, ...cycles].slice(-COMMUNITY_RULES.historyLimit);
  return { cycles, initialized: false, skippedDays };
}

/** Aplica somente perdas da liquidação; não consome itens que não estejam catalogados como alimento. */
export function communityFoodPortions(state: Pick<VillageState, 'inventory'>): number {
  return portionsAvailable(state);
}

