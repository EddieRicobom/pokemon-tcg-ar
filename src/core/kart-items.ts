/**
 * Catálogo e sorteio dos itens do Kart. A regra central é a "corrida de recuperação": quanto pior a posição, maior
 * a chance de itens fortes (concha, raio, cometa) e menor a de itens de líder (turbo, casca). Tudo é puro e testável;
 * a física e os ataques ficam em `kart-race.ts`.
 */

export type KartItemId = 'turbo' | 'banana' | 'shield' | 'oil' | 'shell' | 'bolt' | 'comet';
/** 1 = comum, 2 = raro, 3 = épico. */
export type KartItemTier = 1 | 2 | 3;
export type KartItemUse = 'self' | 'drop' | 'target' | 'ahead';

export interface KartItemDefinition {
  id: KartItemId;
  name: string;
  icon: string;
  tier: KartItemTier;
  use: KartItemUse;
  /** Efeito principal em segundos (impulso, escudo, vida do perigo ou duração do atraso). */
  duration: number;
  description: string;
  color: string;
}

export const KART_ITEM_IDS: readonly KartItemId[] = ['turbo', 'banana', 'shield', 'oil', 'shell', 'bolt', 'comet'];

export const KART_ITEMS: Record<KartItemId, KartItemDefinition> = {
  turbo: {
    id: 'turbo', name: 'Turbo', icon: '🔥', tier: 1, use: 'self', duration: 2.2, color: '#f5a623',
    description: 'Acelera por 2,2 s. Bom para abrir distância ou recuperar reta.',
  },
  banana: {
    id: 'banana', name: 'Casca', icon: '🍌', tier: 1, use: 'drop', duration: 12, color: '#e8d24a',
    description: 'Deixa uma casca atrás. Quem encostar roda e perde velocidade.',
  },
  shield: {
    id: 'shield', name: 'Escudo', icon: '🛡️', tier: 2, use: 'self', duration: 3.4, color: '#62c7f0',
    description: 'Bloqueia cascas, óleo, conchas e raios por 3,4 s.',
  },
  oil: {
    id: 'oil', name: 'Óleo', icon: '🛢️', tier: 2, use: 'drop', duration: 14, color: '#8b6fb0',
    description: 'Deixa uma poça atrás. Quem passar perde aderência e velocidade.',
  },
  shell: {
    id: 'shell', name: 'Concha', icon: '🐚', tier: 2, use: 'target', duration: 6, color: '#e56b57',
    description: 'Persegue o rival imediatamente à frente e o faz rodar.',
  },
  bolt: {
    id: 'bolt', name: 'Raio', icon: '⚡', tier: 3, use: 'ahead', duration: 1.8, color: '#f6e05e',
    description: 'Atinge todos os rivais à frente com um atraso curto. Escudo bloqueia.',
  },
  comet: {
    id: 'comet', name: 'Cometa', icon: '☄️', tier: 3, use: 'self', duration: 3.6, color: '#b48cf2',
    description: 'Impulso forte por 3,6 s e escudo curto. O item de quem está atrás.',
  },
};

export const KART_ITEM_TIER_LABELS: Record<KartItemTier, string> = { 1: 'comum', 2: 'raro', 3: 'épico' };

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));

/**
 * Probabilidade de cada item para uma posição (1 = líder). Perto do líder sobram itens de controle; no fim do grid
 * crescem concha, raio e cometa. `total` menor que 2 vira líder (sem corrida de recuperação).
 */
export function kartItemOdds(position: number, total: number): Record<KartItemId, number> {
  const places = Math.max(1, Math.floor(total) - 1);
  const behind = clamp((Math.max(1, Math.floor(position)) - 1) / places, 0, 1);
  const recovering = behind * behind;
  const weights: Record<KartItemId, number> = {
    turbo: 24 + 10 * behind,
    banana: 22 - 8 * behind,
    shield: 10 + 2 * behind,
    oil: 8 - 3 * behind,
    shell: 6 + 14 * behind,
    bolt: 2 + 14 * recovering,
    comet: 1 + 10 * recovering,
  };
  const sum = KART_ITEM_IDS.reduce((totalWeight, id) => totalWeight + weights[id], 0);
  return Object.fromEntries(KART_ITEM_IDS.map((id) => [id, weights[id] / sum])) as Record<KartItemId, number>;
}

/** Sorteia um item com as probabilidades da posição. `rng` é chamado uma vez, em [0, 1). */
export function rollKartItem(rng: () => number, position: number, total: number): KartItemId {
  const odds = kartItemOdds(position, total);
  let roll = clamp(rng(), 0, 0.999999) * 100;
  for (const id of KART_ITEM_IDS) {
    roll -= odds[id] * 100;
    if (roll < 0) return id;
  }
  return KART_ITEM_IDS[KART_ITEM_IDS.length - 1]!;
}

/** Soma das probabilidades dos itens de cada raridade (para teste e para explicar a corrida de recuperação). */
export function kartItemTierOdds(position: number, total: number): Record<KartItemTier, number> {
  const odds = kartItemOdds(position, total);
  return {
    1: KART_ITEM_IDS.filter((id) => KART_ITEMS[id].tier === 1).reduce((sum, id) => sum + odds[id], 0),
    2: KART_ITEM_IDS.filter((id) => KART_ITEMS[id].tier === 2).reduce((sum, id) => sum + odds[id], 0),
    3: KART_ITEM_IDS.filter((id) => KART_ITEMS[id].tier === 3).reduce((sum, id) => sum + odds[id], 0),
  };
}

/** Itens que atacam alguém (para a ajuda e para a interface). */
export function kartItemAttacks(item: KartItemId): boolean {
  return KART_ITEMS[item].use === 'target' || KART_ITEMS[item].use === 'ahead' || KART_ITEMS[item].use === 'drop';
}
