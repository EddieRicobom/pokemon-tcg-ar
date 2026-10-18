import type { ItemId, VillageState } from './life';
import type { PersonalityName } from './personality';

export type DiscoveryPlace = 'lago' | 'parque' | 'bosque' | 'fazenda' | 'praca';

export interface DiscoveryState {
  steps: Record<string, number>;
  found: string[];
  lastPlace?: DiscoveryPlace | null;
}

export interface DiscoveryResult {
  id: string;
  text: string;
  rewardCoins: number;
  rewardItem?: ItemId;
  completed: boolean;
}

export interface WeeklyEvent {
  id: string;
  title: string;
  place: string;
  detail: string;
  bonus: string;
}

export interface WeeklyState {
  week: string;
  eventId: string;
}

export interface Expedition {
  id: string;
  monId: string;
  place: DiscoveryPlace;
  startedAt: number;
  finishAt: number;
  weather: string | null;
  result?: ExpeditionResult;
}

export interface ExpeditionResult {
  text: string;
  coins: number;
  item?: ItemId;
  qty: number;
}

export interface RequestInfluence {
  weather: 'chuva' | 'neve' | null;
  hourShift: number;
  bellBonus: number;
  townPressure: number;
}

export interface WeeklyModifiers {
  saleMultiplier: number;
  cropGrowthFactor: number;
  hourShift: number;
  sceneCoins: number;
}

const DISCOVERIES: Record<string, { place: DiscoveryPlace; clues: readonly string[]; rewardCoins: number; rewardItem: ItemId }> = {
  'lago-caverna': { place: 'lago', clues: ['Há marcas de água perto das pedras.', 'O eco responde quando alguém canta.', 'Uma passagem aparece sob a margem.'], rewardCoins: 35, rewardItem: 'cristal' },
  'bosque-atalho': { place: 'bosque', clues: ['As árvores formam uma seta.', 'Um Pokémon deixa sementes no caminho.', 'O atalho leva a uma clareira escondida.'], rewardCoins: 28, rewardItem: 'mel' },
  'fazenda-nascente': { place: 'fazenda', clues: ['A terra está úmida mesmo sem chuva.', 'As raízes apontam para o muro.', 'Uma nascente alimenta os canteiros.'], rewardCoins: 30, rewardItem: 'perola' },
  'parque-caixa': { place: 'parque', clues: ['O brinquedo faz um som oco.', 'Há riscos recentes na madeira.', 'Uma caixa antiga estava escondida sob o parquinho.'], rewardCoins: 24, rewardItem: 'tecido' },
};

export const DISCOVERY_DEFS = DISCOVERIES;

export function emptyWorldProgress(): { discoveries: DiscoveryState; weekly: WeeklyState; expeditions: Expedition[] } {
  return { discoveries: { steps: {}, found: [], lastPlace: null }, weekly: { week: '', eventId: '' }, expeditions: [] };
}

export function normalizeWorldProgress(raw: unknown): ReturnType<typeof emptyWorldProgress> {
  const r = raw && typeof raw === 'object' ? raw as Partial<ReturnType<typeof emptyWorldProgress>> : {};
  const d = r.discoveries && typeof r.discoveries === 'object' ? r.discoveries : {};
  const steps = d && typeof d === 'object' && 'steps' in d && d.steps && typeof d.steps === 'object'
    ? Object.fromEntries(Object.entries(d.steps).filter(([id, n]) => id in DISCOVERIES && Number.isInteger(n)).map(([id, n]) => [id, Math.max(0, Math.min(3, n as number))]))
    : {};
  const found = d && typeof d === 'object' && 'found' in d && Array.isArray(d.found) ? [...new Set(d.found.filter((id): id is string => typeof id === 'string' && id in DISCOVERIES))].slice(0, 40) : [];
  const w = r.weekly && typeof r.weekly === 'object' ? r.weekly as Partial<WeeklyState> : {};
  const expeditions = Array.isArray(r.expeditions) ? r.expeditions.filter((e): e is Expedition => !!e && typeof e === 'object' && typeof e.id === 'string' && typeof e.monId === 'string' && typeof e.place === 'string' && Number.isFinite(e.startedAt) && Number.isFinite(e.finishAt)).slice(-3) : [];
  const lastPlace = d && typeof d === 'object' && 'lastPlace' in d && typeof d.lastPlace === 'string' && ['lago', 'parque', 'bosque', 'fazenda', 'praca'].includes(d.lastPlace) ? d.lastPlace as DiscoveryPlace : null;
  return { discoveries: { steps, found, lastPlace }, weekly: { week: typeof w.week === 'string' ? w.week.slice(0, 10) : '', eventId: typeof w.eventId === 'string' ? w.eventId.slice(0, 40) : '' }, expeditions };
}

function placeFor(x: number, y: number): DiscoveryPlace | null {
  if (x >= 76 && y <= 25) return 'lago';
  if (x <= 22 && y >= 40 && y <= 59) return 'parque';
  if (x <= 28 && y >= 58) return 'bosque';
  if (x >= 76 && y >= 45) return 'fazenda';
  if (x >= 40 && x <= 55 && y >= 32 && y <= 42) return 'praca';
  return null;
}

export function discoverAt(state: VillageState, x: number, y: number): DiscoveryResult | null {
  const place = placeFor(x, y);
  if (!place) return null;
  if (state.discoveries.lastPlace === place) return null;
  state.discoveries.lastPlace = place;
  const entry = Object.entries(DISCOVERIES).find(([id, d]) => d.place === place && !state.discoveries.found.includes(id));
  if (!entry) return null;
  const [id, def] = entry;
  const step = (state.discoveries.steps[id] ?? 0) + 1;
  state.discoveries.steps[id] = Math.min(def.clues.length, step);
  if (step < def.clues.length) return { id, text: `🔎 Descoberta ${step}/${def.clues.length}: ${def.clues[step - 1]!}`, rewardCoins: 0, completed: false };
  state.discoveries.found.push(id);
  return { id, text: `✨ Descoberta completa: ${def.clues[def.clues.length - 1]!}`, rewardCoins: def.rewardCoins, rewardItem: def.rewardItem, completed: true };
}

const WEEKLY_EVENTS: readonly WeeklyEvent[] = [
  { id: 'feira', title: 'Feira da Praça', place: 'Praça da Fonte', detail: 'Materiais coletados hoje valem mais na loja.', bonus: '+25% no valor de venda de materiais' },
  { id: 'campeonato', title: 'Campeonato de Brincadeiras', place: 'Parquinho', detail: 'Os Pokémon querem competir em duplas.', bonus: 'Momentos de rivalidade rendem +5 moedas' },
  { id: 'noite-luzes', title: 'Noite das Luzes', place: 'Rua Principal', detail: 'A Vila fica iluminada e os moradores ficam acordados até mais tarde.', bonus: 'Moradores dormem 2 horas mais tarde' },
  { id: 'mutirao', title: 'Mutirão da Horta', place: 'Fazenda', detail: 'A cidade inteira ajuda a cuidar dos canteiros.', bonus: 'Crescimento da horta 25% mais rápido' },
];

export function weekKey(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const monday = new Date(d);
  const shift = (d.getUTCDay() + 6) % 7;
  monday.setUTCDate(d.getUTCDate() - shift);
  return monday.toISOString().slice(0, 10);
}

export function weeklyEventFor(state: VillageState, day: string): WeeklyEvent {
  const week = weekKey(day);
  const index = Math.abs(state.seed + Date.parse(`${week}T00:00:00Z`) / 86_400_000) % WEEKLY_EVENTS.length;
  const event = WEEKLY_EVENTS[index]!;
  state.weekly = { week, eventId: event.id };
  return event;
}

export function weeklyModifiers(state: VillageState): WeeklyModifiers {
  switch (state.weekly.eventId) {
    case 'feira': return { saleMultiplier: 1.25, cropGrowthFactor: 1, hourShift: 0, sceneCoins: 0 };
    case 'mutirao': return { saleMultiplier: 1, cropGrowthFactor: 0.75, hourShift: 0, sceneCoins: 0 };
    case 'noite-luzes': return { saleMultiplier: 1, cropGrowthFactor: 1, hourShift: 2, sceneCoins: 0 };
    case 'campeonato': return { saleMultiplier: 1, cropGrowthFactor: 1, hourShift: 0, sceneCoins: 5 };
    default: return { saleMultiplier: 1, cropGrowthFactor: 1, hourShift: 0, sceneCoins: 0 };
  }
}

export function requestInfluence(state: VillageState, day: string): RequestInfluence {
  const pending = state.requests.items.filter((r) => !r.done && r.day === day);
  const locations = pending.map((r) => r.location.toLowerCase()).join(' ');
  return {
    weather: locations.includes('lago') || locations.includes('praia') ? 'chuva' : null,
    hourShift: pending.some((r) => r.location.toLowerCase().includes('correio')) ? 1 : 0,
    bellBonus: pending.length >= 2 ? 1 : 0,
    townPressure: pending.length === 3 ? 1 : 0,
  };
}

export function discoveryPlaceAt(x: number, y: number): DiscoveryPlace | null { return placeFor(x, y); }

const PLACE_ITEMS: Record<DiscoveryPlace, ItemId> = { lago: 'concha', parque: 'flor', bosque: 'madeira', fazenda: 'oran', praca: 'tecido' };

export function startExpedition(state: VillageState, monId: string, place: DiscoveryPlace, now: number, weather: string | null): { ok: boolean; message: string } {
  if (state.expeditions.some((e) => !e.result && e.finishAt > now)) return { ok: false, message: 'Esse Pokémon ainda está em uma expedição.' };
  if (state.expeditions.filter((e) => !e.result).length >= 2) return { ok: false, message: 'A Vila só consegue acompanhar duas expedições ao mesmo tempo.' };
  const id = `exp:${monId}:${now.toString(36)}`;
  state.expeditions.push({ id, monId, place, startedAt: now, finishAt: now + 15 * 60_000, weather });
  state.expeditions = state.expeditions.slice(-6);
  return { ok: true, message: 'Expedição iniciada. Volte depois para descobrir o que aconteceu.' };
}

export function resolveExpeditions(state: VillageState, now: number, personality: (id: string) => PersonalityName, types: (id: string) => readonly string[], friendship: (id: string) => number = () => 0): Expedition[] {
  const done: Expedition[] = [];
  for (const expedition of state.expeditions) {
    if (expedition.result || expedition.finishAt > now) continue;
    const p = personality(expedition.monId);
    const type = types(expedition.monId)[0] ?? 'normal';
    const bonus = (p === 'Curioso' || p === 'Corajoso' ? 8 : 0) + (type === 'water' && expedition.place === 'lago' ? 8 : 0) + (expedition.weather === 'chuva' && p === 'Calmo' ? 5 : 0) + Math.min(6, Math.floor(Math.max(0, friendship(expedition.monId)) / 15));
    const item = PLACE_ITEMS[expedition.place];
    expedition.result = { text: `${expedition.monId} voltou da expedição com novas histórias.`, coins: 10 + bonus, item, qty: 1 + Math.floor(bonus / 8) };
    done.push(expedition);
  }
  return done;
}
