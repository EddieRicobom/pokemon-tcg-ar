import type { Rng } from '../../battle';
import type { PokemonType } from '../../pokemon-data';
import type { ItemId } from '../life';
import { birthdayOf } from '../personality';
import type { PersonalityName } from '../personality';
import type { Fx, MomentKind, MomentLine, RelFlag, Relation, SocialPlanKind } from '../social-state';

export interface Actor {
  id: string;
  name: string;
  types: readonly PokemonType[];
}

/** Trabalho realmente concluído recentemente por um morador. A camada social só comenta registros existentes. */
export interface WorkSignal {
  residentId: string;
  kind: 'plant' | 'water' | 'harvest' | 'mine' | 'lumber' | 'fish';
  at: number;
}

/** O mundo no instante do momento (o que está colocado na Vila, a hora, o tempo). */
export interface SocialEnv {
  /** O nome do treinador (para os Pokémon falarem de você). */
  player: string;
  hour: number;
  day: string;
  weather: string | null;
  placed: ReadonlySet<string>;
  worn?: ReadonlySet<string>;
  crops: number;
  ripeCrops: number;
  /** Nível da cidade da Vila (nível de Treinador visto por último) e o que você respondeu às perguntas dos Pokémon (as 8 últimas). */
  town: number;
  lingo: readonly string[];
  /** Últimas tarefas concluídas pela automação, para eventos que nascem do trabalho visível. */
  recentWork?: readonly WorkSignal[];
  /** IDs realmente sentados e servidos na mesma mesa do Café nesta sessão. */
  cafeGuests?: readonly string[];
}

export interface Outcome {
  /** Entre o elenco 0 e o 1. */
  bond?: number;
  spark?: number;
  /** Entre 0 e 2, e entre 1 e 2 (momentos de três). */
  bond02?: number;
  bond12?: number;
  spark02?: number;
  flag?: RelFlag | 'clear';
  coins?: number;
  items?: [ItemId, number][];
  /** Amizade com você, para todos do elenco ou por posição. */
  friend?: number;
  friendBy?: number[];
  /** Um Pokémon comeu uma colheita pronta. */
  eatCrop?: boolean;
  /** Rega de graça todas as plantas com sede. */
  water?: boolean;
  /** Cria um compromisso para um encontro futuro entre os participantes. */
  plan?: SocialPlanDraft | SocialPlanDraft[];
}

export interface SocialPlanDraft {
  kind: SocialPlanKind;
  /** Posição de quem toma a iniciativa (padrão: 0). */
  from?: 0 | 1 | 2;
  /** Posição de quem recebe o compromisso (padrão: 1). */
  to?: 0 | 1 | 2;
  /** Quantos dias o compromisso permanece válido. */
  days?: number;
}

export interface Ctx {
  n: string[];
  p: PersonalityName[];
  types: (readonly PokemonType[])[];
  rel: Relation | undefined;
  rel02: Relation | undefined;
  rel12: Relation | undefined;
  env: SocialEnv;
  seen: ReadonlySet<string>;
  rng: Rng;
  /** Para as falas e o resultado combinarem (quem ganhou, se aceitou…). */
  memo: Record<string, number | string | boolean>;
  pts: (i: number) => number;
  has: (...ids: string[]) => boolean;
  rolling: boolean;
  /** Quem está no elenco (ids), e a data do momento (mês 1–12, dia, dia da semana 0 = domingo). */
  ids: string[];
  date: { y: number; m: number; d: number; dow: number };
}

export type Lines = (c: Ctx) => MomentLine[];

export interface ChoiceOption {
  label: (c: Ctx) => string;
  /** Falas depois da sua decisão. */
  lines?: Lines;
  outcome: Outcome | ((c: Ctx) => Outcome);
  /** Custo em itens da mochila (não gasta se faltar). */
  needs?: { item: ItemId; qty: number };
}

export interface Template {
  id: string;
  kind: MomentKind;
  title: string;
  emoji: string;
  cast: 1 | 2 | 3;
  weight: number;
  when?: (c: Ctx) => boolean;
  lines: Lines;
  /** O que acontece se você não decidir (ou se o momento não pede decisão). */
  outcome: Outcome | ((c: Ctx) => Outcome);
  /** Marco da vida deles: vai direto para o Álbum e fica para sempre. */
  keep?: boolean;
  choice?: { prompt: string; options: ChoiceOption[] };
  /** O que cada um comenta depois, quando você conversa com ele (`who` = posição no elenco). */
  after?: (n: string[], who: number) => string | null;
}

export const L = (who: number, text: string, fx?: Fx): MomentLine => ({ who, text, ...(fx ? { fx } : {}) });
export const is = (c: Ctx, i: number, ...names: PersonalityName[]): boolean => names.includes(c.p[i]!);
export const night = (c: Ctx): boolean => c.env.hour >= 21 || c.env.hour < 5;
export const calm = (c: Ctx): boolean => c.env.weather !== 'chuva' && c.env.weather !== 'neve';
export const other = (n: string[], who: number): string => n[who === 0 ? 1 : 0] ?? 'o colega';


/** É o aniversário de quem está na posição `i` do elenco? */
export const birthday = (c: Ctx, i: number): boolean => {
  const b = c.ids[i] ? birthdayOf(c.ids[i]!) : null;
  return !!b && b.m === c.date.m && b.d === c.date.d;
};
/** A data cai entre dois dias do ano (mês/dia, inclusive)? */
export const between = (c: Ctx, m1: number, d1: number, m2: number, d2: number): boolean => {
  const v = c.date.m * 100 + c.date.d;
  return v >= m1 * 100 + d1 && v <= m2 * 100 + d2;
};
export const onDay = (c: Ctx, m: number, d: number): boolean => c.date.m === m && c.date.d === d;
/** Escolhe um item de uma lista com o `rng` do momento. */
export const pick = <T,>(c: Ctx, list: readonly T[]): T => list[Math.floor(c.rng() * list.length)]!;
/** Existe alguma resposta sua guardada (para os Pokémon comentarem)? */
export const heard = (c: Ctx): boolean => c.env.lingo.length > 0;
export const said = (c: Ctx): string => pick(c, c.env.lingo);
export const day = (c: Ctx): boolean => c.env.hour >= 7 && c.env.hour < 19;
export const evening = (c: Ctx): boolean => c.env.hour >= 17 && c.env.hour < 24;
export const rainy = (c: Ctx): boolean => c.env.weather === 'chuva';
export const snowy = (c: Ctx): boolean => c.env.weather === 'neve';
/** Os dois (ou o par pedido) são do mesmo tipo de Pokémon? */
export const sameType = (c: Ctx): boolean => !!c.types[0] && !!c.types[1] && c.types[0]!.some((t) => c.types[1]!.includes(t));
export const friendsNow = (c: Ctx): boolean => !!c.rel && c.rel.bond >= 20 && c.rel.flag !== 'brigados';
export const rivals = (c: Ctx): boolean => !!c.rel && (c.rel.bond <= -15 || c.rel.flag === 'brigados');
export const coupled = (c: Ctx): boolean => c.rel?.flag === 'casal';
export const wearing = (c: Ctx, ...ids: string[]): boolean => ids.some((id) => c.env.worn?.has(id) === true);

