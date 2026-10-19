import type { FurnitureId, ItemId, VillageState } from './life';
import type { PersonalityName } from './personality';
import type { VillageRequest } from './requests';

export type DiscoveryPlace = 'lago' | 'parque' | 'bosque' | 'fazenda' | 'praca';

export interface DiscoveryState {
  steps: Record<string, number>;
  found: string[];
  lastPlace?: DiscoveryPlace | null;
}

interface DiscoveryDefinition {
  place: DiscoveryPlace;
  title: string;
  clues: readonly string[];
  rewardCoins: number;
  rewardItem: ItemId;
  /** Relíquia que entra uma vez na coleção quando a descoberta é concluída de verdade. */
  rewardFurniture: FurnitureId;
  /** Página factual do Diário, criada só no instante em que o lugar é alcançado. */
  diary: string;
  requires?: string;
  request: Omit<VillageRequest, 'id' | 'day' | 'done' | 'persistent'>;
}

export interface DiscoveryResult {
  id: string;
  title: string;
  text: string;
  rewardCoins: number;
  rewardItem?: ItemId;
  rewardFurniture?: FurnitureId;
  diary?: string;
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
  /** Semana do festival já jogado; impede prêmio repetido sem apagar o evento da semana. */
  festivalWeek: string;
  festivalWon: boolean;
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

const DISCOVERIES: Record<string, DiscoveryDefinition> = {
  'lago-caverna': {
    place: 'lago', title: 'A passagem do lago', clues: ['Há marcas de água perto das pedras.', 'O eco responde quando alguém canta.', 'Uma passagem aparece sob a margem.'], rewardCoins: 35, rewardItem: 'cristal', rewardFurniture: 'lampiao-cristal', diary: 'Você encontrou uma passagem escondida sob a margem do lago. O cristal que trouxe de lá agora ilumina o caminho.',
    request: { kind: 'collect', title: 'Preparar a passagem do lago', detail: 'A passagem sob a margem precisa de duas conchas para não desabar.', location: 'Praia do lago', item: 'concha', qty: 2, rewardCoins: 18, rewardItem: 'cristal', rewardQty: 1, rewardFriend: 0 },
  },
  'bosque-atalho': {
    place: 'bosque', title: 'A clareira do bosque', clues: ['As árvores formam uma seta.', 'Um Pokémon deixa sementes no caminho.', 'O atalho leva a uma clareira escondida.'], rewardCoins: 28, rewardItem: 'mel', rewardFurniture: 'banco-cogumelo', diary: 'Seguindo as marcas entre as árvores, você chegou a uma clareira quieta. Um banco cogumelo estava guardado ali, como se esperasse uma visita.', requires: 'lago-caverna',
    request: { kind: 'collect', title: 'Marcar o atalho do bosque', detail: 'Leve três madeiras para fazer placas na clareira recém-encontrada.', location: 'Bosque do Sul', item: 'madeira', qty: 3, rewardCoins: 20, rewardItem: 'mel', rewardQty: 1, rewardFriend: 0 },
  },
  'fazenda-nascente': {
    place: 'fazenda', title: 'A nascente da fazenda', clues: ['A terra está úmida mesmo sem chuva.', 'As raízes apontam para o muro.', 'Uma nascente alimenta os canteiros.'], rewardCoins: 30, rewardItem: 'perola', rewardFurniture: 'poco', diary: 'Atrás da horta, você encontrou uma nascente que alimenta os canteiros. As pedras ao redor formavam um poço antigo, agora salvo na sua coleção.', requires: 'bosque-atalho',
    request: { kind: 'collect', title: 'Cuidar da nascente', detail: 'A água nova precisa de duas frutas para alimentar os primeiros canteiros.', location: 'Fazenda', item: 'oran', qty: 2, rewardCoins: 22, rewardItem: 'perola', rewardQty: 1, rewardFriend: 0 },
  },
  'parque-caixa': {
    place: 'parque', title: 'A caixa sob o parquinho', clues: ['O brinquedo faz um som oco.', 'Há riscos recentes na madeira.', 'Uma caixa antiga estava escondida sob o parquinho.'], rewardCoins: 24, rewardItem: 'tecido', rewardFurniture: 'caixa-correio-rosa', diary: 'Debaixo do parquinho havia uma caixa antiga, forrada de tecido. Ela guardava uma caixa de correio rosa para alguém deixar novos recados na Vila.', requires: 'fazenda-nascente',
    request: { kind: 'collect', title: 'Abrir a caixa do parquinho', detail: 'Leve dois tecidos para forrar a caixa antiga sem estragar o que há dentro.', location: 'Parquinho', item: 'tecido', qty: 2, rewardCoins: 24, rewardItem: 'tecido', rewardQty: 1, rewardFriend: 0 },
  },
};

export const DISCOVERY_DEFS = DISCOVERIES;

export function emptyWorldProgress(): { discoveries: DiscoveryState; weekly: WeeklyState; expeditions: Expedition[] } {
  return { discoveries: { steps: {}, found: [], lastPlace: null }, weekly: { week: '', eventId: '', festivalWeek: '', festivalWon: false }, expeditions: [] };
}

function discoveryRequest(state: VillageState, id: string): VillageRequest | undefined {
  return (state.requests.story ?? []).find((request) => request.id === `desc:${id}`);
}

function discoveryResolved(state: VillageState, id: string): boolean {
  return state.discoveries.found.includes(id) && discoveryRequest(state, id)?.done === true;
}

function discoveryAvailable(state: VillageState, id: string): boolean {
  const requirement = DISCOVERIES[id]?.requires;
  return !requirement || discoveryResolved(state, requirement);
}

function createDiscoveryRequest(state: VillageState, id: string): void {
  const def = DISCOVERIES[id];
  if (!def || (state.requests.story ?? []).some((request) => request.id === `desc:${id}`)) return;
  state.requests.story ??= [];
  state.requests.story.push({ id: `desc:${id}`, day: '', persistent: true, done: false, ...def.request });
  state.requests.story = state.requests.story.slice(-8);
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
  return { discoveries: { steps, found, lastPlace }, weekly: { week: typeof w.week === 'string' ? w.week.slice(0, 10) : '', eventId: typeof w.eventId === 'string' ? w.eventId.slice(0, 40) : '', festivalWeek: typeof w.festivalWeek === 'string' ? w.festivalWeek.slice(0, 10) : '', festivalWon: w.festivalWon === true }, expeditions };
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
  if (!place) {
    state.discoveries.lastPlace = null;
    return null;
  }
  if (state.discoveries.lastPlace === place) return null;
  state.discoveries.lastPlace = place;
  const entry = Object.entries(DISCOVERIES).find(([id, d]) => d.place === place && !state.discoveries.found.includes(id) && discoveryAvailable(state, id));
  if (!entry) return null;
  const [id, def] = entry;
  const step = (state.discoveries.steps[id] ?? 0) + 1;
  state.discoveries.steps[id] = Math.min(def.clues.length, step);
  if (step < def.clues.length) return { id, title: def.title, text: `🔎 Descoberta ${step}/${def.clues.length}: ${def.clues[step - 1]!}`, rewardCoins: 0, completed: false };
  state.discoveries.found.push(id);
  createDiscoveryRequest(state, id);
  return { id, title: def.title, text: `✨ Descoberta completa: ${def.clues[def.clues.length - 1]!}`, rewardCoins: def.rewardCoins, rewardItem: def.rewardItem, rewardFurniture: def.rewardFurniture, diary: def.diary, completed: true };
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
  state.weekly = state.weekly.week === week
    ? { ...state.weekly, eventId: event.id }
    : { week, eventId: event.id, festivalWeek: '', festivalWon: false };
  return event;
}

const FESTIVAL_CHOICES = ['Barraca das fitas', 'Barraca das lanternas', 'Barraca das flores'] as const;

function festivalChoiceIndex(state: VillageState): number {
  return Math.abs(state.seed + Date.parse(`${state.weekly.week}T00:00:00Z`) / 86_400_000) % FESTIVAL_CHOICES.length;
}

export interface FestivalRound {
  title: string;
  prompt: string;
  choices: readonly string[];
  played: boolean;
}

/** Desafio curto e determinístico do festival: a barraca certa muda toda semana para cada Vila. */
export function festivalRound(state: VillageState, day: string): FestivalRound {
  const event = weeklyEventFor(state, day);
  const correct = festivalChoiceIndex(state);
  return {
    title: event.title,
    prompt: `A placa do festival diz: “Procure a ${FESTIVAL_CHOICES[correct]!.replace('Barraca das ', '')}”.`,
    choices: FESTIVAL_CHOICES,
    played: state.weekly.festivalWeek === state.weekly.week,
  };
}

export function completeFestival(state: VillageState, day: string, choice: number): { ok: boolean; title: string; text: string; coins: number } {
  const round = festivalRound(state, day);
  if (round.played) return { ok: false, title: round.title, text: 'A brincadeira desta semana já terminou.', coins: 0 };
  const correct = festivalChoiceIndex(state);
  const won = choice === correct;
  state.weekly.festivalWeek = state.weekly.week;
  state.weekly.festivalWon = won;
  return { ok: true, title: round.title, text: won ? 'Você encontrou a barraca indicada e ganhou os aplausos da praça!' : 'Você escolheu outra barraca, mas entrou na brincadeira e ajudou a animar a praça.', coins: won ? 25 : 8 };
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
