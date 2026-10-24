/**
 * O que a vida social da Vila guarda no arquivo de progresso: a relação entre cada par de Pokémon, o Diário de momentos,
 * quais momentos você já viu (o Álbum) e quando você saiu da Vila (para o que aconteceu enquanto estava fora).
 * Tipos, limpeza do save e escrita limitada nos registros sociais existentes; regras de comportamento ficam em `social.ts`.
 */

import type { VillageState } from './life';

export type MomentKind = 'amizade' | 'drama' | 'comedia' | 'romance' | 'festa' | 'rivalidade' | 'solo';
export const MOMENT_KINDS: readonly MomentKind[] = ['amizade', 'drama', 'comedia', 'romance', 'festa', 'rivalidade', 'solo'];
export const MOMENT_LABELS: Record<MomentKind, string> = { amizade: 'Amizade', drama: 'Drama', comedia: 'Comédia', romance: 'Romance', festa: 'Festa', rivalidade: 'Rivalidade', solo: 'Sozinho' };
export const MOMENT_EMOJI: Record<MomentKind, string> = { amizade: '🤝', drama: '🎭', comedia: '🤣', romance: '💕', festa: '🎉', rivalidade: '⚔️', solo: '💭' };

/** Efeito visual que acompanha uma fala (vira emoji flutuando sobre quem falou). */
export type Fx = 'heart' | 'anger' | 'sweat' | 'star' | 'note' | 'zzz' | 'laugh' | 'shock' | 'sparkle' | 'question' | 'sad' | 'idea' | 'fire';
export const FX_EMOJI: Record<Fx, string> = {
  heart: '❤️', anger: '💢', sweat: '💦', star: '⭐', note: '🎵', zzz: '💤', laugh: '😂', shock: '❗', sparkle: '✨', question: '❓', sad: '😢', idea: '💡', fire: '🔥',
};
const FX_LIST = Object.keys(FX_EMOJI) as Fx[];

export type RelFlag = 'casal' | 'brigados' | null;

export interface Relation {
  /** −100 (inimigos) a 100 (inseparáveis). */
  bond: number;
  /** 0 a 100: o quanto há de clima entre os dois. */
  spark: number;
  flag: RelFlag;
  /** Dia em que a situação atual começou. */
  since: string;
  /** Quantas vezes os dois já tiveram um momento juntos. */
  met: number;
}

export interface MomentLine {
  /** Posição no elenco do momento (0 = primeiro). */
  who: number;
  text: string;
  fx?: Fx;
}

export interface Moment {
  id: string;
  /** Instante (ms) em que aconteceu. */
  t: number;
  day: string;
  hour: number;
  /** Id do modelo do momento (para o Álbum). */
  tpl: string;
  kind: MomentKind;
  title: string;
  emoji: string;
  cast: { id: string; name: string }[];
  lines: MomentLine[];
  /** Resultados curtos, como "+8 amizade" ou "agora são rivais". */
  result: string[];
  /** O que você decidiu, se o momento pediu. */
  choice?: string;
  fav?: boolean;
  /** Aconteceu enquanto você estava fora da Vila. */
  away?: boolean;
}

/** O que você respondeu a uma pergunta de um Pokémon (digitado por você ou escolhido nas sugestões). */
export interface Answer {
  /** Id da pergunta (`quiz.ts`). */
  q: string;
  a: string;
  /** Quem perguntou. */
  mon: string;
  t: number;
  day: string;
}

/** Uma palavra que "pegou" na Vila: vem de uma resposta sua e os Pokémon repetem por aí ("Hmmm, que fome de…"). */
export interface Lingo {
  text: string;
  /** Tipo da pergunta de onde veio (comida, lugar, palavra…): decide como os Pokémon falam dela. */
  kind: string;
  from: string;
  t: number;
}

/** Memória curta de um acontecimento importante para um Pokémon específico. */
export type MemoryKind = 'amizade' | 'rivalidade' | 'romance' | 'descoberta';
export interface SocialMemory {
  id: string;
  mon: string;
  with: string[];
  kind: MemoryKind;
  text: string;
  day: string;
  t: number;
  momentId: string;
}

/** Um compromisso social que muda o próximo comportamento de um morador. */
export type SocialPlanKind = 'visitar' | 'ajudar' | 'convidar';
export interface SocialPlan {
  id: string;
  from: string;
  to: string;
  kind: SocialPlanKind;
  createdDay: string;
  expiresDay: string;
  sourceMomentId: string;
}

export interface SocialState {
  rel: Record<string, Relation>;
  diary: Moment[];
  seen: string[];
  lastSeen: number;
  diaryRead: number;
  /** Perguntas que os Pokémon fizeram a você e as suas respostas (as mais novas). */
  answers: Answer[];
  /** O bordão de cada Pokémon (o que ele repete no fim das falas). */
  words: Record<string, string>;
  lingo: Lingo[];
  memories: SocialMemory[];
  /** Compromissos criados por momentos importantes (visitas, ajuda e convites). */
  plans: SocialPlan[];
  /** Quantas perguntas cada Pokémon já fez hoje. */
  asked: Record<string, { day: string; n: number }>;
  /** Apelidos que você deu (só quem chegou a «Grande amigo» pode ganhar um; ver `nickname.ts`). */
  nicks: Record<string, string>;
}

/** Mais que o número de perguntas (`QUESTIONS`), para nenhuma voltar antes de todas terem sido respondidas. */
export const MAX_ANSWERS = 200;
export const MAX_LINGO = 16;
export const MAX_WORDS = 80;
export const MAX_ANSWER_LEN = 28;
export const MAX_NICKS = 200;
export const MAX_NICK_LEN = 14;
export const MAX_MEMORIES = 80;
export const MAX_SOCIAL_PLANS = 24;

/** Limpa o que foi digitado: sem caracteres de controle, espaços repetidos nem sobras, com tamanho limitado. */
export function cleanAnswer(raw: unknown, max = MAX_ANSWER_LEN): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return raw.normalize('NFC').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

/** O Diário guarda só os últimos momentos; o que você guarda no Álbum fica para sempre (até este limite, por causa do espaço no aparelho). */
export const MAX_DIARY = 60;
export const MAX_SAVED = 500;
const MAX_SEEN = 600;

export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function emptySocial(): SocialState {
  return { rel: {}, diary: [], seen: [], lastSeen: 0, diaryRead: 0, answers: [], words: {}, lingo: [], memories: [], plans: [], asked: {}, nicks: {} };
}

const num = (v: unknown, lo: number, hi: number, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : fallback);
const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.slice(0, max) : '');

function normalizeMoment(raw: unknown): Moment | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Moment>;
  if (typeof r.id !== 'string' || typeof r.tpl !== 'string' || !MOMENT_KINDS.includes(r.kind as MomentKind)) return null;
  const cast = Array.isArray(r.cast) ? r.cast.filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string').map((c) => ({ id: c.id.slice(0, 80), name: c.name.slice(0, 40) })).slice(0, 3) : [];
  if (cast.length === 0) return null;
  const lines = Array.isArray(r.lines)
    ? r.lines
        .filter((l) => l && typeof l.text === 'string' && Number.isInteger(l.who) && l.who >= 0 && l.who < cast.length)
        .map((l) => ({ who: l.who, text: l.text.slice(0, 220), ...(FX_LIST.includes(l.fx as Fx) ? { fx: l.fx as Fx } : {}) }))
        .slice(0, 12)
    : [];
  if (lines.length === 0) return null;
  return {
    id: r.id.slice(0, 60),
    t: num(r.t, 0, 9e15, 0),
    day: str(r.day, 12),
    hour: num(r.hour, 0, 23, 12),
    tpl: r.tpl.slice(0, 60),
    kind: r.kind as MomentKind,
    title: str(r.title, 80),
    emoji: str(r.emoji, 8),
    cast,
    lines,
    result: Array.isArray(r.result) ? r.result.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 80)).slice(0, 8) : [],
    ...(typeof r.choice === 'string' ? { choice: r.choice.slice(0, 120) } : {}),
    ...(r.fav === true ? { fav: true } : {}),
    ...(r.away === true ? { away: true } : {}),
  };
}

/** Os guardados no Álbum ficam (os mais novos, até o limite); dos demais, só os últimos `MAX_DIARY`. A ordem se mantém. */
export function trimMoments(all: readonly Moment[]): Moment[] {
  const keepSaved = new Set(all.filter((m) => m.fav).slice(-MAX_SAVED));
  const recent = new Set(all.filter((m) => !m.fav).slice(-MAX_DIARY));
  return all.filter((m) => keepSaved.has(m) || recent.has(m));
}

/** Writes a real moment to the existing diary and derives bounded pair memories when applicable. */
export function recordMomentAndMemory(
  state: Pick<VillageState, 'diary' | 'memories'>,
  moment: Moment,
  memoryKind: MemoryKind | null = null,
): boolean {
  const isNewMoment = !state.diary.some((entry) => entry.id === moment.id);
  if (isNewMoment) state.diary = trimMoments([...state.diary, moment]);
  if (memoryKind && moment.cast.length > 1) {
    const memories: SocialMemory[] = moment.cast.map((mon) => ({
      id: `${moment.id}:${mon.id}`,
      mon: mon.id,
      with: moment.cast.filter((other) => other.id !== mon.id).map((other) => other.id).slice(0, 2),
      kind: memoryKind,
      text: moment.result[0] ? `${moment.title}: ${moment.result[0]}` : `${moment.title} aconteceu na Vila.`,
      day: moment.day,
      t: moment.t,
      momentId: moment.id,
    }));
    state.memories = [...state.memories.filter((old) => !memories.some((next) => next.id === old.id)), ...memories].slice(-MAX_MEMORIES);
  }
  return isNewMoment;
}

export function normalizeSocial(raw: { rel?: unknown; diary?: unknown; seen?: unknown; lastSeen?: unknown; diaryRead?: unknown; answers?: unknown; words?: unknown; lingo?: unknown; memories?: unknown; plans?: unknown; asked?: unknown; nicks?: unknown }): SocialState {
  const rel: Record<string, Relation> = {};
  if (raw.rel && typeof raw.rel === 'object') {
    for (const [k, v] of Object.entries(raw.rel as Record<string, Partial<Relation>>)) {
      if (!k.includes('|') || !v || typeof v !== 'object') continue;
      rel[k] = { bond: num(v.bond, -100, 100, 0), spark: num(v.spark, 0, 100, 0), flag: v.flag === 'casal' || v.flag === 'brigados' ? v.flag : null, since: str(v.since, 12), met: num(v.met, 0, 9999, 0) };
    }
  }
  const all = Array.isArray(raw.diary) ? raw.diary.map(normalizeMoment).filter((m): m is Moment => m !== null) : [];
  const memories: SocialMemory[] = [];
  if (Array.isArray(raw.memories)) {
    for (const x of raw.memories) {
      if (!x || typeof x !== 'object') continue;
      const m = x as Partial<SocialMemory>;
      if (typeof m.id !== 'string' || typeof m.mon !== 'string' || typeof m.text !== 'string' || typeof m.momentId !== 'string') continue;
      if (!['amizade', 'rivalidade', 'romance', 'descoberta'].includes(m.kind as string)) continue;
      const withIds = Array.isArray(m.with) ? m.with.filter((id): id is string => typeof id === 'string').map((id) => id.slice(0, 80)).slice(0, 2) : [];
      memories.push({ id: m.id.slice(0, 100), mon: m.mon.slice(0, 80), with: withIds, kind: m.kind as MemoryKind, text: m.text.slice(0, 180), day: str(m.day, 12), t: num(m.t, 0, 9e15, 0), momentId: m.momentId.slice(0, 100) });
    }
  }
  const plans: SocialPlan[] = [];
  if (Array.isArray(raw.plans)) {
    for (const x of raw.plans) {
      if (!x || typeof x !== 'object') continue;
      const p = x as Partial<SocialPlan>;
      if (typeof p.id !== 'string' || typeof p.from !== 'string' || typeof p.to !== 'string' || typeof p.createdDay !== 'string' || typeof p.expiresDay !== 'string' || typeof p.sourceMomentId !== 'string') continue;
      if (!['visitar', 'ajudar', 'convidar'].includes(p.kind as string) || p.from === p.to) continue;
      plans.push({ id: p.id.slice(0, 100), from: p.from.slice(0, 80), to: p.to.slice(0, 80), kind: p.kind as SocialPlanKind, createdDay: p.createdDay.slice(0, 12), expiresDay: p.expiresDay.slice(0, 12), sourceMomentId: p.sourceMomentId.slice(0, 100) });
    }
  }
  return {
    rel,
    diary: trimMoments(all),
    seen: Array.isArray(raw.seen) ? [...new Set(raw.seen.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 60)))].slice(0, MAX_SEEN) : [],
    lastSeen: num(raw.lastSeen, 0, 9e15, 0),
    diaryRead: num(raw.diaryRead, 0, 9e15, 0),
    answers: Array.isArray(raw.answers)
      ? raw.answers
          .filter((x): x is Answer => !!x && typeof x === 'object' && typeof (x as Answer).q === 'string' && cleanAnswer((x as Answer).a) !== '' && typeof (x as Answer).mon === 'string')
          .map((x) => ({ q: x.q.slice(0, 40), a: cleanAnswer(x.a), mon: x.mon.slice(0, 80), t: num(x.t, 0, 9e15, 0), day: str(x.day, 12) }))
          .slice(-MAX_ANSWERS)
      : [],
    words: raw.words && typeof raw.words === 'object' ? Object.fromEntries(Object.entries(raw.words as Record<string, unknown>).filter(([k, v]) => k.length <= 80 && cleanAnswer(v, 24) !== '').slice(0, MAX_WORDS).map(([k, v]) => [k, cleanAnswer(v, 24)])) : {},
    nicks: raw.nicks && typeof raw.nicks === 'object' ? Object.fromEntries(Object.entries(raw.nicks as Record<string, unknown>).filter(([k, v]) => k.length <= 80 && cleanAnswer(v, MAX_NICK_LEN) !== '').slice(0, MAX_NICKS).map(([k, v]) => [k, cleanAnswer(v, MAX_NICK_LEN)])) : {},
    lingo: Array.isArray(raw.lingo)
      ? raw.lingo
          .filter((x): x is Lingo => !!x && typeof x === 'object' && cleanAnswer((x as Lingo).text) !== '')
          .map((x) => ({ text: cleanAnswer(x.text), kind: str(x.kind, 16), from: str(x.from, 80), t: num(x.t, 0, 9e15, 0) }))
          .slice(-MAX_LINGO)
      : [],
    memories: memories.slice(-MAX_MEMORIES),
    plans: plans.slice(-MAX_SOCIAL_PLANS),
    asked: raw.asked && typeof raw.asked === 'object' ? Object.fromEntries(Object.entries(raw.asked as Record<string, Partial<{ day: string; n: number }>>).filter(([, v]) => v && typeof v.day === 'string').slice(0, 80).map(([k, v]) => [k, { day: str(v.day, 12), n: num(v.n, 0, 99, 0) }])) : {},
  };
}

/** Como está a relação: casal, brigados, melhores amigos, amigos, rivais ou só conhecidos. */
export function relationStatus(r: Relation | undefined): { key: 'casal' | 'brigados' | 'melhores' | 'amigos' | 'rivais' | 'conhecidos'; label: string; emoji: string } {
  if (!r) return { key: 'conhecidos', label: 'Conhecidos', emoji: '👋' };
  if (r.flag === 'casal') return { key: 'casal', label: 'Casal', emoji: '💕' };
  if (r.flag === 'brigados') return { key: 'brigados', label: 'Brigados', emoji: '💢' };
  if (r.bond >= 60) return { key: 'melhores', label: 'Melhores amigos', emoji: '🫶' };
  if (r.bond >= 30) return { key: 'amigos', label: 'Amigos', emoji: '🤝' };
  if (r.bond <= -30) return { key: 'rivais', label: 'Rivais', emoji: '😤' };
  return { key: 'conhecidos', label: 'Conhecidos', emoji: '👋' };
}
