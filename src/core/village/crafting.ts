import { add, availableCount, bagFull, canAfford, count, craft, itemName, pay, RECIPES } from './life';
import type { Interaction, ItemId, VillageState } from './life';
import { itemDef } from './catalog';

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
  if (!recipe) return [];
  return Object.entries(recipe).map(([k, n]) => {
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
  const lines = recipeLines(s, item);
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
  return { ok: true, message: `Você fez ${missing.map((line) => `${line.need - line.have}× ${line.name}`).join(' e ')}. Agora dá para fazer ${itemName(item)}.` };
}
