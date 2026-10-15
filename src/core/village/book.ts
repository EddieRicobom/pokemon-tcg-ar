import { typeEffectiveness } from '../battle';
import type { PokemonType } from '../pokemon-data';
import { itemDef } from './catalog';
import { favoriteOf, friendLevel } from './life';
import type { Friendship } from './life';
import { hash, personalityOf, PERSONALITIES } from './personality';

export { PERSONALITIES, personalityOf };

/**
 * O Livro dos Pokémon: o que cada Pokémon da sua caixa pensa e sente. Personalidade e gostos são fixos (vêm do id da
 * carta, então o mesmo Pokémon pensa sempre igual); o humor muda a cada dia e com o que você fez com ele hoje. Quanto maior
 * a intimidade, mais páginas se abrem: gostos, opiniões sobre os colegas e as ajudas que ele passa a dar.
 */

export interface BookMon {
  id: string;
  /** O nome na tela (o apelido, se tem). */
  name: string;
  /** O nome da carta, quando é diferente do que aparece. */
  real?: string;
  types: readonly PokemonType[];
}

const MOODS = [
  { name: 'Feliz', emoji: '😊' },
  { name: 'Animado', emoji: '🤩' },
  { name: 'Pensativo', emoji: '🤔' },
  { name: 'Entediado', emoji: '😐' },
  { name: 'Carente', emoji: '🥺' },
  { name: 'Brincalhão', emoji: '😜' },
] as const;

const DISLIKE_POOL = ['pedra', 'madeira', 'concha', 'flor', 'tomate', 'abobora'] as const;

/** O que ele não gosta de ganhar (nunca é o favorito). */
export function dislikeOf(id: string, types: readonly PokemonType[]): string {
  const fav = favoriteOf(types);
  const pool = DISLIKE_POOL.filter((i) => i !== fav);
  return pool[hash(`d:${id}`) % pool.length]!;
}

/** Humor de hoje: conversou e ganhou presente → radiante; de noite → sonolento; senão, o humor do dia. */
export function moodOf(id: string, f: Friendship | undefined, day: string, hour: number): { name: string; emoji: string; why: string } {
  if (f && f.lastTalk === day && f.lastGift === day) return { name: 'Radiante', emoji: '🥰', why: 'Você conversou com ele e deu presente hoje.' };
  if (hour >= 22 || hour < 6) return { name: 'Sonolento', emoji: '😴', why: 'Já é tarde. Ele está quase dormindo.' };
  if (f && f.lastTalk === day) return { name: 'Contente', emoji: '😄', why: 'Vocês já conversaram hoje.' };
  const m = MOODS[hash(`m:${id}:${day}`) % MOODS.length]!;
  return { ...m, why: m.name === 'Carente' ? 'Ainda não conversou com você hoje.' : 'É o humor dele hoje.' };
}

const ABOUT_YOU = [
  'Ainda está te conhecendo.',
  'Acha você legal e gosta das conversas.',
  'Confia em você e se diverte nas batalhas juntos.',
  'Diz que você é o melhor treinador que já conheceu.',
  'Você é a pessoa favorita dele no mundo inteiro.',
] as const;

export function opinionOfYou(points: number): string {
  return ABOUT_YOU[friendLevel(points).level]!;
}

/** O que `a` acha de `b`: depende dos tipos (quem leva vantagem) e um pouco do jeito de cada um. */
export function opinionOf(a: BookMon, b: BookMon): { feeling: string; emoji: string } {
  const edge = (from: BookMon, to: BookMon) => Math.max(1, ...from.types.map((t) => typeEffectiveness(t, to.types)));
  const mine = edge(a, b);
  const theirs = edge(b, a);
  const pick = hash(`o:${a.id}:${b.id}`) % 4;
  if (theirs >= 2 && mine < 2) return pick < 2 ? { feeling: `respeita (e tem um pouco de medo de) ${b.name}`, emoji: '😰' } : { feeling: `quer treinar para vencer ${b.name} um dia`, emoji: '😤' };
  if (mine >= 2 && theirs < 2) return pick < 2 ? { feeling: `acha que ganha fácil de ${b.name}`, emoji: '😎' } : { feeling: `protege ${b.name} nas batalhas`, emoji: '🛡️' };
  const shared = a.types.some((t) => b.types.includes(t));
  if (shared) return { feeling: `é unha e carne com ${b.name}`, emoji: '🤝' };
  return [
    { feeling: `adora brincar com ${b.name}`, emoji: '😆' },
    { feeling: `acha ${b.name} engraçado`, emoji: '😂' },
    { feeling: `tem ciúmes de ${b.name}`, emoji: '😒' },
    { feeling: `divide frutas com ${b.name}`, emoji: '🍑' },
  ][pick]!;
}

export interface Unlock {
  level: number;
  levelName: string;
  text: string;
}

/** O que se abre a cada nível de intimidade (o Livro mostra trancado ou aberto). */
export const UNLOCKS: readonly Unlock[] = [
  { level: 1, levelName: 'Colega', text: 'Conta do que gosta e do que não gosta de ganhar.' },
  { level: 2, levelName: 'Amigo', text: 'Traz materiais para você todo dia (na Vila ou ao abrir a Caixa).' },
  { level: 2, levelName: 'Amigo', text: 'Dá a opinião dele sobre os colegas da caixa.' },
  { level: 3, levelName: 'Grande amigo', text: 'Segue você pela Vila ("Vem comigo!").' },
  { level: 3, levelName: 'Grande amigo', text: 'Na Caixa, vem te ver e mostra corações; na batalha, acerta golpes críticos com o dobro da chance.' },
  { level: 4, levelName: 'Melhor amigo', text: 'Uma vez por semana traz um móvel raro, que só se ganha assim.' },
  { level: 4, levelName: 'Melhor amigo', text: 'Na batalha, aguenta firme por você: um golpe que o derrubaria deixa 1 PS (uma vez por luta).' },
];

export interface BookPage {
  id: string;
  name: string;
  level: number;
  levelName: string;
  hearts: number;
  points: number;
  personality: (typeof PERSONALITIES)[number];
  mood: { name: string; emoji: string; why: string };
  aboutYou: string;
  /** Nulo enquanto trancado (nível 1). */
  likes: string | null;
  dislikes: string | null;
  /** Nulo enquanto trancado (nível 2). */
  opinions: { name: string; feeling: string; emoji: string }[] | null;
  unlocks: (Unlock & { open: boolean })[];
}

export function bookPage(mon: BookMon, others: readonly BookMon[], f: Friendship | undefined, day: string, hour: number): BookPage {
  const points = f?.points ?? 0;
  const lvl = friendLevel(points);
  const fav = favoriteOf(mon.types);
  return {
    id: mon.id,
    name: mon.name,
    level: lvl.level,
    levelName: lvl.name,
    hearts: lvl.hearts,
    points,
    personality: personalityOf(mon.id),
    mood: moodOf(mon.id, f, day, hour),
    aboutYou: opinionOfYou(points),
    likes: lvl.level >= 1 ? (itemDef(fav)?.name ?? fav) : null,
    dislikes: lvl.level >= 1 ? (itemDef(dislikeOf(mon.id, mon.types))?.name ?? null) : null,
    opinions: lvl.level >= 2 ? others.filter((o) => o.id !== mon.id).map((o) => ({ name: o.name, ...opinionOf(mon, o) })) : null,
    unlocks: UNLOCKS.map((u) => ({ ...u, open: lvl.level >= u.level })),
  };
}
