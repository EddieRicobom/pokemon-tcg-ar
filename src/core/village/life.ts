import type { Rng } from '../battle';
import type { PokemonType } from '../pokemon-data';
import { tileAt } from './map';
import type { Tile, VillageMap } from './map';

/**
 * A vida na Vila: inventário, coleta (madeira, pedra, frutas, flores, conchas), a casa em níveis, móveis que você
 * fabrica e coloca no chão, e a amizade com cada Pokémon da sua equipe (conversa uma vez por dia, presentes, pedidos).
 * Tudo puro e determinístico com a semente/dia: a tela só chama estas funções e desenha.
 */

export type ItemId = 'madeira' | 'pedra' | 'oran' | 'pecha' | 'flor' | 'concha' | FurnitureId;
export type FurnitureId = 'cadeira' | 'mesa' | 'luminaria' | 'vaso' | 'fonte' | 'cerca' | 'placa';

export const ITEM_INFO: Record<ItemId, { name: string; emoji: string }> = {
  madeira: { name: 'Madeira', emoji: '🪵' },
  pedra: { name: 'Pedra', emoji: '🪨' },
  oran: { name: 'Fruta Oran', emoji: '🫐' },
  pecha: { name: 'Fruta Pecha', emoji: '🍑' },
  flor: { name: 'Flor', emoji: '🌼' },
  concha: { name: 'Concha', emoji: '🐚' },
  cadeira: { name: 'Cadeira', emoji: '🪑' },
  mesa: { name: 'Mesa', emoji: '🟫' },
  luminaria: { name: 'Lampião', emoji: '🏮' },
  vaso: { name: 'Vaso de flores', emoji: '🪴' },
  fonte: { name: 'Fonte', emoji: '⛲' },
  cerca: { name: 'Cerca', emoji: '🚧' },
  placa: { name: 'Placa', emoji: '🪧' },
};

export const MATERIALS: readonly ItemId[] = ['madeira', 'pedra', 'oran', 'pecha', 'flor', 'concha'];
export const FURNITURE: readonly FurnitureId[] = ['cadeira', 'mesa', 'luminaria', 'vaso', 'fonte', 'cerca', 'placa'];

export const RECIPES: Record<FurnitureId, Partial<Record<ItemId, number>>> = {
  cadeira: { madeira: 3 },
  mesa: { madeira: 5 },
  luminaria: { madeira: 2, pedra: 2 },
  vaso: { flor: 3, pedra: 1 },
  fonte: { pedra: 6, concha: 2 },
  cerca: { madeira: 2 },
  placa: { madeira: 2, pedra: 1 },
};

export interface HouseLevel {
  name: string;
  cost: Partial<Record<ItemId, number>>;
}

/** Nível 0 é o terreno vazio. */
export const HOUSE_LEVELS: readonly HouseLevel[] = [
  { name: 'Terreno vazio', cost: {} },
  { name: 'Barraca', cost: { madeira: 8 } },
  { name: 'Cabana', cost: { madeira: 15, pedra: 8 } },
  { name: 'Casa', cost: { madeira: 25, pedra: 18, concha: 4 } },
  { name: 'Casa com jardim', cost: { madeira: 20, pedra: 12, flor: 10 } },
];

export interface Friendship {
  /** 0 a 100. */
  points: number;
  lastTalk: string;
  lastGift: string;
  /** Pedido do dia (o Pokémon quer este item). */
  request: { day: string; item: ItemId; qty: number; done: boolean } | null;
}

export interface VillageState {
  v: 1;
  seed: number;
  player: { x: number; y: number; dir: 'up' | 'down' | 'left' | 'right' };
  inventory: Partial<Record<ItemId, number>>;
  house: number;
  placed: { x: number; y: number; item: FurnitureId }[];
  friends: Record<string, Friendship>;
  /** Último dia em que cada bloco foi coletado ("x,y" → dia). */
  harvested: Record<string, string>;
  /** Quem segue você pela vila (melhor amigo). */
  follower: string | null;
}

export function emptyVillage(seed: number, spawn: { x: number; y: number }): VillageState {
  return { v: 1, seed, player: { ...spawn, dir: 'down' }, inventory: {}, house: 0, placed: [], friends: {}, harvested: {}, follower: null };
}

const ITEM_IDS = new Set<string>(Object.keys(ITEM_INFO));

export function normalizeVillage(raw: unknown, seed: number, spawn: { x: number; y: number }): VillageState {
  const base = emptyVillage(seed, spawn);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<VillageState>;
  if (r.v !== 1 || r.seed !== seed) return base;
  const inv: Partial<Record<ItemId, number>> = {};
  for (const [k, n] of Object.entries(r.inventory ?? {})) if (ITEM_IDS.has(k) && Number.isInteger(n) && (n as number) > 0) inv[k as ItemId] = Math.min(999, n as number);
  const p = r.player;
  return {
    ...base,
    player: p && Number.isInteger(p.x) && Number.isInteger(p.y) ? { x: p.x, y: p.y, dir: ['up', 'down', 'left', 'right'].includes(p.dir) ? p.dir : 'down' } : base.player,
    inventory: inv,
    house: Number.isInteger(r.house) ? Math.max(0, Math.min(HOUSE_LEVELS.length - 1, r.house!)) : 0,
    placed: Array.isArray(r.placed) ? r.placed.filter((f) => f && Number.isInteger(f.x) && Number.isInteger(f.y) && (FURNITURE as readonly string[]).includes(f.item)).slice(0, 200) : [],
    friends: r.friends && typeof r.friends === 'object' ? r.friends : {},
    harvested: r.harvested && typeof r.harvested === 'object' ? r.harvested : {},
    follower: typeof r.follower === 'string' ? r.follower : null,
  };
}

export const count = (s: VillageState, item: ItemId): number => s.inventory[item] ?? 0;

export function canAfford(s: VillageState, cost: Partial<Record<ItemId, number>>): boolean {
  return Object.entries(cost).every(([k, n]) => count(s, k as ItemId) >= (n ?? 0));
}

function pay(s: VillageState, cost: Partial<Record<ItemId, number>>): void {
  for (const [k, n] of Object.entries(cost)) s.inventory[k as ItemId] = count(s, k as ItemId) - (n ?? 0);
}

export function add(s: VillageState, item: ItemId, n = 1): void {
  s.inventory[item] = Math.min(999, count(s, item) + n);
}

// ----------------------------------------------------------------------------- coleta

export interface Interaction {
  ok: boolean;
  message: string;
  got?: { item: ItemId; qty: number };
}

const HARVEST: Partial<Record<Tile, { item: ItemId | ((rng: Rng) => ItemId); qty: [number, number]; verb: string }>> = {
  tree: { item: 'madeira', qty: [1, 3], verb: 'Você cortou galhos da árvore' },
  rock: { item: 'pedra', qty: [1, 2], verb: 'Você quebrou um pedaço da pedra' },
  bush: { item: (rng) => (rng() < 0.6 ? 'oran' : 'pecha'), qty: [1, 2], verb: 'Você colheu frutas do arbusto' },
  flower: { item: 'flor', qty: [1, 2], verb: 'Você colheu flores' },
  sand: { item: 'concha', qty: [1, 1], verb: 'Você achou uma concha na areia' },
};

/** Coleta no bloco (x, y): cada bloco dá uma vez por dia (a natureza volta no dia seguinte). */
export function harvest(s: VillageState, map: VillageMap, x: number, y: number, day: string, rng: Rng): Interaction {
  const tile = tileAt(map, x, y);
  const rule = HARVEST[tile];
  if (!rule) return { ok: false, message: '' };
  // Areia: só às vezes tem concha.
  if (tile === 'sand' && rng() < 0.55) return { ok: false, message: 'Só areia por aqui.' };
  const key = `${x},${y}`;
  if (s.harvested[key] === day) return { ok: false, message: tile === 'tree' ? 'Esta árvore já deu madeira hoje. Volte amanhã!' : 'Já coletou aqui hoje. Volte amanhã!' };
  s.harvested[key] = day;
  const item = typeof rule.item === 'function' ? rule.item(rng) : rule.item;
  const qty = rule.qty[0] + Math.floor(rng() * (rule.qty[1] - rule.qty[0] + 1));
  add(s, item, qty);
  return { ok: true, message: `${rule.verb}: +${qty} ${ITEM_INFO[item].name}`, got: { item, qty } };
}

/** Limpa as marcas de coleta de dias anteriores (o arquivo não cresce para sempre). */
export function pruneHarvest(s: VillageState, day: string): void {
  for (const [k, d] of Object.entries(s.harvested)) if (d !== day) delete s.harvested[k];
}

// ----------------------------------------------------------------------------- casa e móveis

export function upgradeHouse(s: VillageState): Interaction {
  const next = HOUSE_LEVELS[s.house + 1];
  if (!next) return { ok: false, message: 'Sua casa já está completa!' };
  if (!canAfford(s, next.cost)) return { ok: false, message: `Para a ${next.name} faltam materiais: ${describeCost(s, next.cost)}.` };
  pay(s, next.cost);
  s.house++;
  return { ok: true, message: `Você construiu: ${next.name}!` };
}

export function describeCost(s: VillageState, cost: Partial<Record<ItemId, number>>): string {
  return Object.entries(cost)
    .map(([k, n]) => `${ITEM_INFO[k as ItemId].name} ${Math.min(count(s, k as ItemId), n ?? 0)}/${n}`)
    .join(', ');
}

export function craft(s: VillageState, item: FurnitureId): Interaction {
  const cost = RECIPES[item];
  if (!canAfford(s, cost)) return { ok: false, message: `Faltam materiais: ${describeCost(s, cost)}.` };
  pay(s, cost);
  add(s, item);
  return { ok: true, message: `Você fez: ${ITEM_INFO[item].name}!` };
}

export const isPlaced = (s: VillageState, x: number, y: number) => s.placed.some((f) => f.x === x && f.y === y);

/** Põe um móvel no chão (grama, flores ou trilha, sem nada em cima). */
export function place(s: VillageState, map: VillageMap, item: FurnitureId, x: number, y: number, occupied: (x: number, y: number) => boolean): Interaction {
  if (count(s, item) <= 0) return { ok: false, message: `Você não tem ${ITEM_INFO[item].name}.` };
  const t = tileAt(map, x, y);
  if (!['grass', 'path', 'flower', 'tall', 'sand'].includes(t) || isPlaced(s, x, y) || occupied(x, y)) return { ok: false, message: 'Não dá para colocar aí. Fique de frente para um lugar livre.' };
  s.inventory[item] = count(s, item) - 1;
  s.placed.push({ x, y, item });
  return { ok: true, message: `${ITEM_INFO[item].name} colocado!` };
}

/** Recolhe o móvel em (x, y) de volta para o inventário. */
export function pickUp(s: VillageState, x: number, y: number): Interaction {
  const i = s.placed.findIndex((f) => f.x === x && f.y === y);
  if (i < 0) return { ok: false, message: '' };
  const [f] = s.placed.splice(i, 1);
  add(s, f!.item);
  return { ok: true, message: `${ITEM_INFO[f!.item].name} guardado.` };
}

// ----------------------------------------------------------------------------- amizade

export const FRIEND_LEVELS = [
  { min: 0, name: 'Conhecido' },
  { min: 20, name: 'Colega' },
  { min: 45, name: 'Amigo' },
  { min: 70, name: 'Grande amigo' },
  { min: 90, name: 'Melhor amigo' },
] as const;

export function friendOf(s: VillageState, id: string): Friendship {
  return (s.friends[id] ??= { points: 0, lastTalk: '', lastGift: '', request: null });
}

export function friendLevel(points: number): { level: number; name: string; hearts: number } {
  let level = 0;
  FRIEND_LEVELS.forEach((l, i) => {
    if (points >= l.min) level = i;
  });
  return { level, name: FRIEND_LEVELS[level]!.name, hearts: Math.round(Math.max(0, Math.min(100, points)) / 20) };
}

/** Do que cada tipo gosta mais de ganhar. */
export const FAVORITE: Partial<Record<PokemonType, ItemId>> = {
  grass: 'flor', bug: 'flor', fairy: 'flor',
  water: 'concha', ice: 'concha',
  fire: 'oran', fighting: 'oran', dragon: 'oran', electric: 'oran',
  psychic: 'pecha', ghost: 'pecha', normal: 'pecha', poison: 'pecha', dark: 'pecha',
  rock: 'pedra', ground: 'pedra', steel: 'pedra',
  flying: 'oran',
};

export function favoriteOf(types: readonly PokemonType[]): ItemId {
  for (const t of types) {
    const fav = FAVORITE[t];
    if (fav) return fav;
  }
  return 'oran';
}

const LINES: Record<number, readonly string[]> = {
  0: ['Oi! Ainda estou me acostumando com a vila.', 'Você é quem me escaneou, né? Prazer!', 'Que lugar bonito... posso explorar?'],
  1: ['Bom te ver de novo!', 'Hoje achei um cantinho ótimo perto do lago.', 'Vamos treinar depois?'],
  2: ['Você é um bom amigo, sabia?', 'Quando você chega, o dia fica melhor!', 'Guardei um lugar para você na sombra.'],
  3: ['Eu confio em você para qualquer batalha!', 'Lembra da nossa primeira batalha? Eu lembro!', 'Quero ficar sempre na sua equipe.'],
  4: ['Você é meu melhor amigo!', 'Vou te seguir para onde você for!', 'Nenhuma insígnia vale mais que a nossa amizade.'],
};

export interface Talk {
  text: string;
  gained: number;
  /** Pedido feito agora (ou que segue aberto). */
  request: Friendship['request'];
}

/**
 * Conversa: a primeira do dia vale amizade (+6). Às vezes (1 em 3 dias) o Pokémon pede um item; entregar vale bem mais.
 * O texto muda com o nível de amizade e com a hora (bom dia / boa noite).
 */
export function talk(s: VillageState, id: string, name: string, types: readonly PokemonType[], day: string, hour: number, rng: Rng): Talk {
  const f = friendOf(s, id);
  let gained = 0;
  const first = f.lastTalk !== day;
  if (first) {
    f.lastTalk = day;
    gained = 6;
    f.points = Math.min(100, f.points + gained);
    if (!f.request || f.request.day !== day) {
      f.request = rng() < 0.34 ? { day, item: rng() < 0.5 ? favoriteOf(types) : (['madeira', 'pedra', 'oran', 'pecha', 'flor', 'concha'] as const)[Math.floor(rng() * 6)]!, qty: 1 + Math.floor(rng() * 3), done: false } : null;
    }
  }
  const { level } = friendLevel(f.points);
  const greet = hour < 5 || hour >= 19 ? 'Boa noite! ' : hour < 12 ? 'Bom dia! ' : '';
  const lines = LINES[level]!;
  let text = `${first ? greet : ''}${lines[Math.floor(rng() * lines.length)]}`;
  const req = f.request && f.request.day === day && !f.request.done ? f.request : null;
  if (req) text += ` Ah... você teria ${req.qty} ${ITEM_INFO[req.item].name}? Eu ia adorar!`;
  else if (!first) text = `${name} está feliz em te ver.`;
  return { text, gained, request: req };
}

export interface Gift {
  ok: boolean;
  text: string;
  gained: number;
}

/** Presente: entrega o pedido do dia (muito), o favorito (bastante) ou qualquer coisa (um pouco). Um presente por dia. */
export function giveGift(s: VillageState, id: string, types: readonly PokemonType[], item: ItemId, day: string): Gift {
  const f = friendOf(s, id);
  const req = f.request && f.request.day === day && !f.request.done ? f.request : null;
  if (req && req.item === item) {
    if (count(s, item) < req.qty) return { ok: false, text: `Precisa de ${req.qty} ${ITEM_INFO[item].name} (você tem ${count(s, item)}).`, gained: 0 };
    s.inventory[item] = count(s, item) - req.qty;
    req.done = true;
    f.points = Math.min(100, f.points + 15);
    add(s, (['oran', 'pecha', 'concha', 'flor'] as const)[req.qty % 4]!, 1);
    return { ok: true, text: 'Era isso que eu queria! Obrigado! Tome, um presentinho meu.', gained: 15 };
  }
  if (f.lastGift === day) return { ok: false, text: 'Já ganhei presente hoje. Obrigado mesmo assim!', gained: 0 };
  if (count(s, item) <= 0) return { ok: false, text: `Você não tem ${ITEM_INFO[item].name}.`, gained: 0 };
  s.inventory[item] = count(s, item) - 1;
  f.lastGift = day;
  const fav = favoriteOf(types) === item;
  const gained = fav ? 10 : 4;
  f.points = Math.min(100, f.points + gained);
  return { ok: true, text: fav ? `${ITEM_INFO[item].name}! É o meu favorito!` : 'Que gentil, obrigado!', gained };
}

/** Só um Grande amigo (ou mais) aceita seguir você pela vila. */
export function canFollow(s: VillageState, id: string): boolean {
  return friendLevel(friendOf(s, id).points).level >= 3;
}

/** Luz do dia pela hora local: `dark` (0 dia … 0,55 noite, uma camada azul-escura) e `warm` (0 a 1, o laranja do fim de tarde). */
export function daylight(hour: number, minute = 0): { dark: number; warm: number } {
  const t = hour + minute / 60;
  let night: number;
  if (t >= 7 && t <= 17) night = 0;
  else if (t > 17 && t < 19.5) night = (t - 17) / 2.5;
  else if (t >= 5 && t < 7) night = 1 - (t - 5) / 2;
  else night = 1;
  const warm = t > 16.5 && t < 19.5 ? Math.max(0, 1 - Math.abs(t - 18) / 1.5) : t >= 5 && t < 7.5 ? Math.max(0, 1 - Math.abs(t - 6.2) / 1.3) * 0.6 : 0;
  return { dark: Math.round(night * 0.55 * 1000) / 1000, warm: Math.round(warm * 1000) / 1000 };
}
