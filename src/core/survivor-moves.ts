import type { PokemonType } from './pokemon-data';

/**
 * Golpes da Torre de Sobrevivência (pedidos do dono): cada Pokémon ataca com um golpe próprio.
 *
 * - O **1º tipo** dá o **elemento**: nome, cor, ícone e efeito extra (queimar, deixar lento, empurrar, saltar,
 *   atordoar, ir mais longe, roubar vida). Os nomes são descritivos e próprios do app, não traduções dos golpes oficiais.
 * - Os **stats base reais** (PokéAPI, `core/survivor-stats.ts`) dão a **forma** do golpe e os números dele:
 *   - Defesas e HP mais altos que o ataque → **aura** (pulsos de dano em volta do Pokémon);
 *   - Ataque Especial maior ou igual ao Ataque → **projétil** (dispara no inimigo mais próximo);
 *   - Ataque maior → **área** (explosão em cima do inimigo mais próximo, que acerta quem está em volta).
 *   Ataque/Ataque Especial = dano, Velocidade = recarga, velocidade do disparo e do passo, HP = vida,
 *   Defesa = raio da aura/explosão e tamanho do disparo.
 *
 * Sem stats (dado ausente), a forma é projétil e os números são os médios; `estimated` avisa a tela para dizer isso.
 */
export type MoveCategory = 'projetil' | 'aura' | 'area';
export type MoveEffect = 'queimar' | 'lentidao' | 'empurrar' | 'saltar' | 'atordoar' | 'atravessar' | 'roubar' | 'nenhum';

export interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}

export interface SurvivorMove {
  type: PokemonType;
  name: string;
  category: MoveCategory;
  effect: MoveEffect;
  /** Cor do golpe no desenho e na interface. */
  color: string;
  icon: string;
  /** Sem stats reais da espécie: forma e números médios (a tela avisa). */
  estimated?: boolean;
}

type Element = Pick<SurvivorMove, 'name' | 'effect' | 'color' | 'icon'>;

const ELEMENTS: Record<PokemonType, Element> = {
  fire: { name: 'Bola de fogo', effect: 'queimar', color: '#ff7a2f', icon: '🔥' },
  water: { name: 'Jato d’água', effect: 'empurrar', color: '#4aa8ff', icon: '💧' },
  electric: { name: 'Faísca', effect: 'saltar', color: '#ffe23d', icon: '⚡' },
  rock: { name: 'Pedrada', effect: 'atordoar', color: '#b89a5e', icon: '🪨' },
  ice: { name: 'Raio de gelo', effect: 'lentidao', color: '#9fe8ff', icon: '❄️' },
  dragon: { name: 'Sopro de dragão', effect: 'atravessar', color: '#8a6cff', icon: '🐉' },
  steel: { name: 'Bala de aço', effect: 'atravessar', color: '#c3ccd6', icon: '⚙️' },
  poison: { name: 'Nuvem tóxica', effect: 'queimar', color: '#b45cdc', icon: '☠️' },
  ghost: { name: 'Névoa sombria', effect: 'lentidao', color: '#6f5aa8', icon: '👻' },
  psychic: { name: 'Onda mental', effect: 'empurrar', color: '#ff6fae', icon: '🔮' },
  fairy: { name: 'Brilho de fada', effect: 'roubar', color: '#ffb3e0', icon: '✨' },
  grass: { name: 'Folhas cortantes', effect: 'nenhum', color: '#5ccf5c', icon: '🍃' },
  dark: { name: 'Golpe sombrio', effect: 'roubar', color: '#5a4a5e', icon: '🌑' },
  flying: { name: 'Rajada de vento', effect: 'empurrar', color: '#cfe6ff', icon: '🌪️' },
  ground: { name: 'Tremor', effect: 'atordoar', color: '#c9924a', icon: '🌋' },
  fighting: { name: 'Soco forte', effect: 'empurrar', color: '#e0574a', icon: '👊' },
  bug: { name: 'Enxame', effect: 'lentidao', color: '#a8c43a', icon: '🐛' },
  normal: { name: 'Estouro', effect: 'nenhum', color: '#f2efe6', icon: '💥' },
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
  atravessar: 'vai mais longe',
  roubar: 'recupera um pouco de vida',
  nenhum: 'sem efeito extra',
};

/** Defesas e HP (a "parede"): média de HP, Defesa e Defesa Especial. */
const bulkOf = (s: BaseStats): number => (s.hp + s.defense + s.spDefense) / 3;

/** A forma do golpe pelos stats (ver o comentário do arquivo). */
export function categoryForStats(s: BaseStats): MoveCategory {
  if (bulkOf(s) > Math.max(s.attack, s.spAttack)) return 'aura';
  return s.spAttack >= s.attack ? 'projetil' : 'area';
}

/** O golpe de um Pokémon: elemento pelo 1º tipo (sem tipo, Normal) e forma pelos stats (sem stats, projétil). */
export function moveFor(types: readonly PokemonType[], stats: BaseStats | null): SurvivorMove {
  const type = types[0] ?? 'normal';
  const category = stats ? categoryForStats(stats) : 'projetil';
  return { type, ...ELEMENTS[type], category, ...(stats ? {} : { estimated: true }) };
}

/** Números base de cada forma (dano, recarga, alcance e raio) para stats médios; os stats multiplicam a partir daqui. */
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

/** Os números do golpe e do corpo de quem joga, já com os stats aplicados. */
export interface AttackProfile {
  damage: number;
  cooldownMs: number;
  range: number;
  radius: number;
  maxHp: number;
  walkSpeed: number;
  projectileSpeed: number;
  /** Raio do disparo no desenho (px do jogo). */
  projectileSize: number;
}

/** Stat médio: um Pokémon com todos os stats neste valor joga com os números base. */
export const AVERAGE_STAT = 75;
const AVERAGE: BaseStats = { hp: AVERAGE_STAT, attack: AVERAGE_STAT, defense: AVERAGE_STAT, spAttack: AVERAGE_STAT, spDefense: AVERAGE_STAT, speed: AVERAGE_STAT };

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Fator de um stat em volta do médio (75 → 1), limitado para nenhum Pokémon ficar inútil ou imbatível. */
function factor(stat: number, weight: number, lo: number, hi: number): number {
  return clamp(1 + ((stat - AVERAGE_STAT) / AVERAGE_STAT) * weight, lo, hi);
}

/** O ataque que conta para o dano de cada forma. */
function offenseOf(category: MoveCategory, s: BaseStats): number {
  if (category === 'projetil') return s.spAttack;
  if (category === 'area') return s.attack;
  return (s.attack + s.spAttack) / 2;
}

export function attackProfile(move: SurvivorMove, stats: BaseStats | null): AttackProfile {
  const s = stats ?? AVERAGE;
  const base = CATEGORY_BASE[move.category];
  const farther = move.effect === 'atravessar' && move.category !== 'projetil' ? 1.15 : 1;
  return {
    damage: round1(base.damage * factor(offenseOf(move.category, s), 0.6, 0.65, 1.7)),
    cooldownMs: Math.round(base.cooldownMs / factor(s.speed, 0.35, 0.75, 1.35)),
    range: round1(base.range * farther),
    radius: round1(base.radius * factor(s.defense, 0.35, 0.8, 1.5) * farther),
    maxHp: Math.round(100 * factor(s.hp, 0.5, 0.8, 1.6)),
    walkSpeed: round1(150 * factor(s.speed, 0.15, 0.9, 1.2)),
    projectileSpeed: round1(360 * factor(s.speed, 0.3, 0.85, 1.3)),
    projectileSize: round1(clamp(3 + s.defense / 50, 3, 7)),
  };
}

/** Barras de 0 a 1 para a tela de escolha (dano, rapidez, alcance/raio, vida), relativas ao melhor caso possível. */
export function profileBars(move: SurvivorMove, p: AttackProfile): { label: string; value: number }[] {
  const base = CATEGORY_BASE[move.category];
  const reach = move.category === 'projetil'
    ? { label: 'Alcance', value: p.projectileSpeed / (360 * 1.3) }
    : { label: 'Raio', value: p.radius / (base.radius * 1.5 * 1.15) };
  return [
    { label: 'Dano', value: clamp(p.damage / (base.damage * 1.7), 0, 1) },
    { label: 'Rapidez', value: clamp((base.cooldownMs / p.cooldownMs) / 1.35, 0, 1) },
    { label: reach.label, value: clamp(reach.value, 0, 1) },
    { label: 'Vida', value: clamp(p.maxHp / 160, 0, 1) },
  ];
}
