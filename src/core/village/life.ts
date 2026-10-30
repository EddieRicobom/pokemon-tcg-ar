import type { Rng } from '../battle';
import type { PokemonType } from '../pokemon-data';
import { ACCESSORY_IDS, FURNITURE_IDS, isItem, itemDef, ITEMS, MATERIAL_IDS, shopToday } from './catalog';
import { hash, personalityOf } from './personality';
import { MOUNTAIN_REMARKS, MOUNTAIN_TALK_LINES, STATUE_REMARKS } from './mew-shrine';
import { emptySocial, normalizeSocial } from './social-state';
import type { Answer, Lingo, Moment, Relation, SocialMemory, SocialPlan } from './social-state';
import { cutsOff, isFront, tileAt } from './map';
import type { Tile, VillageMap } from './map';
import { emptyDigital, normalizeDigital } from './digital';
import type { DigitalState } from './digital';
import { emptyLegendary, normalizeLegendary } from './legendary';
import type { LegendaryState } from './legendary';
import { emptyWorldProgress, normalizeWorldProgress, weeklyModifiers } from './world-progress';
import type { DiscoveryState, Expedition, WeeklyState } from './world-progress';
import type { VillageRequest } from './requests';
import { emptyHomeInterior, normalizeHomeInterior, normalizeHomeInteriors } from './home-interior';
import type { HomeInterior, HomeInteriors } from './home-interior';
import { normalizeHomeProjects, normalizeHomeValue } from './home-state';
import type { HomeProjects } from './home-state';
import { normalizeResidentEconomy } from './resident-economy';
import type { ResidentEconomy } from './resident-economy';
import { emptyCommunity, normalizeCommunity } from './community';
import type { CommunityState } from './community';
import { emptyFarm, normalizeFarm } from './farm';
import type { FarmState } from './farm';
import { emptyMail, normalizeMail } from './mail';
import { emptyTower, normalizeTower } from './tower-state';
import { emptyDungeonVault, normalizeDungeonVault } from './dungeon-vault';
import type { DungeonVault } from './dungeon-vault';
import type { TowerState } from './tower-state';
import type { MailState } from './mail';

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
  { name: 'Casa com varanda', cost: { tabua: 12, tijolo: 8, vidro: 3 } },
  { name: 'Solar da Vila', cost: { tabua: 18, tijolo: 14, vidro: 6, flor: 12 } },
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
  /** Maior nível de amizade já comemorado (ver `claimFriendMilestones`): o que se abre em cada nível é anunciado uma vez só. */
  milestone?: number;
  /** Nível que você viu por último: cair abaixo dele ou voltar a ele também é anunciado. */
  known?: number;
  /** Dia da última mágoa (amizade perdida): o Livro mostra no humor do dia. */
  hurt?: string;
}

/**
 * Versão do desenho do mapa: saves de antes do mapa grande (sem este número) passam por `migrateLayout`. A versão 3
 * acrescentou o Monte Miragem a oeste: a cidade inteira andou `WEST` blocos para a direita.
 */
export const MAP_LAYOUT = 3;
/** O mapa grande antes do Monte Miragem (mesmo desenho, sem as colunas do oeste). */
export const MAP_LAYOUT_BEFORE_MOUNTAIN = 2;

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
  /** Decoração interna que cada casa de morador compra para si, indexada pelo terreno. */
  homeInteriors: HomeInteriors;
  friends: Record<string, Friendship>;
  /** Último dia em que cada bloco foi coletado ("x,y" → dia). */
  harvested: Record<string, string>;
  /** Quem segue você pela vila (melhor amigo). */
  follower: string | null;
  /** Moedas (vendendo na loja; ganhas também com pedidos e colheitas). */
  coins: number;
  /** Segredo da Estátua do Mew já revelado: mantém a Vila no estágio máximo. */
  mewBlessing: boolean;
  /** Horta: o que está plantado em cada bloco. */
  crops: Crop[];
  farm: FarmState;
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
  plans: SocialPlan[];
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
  /** Estilo visual exterior escolhido para cada casa de morador. */
  homeStyles: Record<string, string>;
  /** Poupança doméstica e limite diário de reformas; nunca usa a carteira do jogador. */
  homeProjects: HomeProjects;
  town: { level: number; mailDay: string; cafeDay: string };
  /** Pedidos diários do mural da praça. */
  requests: { day: string; items: VillageRequest[]; story: VillageRequest[] };
  /** Digital Pokémon (presente inicial, Fonte, evolução) — pagos em moedas, o saldo único (`app/wallet.ts`). */
  digital: DigitalState;
  /** Quantas moedas já foram lançadas na Fonte. */
  fountainWishes: number;
  /** A cena única do Ho-Oh já começou; retrocompatível com saves anteriores. */
  hoOhWishSeen: boolean;
  /** Encontros lendários raríssimos na Vila (ver `legendary.ts`). */
  legendary: LegendaryState;
  recap: { day: string; at: number };
  discoveries: DiscoveryState;
  weekly: WeeklyState;
  expeditions: Expedition[];
  /** Economia comunitária diária, com histórico limitado e defaults retrocompatíveis. */
  community: CommunityState;
  /** Caixa de entrada e arquivo de cartas ligadas aos momentos reais da Vila. */
  mail: MailState;
  /** Morador escolhido para o turno do Correio; saves antigos começam sem escolha. */
  mailCarrierId: string | null;
  cafeWaiterId: string | null;
  /** Morador que cuida do Dojô da Torre (terceiro posto, além do carteiro e da garçonete). */
  instructorId: string | null;
  /** Dojô, treinos, lições, sorte do carteiro e marmita: a progressão do Survival/BONK (ver `docs/PROGRESSAO_TORRE.md`). */
  tower: TowerState;
  /** Cofre de gemas, teto diário e recorde da Masmorra (`core/dungeon-village.ts`). */
  dungeon: DungeonVault;
  residentEconomy: ResidentEconomy;
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
    v: 1, seed, layout: MAP_LAYOUT, player: { ...spawn, dir: 'down' }, inventory: {}, house: 0, placed: [], homeInterior: emptyHomeInterior(), homeInteriors: {}, friends: {}, harvested: {}, follower: null,
    coins: 100, mewBlessing: false, crops: [], farm: emptyFarm(), wear: { player: null, mons: {} }, collected: [], helped: {}, rareGift: {},
    claimed: [], ...emptySocial(), fishing: { day: '', casts: 0 }, battleCoins: { day: '', count: 0 }, homes: {}, town: { level: 1, mailDay: '', cafeDay: '' }, requests: { day: '', items: [], story: [] },
    digital: emptyDigital(), fountainWishes: 0, hoOhWishSeen: false, legendary: emptyLegendary(), recap: { day: '', at: 0 }, community: emptyCommunity(), mail: emptyMail(), mailCarrierId: null, cafeWaiterId: null, instructorId: null, tower: emptyTower(), dungeon: emptyDungeonVault(), residentEconomy: {}, ...emptyWorldProgress(), homeStyles: {}, homeProjects: {},
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

/** Itens que trocaram de id: o save antigo é lido com o id novo, para nada sumir da mochila. */
const RENAMED_ITEMS: Readonly<Record<string, string>> = { 'mega-stone-shard': 'omega-shard' };

export function normalizeVillage(raw: unknown, seed: number, spawn: { x: number; y: number }): VillageState {
  const base = emptyVillage(seed, spawn);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<VillageState>;
  if (r.v !== 1 || r.seed !== seed) return base;
  const inv: Partial<Record<ItemId, number>> = {};
  for (const [key, n] of Object.entries(r.inventory ?? {})) {
    const k = RENAMED_ITEMS[key] ?? key;
    if (isItem(k) && Number.isInteger(n) && (n as number) > 0) inv[k as ItemId] = Math.min(999, (inv[k as ItemId] ?? 0) + (n as number));
  }
  const p = r.player;
  return {
    ...base,
    // Sem o número (save de antes do mapa grande) = mapa antigo; quem carrega passa por `migrateLayout`.
    layout: r.layout === MAP_LAYOUT || r.layout === MAP_LAYOUT_BEFORE_MOUNTAIN ? r.layout : 1,
    player: p && Number.isInteger(p.x) && Number.isInteger(p.y) ? { x: p.x, y: p.y, dir: ['up', 'down', 'left', 'right'].includes(p.dir) ? p.dir : 'down' } : base.player,
    inventory: inv,
    farm: normalizeFarm(r.farm),
    house: Number.isInteger(r.house) ? Math.max(0, Math.min(HOUSE_LEVELS.length - 1, r.house!)) : 0,
    placed: Array.isArray(r.placed) ? r.placed.filter((f) => f && Number.isInteger(f.x) && Number.isInteger(f.y) && FURNITURE_IDS.includes(f.item)).slice(0, 300) : [],
    homeInterior: normalizeHomeInterior(r.homeInterior),
    homeInteriors: normalizeHomeInteriors(r.homeInteriors),
    friends: normalizeFriends(r.friends),
    harvested: r.harvested && typeof r.harvested === 'object' ? r.harvested : {},
    follower: typeof r.follower === 'string' ? r.follower : null,
    coins: Number.isInteger(r.coins) ? Math.max(0, Math.min(999999, r.coins!)) : base.coins,
    mewBlessing: r.mewBlessing === true,
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
    homes: r.homes && typeof r.homes === 'object' ? Object.fromEntries(Object.entries(r.homes).filter(([k, v]) => k.length <= 80 && Number.isInteger(v)).slice(0, 80).map(([k, v]) => [k, normalizeHomeValue(v as number)])) : {},
    homeStyles: r.homeStyles && typeof r.homeStyles === 'object' ? Object.fromEntries(Object.entries(r.homeStyles).filter(([k, v]) => k.length <= 80 && typeof v === 'string').slice(0, 80)) : {},
    homeProjects: normalizeHomeProjects(r.homeProjects),
    town: { level: Number.isInteger(r.town?.level) ? Math.max(1, Math.min(99, r.town!.level)) : 1, mailDay: typeof r.town?.mailDay === 'string' ? r.town.mailDay.slice(0, 12) : '', cafeDay: typeof r.town?.cafeDay === 'string' ? r.town.cafeDay.slice(0, 12) : '' },
    requests: normalizeRequests(r.requests),
    fishing: r.fishing && typeof r.fishing.day === 'string' && Number.isInteger(r.fishing.casts) ? { day: r.fishing.day, casts: Math.max(0, Math.min(99, r.fishing.casts)) } : { day: '', casts: 0 },
    battleCoins: r.battleCoins && typeof r.battleCoins.day === 'string' && Number.isInteger(r.battleCoins.count)
      ? { day: r.battleCoins.day.slice(0, 12), count: Math.max(0, Math.min(BATTLE_REWARDS_PER_DAY, r.battleCoins.count)) }
      : { day: '', count: 0 },
    digital: normalizeDigital(r.digital),
    fountainWishes: r.hoOhWishSeen === true ? 3 : (Number.isInteger(r.fountainWishes) ? Math.max(0, Math.min(3, r.fountainWishes ?? 0)) : 0),
    hoOhWishSeen: r.hoOhWishSeen === true,
    legendary: normalizeLegendary(r.legendary),
    recap: { day: typeof r.recap?.day === 'string' ? r.recap.day : '', at: typeof r.recap?.at === 'number' && Number.isFinite(r.recap.at) && r.recap.at >= 0 ? r.recap.at : 0 },
    ...normalizeWorldProgress(r),
    community: normalizeCommunity(r.community),
    mail: normalizeMail(r.mail),
    mailCarrierId: typeof r.mailCarrierId === 'string' ? r.mailCarrierId.slice(0, 80) : null,
    cafeWaiterId: typeof r.cafeWaiterId === 'string' ? r.cafeWaiterId.slice(0, 80) : null,
    instructorId: typeof r.instructorId === 'string' ? r.instructorId.slice(0, 80) : null,
    tower: normalizeTower(r.tower),
    dungeon: normalizeDungeonVault(r.dungeon),
    residentEconomy: normalizeResidentEconomy(r.residentEconomy),
  };
}

export const count = (s: VillageState, item: ItemId): number => s.inventory[item] ?? 0;

/** Quantidade que ações manuais podem gastar depois de respeitar propostas ativas do Conselho. */
export function availableCount(s: VillageState, item: ItemId): number {
  const reserved = s.community.council.reduce((total, project) => {
    if (project.status !== 'proposto' && project.status !== 'apoiado') return total;
    return total + project.ingredients.filter((ingredient) => ingredient.item === item).reduce((sum, ingredient) => sum + ingredient.qty, 0);
  }, 0);
  return Math.max(0, count(s, item) - reserved);
}

export function canAfford(s: VillageState, cost: Partial<Record<ItemId, number>>): boolean {
  return Object.entries(cost).every(([k, n]) => availableCount(s, k as ItemId) >= (n ?? 0));
}

export function pay(s: VillageState, cost: Partial<Record<ItemId, number>>): void {
  if (!canAfford(s, cost)) return;
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

/** Sementes das frutas Pokémon: achado raro no mato alto (também vendem na loja). */
const BERRY_SEEDS_WILD = ['sem-cheri', 'sem-chesto', 'sem-rawst', 'sem-aspear', 'sem-leppa', 'sem-persim', 'sem-razz', 'sem-nanab'] as const;
const STONES = ['pedra-fogo', 'pedra-agua', 'pedra-trovao', 'pedra-folha', 'pedra-gelo', 'pedra-lua', 'pedra-sol'] as const;

const SEEDS_WILD = ['sem-oran', 'sem-pecha', 'sem-girassol', 'sem-tomate', 'sem-cenoura', 'sem-milho', 'sem-batata', 'sem-lavanda'] as const;

const HARVEST: Partial<Record<Tile, HarvestRule>> = {
  tree: { item: 'madeira', qty: [1, 3], verb: 'Você cortou galhos da árvore', extra: [{ item: 'pena', chance: 0.12, verb: 'caiu uma pena do ninho' }, { item: 'mel', chance: 0.05, verb: 'achou um favo de mel' }, { item: 'bolota', chance: 0.14, verb: 'caiu uma bolota' }, { item: 'pinha', chance: 0.1, verb: 'caiu uma pinha' }, { item: 'seiva', chance: 0.05, verb: 'escorreu seiva do tronco' }] },
  rock: { item: 'pedra', qty: [1, 2], verb: 'Você quebrou um pedaço da pedra', extra: [{ item: 'cristal', chance: 0.12, verb: 'brilhou um cristal lá dentro' }, { item: 'ouro', chance: 0.04, verb: 'tinha uma pepita de ouro' }, { item: 'carvao', chance: 0.2, verb: 'saiu carvão' }, { item: 'quartzo', chance: 0.07, verb: 'apareceu um quartzo' }, { item: 'ambar', chance: 0.03, verb: 'achou um âmbar' }, { item: 'fossil-helix', chance: 0.015, verb: 'era um Fóssil Hélice!' }, { item: 'fossil-domo', chance: 0.015, verb: 'era um Fóssil Domo!' }, ...STONES.map((item) => ({ item, chance: 0.008, verb: 'brilhou uma pedra de evolução!' }))] },
  bush: { item: (rng) => (rng() < 0.6 ? 'oran' : 'pecha'), qty: [1, 2], verb: 'Você colheu frutas do arbusto', extra: [{ item: 'sem-morango', chance: 0.06, verb: 'achou uma semente de morango' }, { item: 'erva', chance: 0.12, verb: 'e um raminho de erva aromática' }] },
  flower: { item: 'flor', qty: [1, 2], verb: 'Você colheu flores', extra: [{ item: 'mel', chance: 0.18, verb: 'as abelhas deixaram mel' }, { item: 'trevo', chance: 0.04, verb: 'e, no meio delas, um trevo de quatro folhas' }] },
  sand: { item: 'concha', qty: [1, 1], verb: 'Você achou uma concha na areia' },
  tall: { item: (rng) => (rng() < 0.12 ? BERRY_SEEDS_WILD[Math.floor(rng() * BERRY_SEEDS_WILD.length)]! : SEEDS_WILD[Math.floor(rng() * SEEDS_WILD.length)]!), qty: [1, 1], verb: 'Você achou no mato alto', extra: [{ item: 'champignon', chance: 0.3, verb: 'e um cogumelo' }, { item: 'cogumelo-pequeno', chance: 0.1, verb: 'e um Cogumelo Pequeno' }, { item: 'cogumelo-grande', chance: 0.02, verb: 'e um Cogumelo Grande!' }] },
};

/** Coleta no bloco (x, y): cada bloco dá uma vez por dia (a natureza volta no dia seguinte). */
export function harvest(s: VillageState, map: VillageMap, x: number, y: number, day: string, rng: Rng): Interaction {
  const tile = tileAt(map, x, y);
  const rule = HARVEST[tile];
  if (!rule) return { ok: false, message: '' };
  // Areia: só às vezes tem concha, e o resto é areia, argila, sal ou, raramente, uma concha espiral.
  let sandItem: ItemId | null = null;
  if (tile === 'sand') {
    const roll = rng();
    if (roll < 0.2) return { ok: false, message: 'Só areia por aqui.' };
    sandItem = roll < 0.52 ? 'concha' : roll < 0.76 ? 'areia' : roll < 0.88 ? 'argila' : roll < 0.96 ? 'sal-praia' : 'concha-espiral';
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
  { item: 'caranguejo', w: 8, msg: 'Um caranguejo agarrou a isca' },
  { item: 'lula', w: 6, msg: 'Uma lula saiu da água' },
  { item: 'escama-coracao', w: 3, msg: 'Uma Escama Coração brilhando no anzol' },
];

/** Tudo o que a natureza dá (coleta por bloco, areia e pesca): para conferir que todo material tem de onde vir. */
export const WILD_FINDS: ReadonlySet<string> = new Set<string>([
  ...Object.values(HARVEST).flatMap((r) => [...(typeof r.item === 'string' ? [r.item] : []), ...(r.extra ?? []).map((e) => e.item)]),
  ...SEEDS_WILD, ...BERRY_SEEDS_WILD, 'concha', 'areia', 'argila', 'sal-praia', 'concha-espiral',
  ...FISH_TABLE.flatMap((f) => (f.item ? [f.item] : [])),
]);

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
    .map(([k, n]) => {
      const item = k as ItemId;
      const reserved = count(s, item) - availableCount(s, item);
      return `${itemName(item)} ${Math.min(availableCount(s, item), n ?? 0)}/${n}${reserved > 0 ? ` (${reserved} reservado(s) pelo Conselho)` : ''}`;
    })
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
  return (s.friends[id] ??= { points: 0, lastTalk: '', lastGift: '', request: null, milestone: 0, known: 0 });
}

/** Pontos máximos: a evolução por amizade da carta pede a amizade cheia (100), um passo depois de «Melhor amigo». */
export const FRIEND_MAX = 100;

export function friendLevel(points: number): { level: number; name: string; hearts: number; next: { name: string; min: number } | null; toNext: number } {
  let level = 0;
  FRIEND_LEVELS.forEach((l, i) => {
    if (points >= l.min) level = i;
  });
  const upcoming = FRIEND_LEVELS[level + 1];
  const next = upcoming ? { name: upcoming.name, min: upcoming.min } : points < FRIEND_MAX ? { name: 'amizade máxima', min: FRIEND_MAX } : null;
  return { level, name: FRIEND_LEVELS[level]!.name, hearts: Math.round(Math.max(0, Math.min(FRIEND_MAX, points)) / 20), next, toNext: next ? Math.max(0, next.min - points) : 0 };
}

/** "faltam 12 para Amigo" (ou "amizade máxima"), para mostrar o caminho até o próximo marco. */
export function friendProgressText(points: number): string {
  const { next, toNext } = friendLevel(points);
  return next ? `faltam ${toNext} para ${next.name}` : 'amizade máxima';
}

/**
 * Soma (ou tira) amizade com o limite de 0 a 100; devolve quanto de fato mudou. Com `day`, uma perda marca a mágoa do
 * dia (o humor no Livro).
 */
export function gainFriendship(s: VillageState, id: string, delta: number, day?: string): number {
  const f = friendOf(s, id);
  const before = f.points;
  f.points = Math.max(0, Math.min(FRIEND_MAX, Math.round(before + delta)));
  if (day && f.points < before) f.hurt = day;
  return f.points - before;
}

export interface FriendMilestone {
  id: string;
  /** `up`: nível novo; `back`: voltou a um nível que já tinha tido; `down`: a amizade esfriou e caiu de nível. */
  kind: 'up' | 'back' | 'down';
  /** Nível de agora (índice de `FRIEND_LEVELS`). */
  level: number;
  name: string;
  /** Nível que você conhecia antes da mudança. */
  from: number;
  /** Em `up`, os níveis abertos pela primeira vez (para listar o que se abriu); em `down`, os níveis perdidos. */
  passed: number[];
}

/**
 * Mudanças de nível ainda não anunciadas, venha o ganho ou a perda de onde vier (conversa, presente, momento, carta,
 * mural, reforma, ausência). O que se abre num nível é comemorado só na primeira vez; cair e se recuperar também aparece.
 */
export function claimFriendMilestones(s: VillageState, ids: readonly string[] = Object.keys(s.friends)): FriendMilestone[] {
  const out: FriendMilestone[] = [];
  for (const id of ids) {
    const f = s.friends[id];
    if (!f) continue;
    const { level, name } = friendLevel(f.points);
    const best = f.milestone ?? 0;
    const known = f.known ?? best;
    if (level === known) continue;
    f.known = level;
    if (level < known) {
      out.push({ id, kind: 'down', level, name, from: known, passed: Array.from({ length: known - level }, (_, k) => known - k) });
      continue;
    }
    const fresh = Array.from({ length: Math.max(0, level - best) }, (_, k) => best + 1 + k);
    f.milestone = Math.max(best, level);
    out.push({ id, kind: fresh.length > 0 ? 'up' : 'back', level, name, from: known, passed: fresh });
  }
  return out;
}

/** Perdas por descuido: pequenas, com teto, e recuperáveis com uma conversa e um presente. */
export const FRIEND_LOSS = {
  /** Pedido do dia que ficou sem resposta até a próxima conversa. */
  ignoredRequest: 2,
  /** Dias sem conversar antes de a saudade pesar. */
  absenceGraceDays: 7,
  /** Perda por semana inteira sem conversar. */
  absencePerWeek: 2,
  /** Teto da saudade numa volta só. */
  absenceMax: 8,
  /** Presente que o Livro diz que ele não gosta. */
  dislikedGift: 2,
} as const;

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) : 0;
}

/**
 * Limpa as amizades do save. Saves de antes dos marcos não têm `milestone`/`known`: o nível atual vale como já
 * comemorado, para ninguém receber de uma vez os avisos de tudo o que já tinha conquistado.
 */
function normalizeFriends(raw: unknown): Record<string, Friendship> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, Friendship> = {};
  for (const [id, v] of Object.entries(raw as Record<string, Partial<Friendship>>)) {
    if (!v || typeof v !== 'object') continue;
    const points = typeof v.points === 'number' && Number.isFinite(v.points) ? Math.max(0, Math.min(FRIEND_MAX, Math.round(v.points))) : 0;
    const level = friendLevel(points).level;
    const milestone = Number.isInteger(v.milestone) ? Math.max(0, Math.min(FRIEND_LEVELS.length - 1, v.milestone!)) : level;
    const known = Number.isInteger(v.known) ? Math.max(0, Math.min(FRIEND_LEVELS.length - 1, v.known!)) : level;
    out[id] = { ...v, points, lastTalk: typeof v.lastTalk === 'string' ? v.lastTalk : '', lastGift: typeof v.lastGift === 'string' ? v.lastGift : '', request: v.request ?? null, milestone, known } as Friendship;
  }
  return out;
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

const DISLIKE_POOL = ['pedra', 'madeira', 'concha', 'flor', 'tomate', 'abobora'] as const;

/** O que ele não gosta de ganhar (nunca é o favorito). O Livro mostra; o presente rende quase nada. */
export function dislikeOf(id: string, types: readonly PokemonType[]): string {
  const fav = favoriteOf(types);
  const pool = DISLIKE_POOL.filter((i) => i !== fav);
  return pool[hash(`d:${id}`) % pool.length]!;
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
  0: ['Oi! Ainda estou me acostumando com a vila.', 'Você é quem cuida da Vila, né? Prazer!', 'Que lugar bonito... posso explorar?'],
  1: ['Bom te ver de novo!', 'Hoje achei um cantinho ótimo perto do lago.', 'Vamos treinar depois?'],
  2: ['Você é um bom amigo, sabia?', 'Quando você chega, o dia fica melhor!', 'Guardei um lugar para você na sombra.'],
  3: ['Eu confio em você para qualquer batalha!', 'Lembra do dia em que eu cheguei na Vila? Eu lembro!', 'Quero ficar sempre na sua equipe.'],
  4: ['Você é meu melhor amigo!', 'Vou te seguir para onde você for!', 'Nenhuma insígnia vale mais que a nossa amizade.'],
};

/** Quando já conversaram hoje: a reação muda com a intimidade, para a amizade aparecer mesmo sem pontos novos. */
const AGAIN_LINES: Record<number, (name: string) => string> = {
  0: (name) => `${name} acena de longe, ainda meio sem jeito.`,
  1: (name) => `${name} sorri quando vê você.`,
  2: (name) => `${name} está feliz em te ver.`,
  3: (name) => `${name} pula de alegria e vem correndo até você.`,
  4: (name) => `${name} encosta em você e fica ali, quietinho. Nem precisa dizer nada.`,
};

export interface Talk {
  text: string;
  gained: number;
  /** Amizade perdida antes da conversa de hoje (pedido sem resposta, muito tempo sem aparecer). */
  lost: number;
  /** Pedido feito agora (ou que segue aberto). */
  request: Friendship['request'];
}

/** Amizade da primeira conversa do dia. */
export const TALK_FRIENDSHIP = 6;

/** Como ele recebe você depois de muito tempo sem conversar, pelo nível de agora. */
const MISSED_YOU: Record<number, (days: number) => string> = {
  0: () => 'Ah, é você. Achei que tinha esquecido da Vila.',
  1: (days) => `Faz ${days} dias que a gente não conversa...`,
  2: (days) => `${days} dias sem aparecer! Eu fiquei com saudade, sabia?`,
  3: () => 'Você sumiu! Eu olhava a estrada todo dia esperando você voltar.',
  4: () => 'Finalmente! Eu guardei um monte de coisa para te contar.',
};

/**
 * Conversa: a primeira do dia vale amizade (+6). Às vezes (1 em 3 dias) o Pokémon pede um item; entregar vale bem mais.
 * Antes dela, pesa um pouco o que ficou para trás: o pedido sem resposta e a saudade de mais de uma semana (`FRIEND_LOSS`).
 * O texto muda com o nível de amizade e com a hora (bom dia / boa noite).
 */
/** Onde a conversa acontece, quando o lugar muda o assunto: nos patamares do Monte Miragem ou diante da Estátua do Mew. */
export type TalkPlace = 'mountain' | 'statue' | null;

export function talk(s: VillageState, id: string, name: string, types: readonly PokemonType[], day: string, hour: number, rng: Rng, gossip: string | null = null, weather: string | null = null, place: TalkPlace = null): Talk {
  const f = friendOf(s, id);
  let gained = 0;
  let lost = 0;
  let grievance = '';
  const first = f.lastTalk !== day;
  if (first) {
    const away = f.lastTalk ? daysBetween(f.lastTalk, day) : 0;
    const missed = f.request && f.request.day !== day && !f.request.done ? f.request : null;
    const missing = away >= FRIEND_LOSS.absenceGraceDays ? Math.min(FRIEND_LOSS.absenceMax, FRIEND_LOSS.absencePerWeek * Math.floor(away / 7)) : 0;
    const change = gainFriendship(s, id, -((missed ? FRIEND_LOSS.ignoredRequest : 0) + missing), day);
    lost = change < 0 ? -change : 0;
    if (missing > 0) grievance = `${MISSED_YOU[friendLevel(f.points).level]!(away)} `;
    if (missed) grievance += `Da última vez eu te pedi ${missed.qty} ${itemName(missed.item)}... tudo bem, fica para a próxima. `;
    f.lastTalk = day;
    gained = gainFriendship(s, id, TALK_FRIENDSHIP);
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
  // O Monte Miragem: lá em cima o assunto é a subida e a estátua; na cidade, de vez em quando (≈8% dos dias, pelo
  // hash — sem gastar o sorteio da conversa), o morador comenta o monte do jeito dele.
  const roll = hash(`monte:${id}:${day}`) % 100;
  if (place === 'statue' && roll < 70) pool = STATUE_REMARKS;
  else if (place === 'mountain' && roll < 60) pool = MOUNTAIN_REMARKS;
  else if (place === null && level >= 1 && roll < 8) pool = [MOUNTAIN_TALK_LINES[personalityOf(id).name]];
  const remembers = !!gossip && level >= 1 && rng() < 0.6;
  if (remembers) pool = [gossip!];
  let text = `${first ? greet : ''}${grievance}${pool[Math.floor(rng() * pool.length)]}`;
  const req = f.request && f.request.day === day && !f.request.done ? f.request : null;
  if (req) text += ` Ah... você teria ${req.qty} ${itemName(req.item)}? Eu ia adorar!`;
  else if (!first && !remembers) text = AGAIN_LINES[level]!(name);
  return { text, gained, lost, request: req };
}

export interface Gift {
  ok: boolean;
  text: string;
  gained: number;
}

/** Presente: entrega o pedido do dia (muito), o favorito (bastante), qualquer coisa (um pouco) ou o que ele não gosta (tira um pouco). Um presente por dia. */
export function giveGift(s: VillageState, id: string, types: readonly PokemonType[], item: ItemId, day: string): Gift {
  const f = friendOf(s, id);
  const def = itemDef(item);
  if (def?.friendshipLevels) {
    if (availableCount(s, item) <= 0) return { ok: false, text: `Você não tem ${itemName(item)} disponível.`, gained: 0 };
    const current = friendLevel(f.points).level;
    const next = FRIEND_LEVELS[current + 1];
    if (!next) return { ok: false, text: 'A gente já é melhor amigo! Guarde esse doce para outra pessoa.', gained: 0 };
    s.inventory[item] = count(s, item) - 1;
    const gained = next.min - f.points;
    f.points = Math.min(100, next.min);
    return { ok: true, text: `✨ ${itemName(item)}! A amizade subiu para ${next.name}.`, gained };
  }
  if (def?.kind === 'food') {
    if (f.lastMeal === day) return { ok: false, text: 'Já comi hoje. Estou satisfeito, obrigado!', gained: 0 };
    if (availableCount(s, item) <= 0) return { ok: false, text: `Esse alimento está reservado para uma proposta ativa do Conselho.`, gained: 0 };
    s.inventory[item] = count(s, item) - 1;
    f.lastMeal = day;
    const fav = favoriteFoodOf(types) === item;
    const greedy = personalityOf(id).name === 'Guloso';
    const gained = gainFriendship(s, id, (def.feeds ?? 8) + (fav ? 10 : 0) + (greedy ? 4 : 0));
    const text = fav ? `${itemName(item)}! Meu prato favorito! Que delícia!` : greedy ? `Nhac! ${itemName(item)}! Tem mais?` : `${itemName(item)}... uma delícia, obrigado!`;
    return { ok: true, text, gained };
  }
  const req = f.request && f.request.day === day && !f.request.done ? f.request : null;
  if (req && req.item === item) {
    if (availableCount(s, item) < req.qty) return { ok: false, text: `Precisa de ${req.qty} ${itemName(item)} disponíveis; parte do estoque pode estar reservada para o Conselho.`, gained: 0 };
    s.inventory[item] = count(s, item) - req.qty;
    req.done = true;
    const gained = gainFriendship(s, id, 15);
    add(s, (['oran', 'pecha', 'concha', 'flor'] as const)[req.qty % 4]!, 1);
    return { ok: true, text: 'Era isso que eu queria! Obrigado! Tome, um presentinho meu.', gained };
  }
  if (f.lastGift === day) return { ok: false, text: 'Já ganhei presente hoje. Obrigado mesmo assim!', gained: 0 };
  if (availableCount(s, item) <= 0) return { ok: false, text: `Esse item está reservado para uma proposta ativa do Conselho.`, gained: 0 };
  s.inventory[item] = count(s, item) - 1;
  f.lastGift = day;
  const fav = favoriteOf(types) === item;
  // O Livro avisa do que ele não gosta: insistir nisso afasta um pouquinho.
  const disliked = !fav && dislikeOf(id, types) === item;
  const gained = gainFriendship(s, id, fav ? 10 : disliked ? -FRIEND_LOSS.dislikedGift : 4, day);
  return { ok: true, text: fav ? `${itemName(item)}! É o meu favorito!` : disliked ? `${itemName(item)}... Ah. Obrigado, mas eu não gosto muito disso.` : 'Que gentil, obrigado!', gained };
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
  const n = Math.min(availableCount(s, id), Math.max(1, qty));
  if (!def || n <= 0) return { ok: false, message: availableCount(s, id) === 0 && have > 0 ? 'Esse estoque está reservado para uma proposta ativa do Conselho.' : 'Você não tem isso.' };
  if (def.kind === 'accessory') return { ok: false, message: `${def.name} é um acessório permanente e não pode ser vendido.` };
  if (def.gift) return { ok: false, message: `${def.name} é um prêmio único e não pode ser vendido.` };
  if (def.sell <= 0) return { ok: false, message: `${def.name} é um prêmio de conquista: não dá para vender.` };
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

