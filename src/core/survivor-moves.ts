import type { PokemonType } from './pokemon-data';

/**
 * Golpes da Torre de Sobrevivência (pedido do dono): cada Pokémon ataca com um golpe próprio, decidido pelo seu 1º
 * tipo. Os 18 tipos caem em 3 categorias padronizadas, para o jogo ter poucas regras e a interface poder mostrar o
 * golpe com nome, cor e ícone:
 *
 * - **projétil**: dispara no inimigo mais próximo dentro do alcance (pode ganhar mais projéteis e atravessar);
 * - **aura**: pulsos de dano em todos os inimigos num raio em volta do Pokémon;
 * - **área**: explosão em cima do inimigo mais próximo, que acerta quem estiver em volta dele.
 *
 * Cada tipo tem um efeito extra (queimar, deixar lento, empurrar, saltar, atordoar, atravessar, roubar vida). Os nomes
 * são descritivos e próprios do app, não traduções dos golpes oficiais.
 */
export type MoveCategory = 'projetil' | 'aura' | 'area';
export type MoveEffect = 'queimar' | 'lentidao' | 'empurrar' | 'saltar' | 'atordoar' | 'atravessar' | 'roubar' | 'nenhum';

export interface SurvivorMove {
  type: PokemonType;
  name: string;
  category: MoveCategory;
  effect: MoveEffect;
  /** Cor do golpe no desenho e na interface. */
  color: string;
  icon: string;
}

type MoveSpec = Omit<SurvivorMove, 'type'>;

const MOVES: Record<PokemonType, MoveSpec> = {
  fire: { name: 'Bola de fogo', category: 'projetil', effect: 'queimar', color: '#ff7a2f', icon: '🔥' },
  water: { name: 'Jato d’água', category: 'projetil', effect: 'empurrar', color: '#4aa8ff', icon: '💧' },
  electric: { name: 'Faísca', category: 'projetil', effect: 'saltar', color: '#ffe23d', icon: '⚡' },
  rock: { name: 'Pedrada', category: 'projetil', effect: 'atordoar', color: '#b89a5e', icon: '🪨' },
  ice: { name: 'Raio de gelo', category: 'projetil', effect: 'lentidao', color: '#9fe8ff', icon: '❄️' },
  dragon: { name: 'Sopro de dragão', category: 'projetil', effect: 'atravessar', color: '#8a6cff', icon: '🐉' },
  steel: { name: 'Bala de aço', category: 'projetil', effect: 'atravessar', color: '#c3ccd6', icon: '⚙️' },
  poison: { name: 'Nuvem tóxica', category: 'aura', effect: 'queimar', color: '#b45cdc', icon: '☠️' },
  ghost: { name: 'Névoa sombria', category: 'aura', effect: 'lentidao', color: '#6f5aa8', icon: '👻' },
  psychic: { name: 'Onda mental', category: 'aura', effect: 'empurrar', color: '#ff6fae', icon: '🔮' },
  fairy: { name: 'Brilho de fada', category: 'aura', effect: 'roubar', color: '#ffb3e0', icon: '✨' },
  grass: { name: 'Folhas em círculo', category: 'aura', effect: 'nenhum', color: '#5ccf5c', icon: '🍃' },
  dark: { name: 'Aura sombria', category: 'aura', effect: 'roubar', color: '#5a4a5e', icon: '🌑' },
  flying: { name: 'Rajada de vento', category: 'aura', effect: 'empurrar', color: '#cfe6ff', icon: '🌪️' },
  ground: { name: 'Tremor', category: 'area', effect: 'atordoar', color: '#c9924a', icon: '🌋' },
  fighting: { name: 'Soco no chão', category: 'area', effect: 'empurrar', color: '#e0574a', icon: '👊' },
  bug: { name: 'Enxame', category: 'area', effect: 'lentidao', color: '#a8c43a', icon: '🐛' },
  normal: { name: 'Estouro', category: 'area', effect: 'nenhum', color: '#f2efe6', icon: '💥' },
};

export const MOVE_CATEGORY_LABELS_PT: Record<MoveCategory, string> = {
  projetil: 'projétil',
  aura: 'aura',
  area: 'área',
};

export const MOVE_EFFECT_LABELS_PT: Record<MoveEffect, string> = {
  queimar: 'causa dano por alguns segundos',
  lentidao: 'deixa lento',
  empurrar: 'empurra para longe',
  saltar: 'salta para mais um inimigo',
  atordoar: 'atordoa por um instante',
  atravessar: 'atravessa um inimigo',
  roubar: 'recupera um pouco de vida',
  nenhum: 'sem efeito extra',
};

/**
 * O golpe de um Pokémon pelos seus tipos (só o 1º conta). Sem dado de tipo, o golpe é o do tipo Normal — quem chama
 * mostra isso na tela (ver `moveForTypes(...).type`).
 */
export function moveForTypes(types: readonly PokemonType[]): SurvivorMove {
  const type = types[0] ?? 'normal';
  return { type, ...MOVES[type] };
}

/** Números base de cada categoria (dano, recarga, alcance e raio); os upgrades e a evolução multiplicam a partir daqui. */
export interface CategoryBase {
  damage: number;
  cooldownMs: number;
  /** Projétil e área: distância máxima até o alvo. Aura: não usa. */
  range: number;
  /** Aura: raio em volta do Pokémon. Área: raio da explosão. Projétil: não usa. */
  radius: number;
}

export const CATEGORY_BASE: Record<MoveCategory, CategoryBase> = {
  projetil: { damage: 10, cooldownMs: 600, range: 170, radius: 0 },
  aura: { damage: 5, cooldownMs: 420, range: 0, radius: 62 },
  area: { damage: 15, cooldownMs: 1100, range: 190, radius: 48 },
};
