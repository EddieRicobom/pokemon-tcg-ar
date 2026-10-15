/**
 * O que a vida social da Vila guarda no arquivo de progresso: a relação entre cada par de Pokémon, o Diário de momentos,
 * quais momentos você já viu (o Álbum) e quando você saiu da Vila (para o que aconteceu enquanto estava fora).
 * Só tipos e a limpeza do que vem do disco; as regras ficam em `social.ts`.
 */

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

export interface SocialState {
  rel: Record<string, Relation>;
  diary: Moment[];
  seen: string[];
  lastSeen: number;
  diaryRead: number;
}

/** O Diário guarda só os últimos momentos; o que você guarda no Álbum fica para sempre (até este limite, por causa do espaço no aparelho). */
export const MAX_DIARY = 60;
export const MAX_SAVED = 500;
const MAX_SEEN = 600;

export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function emptySocial(): SocialState {
  return { rel: {}, diary: [], seen: [], lastSeen: 0, diaryRead: 0 };
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

export function normalizeSocial(raw: { rel?: unknown; diary?: unknown; seen?: unknown; lastSeen?: unknown; diaryRead?: unknown }): SocialState {
  const rel: Record<string, Relation> = {};
  if (raw.rel && typeof raw.rel === 'object') {
    for (const [k, v] of Object.entries(raw.rel as Record<string, Partial<Relation>>)) {
      if (!k.includes('|') || !v || typeof v !== 'object') continue;
      rel[k] = { bond: num(v.bond, -100, 100, 0), spark: num(v.spark, 0, 100, 0), flag: v.flag === 'casal' || v.flag === 'brigados' ? v.flag : null, since: str(v.since, 12), met: num(v.met, 0, 9999, 0) };
    }
  }
  const all = Array.isArray(raw.diary) ? raw.diary.map(normalizeMoment).filter((m): m is Moment => m !== null) : [];
  return {
    rel,
    diary: trimMoments(all),
    seen: Array.isArray(raw.seen) ? [...new Set(raw.seen.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 60)))].slice(0, MAX_SEEN) : [],
    lastSeen: num(raw.lastSeen, 0, 9e15, 0),
    diaryRead: num(raw.diaryRead, 0, 9e15, 0),
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
