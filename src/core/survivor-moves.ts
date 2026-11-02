import type { PokemonType } from './pokemon-data';

/**
 * Golpes da Torre de Sobrevivência (pedidos do dono): cada Pokémon ataca com um golpe próprio.
 *
 * - O **1º tipo** dá o **elemento**: nome, cor, ícone e efeito extra (queimar, deixar lento, empurrar, saltar,
 *   atordoar, ir mais longe, roubar vida). Os nomes são descritivos e próprios do app, não traduções dos golpes oficiais.
 * - Os **stats base reais** (PokéAPI, `core/survivor-stats.ts`) dão sozinhos a **forma** do golpe e os números dele.
 *   Cada forma recebe uma pontuação que usa os seis stats normalizados contra as medianas do catálogo. O melhor
 *   perfil é o golpe principal e o segundo é o opcional: não há um grande "resto" de Projétil/Área nem forma fixa por tipo.
 *   Ataque/Ataque Especial = dano, Velocidade = recarga, velocidade do disparo e do passo, HP = vida,
 *   Defesa = raio da aura/explosão e tamanho do disparo.
 *
 * O tipo nunca escolhe a forma: dá o elemento, o efeito e a identidade visual. Isso evita que o primeiro tipo de
 * um Pokémon de dois tipos imponha Cone ou Órbita sobre seus atributos.
 *
 * Sem stats (dado ausente), a forma é projétil e os números são os médios; `estimated` avisa a tela para dizer isso.
 */
export type MoveCategory = 'projetil' | 'aura' | 'area' | 'cone' | 'orbit' | 'foco' | 'rapido' | 'teleporte' | 'trilha';
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
  cone: 'cone',
  orbit: 'órbita',
  foco: 'foco (carga)',
  rapido: 'rajada rápida',
  teleporte: 'teleporte (carga)',
  trilha: 'trilha elemental',
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

/** Medianas e distâncias interquartis das 1.025 espécies, congeladas para uma regra estável quando o catálogo crescer. */
const STAT_CENTER = { hp: 68, attack: 75, defense: 70, spAttack: 65, spDefense: 67, speed: 65 } as const;
const STAT_SPREAD = { hp: 35, attack: 45, defense: 40, spAttack: 43, spDefense: 36, speed: 43 } as const;
const CATEGORY_ORDER: readonly MoveCategory[] = ['projetil', 'area', 'aura', 'orbit', 'cone', 'foco', 'rapido', 'teleporte', 'trilha'];

/** Pequeno viés calibrado no catálogo: Projétil/Área são só um pouco mais frequentes, sem quota em tempo de execução. */
const CATEGORY_CALIBRATION: Record<MoveCategory, number> = {
  projetil: -0.0525, area: -0.0125, aura: -0.0755, orbit: 0.276,
  cone: 0.0995, foco: -0.4915, rapido: -0.1635, teleporte: -0.0495, trilha: 0.3895,
};

const positive = (value: number): number => Math.max(0, value);

interface CombatVector {
  physical: number;
  special: number;
  bulk: number;
  speed: number;
  /** O ataque opcional/menos dominante: híbridos bons são reconhecidos, sem virar dano grátis. */
  secondary: number;
  primary: number;
}

function combatVector(s: BaseStats): CombatVector {
  const physical = (s.attack - STAT_CENTER.attack) / STAT_SPREAD.attack;
  const special = (s.spAttack - STAT_CENTER.spAttack) / STAT_SPREAD.spAttack;
  return {
    physical,
    special,
    bulk: ((s.hp - STAT_CENTER.hp) / STAT_SPREAD.hp + (s.defense - STAT_CENTER.defense) / STAT_SPREAD.defense + (s.spDefense - STAT_CENTER.spDefense) / STAT_SPREAD.spDefense) / 3,
    speed: (s.speed - STAT_CENTER.speed) / STAT_SPREAD.speed,
    secondary: Math.min(physical, special),
    primary: Math.max(physical, special),
  };
}

/**
 * Afinidade de cada forma. Todo coeficiente usa dados estatísticos, inclusive o ataque não dominante.
 * O segundo maior valor é o golpe opcional, portanto ele também é escolhido pelos atributos em vez de uma lista fixa.
 */
export function categoryScoresForStats(s: BaseStats): Record<MoveCategory, number> {
  const { physical, special, bulk, speed, secondary, primary } = combatVector(s);
  return {
    projetil: 1.3 * special + 0.3 * physical + 0.2 * speed - 0.2 * bulk + CATEGORY_CALIBRATION.projetil,
    area: 1.3 * physical + 0.3 * special - 0.1 * speed - 0.2 * bulk + CATEGORY_CALIBRATION.area,
    aura: 0.75 * bulk + 0.45 * secondary - 0.45 * speed + CATEGORY_CALIBRATION.aura,
    orbit: 0.75 * bulk + 0.45 * secondary + 0.55 * speed + CATEGORY_CALIBRATION.orbit,
    cone: 1.05 * physical + 0.4 * special + 0.8 * speed - 0.15 * bulk + CATEGORY_CALIBRATION.cone,
    foco: 1.4 * positive(primary) + 0.3 * secondary - 0.45 * speed + CATEGORY_CALIBRATION.foco,
    rapido: 0.9 * special + 0.45 * physical + 1.2 * positive(speed) - 0.35 * bulk + CATEGORY_CALIBRATION.rapido,
    teleporte: 0.9 * physical + 0.45 * special + 1.2 * positive(speed) - 0.35 * bulk + CATEGORY_CALIBRATION.teleporte,
    trilha: 0.85 * speed + 0.7 * secondary + 0.25 * bulk - 0.2 * Math.abs(physical - special) + CATEGORY_CALIBRATION.trilha,
  };
}

/** Formas, da afinidade mais alta à mais baixa; empates são estáveis na ordem de `CATEGORY_ORDER`. */
export function rankedCategories(_type: PokemonType, stats: BaseStats | null): MoveCategory[] {
  if (!stats) return ['projetil', 'area', 'aura'];
  const scores = categoryScoresForStats(stats);
  return [...CATEGORY_ORDER].sort((left, right) => scores[right] - scores[left]);
}

/** A forma principal é a maior afinidade estatística. */
export function categoryForStats(s: BaseStats): MoveCategory {
  return rankedCategories('normal', s)[0]!;
}

/** O golpe de um Pokémon: elemento pelo 1º tipo (sem tipo, Normal) e forma somente pelos stats. */
export function moveFor(types: readonly PokemonType[], stats: BaseStats | null): SurvivorMove {
  const type = types[0] ?? 'normal';
  const category: MoveCategory = stats ? categoryForStats(stats) : 'projetil';
  return { type, ...ELEMENTS[type], category, ...(stats ? {} : { estimated: true }) };
}

/** O golpe de um tipo com uma forma escolhida (o elemento vem do tipo; a forma, de fora). */
export function moveWith(type: PokemonType, category: MoveCategory, stats: BaseStats | null): SurvivorMove {
  return { type, ...ELEMENTS[type], category, ...(stats ? {} : { estimated: true }) };
}

/**
 * O golpe alternativo: a forma mais próxima depois de tirar a do golpe principal. Quem tem dois tipos troca também
 * para o outro tipo, de modo que os efeitos de tipo (Mistura e Afinidade) passam a vir do golpe antigo.
 */
export function alternativeMoveFor(types: readonly PokemonType[], stats: BaseStats | null): SurvivorMove {
  const mainType = types[0] ?? 'normal';
  const main = moveFor(types, stats);
  const category = rankedCategories(mainType, stats).find((candidate) => candidate !== main.category) ?? 'projetil';
  const type = types.find((candidate) => candidate !== mainType) ?? mainType;
  return moveWith(type, category, stats);
}

/** Efeito elemental usado por um tipo, sem depender dos stats da espécie. */
export function moveEffectForType(type: PokemonType): MoveEffect {
  return ELEMENTS[type].effect;
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
  cone: { damage: 11, cooldownMs: 720, range: 185, radius: 0 },
  orbit: { damage: 7, cooldownMs: 520, range: 0, radius: 82 },
  foco: { damage: 17, cooldownMs: 3900, range: 230, radius: 26 },
  // Três tiros em 0/90/180 ms, depois 600 ms de respiro: ciclo de 780 ms.
  rapido: { damage: 5, cooldownMs: 780, range: 150, radius: 0 },
  teleporte: { damage: 12, cooldownMs: 1500, range: 240, radius: 54 },
  trilha: { damage: 7, cooldownMs: 1000, range: 0, radius: 30 },
};

/**
 * Multiplicadores situacionais: golpes que exigem proximidade recebem mais retorno por exposição.
 * Calibrados com `scripts/survivor-forms.eval.ts` (stats iguais, sobrevivência primeiro); ver `docs/SURVIVOR_BALANCE_PRINCIPLES.md`.
 */
export const CATEGORY_DAMAGE_FACTOR: Record<MoveCategory, number> = {
  projetil: 1,
  aura: 1.6,
  area: 1,
  cone: 1.2,
  orbit: 1.32,
  foco: 1,
  rapido: 1.35,
  teleporte: 1,
  trilha: 1.15,
};

/**
 * Pequenas compensações para tipos que dependem de exposição ou controle para causar dano.
 * Inseto não tem fator: o eco de enxame já soma 20% e, com o fator antigo de 1,14, o tipo liderava cinco das oito formas
 * na matriz tipo × forma (1,35× a 2,4× a mediana dos 18 tipos).
 */
export const TYPE_DAMAGE_FACTOR: Partial<Record<PokemonType, number>> = {
  grass: 1.06,
  fighting: 1.12,
  ice: 1.10,
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
/** Ajuste de ritmo do modo: mantém as proporções dos stats reais sem deixar as ondas iniciais sufocarem os golpes mais fracos. */
export const SURVIVOR_DAMAGE_FACTOR = 1.2;
/** Ataques automáticos normais causam metade do dano base; golpes de carga compensam esse corte ao serem liberados. */
export const BASIC_ATTACK_DAMAGE_FACTOR = 0.5;

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Fator de um stat em volta do médio (75 → 1), limitado para nenhum Pokémon ficar inútil ou imbatível. */
function factor(stat: number, weight: number, lo: number, hi: number): number {
  return clamp(1 + ((stat - AVERAGE_STAT) / AVERAGE_STAT) * weight, lo, hi);
}

/** O ataque que conta para o dano de cada forma. */
function offenseOf(category: MoveCategory, s: BaseStats): number {
  if (category === 'projetil') return s.spAttack;
  if (category === 'area' || category === 'cone') return s.attack;
  if (category === 'foco' || category === 'rapido' || category === 'teleporte') return Math.max(s.attack, s.spAttack);
  return (s.attack + s.spAttack) / 2;
}

export function attackProfile(move: SurvivorMove, stats: BaseStats | null): AttackProfile {
  const s = stats ?? AVERAGE;
  const base = CATEGORY_BASE[move.category];
  const farther = move.effect === 'atravessar' && move.category !== 'projetil' ? 1.15 : 1;
  return {
    damage: round1(base.damage * factor(offenseOf(move.category, s), 0.6, 0.65, 1.7) * SURVIVOR_DAMAGE_FACTOR * BASIC_ATTACK_DAMAGE_FACTOR * CATEGORY_DAMAGE_FACTOR[move.category] * (TYPE_DAMAGE_FACTOR[move.type] ?? 1)),
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
    : move.category === 'cone'
      ? { label: 'Alcance', value: p.range / 220 }
      : move.category === 'foco' || move.category === 'rapido' || move.category === 'teleporte'
        ? { label: 'Alcance', value: p.range / 260 }
      : { label: move.category === 'orbit' ? 'Órbita' : 'Raio', value: p.radius / (base.radius * 1.5 * 1.15) };
  return [
    { label: 'Dano', value: clamp(p.damage / (base.damage * 1.7), 0, 1) },
    { label: 'Rapidez', value: clamp((base.cooldownMs / p.cooldownMs) / 1.35, 0, 1) },
    { label: reach.label, value: clamp(reach.value, 0, 1) },
    { label: 'Vida', value: clamp(p.maxHp / 160, 0, 1) },
  ];
}
