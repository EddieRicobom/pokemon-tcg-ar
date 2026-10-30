/**
 * Golpes escolhidos pelo jogador para cada Pokémon da Arena (até 4, como nos jogos).
 *
 * Só entram golpes que a espécie aprende de verdade (o learnset da PokéAPI, `GET /pokemon/{id}` → `moves`), com tipo,
 * poder, precisão e PP vindos de `GET /move/{id}`. Golpes de status ainda não têm efeito no motor de batalha, então não
 * podem ser escolhidos (a interface mostra o motivo). Nada aqui inventa golpe: sem dado, a lista fica vazia.
 */
import type { BattleMove } from './battle';
import type { GameMove, PokemonType } from './pokemon-data';
import { isPokemonType, prettyMoveName, VERSION_GROUP_ORDER } from './pokemon-data';

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

/** Golpe escolhido, com os números guardados junto: a batalha funciona mesmo sem rede depois. */
export interface ChosenMove {
  slug: string;
  name: string;
  type: PokemonType;
  power: number;
  /** null = nunca erra (assim vem da PokéAPI). */
  accuracy: number | null;
  pp: number;
  damageClass: 'physical' | 'special';
}

/** Por que o golpe não pode ser escolhido (ou null se pode). */
export function unusableReason(move: GameMove): string | null {
  if (move.damageClass === 'status') return 'Golpe de status: ainda sem efeito na Arena.';
  if (move.power === null || move.power <= 0) return 'Sem poder fixo: ainda sem efeito na Arena.';
  if (move.type === null) return 'A PokéAPI não informou o tipo.';
  if (move.damageClass === null) return 'A PokéAPI não informou se é físico ou especial.';
  if (move.pp === null || move.pp <= 0) return 'A PokéAPI não informou o PP.';
  return null;
}

export function toChosenMove(slug: string, move: GameMove): ChosenMove | null {
  if (unusableReason(move) !== null) return null;
  return {
    slug,
    name: move.name,
    type: move.type!,
    power: move.power!,
    accuracy: move.accuracy,
    pp: move.pp!,
    damageClass: move.damageClass as 'physical' | 'special',
  };
}

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

/**
 * Sugestão de 4 golpes: o maior dano esperado (poder × precisão, ×1,5 com o tipo do Pokémon, ×1,25 na classe em que ele
 * é mais forte), preferindo tipos diferentes para cobrir mais adversários. É só um ponto de partida para o jogador.
 */
export function suggestMoveset(options: readonly ChosenMove[], types: readonly PokemonType[], physical: boolean): ChosenMove[] {
  const score = (m: ChosenMove) => m.power * ((m.accuracy ?? 100) / 100) * (types.includes(m.type) ? 1.5 : 1)
    * ((m.damageClass === 'physical') === physical ? 1.25 : 1);
  const pool = [...options];
  const out: ChosenMove[] = [];
  while (out.length < MOVESET_SIZE && pool.length > 0) {
    const value = (m: ChosenMove) => score(m) * (out.some((o) => o.type === m.type) ? 0.55 : 1);
    pool.sort((a, b) => value(b) - value(a) || a.slug.localeCompare(b.slug));
    out.push(pool.shift()!);
  }
  return out;
}

/** O golpe no formato do motor de batalha. */
export function toBattleMove(move: ChosenMove): BattleMove {
  return { name: move.name, type: move.type, power: move.power, accuracy: move.accuracy ?? 100, special: move.damageClass === 'special', source: 'jogo' };
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

function sanitizeChosen(raw: unknown): ChosenMove | null {
  if (!isObject(raw)) return null;
  const { slug, name, type, power, accuracy, pp, damageClass } = raw;
  if (typeof slug !== 'string' || !slug || slug.length > 60) return null;
  if (typeof name !== 'string' || !name || name.length > 60) return null;
  if (!isPokemonType(type)) return null;
  if (typeof power !== 'number' || !Number.isFinite(power) || power <= 0 || power > 300) return null;
  if (accuracy !== null && (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 100)) return null;
  if (typeof pp !== 'number' || !Number.isInteger(pp) || pp <= 0 || pp > 64) return null;
  if (damageClass !== 'physical' && damageClass !== 'special') return null;
  return { slug, name, type, power, accuracy, pp, damageClass };
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
