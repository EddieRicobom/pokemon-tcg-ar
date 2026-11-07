import { add, availableCount, bagFull, canAfford, count, craft, HOUSE_LEVELS, itemName, pay, RECIPES } from './life';
import type { Interaction, ItemId, VillageState } from './life';
import { itemDef } from './catalog';
import { homeLevel } from './home-state';
import { HOME_STAGES } from './town';
import { DOJO_LEVELS, LESSON_IDS, LESSONS, TRAINING_IDS, TRAININGS } from './tower-state';

/**
 * O menu de fabricar da Vila: quanto de cada ingrediente você tem, quantas vezes dá para fazer a receita e, quando falta um
 * material que também se fabrica (a tábua do guarda-roupa, por exemplo), fazer esse material antes. Gasta só o que está
 * livre: o que o Conselho reservou continua reservado, como em `craft`.
 */

export interface RecipeLine {
  item: ItemId;
  name: string;
  need: number;
  have: number;
  ok: boolean;
  /** Falta, mas dá para fabricar o que falta agora mesmo com o que está na mochila. */
  makeable: boolean;
}

const MAX_BAG = 999;

const recipeOf = (item: ItemId): Partial<Record<ItemId, number>> | null => {
  const recipe = RECIPES[item];
  return recipe && itemDef(item)?.kind !== 'food' ? recipe : null;
};

/** Quantas vezes dá para fazer a receita agora, sem passar do limite da mochila. */
export function maxCraftable(s: VillageState, item: ItemId): number {
  const recipe = recipeOf(item);
  if (!recipe) return 0;
  const byIngredients = Math.min(...Object.entries(recipe).map(([k, n]) => Math.floor(availableCount(s, k as ItemId) / Math.max(1, n ?? 1))));
  return Math.max(0, Math.min(byIngredients, MAX_BAG - count(s, item)));
}

/** Um material que falta pode ser fabricado agora? Só um nível abaixo: a tábua sim, a madeira da tábua não. */
function canMake(s: VillageState, item: ItemId, amount: number): boolean {
  const recipe = recipeOf(item);
  if (!recipe || amount <= 0) return false;
  return Object.entries(recipe).every(([k, n]) => availableCount(s, k as ItemId) >= (n ?? 0) * amount);
}

export function recipeLines(s: VillageState, item: ItemId): RecipeLine[] {
  const recipe = recipeOf(item);
  return recipe ? costLines(s, recipe) : [];
}

/** O mesmo que `recipeLines` para qualquer lista de materiais (a receita de um item ou o custo de uma melhoria). */
export function costLines(s: VillageState, cost: Partial<Record<ItemId, number>>): RecipeLine[] {
  return Object.entries(cost).map(([k, n]) => {
    const id = k as ItemId;
    const need = n ?? 0;
    const have = availableCount(s, id);
    return { item: id, name: itemName(id), need, have, ok: have >= need, makeable: have < need && canMake(s, id, need - have) };
  });
}

/** Faz a receita `times` vezes (ou quantas der, se for menos). */
export function craftMany(s: VillageState, item: ItemId, times: number): Interaction {
  const n = Math.min(Math.max(1, Math.floor(times)), maxCraftable(s, item));
  if (n <= 1) return craft(s, item);
  const recipe = recipeOf(item)!;
  for (let i = 0; i < n; i++) pay(s, recipe);
  add(s, item, n);
  return { ok: true, message: `Você fez ${n}× ${itemName(item)}!` };
}

/**
 * Fabrica os materiais que faltam para a receita (só os que se fabricam e dá para fazer agora). Não gasta nada se algum
 * ingrediente que falta não puder ser feito: aí a mensagem diz qual.
 */
export function craftMissing(s: VillageState, item: ItemId): Interaction {
  const recipe = recipeOf(item);
  if (!recipe) return { ok: false, message: 'Isso não dá para fabricar.' };
  return craftMissingFor(s, recipe, `fazer ${itemName(item)}`);
}

/** Fabrica o que falta para um custo qualquer: a receita de um item ou uma melhoria da Vila (`goal` diz para quê). */
export function craftMissingFor(s: VillageState, cost: Partial<Record<ItemId, number>>, goal: string): Interaction {
  const lines = costLines(s, cost);
  const missing = lines.filter((line) => !line.ok);
  if (missing.length === 0) return { ok: false, message: 'Já tem tudo: é só fazer.' };
  const blocked = missing.find((line) => !line.makeable);
  if (blocked) return { ok: false, message: `${blocked.name} não dá para fabricar agora: faltam ${blocked.need - blocked.have}.` };
  // Os materiais que faltam podem disputar o mesmo ingrediente: confere tudo junto antes de gastar.
  const total: Partial<Record<ItemId, number>> = {};
  for (const line of missing) {
    for (const [k, n] of Object.entries(recipeOf(line.item)!)) total[k as ItemId] = (total[k as ItemId] ?? 0) + (n ?? 0) * (line.need - line.have);
  }
  if (!canAfford(s, total)) return { ok: false, message: 'Os materiais que faltam disputam os mesmos ingredientes: não dá para fazer tudo de uma vez.' };
  if (missing.some((line) => bagFull(s, line.item, line.need - line.have))) return { ok: false, message: 'A mochila está cheia.' };
  pay(s, total);
  for (const line of missing) add(s, line.item, line.need - line.have);
  return { ok: true, message: `Você fez ${missing.map((line) => `${line.need - line.have}× ${line.name}`).join(' e ')}. Agora dá para ${goal}.` };
}

// ----------------------------------------------------------------------------- melhorias da Vila

/** Uma melhoria que pede materiais: o próximo nível da sua casa, de uma casa de morador ou do Dojô e suas aulas. */
export interface VillageGoal {
  id: string;
  icon: string;
  title: string;
  /** Onde a melhoria é feita (o menu abre por lá). */
  where: string;
  coins: number;
  lines: RecipeLine[];
  /** Todos os materiais estão na mochila (as moedas são conferidas na hora de pagar). */
  ready: boolean;
  /** Falta algo, mas tudo o que falta dá para fabricar agora. */
  makeable: boolean;
}

function goal(s: VillageState, id: string, icon: string, title: string, where: string, coins: number, cost: Partial<Record<ItemId, number>>): VillageGoal {
  const lines = costLines(s, cost);
  return { id, icon, title, where, coins, lines, ready: lines.every((l) => l.ok), makeable: lines.some((l) => !l.ok) && lines.every((l) => l.ok || l.makeable) };
}

/**
 * As próximas melhorias da Vila que pedem materiais. `homeLots` são os lotes com morador (a casa de cada um); `dojoOpen`
 * diz se o Instrutor já atende (fechado, o Dojô não entra: não dá para comprar nada lá).
 */
export function villageGoals(s: VillageState, opts: { homeLots?: readonly number[]; dojoOpen?: boolean } = {}): VillageGoal[] {
  const out: VillageGoal[] = [];
  const house = HOUSE_LEVELS[s.house + 1];
  if (house) out.push(goal(s, 'casa', '🏠', `Sua casa: ${house.name}`, 'Sua casa', 0, house.cost));
  const lots = [...new Set(opts.homeLots ?? [])];
  if (lots.length > 0) {
    // A casa de morador mais atrasada primeiro: é a reforma mais barata da vez.
    const lot = lots.reduce((a, b) => (homeLevel(s.homes[String(b)] ?? 0) < homeLevel(s.homes[String(a)] ?? 0) ? b : a));
    const stage = HOME_STAGES[homeLevel(s.homes[String(lot)] ?? 0) + 1];
    if (stage) out.push(goal(s, `morador-${lot}`, '🏡', `Casa de morador: ${stage.name}`, 'Casa do morador', 0, stage.cost));
  }
  if (opts.dojoOpen) {
    const dojo = (DOJO_LEVELS as readonly (typeof DOJO_LEVELS)[number][])[s.tower.dojoLevel];
    if (dojo) out.push(goal(s, 'dojo', dojo.icon, `Dojô: ${dojo.name}`, 'Dojô', dojo.coins, dojo.cost));
    for (const id of TRAINING_IDS) {
      const def = TRAININGS[id];
      const level = s.tower.training[id] ?? 0;
      if (level >= def.coins.length || s.tower.dojoLevel < def.minDojo[level]!) continue;
      out.push(goal(s, `treino-${id}`, def.icon, `Treino ${def.name} ${level + 1}`, 'Dojô', def.coins[level]!, { [def.piece]: 1 }));
    }
    for (const id of LESSON_IDS) {
      const def = LESSONS[id];
      if (s.tower.lessons.includes(id) || s.tower.dojoLevel < def.minDojo || (def.requires && !s.tower.lessons.includes(def.requires))) continue;
      out.push(goal(s, `licao-${id}`, def.icon, `Lição: ${def.name}`, 'Dojô', def.coins, { [def.piece]: def.pieces }));
    }
  }
  return out;
}

/** Para cada item, as melhorias que o pedem (a receita do item mostra «para: Dojô…»). */
export function goalsByItem(goals: readonly VillageGoal[]): Map<ItemId, string[]> {
  const out = new Map<ItemId, string[]>();
  for (const g of goals) for (const line of g.lines) if (!line.ok) out.set(line.item, [...(out.get(line.item) ?? []), g.title]);
  return out;
}
