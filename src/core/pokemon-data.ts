/**
 * Dados de batalha do Pokémon que aparecem no painel de AR, de duas fontes públicas e independentes:
 *  - PokéAPI (jogos oficiais): tipos, atributos-base e golpes.
 *  - TCGdex (a própria carta): PS, tipo, ataques e fraqueza impressos.
 * Aqui ficam só os formatos e a interpretação das respostas (puro, testável). Nada é inventado: o que a
 * fonte não trouxer fica ausente, e a interface diz que não há dado.
 */

export const POKEMON_TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
] as const;
export type PokemonType = (typeof POKEMON_TYPES)[number];

export const TYPE_LABELS_PT: Record<PokemonType, string> = {
  normal: 'Normal', fire: 'Fogo', water: 'Água', electric: 'Elétrico', grass: 'Planta', ice: 'Gelo',
  fighting: 'Lutador', poison: 'Veneno', ground: 'Terra', flying: 'Voador', psychic: 'Psíquico', bug: 'Inseto',
  rock: 'Pedra', ghost: 'Fantasma', dragon: 'Dragão', dark: 'Sombrio', steel: 'Aço', fairy: 'Fada',
};

export const TYPE_COLORS: Record<PokemonType, string> = {
  normal: '#a8a77a', fire: '#ee8130', water: '#6390f0', electric: '#f7d02c', grass: '#7ac74c', ice: '#96d9d6',
  fighting: '#c22e28', poison: '#a33ea1', ground: '#e2bf65', flying: '#a98ff3', psychic: '#f95587', bug: '#a6b91a',
  rock: '#b6a136', ghost: '#735797', dragon: '#6f35fc', dark: '#705746', steel: '#b7b7ce', fairy: '#d685ad',
};

export function isPokemonType(value: unknown): value is PokemonType {
  return typeof value === 'string' && (POKEMON_TYPES as readonly string[]).includes(value);
}

export type StatKey = 'hp' | 'attack' | 'defense' | 'spAttack' | 'spDefense' | 'speed';
export type BaseStats = Record<StatKey, number>;

export const STAT_ORDER: StatKey[] = ['hp', 'attack', 'defense', 'spAttack', 'spDefense', 'speed'];
export const STAT_LABELS_PT: Record<StatKey, string> = {
  hp: 'HP', attack: 'Ataque', defense: 'Defesa', spAttack: 'Atq. Esp.', spDefense: 'Def. Esp.', speed: 'Velocidade',
};
export const STAT_COLORS: Record<StatKey, string> = {
  hp: '#4ade80', attack: '#f97316', defense: '#facc15', spAttack: '#60a5fa', spDefense: '#a78bfa', speed: '#f472b6',
};
/** Valor-base que enche a barra (o máximo real é 255; poucos passam de 200). */
export const STAT_BAR_MAX = 200;

export function statFraction(value: number): number {
  return Math.min(1, Math.max(0, value / STAT_BAR_MAX));
}

const POKEAPI_STAT_NAMES: Record<string, StatKey> = {
  hp: 'hp', attack: 'attack', defense: 'defense', 'special-attack': 'spAttack', 'special-defense': 'spDefense', speed: 'speed',
};

export interface PokemonProfile {
  dexId: number;
  types: PokemonType[];
  stats: BaseStats;
  /** Peso em kg (PokéAPI traz em hectogramas). Ausente em perfis guardados antes de o Pin Mode existir. */
  weightKg?: number;
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null;
const asNumber = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Interpreta `GET /pokemon/{id}` da PokéAPI. Devolve null se faltar qualquer atributo (nunca completa com zero). */
export function parsePokeApiProfile(json: unknown, dexId: number): PokemonProfile | null {
  if (!isObject(json) || !Array.isArray(json.stats)) return null;
  const stats: Partial<BaseStats> = {};
  for (const entry of json.stats) {
    if (!isObject(entry) || !isObject(entry.stat)) continue;
    const key = POKEAPI_STAT_NAMES[String(entry.stat.name)];
    const value = asNumber(entry.base_stat);
    if (key && value !== null) stats[key] = value;
  }
  if (!STAT_ORDER.every((key) => stats[key] !== undefined)) return null;
  const types: PokemonType[] = [];
  if (Array.isArray(json.types)) {
    const sorted = [...json.types].filter(isObject).sort((a, b) => (asNumber(a.slot) ?? 0) - (asNumber(b.slot) ?? 0));
    for (const entry of sorted) {
      const name = isObject(entry.type) ? entry.type.name : undefined;
      if (isPokemonType(name)) types.push(name);
    }
  }
  const weight = asNumber(json.weight);
  return { dexId, types, stats: stats as BaseStats, ...(weight !== null && weight > 0 ? { weightKg: weight / 10 } : {}) };
}

// ----------------------------------------------------------------------------- golpes do jogo

export type DamageClass = 'physical' | 'special' | 'status';
export const DAMAGE_CLASS_LABELS_PT: Record<DamageClass, string> = { physical: 'Físico', special: 'Especial', status: 'Status' };

export interface GameMove {
  name: string;
  type: PokemonType | null;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  damageClass: DamageClass | null;
}

export interface MoveRef {
  name: string;
  url: string;
  level: number;
}

/** Nível máximo considerado ao escolher os golpes "típicos" (o conjunto que o Pokémon costuma ter em batalha). */
export const MOVE_LEVEL_CAP = 50;
export const MOVES_SHOWN = 4;

/** Grupos de versão do mais antigo ao mais novo (a resposta da PokéAPI não traz essa ordem). Legends: Arceus fica de fora (níveis de "maestria"). */
export const VERSION_GROUP_ORDER: readonly string[] = [
  'red-blue', 'yellow', 'gold-silver', 'crystal', 'ruby-sapphire', 'emerald', 'firered-leafgreen', 'diamond-pearl', 'platinum',
  'heartgold-soulsilver', 'black-white', 'black-2-white-2', 'x-y', 'omega-ruby-alpha-sapphire', 'sun-moon',
  'ultra-sun-ultra-moon', 'sword-shield', 'brilliant-diamond-and-shining-pearl', 'scarlet-violet',
];

/**
 * Escolhe os golpes de nível mais recentes (até o nível 50) na geração mais nova em que o Pokémon aprende golpes
 * por nível. É uma heurística: a PokéAPI não tem "conjunto padrão"; por isso a interface chama de "golpes do jogo".
 */
export function pickLevelUpMoves(pokemonJson: unknown, count = MOVES_SHOWN): MoveRef[] {
  if (!isObject(pokemonJson) || !Array.isArray(pokemonJson.moves)) return [];
  type Candidate = { name: string; url: string; level: number; group: string };
  const candidates: Candidate[] = [];
  for (const entry of pokemonJson.moves) {
    if (!isObject(entry) || !isObject(entry.move) || !Array.isArray(entry.version_group_details)) continue;
    const name = typeof entry.move.name === 'string' ? entry.move.name : null;
    const url = typeof entry.move.url === 'string' ? entry.move.url : null;
    if (!name || !url) continue;
    for (const detail of entry.version_group_details) {
      if (!isObject(detail) || !isObject(detail.move_learn_method) || detail.move_learn_method.name !== 'level-up') continue;
      const level = asNumber(detail.level_learned_at);
      const group = isObject(detail.version_group) && typeof detail.version_group.name === 'string' ? detail.version_group.name : '';
      if (level !== null && level > 0) candidates.push({ name, url, level, group });
    }
  }
  if (candidates.length === 0) return [];
  const rank = (group: string) => VERSION_GROUP_ORDER.indexOf(group);
  const groups = [...new Set(candidates.map((c) => c.group))];
  const latest = groups.reduce((best, group) => (rank(group) > rank(best) ? group : best), groups[0]!);
  const inLatest = candidates.filter((c) => c.group === latest);
  const best = new Map<string, MoveRef>();
  for (const c of inLatest) {
    if (c.level > MOVE_LEVEL_CAP) continue;
    const current = best.get(c.name);
    if (!current || c.level > current.level) best.set(c.name, { name: c.name, url: c.url, level: c.level });
  }
  return [...best.values()].sort((a, b) => b.level - a.level).slice(0, count);
}

/** "thunder-shock" → "Thunder Shock" (nome em inglês quando a API não tem o do idioma). */
export function prettyMoveName(slug: string): string {
  return slug.split('-').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

/** Interpreta `GET /move/{id}`. Usa o nome em português do Brasil se existir; senão o nome em inglês. */
export function parseGameMove(json: unknown): GameMove | null {
  if (!isObject(json) || typeof json.name !== 'string') return null;
  let name = prettyMoveName(json.name);
  if (Array.isArray(json.names)) {
    const pt = json.names.find((n) => isObject(n) && isObject(n.language) && n.language.name === 'pt-BR');
    const en = json.names.find((n) => isObject(n) && isObject(n.language) && n.language.name === 'en');
    const chosen = isObject(pt) ? pt : isObject(en) ? en : null;
    if (chosen && typeof chosen.name === 'string' && chosen.name) name = chosen.name;
  }
  const type = isObject(json.type) && isPokemonType(json.type.name) ? json.type.name : null;
  const classRaw = isObject(json.damage_class) ? json.damage_class.name : null;
  const damageClass = classRaw === 'physical' || classRaw === 'special' || classRaw === 'status' ? classRaw : null;
  return { name, type, power: asNumber(json.power), accuracy: asNumber(json.accuracy), pp: asNumber(json.pp), damageClass };
}

// ----------------------------------------------------------------------------- a carta (TCGdex)

export interface CardAttack {
  name: string;
  /** Energias exigidas, como o TCGdex escreve (Grass, Fire, Water, Lightning, Psychic, Fighting, Darkness, Metal, Fairy, Dragon, Colorless). */
  cost: string[];
  damage?: string;
  effect?: string;
}

export interface CardBattleInfo {
  hp?: number;
  types: string[];
  attacks: CardAttack[];
  weaknesses: { type: string; value?: string }[];
  retreat?: number;
}

const asText = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined);

/** Interpreta os campos de batalha da carta completa do TCGdex. Carta sem ataques (Treinador/Energia) → lista vazia. */
export function parseCardBattleInfo(json: unknown): CardBattleInfo | null {
  if (!isObject(json)) return null;
  const attacks: CardAttack[] = [];
  if (Array.isArray(json.attacks)) {
    for (const a of json.attacks) {
      if (!isObject(a) || typeof a.name !== 'string' || !a.name) continue;
      attacks.push({
        name: a.name,
        cost: Array.isArray(a.cost) ? a.cost.filter((c): c is string => typeof c === 'string') : [],
        damage: asText(a.damage),
        effect: asText(a.effect),
      });
    }
  }
  const weaknesses: { type: string; value?: string }[] = [];
  if (Array.isArray(json.weaknesses)) {
    for (const w of json.weaknesses) {
      if (isObject(w) && typeof w.type === 'string') weaknesses.push({ type: w.type, value: asText(w.value) });
    }
  }
  return {
    hp: asNumber(json.hp) ?? undefined,
    types: Array.isArray(json.types) ? json.types.filter((t): t is string => typeof t === 'string') : [],
    attacks,
    weaknesses,
    retreat: asNumber(json.retreat) ?? undefined,
  };
}

/** Energia do TCG → tipo do jogo (para colorir). Incolor não tem tipo equivalente. */
const ENERGY_TO_TYPE: Record<string, PokemonType | undefined> = {
  grass: 'grass', fire: 'fire', water: 'water', lightning: 'electric', psychic: 'psychic', fighting: 'fighting',
  darkness: 'dark', dark: 'dark', metal: 'steel', fairy: 'fairy', dragon: 'dragon', colorless: 'normal',
};
const ENERGY_LABELS_PT: Record<string, string> = {
  grass: 'Planta', fire: 'Fogo', water: 'Água', lightning: 'Elétrico', psychic: 'Psíquico', fighting: 'Lutador',
  darkness: 'Sombrio', dark: 'Sombrio', metal: 'Metal', fairy: 'Fada', dragon: 'Dragão', colorless: 'Incolor',
};

export function energyType(energy: string): PokemonType | null {
  return ENERGY_TO_TYPE[energy.toLowerCase()] ?? null;
}
export function energyLabelPt(energy: string): string {
  return ENERGY_LABELS_PT[energy.toLowerCase()] ?? energy;
}

// ----------------------------------------------------------------------------- animação

export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

/** Progresso (0–1) da linha `index` t ms depois de a página aparecer: cada linha começa um pouco depois da anterior. */
export function rowProgress(elapsedMs: number, index: number, staggerMs = 90, durationMs = 650): number {
  return easeOutCubic((elapsedMs - index * staggerMs) / durationMs);
}
