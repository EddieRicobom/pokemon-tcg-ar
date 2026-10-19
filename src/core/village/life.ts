import type { Rng } from '../battle';
import type { PokemonType } from '../pokemon-data';
import { ACCESSORY_IDS, FURNITURE_IDS, isItem, itemDef, ITEMS, MATERIAL_IDS, shopToday } from './catalog';
import { personalityOf } from './personality';
import { emptySocial, normalizeSocial } from './social-state';
import type { Answer, Lingo, Moment, Relation, SocialMemory } from './social-state';
import { cutsOff, isFront, tileAt } from './map';
import type { Tile, VillageMap } from './map';
import { emptyDigital, normalizeDigital } from './digital';
import type { DigitalState } from './digital';
import { emptyLegendary, normalizeLegendary } from './legendary';
import type { LegendaryState } from './legendary';
import { emptyWorldProgress, normalizeWorldProgress, weeklyModifiers } from './world-progress';
import type { DiscoveryState, Expedition, WeeklyState } from './world-progress';
import type { VillageRequest } from './requests';
import { emptyHomeInterior, normalizeHomeInterior } from './home-interior';
import type { HomeInterior } from './home-interior';

/**
 * A vida na Vila: inventário, coleta (madeira, pedra, frutas, flores, conchas), a casa em níveis, móveis que você
 * fabrica e coloca no chão, e a amizade com cada Pokémon da sua equipe (conversa uma vez por dia, presentes, pedidos).
 * Tudo puro e determinístico com a semente/dia: a tela só chama estas funções e desenha.
 */

export type ItemId = string;
export type FurnitureId = string;

/** Nome de qualquer item do catálogo. */
export function itemName(id: ItemId): string {
  return itemDef(id)?.name ?? id;
}

/** Compatibilidade: nome de cada item (o desenho é o ícone em pixel art, não emoji). */
export const ITEM_INFO: Record<string, { name: string }> = Object.fromEntries(ITEMS.map((i) => [i.id, { name: i.name }]));

export const MATERIALS: readonly ItemId[] = MATERIAL_IDS;
export const FURNITURE: readonly FurnitureId[] = FURNITURE_IDS;
/** Tudo que dá para fabricar, com a receita. */
export const RECIPES: Record<string, Partial<Record<ItemId, number>>> = Object.fromEntries(ITEMS.filter((i) => i.recipe).map((i) => [i.id, i.recipe!]));

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
  /** Dia em que já comeu uma comida sua (uma refeição por dia). */
  lastMeal?: string;
  /** Pedido do dia (o Pokémon quer este item). */
  request: { day: string; item: ItemId; qty: number; done: boolean } | null;
}

/** Versão do desenho do mapa: saves de antes do mapa grande (sem este número) passam por `migrateLayout`. */
export const MAP_LAYOUT = 2;

export interface VillageState {
  v: 1;
  seed: number;
  /** Para qual desenho de mapa as posições (você, móveis, horta) foram salvas (ver `MAP_LAYOUT`). */
  layout: number;
  player: { x: number; y: number; dir: 'up' | 'down' | 'left' | 'right' };
  inventory: Partial<Record<ItemId, number>>;
  house: number;
  placed: { x: number; y: number; item: FurnitureId }[];
  /** Decoração interna da casa do jogador. Não ocupa blocos da Vila. */
  homeInterior: HomeInterior;
  friends: Record<string, Friendship>;
  /** Último dia em que cada bloco foi coletado ("x,y" → dia). */
  harvested: Record<string, string>;
  /** Quem segue você pela vila (melhor amigo). */
  follower: string | null;
  /** Moedas (vendendo na loja; ganhas também com pedidos e colheitas). */
  coins: number;
  /** Horta: o que está plantado em cada bloco. */
  crops: Crop[];
  /** Acessório que você usa e o de cada Pokémon (id da carta → acessório). */
  wear: { player: string | null; mons: Record<string, string | null> };
  /** Móveis que você já teve alguma vez (o catálogo da coleção). */
  collected: string[];
  /** Dia em que cada amigo já ajudou (coleta diária) e já deu presente raro. */
  helped: Record<string, string>;
  rareGift: Record<string, string>;
  /** Vida social: relações entre os Pokémon, Diário de momentos, Álbum e quando você saiu. */
  rel: Record<string, Relation>;
  diary: Moment[];
  /** Memórias importantes por Pokémon, derivadas de momentos marcantes e limitadas. */
  memories: SocialMemory[];
  seen: string[];
  lastSeen: number;
  diaryRead: number;
  /** Perguntas dos Pokémon, suas respostas, bordões e "gírias" da Vila (ver `quiz.ts`). */
  answers: Answer[];
  words: Record<string, string>;
  lingo: Lingo[];
  asked: Record<string, { day: string; n: number }>;
  /** Apelidos dados aos Pokémon (ver `nickname.ts`). */
  nicks: Record<string, string>;
  /** Conquistas do Treinador cujo prêmio já foi entregue (ver `rewards.ts`). */
  claimed: string[];
  /** Pescaria de hoje: quantas vezes já lançou a linha. */
  fishing: { day: string; casts: number };
  /** Batalhas da Caixa que já renderam moedas hoje (máx. `BATTLE_REWARDS_PER_DAY` por dia do calendário). */
  battleCoins: { day: string; count: number };
  /** A mini cidade (ver `town.ts`): nível de cada casa de Pokémon e o que já foi feito hoje nos prédios. */
  homes: Record<string, number>;
  town: { level: number; mailDay: string; cafeDay: string };
  /** Pedidos diários do mural da praça. */
  requests: { day: string; items: VillageRequest[]; story: VillageRequest[] };
  /** Digital Pokémon (presente inicial, Fonte, evolução) — pagos em moedas, o saldo único (`app/wallet.ts`). */
  digital: DigitalState;
  /** Encontros lendários raríssimos na Vila (ver `legendary.ts`). */
  legendary: LegendaryState;
  recap: { day: string; at: number };
  discoveries: DiscoveryState;
  weekly: WeeklyState;
  expeditions: Expedition[];
}

export interface Crop {
  x: number;
  y: number;
  seed: string;
  /** 0 = semente; `stages` = pronto para colher. */
  stage: number;
  /** Quando foi regado pela última vez (ms); null = precisa de água. */
  wateredAt: number | null;
}

export function emptyVillage(seed: number, spawn: { x: number; y: number }): VillageState {
  return {
    v: 1, seed, layout: MAP_LAYOUT, player: { ...spawn, dir: 'down' }, inventory: {}, house: 0, placed: [], homeInterior: emptyHomeInterior(), friends: {}, harvested: {}, follower: null,
    coins: 100, crops: [], wear: { player: null, mons: {} }, collected: [], helped: {}, rareGift: {},
    claimed: [], ...emptySocial(), fishing: { day: '', casts: 0 }, battleCoins: { day: '', count: 0 }, homes: {}, town: { level: 1, mailDay: '', cafeDay: '' }, requests: { day: '', items: [], story: [] },
    digital: emptyDigital(), legendary: emptyLegendary(), recap: { day: '', at: 0 }, ...emptyWorldProgress(),
  };
}

function normalizeRequests(raw: unknown): { day: string; items: VillageRequest[]; story: VillageRequest[] } {
  if (!raw || typeof raw !== 'object') return { day: '', items: [], story: [] };
  const r = raw as { day?: unknown; items?: unknown };
  const kinds = new Set(['collect', 'talk', 'deliver']);
  const items = Array.isArray(r.items)
    ? r.items.filter((x): x is VillageRequest => {
      if (!x || typeof x !== 'object') return false;
      const item = x as VillageRequest;
      return typeof item.id === 'string' && typeof item.title === 'string' && kinds.has(item.kind);
    }).slice(0, 3)
    : [];
  const story = Array.isArray((r as { story?: unknown }).story)
    ? (r as { story: unknown[] }).story.filter((x): x is VillageRequest => {
      if (!x || typeof x !== 'object') return false;
      const item = x as VillageRequest;
      return item.persistent === true && typeof item.id === 'string' && typeof item.title === 'string' && kinds.has(item.kind);
    }).slice(0, 8)
    : [];
  return { day: typeof r.day === 'string' ? r.day.slice(0, 12) : '', items, story };
}


export function normalizeVillage(raw: unknown, seed: number, spawn: { x: number; y: number }): VillageState {
  const base = emptyVillage(seed, spawn);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<VillageState>;
  if (r.v !== 1 || r.seed !== seed) return base;
  const inv: Partial<Record<ItemId, number>> = {};
  for (const [k, n] of Object.entries(r.inventory ?? {})) if (isItem(k) && Number.isInteger(n) && (n as number) > 0) inv[k as ItemId] = Math.min(999, n as number);
  const p = r.player;
  return {
    ...base,
    // Sem o número (save de antes do mapa grande) = mapa antigo; quem carrega passa por `migrateLayout`.
    layout: r.layout === MAP_LAYOUT ? MAP_LAYOUT : 1,
    player: p && Number.isInteger(p.x) && Number.isInteger(p.y) ? { x: p.x, y: p.y, dir: ['up', 'down', 'left', 'right'].includes(p.dir) ? p.dir : 'down' } : base.player,
    inventory: inv,
    house: Number.isInteger(r.house) ? Math.max(0, Math.min(HOUSE_LEVELS.length - 1, r.house!)) : 0,
    placed: Array.isArray(r.placed) ? r.placed.filter((f) => f && Number.isInteger(f.x) && Number.isInteger(f.y) && FURNITURE_IDS.includes(f.item)).slice(0, 300) : [],
    homeInterior: normalizeHomeInterior(r.homeInterior),
    friends: r.friends && typeof r.friends === 'object' ? r.friends : {},
    harvested: r.harvested && typeof r.harvested === 'object' ? r.harvested : {},
    follower: typeof r.follower === 'string' ? r.follower : null,
    coins: Number.isInteger(r.coins) ? Math.max(0, Math.min(999999, r.coins!)) : base.coins,
    crops: Array.isArray(r.crops) ? r.crops.filter((c) => c && Number.isInteger(c.x) && Number.isInteger(c.y) && itemDef(c.seed)?.kind === 'seed' && Number.isInteger(c.stage)).slice(0, 200) : [],
    wear: {
      player: typeof r.wear?.player === 'string' && ACCESSORY_IDS.includes(r.wear.player) ? r.wear.player : null,
      mons: r.wear?.mons && typeof r.wear.mons === 'object' ? Object.fromEntries(Object.entries(r.wear.mons).filter(([, v]) => v === null || (typeof v === 'string' && ACCESSORY_IDS.includes(v)))) : {},
    },
    collected: Array.isArray(r.collected) ? r.collected.filter((id): id is string => typeof id === 'string' && FURNITURE_IDS.includes(id)) : [],
    helped: r.helped && typeof r.helped === 'object' ? r.helped : {},
    rareGift: r.rareGift && typeof r.rareGift === 'object' ? r.rareGift : {},
    ...normalizeSocial(r),
    claimed: Array.isArray(r.claimed) ? [...new Set(r.claimed.filter((id): id is string => typeof id === 'string' && id.length <= 40))].slice(0, 200) : [],
    homes: r.homes && typeof r.homes === 'object' ? Object.fromEntries(Object.entries(r.homes).filter(([k, v]) => k.length <= 80 && Number.isInteger(v)).slice(0, 80).map(([k, v]) => [k, Math.max(0, Math.min(511, v as number))])) : {},
    town: { level: Number.isInteger(r.town?.level) ? Math.max(1, Math.min(99, r.town!.level)) : 1, mailDay: typeof r.town?.mailDay === 'string' ? r.town.mailDay.slice(0, 12) : '', cafeDay: typeof r.town?.cafeDay === 'string' ? r.town.cafeDay.slice(0, 12) : '' },
    requests: normalizeRequests(r.requests),
    fishing: r.fishing && typeof r.fishing.day === 'string' && Number.isInteger(r.fishing.casts) ? { day: r.fishing.day, casts: Math.max(0, Math.min(99, r.fishing.casts)) } : { day: '', casts: 0 },
    battleCoins: r.battleCoins && typeof r.battleCoins.day === 'string' && Number.isInteger(r.battleCoins.count)
      ? { day: r.battleCoins.day.slice(0, 12), count: Math.max(0, Math.min(BATTLE_REWARDS_PER_DAY, r.battleCoins.count)) }
      : { day: '', count: 0 },
    digital: normalizeDigital(r.digital),
    legendary: normalizeLegendary(r.legendary),
    recap: { day: typeof r.recap?.day === 'string' ? r.recap.day : '', at: typeof r.recap?.at === 'number' && Number.isFinite(r.recap.at) && r.recap.at >= 0 ? r.recap.at : 0 },
    ...normalizeWorldProgress(r),
  };
}

export const count = (s: VillageState, item: ItemId): number => s.inventory[item] ?? 0;

export function canAfford(s: VillageState, cost: Partial<Record<ItemId, number>>): boolean {
  return Object.entries(cost).every(([k, n]) => count(s, k as ItemId) >= (n ?? 0));
}

export function pay(s: VillageState, cost: Partial<Record<ItemId, number>>): void {
  for (const [k, n] of Object.entries(cost)) s.inventory[k as ItemId] = count(s, k as ItemId) - (n ?? 0);
}

export function add(s: VillageState, item: ItemId, n = 1): void {
  s.inventory[item] = Math.min(999, count(s, item) + n);
  if (itemDef(item)?.kind === 'furniture' && !s.collected.includes(item)) s.collected.push(item);
}

// ----------------------------------------------------------------------------- coleta

export interface Interaction {
  ok: boolean;
  message: string;
  got?: { item: ItemId; qty: number };
}

interface HarvestRule {
  item: ItemId | ((rng: Rng) => ItemId);
  qty: [number, number];
  verb: string;
  /** Achados raros que vêm junto (cada um com a sua chance). */
  extra?: { item: ItemId; chance: number; verb: string }[];
}

const SEEDS_WILD = ['sem-oran', 'sem-pecha', 'sem-girassol', 'sem-tomate', 'sem-cenoura', 'sem-milho', 'sem-batata', 'sem-lavanda'] as const;

const HARVEST: Partial<Record<Tile, HarvestRule>> = {
  tree: { item: 'madeira', qty: [1, 3], verb: 'Você cortou galhos da árvore', extra: [{ item: 'pena', chance: 0.12, verb: 'caiu uma pena do ninho' }, { item: 'mel', chance: 0.05, verb: 'achou um favo de mel' }] },
  rock: { item: 'pedra', qty: [1, 2], verb: 'Você quebrou um pedaço da pedra', extra: [{ item: 'cristal', chance: 0.12, verb: 'brilhou um cristal lá dentro' }, { item: 'ouro', chance: 0.04, verb: 'tinha uma pepita de ouro' }] },
  bush: { item: (rng) => (rng() < 0.6 ? 'oran' : 'pecha'), qty: [1, 2], verb: 'Você colheu frutas do arbusto', extra: [{ item: 'sem-morango', chance: 0.06, verb: 'achou uma semente de morango' }] },
  flower: { item: 'flor', qty: [1, 2], verb: 'Você colheu flores', extra: [{ item: 'mel', chance: 0.18, verb: 'as abelhas deixaram mel' }] },
  sand: { item: 'concha', qty: [1, 1], verb: 'Você achou uma concha na areia' },
  tall: { item: (rng) => SEEDS_WILD[Math.floor(rng() * SEEDS_WILD.length)]!, qty: [1, 1], verb: 'Você achou no mato alto', extra: [{ item: 'champignon', chance: 0.3, verb: 'e um cogumelo' }] },
};

/** Coleta no bloco (x, y): cada bloco dá uma vez por dia (a natureza volta no dia seguinte). */
export function harvest(s: VillageState, map: VillageMap, x: number, y: number, day: string, rng: Rng): Interaction {
  const tile = tileAt(map, x, y);
  const rule = HARVEST[tile];
  if (!rule) return { ok: false, message: '' };
  // Areia: só às vezes tem concha, e o resto é areia ou argila.
  let sandItem: ItemId | null = null;
  if (tile === 'sand') {
    const roll = rng();
    if (roll < 0.2) return { ok: false, message: 'Só areia por aqui.' };
    sandItem = roll < 0.55 ? 'concha' : roll < 0.85 ? 'areia' : 'argila';
  }
  if (tile === 'tall' && rng() < 0.5) return { ok: false, message: 'Nada no mato desta vez.' };
  const key = `${x},${y}`;
  if (s.harvested[key] === day) return { ok: false, message: tile === 'tree' ? 'Esta árvore já deu madeira hoje. Volte amanhã!' : 'Já coletou aqui hoje. Volte amanhã!' };
  s.harvested[key] = day;
  const item = sandItem ?? (typeof rule.item === 'function' ? rule.item(rng) : rule.item);
  const qty = sandItem ? 1 + Math.floor(rng() * 2) : rule.qty[0] + Math.floor(rng() * (rule.qty[1] - rule.qty[0] + 1));
  add(s, item, qty);
  let message = sandItem ? `Você cavou na areia: +${qty} ${itemName(item)}` : `${rule.verb}: +${qty} ${itemName(item)}`;
  for (const e of rule.extra ?? []) {
    if (rng() < e.chance) {
      add(s, e.item);
      message += ` (${e.verb}: +1 ${itemName(e.item)})`;
    }
  }
  return { ok: true, message, got: { item, qty } };
}

// ----------------------------------------------------------------------------- pesca

export const FISH_PER_DAY = 10;

/** Batalha da Caixa (atalho do Fliperama ou não): moedas por batalha terminada, até tantas vezes por dia. */
export const BATTLE_REWARD_COINS = 100;
export const BATTLE_REWARDS_PER_DAY = 3;

/** Quantas batalhas ainda rendem moedas hoje. */
export function battleRewardsLeft(s: VillageState, day: string): number {
  return s.battleCoins.day === day ? Math.max(0, BATTLE_REWARDS_PER_DAY - s.battleCoins.count) : BATTLE_REWARDS_PER_DAY;
}

/**
 * Uma batalha da Caixa terminou: rende `BATTLE_REWARD_COINS` moedas se ainda houver recompensa hoje (dia do
 * calendário do aparelho, como a pesca). Devolve quantas moedas entraram (0 quando o limite do dia já foi).
 */
export function claimBattleReward(s: VillageState, day: string): number {
  if (s.battleCoins.day !== day) s.battleCoins = { day, count: 0 };
  if (s.battleCoins.count >= BATTLE_REWARDS_PER_DAY) return 0;
  s.battleCoins.count++;
  s.coins = Math.min(999999, s.coins + BATTLE_REWARD_COINS);
  return BATTLE_REWARD_COINS;
}

const FISH_TABLE: readonly { item: ItemId | null; w: number; msg: string }[] = [
  { item: null, w: 14, msg: 'Nada mordeu a isca desta vez.' },
  { item: 'alga', w: 16, msg: 'Fisgou uma alga' },
  { item: 'bota', w: 8, msg: 'Era só uma bota velha…' },
  { item: 'peixe', w: 34, msg: 'Pegou um peixe' },
  { item: 'estrela', w: 11, msg: 'Pescou uma estrela-do-mar' },
  { item: 'dourado', w: 8, msg: 'Um peixe-dourado reluzente' },
  { item: 'perola', w: 3, msg: 'Uma pérola dentro de uma concha' },
  { item: 'cristal', w: 2, msg: 'Um cristal brilhando no fundo' },
];

/** Joga a linha num bloco de água (10 lançamentos por dia). */
export function fish(s: VillageState, map: VillageMap, x: number, y: number, day: string, rng: Rng): Interaction {
  if (tileAt(map, x, y) !== 'water') return { ok: false, message: '' };
  if (s.fishing.day !== day) s.fishing = { day, casts: 0 };
  if (s.fishing.casts >= FISH_PER_DAY) return { ok: false, message: 'Os peixes cansaram por hoje. Volte amanhã!' };
  s.fishing.casts++;
  const total = FISH_TABLE.reduce((n, e) => n + e.w, 0);
  let roll = rng() * total;
  const hit = FISH_TABLE.find((e) => (roll -= e.w) < 0) ?? FISH_TABLE[0]!;
  const left = FISH_PER_DAY - s.fishing.casts;
  if (!hit.item) return { ok: true, message: `${hit.msg} (${left} lançamentos restantes)` };
  add(s, hit.item);
  return { ok: true, message: `${hit.msg}: +1 ${itemName(hit.item)} (${left} lançamentos restantes)`, got: { item: hit.item, qty: 1 } };
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
    .map(([k, n]) => `${itemName(k)} ${Math.min(count(s, k as ItemId), n ?? 0)}/${n}`)
    .join(', ');
}

export function craft(s: VillageState, item: ItemId): Interaction {
  const cost = RECIPES[item];
  if (!cost || itemDef(item)?.kind === 'food') return { ok: false, message: 'Isso não dá para fabricar.' };
  if (!canAfford(s, cost)) return { ok: false, message: `Faltam materiais: ${describeCost(s, cost)}.` };
  pay(s, cost);
  add(s, item);
  return { ok: true, message: `Você fez: ${itemName(item)}!` };
}

/** Cozinha uma comida (receitas de `catalog`, só as de kind "food"). */
export function cook(s: VillageState, item: ItemId): Interaction {
  const cost = RECIPES[item];
  if (!cost || itemDef(item)?.kind !== 'food') return { ok: false, message: 'Isso não dá para cozinhar.' };
  if (!canAfford(s, cost)) return { ok: false, message: `Faltam ingredientes: ${describeCost(s, cost)}.` };
  pay(s, cost);
  add(s, item);
  return { ok: true, message: `Você cozinhou: ${itemName(item)}!` };
}

export const isPlaced = (s: VillageState, x: number, y: number) => s.placed.some((f) => f.x === x && f.y === y);

/**
 * Um móvel ou uma planta em (x, y) atrapalharia a cidade? Devolve o motivo (para a tela) ou `null` se pode. Portas, a
 * frente da loja e o ponto onde você nasce ficam livres, e nada pode fechar o caminho de uma casa, de um prédio ou da loja.
 */
export function blocksRoute(s: VillageState, map: VillageMap, x: number, y: number): string | null {
  if (isFront(map, x, y)) return 'Deixe livre a frente das portas e da loja, para todo mundo passar.';
  if (cutsOff(map, (px, py) => (px === x && py === y) || isPlaced(s, px, py) || cropAt(s, px, py) !== undefined)) return 'Isso fecharia o caminho da cidade. Escolha outro lugar.';
  return null;
}

/** Põe um móvel no chão (grama, flores ou trilha, sem nada em cima). */
export function place(s: VillageState, map: VillageMap, item: FurnitureId, x: number, y: number, occupied: (x: number, y: number) => boolean): Interaction {
  if (itemDef(item)?.kind !== 'furniture') return { ok: false, message: 'Só móveis podem ser colocados no chão.' };
  if (count(s, item) <= 0) return { ok: false, message: `Você não tem ${itemName(item)}.` };
  const t = tileAt(map, x, y);
  if (!['grass', 'path', 'flower', 'tall', 'sand', 'trail', 'plaza'].includes(t) || isPlaced(s, x, y) || cropAt(s, x, y) || occupied(x, y)) return { ok: false, message: 'Não dá para colocar aí. Fique de frente para um lugar livre.' };
  const closed = blocksRoute(s, map, x, y);
  if (closed) return { ok: false, message: closed };
  s.inventory[item] = count(s, item) - 1;
  s.placed.push({ x, y, item });
  return { ok: true, message: `${itemName(item)} colocado!` };
}

/** Recolhe o móvel em (x, y) de volta para o inventário. */
export function pickUp(s: VillageState, x: number, y: number): Interaction {
  const i = s.placed.findIndex((f) => f.x === x && f.y === y);
  if (i < 0) return { ok: false, message: '' };
  const [f] = s.placed.splice(i, 1);
  add(s, f!.item);
  return { ok: true, message: `${itemName(f!.item)} guardado.` };
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

/** A comida preferida de cada tipo. */
export const FAVORITE_FOOD: Partial<Record<PokemonType, ItemId>> = {
  fire: 'espetinho', water: 'peixe-grelhado', grass: 'salada', electric: 'pipoca', psychic: 'geleia', fairy: 'bolo-morango',
  normal: 'pao-mel', ice: 'melancia-gelada', rock: 'ensopado', ground: 'sopa-abobora', fighting: 'lanche-pokebola', dragon: 'torta-pecha',
  ghost: 'suco-pecha', poison: 'espetinho', dark: 'ensopado', bug: 'suco-oran', flying: 'pipoca', steel: 'ensopado',
};

export function favoriteFoodOf(types: readonly PokemonType[]): ItemId {
  for (const t of types) {
    const fav = FAVORITE_FOOD[t];
    if (fav) return fav;
  }
  return 'pao-mel';
}

/** Conversa por jeito: cada personalidade fala do seu jeito (entra a partir do nível Colega). */
const PERSONALITY_LINES: Record<string, readonly string[]> = {
  Brincalhão: ['Quer ver meu truque novo? ...Esqueci qual era.', 'Corre atrás de mim! Ah, você é lento. Brincadeira!', 'Escondi uma coisa na Vila. Não vou dizer onde!'],
  Calmo: ['Respira fundo. Sente a grama? Pois é.', 'Hoje não tem pressa para nada, e está ótimo.', 'Uma soneca na sombra resolve quase tudo.'],
  Tímido: ['E-eu estava pensando em falar com você... ufa, falei.', 'Você não acha que estão me olhando? Ah, é só um arbusto.', 'Obrigado por ser paciente comigo.'],
  Corajoso: ['Se aparecer qualquer coisa, eu protejo você!', 'Amanhã eu encaro o próximo ginásio sozinho. Quer dizer, com você.', 'Medo? Nunca ouvi falar. (Só do escuro.)'],
  Guloso: ['Você tem alguma coisa para comer? Qualquer coisa. Serve uma pedra? Brincadeira... acho.', 'Sonhei com uma torta do tamanho da casa.', 'Meu estômago acabou de falar sozinho.'],
  Sonhador: ['Já reparou que aquela nuvem parece um Magikarp?', 'Imagina se a gente pudesse voar até a lua e voltar antes do jantar.', 'Tive um sonho esquisito: eu era uma Pokébola.'],
  Curioso: ['O que será que tem dentro daquele baú? Não, eu não abri. Ainda.', 'Descobri um formigueiro novo! Quer ver?', 'Por que o céu é azul? Estou pesquisando há dois dias.'],
  Mandão: ['Escute bem: hoje o plano é o seguinte.', 'Eu não estou mandando, estou sugerindo com firmeza.', 'Aqui, quem organiza as coisas sou eu. Você ajuda, claro.'],
};

const WEATHER_LINES: Record<string, string> = {
  chuva: 'Que chuva! Eu adoro, só não quero ficar molhado.',
  neve: 'Olha a neve! Posso fazer um boneco com você?',
  nublado: 'O céu está cinzento hoje, mas eu estou de bom humor.',
};

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
export function talk(s: VillageState, id: string, name: string, types: readonly PokemonType[], day: string, hour: number, rng: Rng, gossip: string | null = null, weather: string | null = null): Talk {
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
  // Do nível Colega em diante, o jeito do Pokémon aparece; o tempo e as fofocas também.
  const flavor = level >= 1 ? PERSONALITY_LINES[personalityOf(id).name] : undefined;
  let pool: readonly string[] = flavor && rng() < 0.5 ? flavor : lines;
  if (weather && WEATHER_LINES[weather] && rng() < 0.25) pool = [WEATHER_LINES[weather]!];
  if (gossip && level >= 1 && rng() < 0.6) pool = [gossip];
  let text = `${first ? greet : ''}${pool[Math.floor(rng() * pool.length)]}`;
  const req = f.request && f.request.day === day && !f.request.done ? f.request : null;
  if (req) text += ` Ah... você teria ${req.qty} ${itemName(req.item)}? Eu ia adorar!`;
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
  const def = itemDef(item);
  if (def?.kind === 'food') {
    if (f.lastMeal === day) return { ok: false, text: 'Já comi hoje. Estou satisfeito, obrigado!', gained: 0 };
    if (count(s, item) <= 0) return { ok: false, text: `Você não tem ${itemName(item)}.`, gained: 0 };
    s.inventory[item] = count(s, item) - 1;
    f.lastMeal = day;
    const fav = favoriteFoodOf(types) === item;
    const greedy = personalityOf(id).name === 'Guloso';
    const gained = (def.feeds ?? 8) + (fav ? 10 : 0) + (greedy ? 4 : 0);
    f.points = Math.min(100, f.points + gained);
    const text = fav ? `${itemName(item)}! Meu prato favorito! Que delícia!` : greedy ? `Nhac! ${itemName(item)}! Tem mais?` : `${itemName(item)}... uma delícia, obrigado!`;
    return { ok: true, text, gained };
  }
  const req = f.request && f.request.day === day && !f.request.done ? f.request : null;
  if (req && req.item === item) {
    if (count(s, item) < req.qty) return { ok: false, text: `Precisa de ${req.qty} ${itemName(item)} (você tem ${count(s, item)}).`, gained: 0 };
    s.inventory[item] = count(s, item) - req.qty;
    req.done = true;
    f.points = Math.min(100, f.points + 15);
    add(s, (['oran', 'pecha', 'concha', 'flor'] as const)[req.qty % 4]!, 1);
    return { ok: true, text: 'Era isso que eu queria! Obrigado! Tome, um presentinho meu.', gained: 15 };
  }
  if (f.lastGift === day) return { ok: false, text: 'Já ganhei presente hoje. Obrigado mesmo assim!', gained: 0 };
  if (count(s, item) <= 0) return { ok: false, text: `Você não tem ${itemName(item)}.`, gained: 0 };
  s.inventory[item] = count(s, item) - 1;
  f.lastGift = day;
  const fav = favoriteOf(types) === item;
  const gained = fav ? 10 : 4;
  f.points = Math.min(100, f.points + gained);
  return { ok: true, text: fav ? `${itemName(item)}! É o meu favorito!` : 'Que gentil, obrigado!', gained };
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

// ----------------------------------------------------------------------------- loja

/** Compra na loja (só o que está à venda hoje). */
export function buy(s: VillageState, id: ItemId, day: string): Interaction {
  const def = shopToday(day).find((i) => i.id === id);
  if (!def) return { ok: false, message: 'Isso não está à venda hoje.' };
  if (s.coins < def.price) return { ok: false, message: `Faltam ${def.price - s.coins} moedas para ${def.name}.` };
  s.coins -= def.price;
  add(s, id);
  return { ok: true, message: `Você comprou: ${def.name}!` };
}

/** Vende `qty` (padrão 1) para a loja. */
export function sell(s: VillageState, id: ItemId, qty = 1): Interaction {
  const def = itemDef(id);
  const have = count(s, id);
  const n = Math.min(have, Math.max(1, qty));
  if (!def || n <= 0) return { ok: false, message: 'Você não tem isso.' };
  if (def.sell <= 0) return { ok: false, message: `${def.name} é um prêmio de conquista: não dá para vender.` };
  if (def.kind === 'accessory' && Object.values(s.wear.mons).filter((w) => w === id).length + (s.wear.player === id ? 1 : 0) >= have) {
    return { ok: false, message: 'Esse acessório está sendo usado. Tire antes de vender.' };
  }
  s.inventory[id] = have - n;
  const earned = Math.round(def.sell * n * weeklyModifiers(s).saleMultiplier);
  s.coins += earned;
  return { ok: true, message: `Vendeu ${n} ${def.name}: +${earned} moedas.` };
}

// ----------------------------------------------------------------------------- horta

export const cropAt = (s: VillageState, x: number, y: number): Crop | undefined => s.crops.find((c) => c.x === x && c.y === y);

/** Planta uma semente na grama (ou flores) à sua frente, ou num canteiro arado da fazenda. */
export function plant(s: VillageState, map: VillageMap, seed: ItemId, x: number, y: number, now: number, occupied: (x: number, y: number) => boolean): Interaction {
  const def = itemDef(seed);
  if (def?.kind !== 'seed') return { ok: false, message: 'Isso não é semente.' };
  if (count(s, seed) <= 0) return { ok: false, message: `Você não tem ${def.name}.` };
  const t = tileAt(map, x, y);
  if (!['grass', 'flower', 'tall', 'field'].includes(t) || cropAt(s, x, y) || isPlaced(s, x, y) || occupied(x, y)) return { ok: false, message: 'Plante na grama livre à sua frente.' };
  const closed = blocksRoute(s, map, x, y);
  if (closed) return { ok: false, message: closed };
  s.inventory[seed] = count(s, seed) - 1;
  s.crops.push({ x, y, seed, stage: 0, wateredAt: now });
  return { ok: true, message: `Você plantou ${def.name}. Regue para crescer!` };
}

/**
 * Avança a horta: cada estágio precisa de rega e dos minutos da planta desde a rega. `factor` < 1 encurta esse tempo
 * (chuva de Suicune, ver `legendaryEffects`).
 */
export function tickCrops(s: VillageState, now: number, factor = 1): number {
  factor *= weeklyModifiers(s).cropGrowthFactor;
  let grew = 0;
  for (const c of s.crops) {
    const g = itemDef(c.seed)?.grows;
    if (!g || c.stage >= g.stages || c.wateredAt === null) continue;
    if (now - c.wateredAt >= g.minutes * 60_000 * factor) {
      c.stage++;
      c.wateredAt = null;
      grew++;
    }
  }
  return grew;
}

export function water(s: VillageState, x: number, y: number, now: number): Interaction {
  const c = cropAt(s, x, y);
  const g = c && itemDef(c.seed)?.grows;
  if (!c || !g) return { ok: false, message: '' };
  if (c.stage >= g.stages) return { ok: false, message: 'Já está pronta para colher!' };
  if (c.wateredAt !== null) return { ok: false, message: `Já regada. Volte em uns ${Math.max(1, Math.ceil((g.minutes * 60_000 - (now - c.wateredAt)) / 60_000))} minutos.` };
  c.wateredAt = now;
  return { ok: true, message: 'Você regou a planta.' };
}

export function harvestCrop(s: VillageState, x: number, y: number, rng: Rng): Interaction {
  const i = s.crops.findIndex((c) => c.x === x && c.y === y);
  const c = s.crops[i];
  const g = c && itemDef(c.seed)?.grows;
  if (!c || !g || c.stage < g.stages) return { ok: false, message: '' };
  s.crops.splice(i, 1);
  const qty = g.yield[0] + Math.floor(rng() * (g.yield[1] - g.yield[0] + 1));
  add(s, g.crop, qty);
  if (rng() < 0.5) add(s, c.seed);
  return { ok: true, message: `Colheu ${qty} ${itemName(g.crop)}!`, got: { item: g.crop, qty } };
}

/** A planta precisa de água agora? (para o balãozinho de gota) */
export function needsWater(c: Crop): boolean {
  const g = itemDef(c.seed)?.grows;
  return !!g && c.stage < g.stages && c.wateredAt === null;
}

// ----------------------------------------------------------------------------- acessórios

/** Põe (ou tira, com `null`) um acessório em você (`'player'`) ou num Pokémon (id da carta). */
export function wear(s: VillageState, who: string, accessory: string | null): Interaction {
  if (accessory === null) {
    if (who === 'player') s.wear.player = null;
    else s.wear.mons[who] = null;
    return { ok: true, message: 'Acessório guardado.' };
  }
  const def = itemDef(accessory);
  if (def?.kind !== 'accessory') return { ok: false, message: 'Isso não é acessório.' };
  if (who === 'player' ? def.slot === 'pokemon' : def.slot === 'player') return { ok: false, message: who === 'player' ? 'Esse é para Pokémon.' : 'Esse é para você.' };
  const inUse = Object.entries(s.wear.mons).filter(([id, w]) => w === accessory && id !== who).length + (s.wear.player === accessory && who !== 'player' ? 1 : 0);
  if (count(s, accessory) <= inUse) return { ok: false, message: `Você precisa de mais um ${def.name} (todos estão em uso).` };
  if (who === 'player') s.wear.player = accessory;
  else s.wear.mons[who] = accessory;
  return { ok: true, message: `${def.name} posto!` };
}

// ----------------------------------------------------------------------------- ajuda dos amigos

const HELP_ITEMS = ['madeira', 'pedra', 'oran', 'pecha', 'flor', 'concha', 'tecido', 'ferro', 'la', 'mel', 'champignon', 'argila', 'pena', 'areia'] as const;

/**
 * Amigo (nível 2) ou mais traz, uma vez por dia, alguns materiais que achou pela vila; Melhor amigo, uma vez por semana,
 * um móvel raro (que só se ganha assim).
 */
export function dailyHelp(s: VillageState, id: string, day: string, rng: Rng): { items: { item: ItemId; qty: number }[]; rare: ItemId | null } {
  const level = friendLevel(friendOf(s, id).points).level;
  const items: { item: ItemId; qty: number }[] = [];
  let rare: ItemId | null = null;
  if (level >= 2 && s.helped[id] !== day) {
    s.helped[id] = day;
    const n = level >= 3 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const item = HELP_ITEMS[Math.floor(rng() * HELP_ITEMS.length)]!;
      const qty = 1 + Math.floor(rng() * 3);
      add(s, item, qty);
      items.push({ item, qty });
    }
  }
  if (level >= 4) {
    const week = Math.floor(Date.parse(`${day}T12:00:00Z`) / (7 * 86_400_000));
    if (Number.isFinite(week) && s.rareGift[id] !== String(week)) {
      s.rareGift[id] = String(week);
      const gifts = ITEMS.filter((i) => i.gift).map((i) => i.id);
      const missing = gifts.filter((g) => !s.collected.includes(g));
      rare = (missing.length > 0 ? missing : gifts)[Math.floor(rng() * (missing.length > 0 ? missing.length : gifts.length))]!;
      add(s, rare);
    }
  }
  return { items, rare };
}
