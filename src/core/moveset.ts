/**
 * Golpes escolhidos pelo jogador para cada Pokémon da Arena (até 4, como nos jogos).
 *
 * Só entram golpes que a espécie aprende de verdade (o learnset da PokéAPI, `GET /pokemon/{id}` → `moves`), com tipo,
 * poder, precisão, PP, prioridade e efeitos vindos de `GET /move/{id}` (`meta`, `stat_changes`). Golpe cujo efeito o
 * duelo não simula não pode ser escolhido, e a interface diz por quê. Nada aqui inventa golpe: sem dado, a lista fica vazia.
 */
import { typeEffectiveness } from './battle';
import type { BattleMove } from './battle';
import type { DamageClass, GameMove, PokemonType } from './pokemon-data';
import { isPokemonType, parseGameMove, POKEMON_TYPES, VERSION_GROUP_ORDER } from './pokemon-data';

export const MOVESET_SIZE = 4;

export type LearnMethod = 'level-up' | 'machine' | 'egg' | 'tutor' | 'other';
export const LEARN_METHOD_LABELS_PT: Record<LearnMethod, string> = {
  'level-up': 'Nível', machine: 'MT', egg: 'Ovo', tutor: 'Tutor', other: 'Especial',
};

/** Um golpe que a espécie aprende (sem os números ainda: esses vêm de `/move/{id}`). */
export interface LearnableMove {
  slug: string;
  url: string;
  methods: LearnMethod[];
  /** Nível em que aprende, se aprende por nível. */
  level: number | null;
}

export interface Learnset {
  /** Grupo de versão de onde a lista saiu (o mais novo em que a espécie aprende golpes). */
  versionGroup: string;
  moves: LearnableMove[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function learnMethod(name: unknown): LearnMethod {
  return name === 'level-up' || name === 'machine' || name === 'egg' || name === 'tutor' ? name : 'other';
}

/**
 * Lê o learnset de `GET /pokemon/{id}`: todos os golpes (por nível, MT, ovo ou tutor) do grupo de versão mais novo em
 * que a espécie aprende golpes, como num jogo só. Resposta sem golpes → null.
 */
export function parseLearnset(pokemonJson: unknown): Learnset | null {
  if (!isObject(pokemonJson) || !Array.isArray(pokemonJson.moves)) return null;
  type Detail = { slug: string; url: string; group: string; method: LearnMethod; level: number };
  const details: Detail[] = [];
  for (const entry of pokemonJson.moves) {
    if (!isObject(entry) || !isObject(entry.move) || !Array.isArray(entry.version_group_details)) continue;
    const slug = typeof entry.move.name === 'string' ? entry.move.name : '';
    const url = typeof entry.move.url === 'string' ? entry.move.url : '';
    if (!slug || !url) continue;
    for (const detail of entry.version_group_details) {
      if (!isObject(detail)) continue;
      const group = isObject(detail.version_group) && typeof detail.version_group.name === 'string' ? detail.version_group.name : '';
      if (!VERSION_GROUP_ORDER.includes(group)) continue; // Legends: Arceus e afins usam outro sistema de golpes
      const method = learnMethod(isObject(detail.move_learn_method) ? detail.move_learn_method.name : null);
      const level = typeof detail.level_learned_at === 'number' ? detail.level_learned_at : 0;
      details.push({ slug, url, group, method, level });
    }
  }
  if (details.length === 0) return null;
  const rank = (group: string) => VERSION_GROUP_ORDER.indexOf(group);
  const latest = details.reduce((best, d) => (rank(d.group) > rank(best) ? d.group : best), details[0]!.group);
  const bySlug = new Map<string, LearnableMove>();
  for (const d of details) {
    if (d.group !== latest) continue;
    const move = bySlug.get(d.slug) ?? { slug: d.slug, url: d.url, methods: [], level: null };
    if (!move.methods.includes(d.method)) move.methods.push(d.method);
    if (d.method === 'level-up') move.level = Math.max(move.level ?? 0, d.level);
    bySlug.set(d.slug, move);
  }
  const moves = [...bySlug.values()].sort((a, b) => (a.level ?? 999) - (b.level ?? 999) || a.slug.localeCompare(b.slug));
  return { versionGroup: latest, moves };
}


// ----------------------------------------------------------------------------- efeitos dos golpes

/** Atributos que golpes sobem ou descem em estágios (−6 a +6). */
export type StageStat = 'attack' | 'defense' | 'spAttack' | 'spDefense' | 'speed' | 'accuracy' | 'evasion';
export const STAGE_STATS: readonly StageStat[] = ['attack', 'defense', 'spAttack', 'spDefense', 'speed', 'accuracy', 'evasion'];
export const STAGE_LABELS_PT: Record<StageStat, string> = {
  attack: 'Atq.', defense: 'Def.', spAttack: 'Atq. Esp.', spDefense: 'Def. Esp.', speed: 'Vel.', accuracy: 'Precisão', evasion: 'Evasão',
};
const POKEAPI_STAGE: Record<string, StageStat> = {
  attack: 'attack', defense: 'defense', 'special-attack': 'spAttack', 'special-defense': 'spDefense', speed: 'speed', accuracy: 'accuracy', evasion: 'evasion',
};

/** Condições que o duelo simula (as não voláteis e a confusão). */
export type MoveAilment = 'burn' | 'poison' | 'paralysis' | 'freeze' | 'sleep' | 'confusion';
const AILMENTS: readonly MoveAilment[] = ['burn', 'poison', 'paralysis', 'freeze', 'sleep', 'confusion'];
export const AILMENT_VERB_PT: Record<MoveAilment, string> = {
  burn: 'Queima', poison: 'Envenena', paralysis: 'Paralisa', freeze: 'Congela', sleep: 'Faz dormir', confusion: 'Confunde',
};

export interface StatChange {
  stat: StageStat;
  change: number;
  /** Em quem a mudança cai. */
  target: 'self' | 'foe';
}

/** O que o golpe faz além do dano, como a PokéAPI descreve. Chances em %, 100 = sempre. */
export interface MoveEffect {
  /** −8 a +8: maior age primeiro; Velocidade só desempata dentro da mesma prioridade. */
  priority: number;
  ailment: MoveAilment | null;
  ailmentChance: number;
  /** Faz o alvo hesitar (só se quem usa agir antes dele no turno). */
  flinchChance: number;
  statChanges: StatChange[];
  statChance: number;
  /** % do dano causado: positivo cura quem usa, negativo é recuo. */
  drain: number;
  /** % dos PS máximos que quem usa recupera (golpes de cura). */
  healing: number;
  /** Estágios extras de crítico. */
  critRate: number;
  minHits: number;
  maxHits: number;
}

/** Golpe com tudo o que a PokéAPI informa e o que dele o duelo não simula (para a interface avisar). */
export interface MoveDetail extends GameMove {
  effect: MoveEffect;
  /** Partes do efeito que não são simuladas (o golpe ainda pode ser usado pelo dano). */
  unsupported: string[];
  /** Golpe de status sem nenhum efeito simulado: não pode ser escolhido. */
  noSimulatedEffect: boolean;
}

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const nameOf = (v: unknown): string => (isObject(v) && typeof v.name === 'string' ? v.name : '');

/** Interpreta `GET /move/{id}` com os efeitos (`priority`, `stat_changes`, `meta`). */
export function parseMoveDetail(json: unknown): MoveDetail | null {
  const base = parseGameMove(json);
  if (!base || !isObject(json)) return null;
  const meta = isObject(json.meta) ? json.meta : null;
  const category = meta ? nameOf(meta.category) : '';
  const target = nameOf(json.target);
  const unsupported: string[] = [];
  const effect: MoveEffect = {
    priority: num(json.priority), ailment: null, ailmentChance: 0, flinchChance: 0, statChanges: [], statChance: 0,
    drain: 0, healing: 0, critRate: 0, minHits: 1, maxHits: 1,
  };
  let simulated = false;

  if (meta) {
    const ailment = nameOf(meta.ailment);
    if ((AILMENTS as readonly string[]).includes(ailment)) {
      effect.ailment = ailment as MoveAilment;
      effect.ailmentChance = num(meta.ailment_chance) > 0 ? num(meta.ailment_chance) : 100;
      simulated = true;
    } else if (ailment && ailment !== 'none') {
      unsupported.push(`condição «${ailment}»`);
    }
    effect.flinchChance = num(meta.flinch_chance);
    effect.drain = num(meta.drain);
    effect.critRate = num(meta.crit_rate);
    if (num(meta.healing) > 0 && category === 'heal') {
      effect.healing = num(meta.healing);
      simulated = true;
    }
    const minHits = num(meta.min_hits, 1);
    const maxHits = num(meta.max_hits, minHits);
    if (maxHits > 1) {
      effect.minHits = Math.max(1, minHits);
      effect.maxHits = Math.max(effect.minHits, maxHits);
    }
    if (meta.min_turns !== null && meta.min_turns !== undefined) unsupported.push('efeito por vários turnos');
    if (['ohko', 'whole-field-effect', 'field-effect', 'force-switch', 'unique', 'swagger'].includes(category)) unsupported.push('efeito especial');
  } else if (base.damageClass === 'status') {
    unsupported.push('efeito sem dados');
  }

  const changes = Array.isArray(json.stat_changes) ? json.stat_changes : [];
  const chance = meta ? num(meta.stat_chance) : 0;
  for (const raw of changes) {
    if (!isObject(raw)) continue;
    const stat = POKEAPI_STAGE[nameOf(raw.stat)];
    const change = num(raw.change);
    if (!stat || change === 0) continue;
    let side: 'self' | 'foe' | null = null;
    if (category === 'damage+lower') side = 'foe';
    else if (category === 'damage+raise' || category === 'damage') side = 'self';
    else if (category === 'net-good-stats') side = target === 'user' || change > 0 ? 'self' : 'foe';
    if (!side) {
      unsupported.push('mudança de atributo');
      continue;
    }
    effect.statChanges.push({ stat, change, target: side });
    simulated = true;
  }
  if (effect.statChanges.length > 0) effect.statChance = chance > 0 ? chance : 100;

  const noSimulatedEffect = base.damageClass === 'status' && !simulated;
  return { ...base, effect, unsupported: [...new Set(unsupported)], noSimulatedEffect };
}

/** Golpe escolhido, com os números guardados junto: a batalha funciona mesmo sem rede depois. */
export interface ChosenMove extends MoveEffect {
  slug: string;
  name: string;
  type: PokemonType;
  /** 0 nos golpes de status. */
  power: number;
  /** null = nunca erra (assim vem da PokéAPI). */
  accuracy: number | null;
  pp: number;
  damageClass: DamageClass;
}

/** Por que o golpe não pode ser escolhido (ou null se pode). */
export function unusableReason(move: MoveDetail): string | null {
  if (move.type === null) return 'A PokéAPI não informou o tipo.';
  if (move.damageClass === null) return 'A PokéAPI não informou a categoria.';
  if (move.pp === null || move.pp <= 0) return 'A PokéAPI não informou o PP.';
  if (move.damageClass === 'status') return move.noSimulatedEffect ? 'Efeito não simulado na Arena.' : null;
  if (move.power === null || move.power <= 0) return 'Dano especial (sem poder fixo): não simulado na Arena.';
  return null;
}

export function toChosenMove(slug: string, move: MoveDetail): ChosenMove | null {
  if (unusableReason(move) !== null) return null;
  return {
    slug,
    name: move.name,
    type: move.type!,
    power: move.damageClass === 'status' ? 0 : move.power!,
    accuracy: move.accuracy,
    pp: move.pp!,
    damageClass: move.damageClass!,
    ...move.effect,
    statChanges: move.effect.statChanges.map((c) => ({ ...c })),
  };
}

const signed = (n: number): string => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

/** Frases curtas do efeito, para o editor e o menu de batalha. */
export function effectSummary(move: MoveEffect): string[] {
  const out: string[] = [];
  if (move.priority !== 0) out.push(`Prioridade ${signed(move.priority)}`);
  if (move.maxHits > 1) out.push(move.minHits === move.maxHits ? `${move.maxHits} golpes` : `${move.minHits}–${move.maxHits} golpes`);
  if (move.ailment) out.push(`${AILMENT_VERB_PT[move.ailment]}${move.ailmentChance < 100 ? ` (${move.ailmentChance}%)` : ''}`);
  for (const c of move.statChanges) out.push(`${STAGE_LABELS_PT[c.stat]} ${signed(c.change)} ${c.target === 'self' ? 'em si' : 'no alvo'}${move.statChance < 100 ? ` (${move.statChance}%)` : ''}`);
  if (move.healing > 0) out.push(`Cura ${move.healing}% dos PS`);
  if (move.drain > 0) out.push(`Recupera ${move.drain}% do dano`);
  if (move.drain < 0) out.push(`Recuo de ${Math.abs(move.drain)}% do dano`);
  if (move.flinchChance > 0) out.push(`Faz hesitar (${move.flinchChance}%)`);
  if (move.critRate > 0) out.push('Crítico mais fácil');
  return out;
}

/** Tipos que nenhum golpe de dano do conjunto acerta com super efetivo. */
export function coverageGaps(moves: readonly ChosenMove[]): PokemonType[] {
  const attacking = moves.filter((m) => m.damageClass !== 'status');
  if (attacking.length === 0) return [...POKEMON_TYPES];
  return POKEMON_TYPES.filter((t) => !attacking.some((m) => typeEffectiveness(m.type, [t]) > 1));
}

/**
 * Sugestão de 4 golpes de dano: o maior dano esperado (poder × precisão × golpes, ×1,5 com o tipo do Pokémon, ×1,25 na
 * classe em que ele é mais forte), preferindo tipos diferentes para cobrir mais adversários. É só um ponto de partida.
 */
export function suggestMoveset(options: readonly ChosenMove[], types: readonly PokemonType[], physical: boolean): ChosenMove[] {
  const score = (m: ChosenMove) => m.power * ((m.accuracy ?? 100) / 100) * ((m.minHits + m.maxHits) / 2) * (types.includes(m.type) ? 1.5 : 1)
    * ((m.damageClass === 'physical') === physical ? 1.25 : 1);
  const pool = options.filter((m) => m.damageClass !== 'status');
  const out: ChosenMove[] = [];
  while (out.length < MOVESET_SIZE && pool.length > 0) {
    const value = (m: ChosenMove) => score(m) * (out.some((o) => o.type === m.type) ? 0.55 : 1);
    pool.sort((a, b) => value(b) - value(a) || a.slug.localeCompare(b.slug));
    out.push(pool.shift()!);
  }
  return out;
}

/** O golpe no formato do motor automático (só golpes de dano: o automático não simula golpes de status). */
export function toBattleMove(move: ChosenMove): BattleMove {
  return { name: move.name, type: move.type, power: move.power, accuracy: move.accuracy ?? 100, special: move.damageClass === 'special', source: 'jogo' };
}

const NO_EFFECT: MoveEffect = {
  priority: 0, ailment: null, ailmentChance: 0, flinchChance: 0, statChanges: [], statChance: 0, drain: 0, healing: 0, critRate: 0, minHits: 1, maxHits: 1,
};

/** Coloca ou tira o golpe do conjunto. `full` = tentou pôr um quinto (nada muda). */
export function toggleChosenMove(current: readonly ChosenMove[], move: ChosenMove): { moves: ChosenMove[]; full: boolean } {
  if (current.some((m) => m.slug === move.slug)) return { moves: current.filter((m) => m.slug !== move.slug), full: false };
  if (current.length >= MOVESET_SIZE) return { moves: [...current], full: true };
  return { moves: [...current, move], full: false };
}

/** Sobe ou desce um golpe no conjunto (a ordem é a do menu de batalha). */
export function moveChosenMove(current: readonly ChosenMove[], slug: string, delta: -1 | 1): ChosenMove[] {
  const out = [...current];
  const i = out.findIndex((m) => m.slug === slug);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

/** Tira do conjunto o que a espécie não aprende (por exemplo, se o learnset da PokéAPI mudou). */
export function compatibleMoves(chosen: readonly ChosenMove[], learnset: Learnset): ChosenMove[] {
  const known = new Set(learnset.moves.map((m) => m.slug));
  return chosen.filter((m) => known.has(m.slug));
}

// ----------------------------------------------------------------------------- o caderno salvo

/** Conjunto salvo de um Pokémon (pela identidade da carta ou do Digital Pokémon). */
export interface SavedMoveset {
  /** Espécie para a qual o conjunto foi montado: se não bater, o conjunto não vale. */
  dexId: number;
  moves: ChosenMove[];
}

export type MovesetBook = Record<string, SavedMoveset>;

const MAX_BOOK_ENTRIES = 400;

const intIn = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

function sanitizeEffect(raw: Record<string, unknown>): MoveEffect | null {
  const e = { ...NO_EFFECT, ...raw } as Record<string, unknown>;
  if (!intIn(e.priority, -8, 8) || !intIn(e.ailmentChance, 0, 100) || !intIn(e.flinchChance, 0, 100) || !intIn(e.statChance, 0, 100)) return null;
  if (!intIn(e.drain, -100, 100) || !intIn(e.healing, 0, 100) || !intIn(e.critRate, 0, 6) || !intIn(e.minHits, 1, 10) || !intIn(e.maxHits, 1, 10)) return null;
  if (e.ailment !== null && !(AILMENTS as readonly unknown[]).includes(e.ailment)) return null;
  if (!Array.isArray(e.statChanges) || e.statChanges.length > 4) return null;
  const statChanges: StatChange[] = [];
  for (const c of e.statChanges) {
    if (!isObject(c) || !(STAGE_STATS as readonly unknown[]).includes(c.stat) || !intIn(c.change, -6, 6) || (c.target !== 'self' && c.target !== 'foe')) return null;
    statChanges.push({ stat: c.stat as StageStat, change: c.change, target: c.target });
  }
  return {
    priority: e.priority, ailment: e.ailment as MoveAilment | null, ailmentChance: e.ailmentChance, flinchChance: e.flinchChance, statChanges, statChance: e.statChance,
    drain: e.drain, healing: e.healing, critRate: e.critRate, minHits: e.minHits, maxHits: Math.max(e.minHits, e.maxHits),
  };
}

function sanitizeChosen(raw: unknown): ChosenMove | null {
  if (!isObject(raw)) return null;
  const { slug, name, type, power, accuracy, pp, damageClass } = raw;
  if (typeof slug !== 'string' || !slug || slug.length > 60) return null;
  if (typeof name !== 'string' || !name || name.length > 60) return null;
  if (!isPokemonType(type)) return null;
  if (damageClass !== 'physical' && damageClass !== 'special' && damageClass !== 'status') return null;
  if (typeof power !== 'number' || !Number.isFinite(power) || power < 0 || power > 300 || (damageClass !== 'status' && power === 0)) return null;
  if (accuracy !== null && (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 100)) return null;
  if (!intIn(pp, 1, 64)) return null;
  const effect = sanitizeEffect(raw);
  if (!effect) return null;
  return { slug, name, type, power: damageClass === 'status' ? 0 : power, accuracy, pp, damageClass, ...effect };
}

/** Lê o caderno guardado, descartando o que estiver quebrado (sem repetir golpe, no máximo 4 por Pokémon). */
export function sanitizeMovesetBook(raw: unknown): MovesetBook {
  if (!isObject(raw)) return {};
  const out: MovesetBook = {};
  for (const [id, entry] of Object.entries(raw).slice(0, MAX_BOOK_ENTRIES)) {
    if (!id || id.length > 120 || !isObject(entry) || !Array.isArray(entry.moves)) continue;
    const dexId = entry.dexId;
    if (typeof dexId !== 'number' || !Number.isInteger(dexId) || dexId <= 0) continue;
    const moves: ChosenMove[] = [];
    for (const m of entry.moves) {
      const move = sanitizeChosen(m);
      if (move && !moves.some((x) => x.slug === move.slug) && moves.length < MOVESET_SIZE) moves.push(move);
    }
    if (moves.length > 0) out[id] = { dexId, moves };
  }
  return out;
}

/** Conjunto salvo que vale para este Pokémon (mesma espécie), ou vazio. */
export function movesetFor(book: MovesetBook, id: string, dexId: number | undefined): ChosenMove[] {
  const entry = book[id];
  return entry && dexId !== undefined && entry.dexId === dexId ? entry.moves : [];
}

/** Grava (ou apaga, com lista vazia) o conjunto de um Pokémon. */
export function withMoveset(book: MovesetBook, id: string, dexId: number, moves: readonly ChosenMove[]): MovesetBook {
  const out = { ...book };
  if (moves.length === 0) delete out[id];
  else out[id] = { dexId, moves: moves.slice(0, MOVESET_SIZE) };
  return out;
}
