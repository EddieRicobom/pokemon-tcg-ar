import { ITEM_BY_ID } from './village/catalog';

/**
 * Marmita da Torre: qualquer comida que o jogador já cozinhou vira um efeito de uma corrida. A família vem dos
 * ingredientes (recursivamente, para pratos que levam outro prato) e a força vem da complexidade da receita.
 * Os números e os tetos estão em `docs/PROGRESSAO_TORRE.md`.
 */

export type LunchFamily = 'doce' | 'peixe' | 'fruta' | 'raiz' | 'grao' | 'fresco';

export const LUNCH_FAMILIES: Record<LunchFamily, { label: string; icon: string; summary: string }> = {
  doce: { label: 'Doce', icon: '🍯', summary: 'Recupera vida aos poucos' },
  peixe: { label: 'Peixe', icon: '🐟', summary: 'Mais XP nos orbes' },
  fruta: { label: 'Fruta', icon: '🍓', summary: 'Proteção mais longa depois de um golpe' },
  raiz: { label: 'Raiz', icon: '🥔', summary: 'Mais Defesa e Defesa Especial' },
  grao: { label: 'Grão', icon: '🌽', summary: 'Mais alcance para coletar orbes' },
  fresco: { label: 'Fresco', icon: '🍉', summary: 'Mais velocidade' },
};

/** Ingrediente → família. Todo ingrediente de toda comida do catálogo precisa estar aqui (um teste confere). */
export const LUNCH_INGREDIENT_FAMILY: Readonly<Record<string, LunchFamily>> = {
  mel: 'doce', acucar: 'doce', leite: 'doce', manteiga: 'doce', 'ovo-fresco': 'doce',
  peixe: 'peixe', dourado: 'peixe', alga: 'peixe', caranguejo: 'peixe', lula: 'peixe', 'sal-praia': 'peixe',
  oran: 'fruta', pecha: 'fruta', uva: 'fruta', morango: 'fruta', cheri: 'fruta', chesto: 'fruta', rawst: 'fruta', aspear: 'fruta',
  persim: 'fruta', nanab: 'fruta', razz: 'fruta', sitrus: 'fruta', lum: 'fruta', erva: 'fruta',
  batata: 'raiz', cenoura: 'raiz', abobora: 'raiz', cebola: 'raiz', beterraba: 'raiz', champignon: 'raiz',
  milho: 'grao', trigo: 'grao', farinha: 'grao', arroz: 'grao',
  melancia: 'fresco', tomate: 'fresco', pimentao: 'fresco',
};

export type LunchTier = 1 | 2 | 3;

/** Quanto dura cada nível. O nível 3 vale até o fim da corrida (20 min é o último marco do relógio). */
export const LUNCH_DURATION_MS: Record<LunchTier, number> = { 1: 3 * 60_000, 2: 6 * 60_000, 3: 20 * 60_000 };
/** Pratos de mais de uma família aplicam esta parte de cada efeito. */
export const LUNCH_MIXED_SCALE = 0.6;
/** A cura da marmita nunca passa desta fração do HP máximo por corrida. */
export const LUNCH_HEAL_CAP_FRACTION = 0.3;
/** Defesa do Dojô somada à da marmita e velocidade do Dojô somada à da marmita têm estes tetos. */
export const TRAINING_DEFENSE_CAP = 20;
export const TRAINING_SPEED_CAP = 0.08;

const BY_TIER = {
  regenPerSec: [0.2, 0.3, 0.4],
  xpMultiplier: [0.1, 0.15, 0.2],
  hitInvulnBonus: [0.15, 0.2, 0.25],
  defense: [4, 7, 10],
  pickupBonus: [0.05, 0.08, 0.1],
  speedBonus: [0.02, 0.03, 0.04],
} as const;

export interface LunchEffect {
  foodId: string;
  name: string;
  tier: LunchTier;
  families: readonly LunchFamily[];
  durationMs: number;
  regenPerSec: number;
  /** Aumento do XP dos orbes (0,1 = +10%); vale o maior entre este e o `xpMultiplier` da corrida, nunca o produto. */
  xpBonus: number;
  /** Aumento da janela de proteção depois de levar um golpe (0,2 = +20%). */
  hitInvulnBonus: number;
  defense: number;
  pickupBonus: number;
  speedBonus: number;
}

function expandIngredients(foodId: string, seen = new Set<string>()): string[] {
  const def = ITEM_BY_ID.get(foodId);
  if (!def?.recipe || seen.has(foodId)) return [foodId];
  seen.add(foodId);
  return Object.keys(def.recipe).flatMap((ingredient) => (ITEM_BY_ID.get(ingredient)?.kind === 'food' ? expandIngredients(ingredient, seen) : [ingredient]));
}

/** Famílias de uma comida, em ordem fixa; vazio se a comida não existe ou tem ingrediente fora do mapa. */
export function lunchFamiliesOf(foodId: string): LunchFamily[] {
  const def = ITEM_BY_ID.get(foodId);
  if (def?.kind !== 'food' || !def.recipe) return [];
  const found = new Set<LunchFamily>();
  for (const ingredient of expandIngredients(foodId)) {
    const family = LUNCH_INGREDIENT_FAMILY[ingredient];
    if (family) found.add(family);
  }
  return (Object.keys(LUNCH_FAMILIES) as LunchFamily[]).filter((family) => found.has(family));
}

/** Complexidade: 1 ingrediente = 1; 2 = 2; 3 ou mais, ou uma receita que leva outro prato = 3. */
export function lunchTierOf(foodId: string): LunchTier {
  const recipe = ITEM_BY_ID.get(foodId)?.recipe;
  if (!recipe) return 1;
  const keys = Object.keys(recipe);
  if (keys.some((key) => ITEM_BY_ID.get(key)?.kind === 'food')) return 3;
  return keys.length >= 3 ? 3 : keys.length === 2 ? 2 : 1;
}

export function lunchEffectFor(foodId: string): LunchEffect | null {
  const families = lunchFamiliesOf(foodId);
  const def = ITEM_BY_ID.get(foodId);
  if (!def || families.length === 0) return null;
  const tier = lunchTierOf(foodId);
  const scale = families.length > 1 ? LUNCH_MIXED_SCALE : 1;
  const sum = (key: keyof typeof BY_TIER, own: LunchFamily): number => (families.includes(own) ? Math.round(BY_TIER[key][tier - 1]! * scale * 1000) / 1000 : 0);
  return {
    foodId, name: def.name, tier, families, durationMs: LUNCH_DURATION_MS[tier],
    regenPerSec: sum('regenPerSec', 'doce'),
    xpBonus: sum('xpMultiplier', 'peixe'),
    hitInvulnBonus: sum('hitInvulnBonus', 'fruta'),
    defense: sum('defense', 'raiz'),
    pickupBonus: sum('pickupBonus', 'grao'),
    speedBonus: sum('speedBonus', 'fresco'),
  };
}

/** Uma linha por efeito, para mostrar na cozinha e no resumo da corrida. */
export function describeLunch(effect: LunchEffect): string[] {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const lines: string[] = [];
  if (effect.regenPerSec > 0) lines.push(`+${effect.regenPerSec.toLocaleString('pt-BR')} de vida por segundo (até ${pct(LUNCH_HEAL_CAP_FRACTION)} da vida máxima)`);
  if (effect.xpBonus > 0) lines.push(`+${pct(effect.xpBonus)} de XP dos orbes`);
  if (effect.hitInvulnBonus > 0) lines.push(`+${pct(effect.hitInvulnBonus)} de proteção depois de levar um golpe`);
  if (effect.defense > 0) lines.push(`+${effect.defense.toLocaleString('pt-BR')} de Defesa e Defesa Especial`);
  if (effect.pickupBonus > 0) lines.push(`+${pct(effect.pickupBonus)} de alcance para coletar orbes`);
  if (effect.speedBonus > 0) lines.push(`+${pct(effect.speedBonus)} de velocidade`);
  return lines;
}
