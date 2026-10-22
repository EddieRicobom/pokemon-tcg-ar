import type { PokemonType } from './pokemon-data';
import type { MoveCategory, MoveEffect } from './survivor-moves';
import type { SurvivorState, SurvivorSummary } from './survivor';

/** Versão do formato compartilhado no código de feedback. */
export const SURVIVOR_FEEDBACK_VERSION = 1 as const;
const PREFIX = 'SVF1.';
const MAX_CODE_LENGTH = 12_000;

export type FeedbackRating = 1 | 2 | 3 | 4 | 5;
export type FeedbackRatingKey = 'fun' | 'difficulty' | 'clarity' | 'fairness' | 'replay';

export interface SurvivorFeedbackAnswers {
  fun: FeedbackRating;
  difficulty: FeedbackRating;
  clarity: FeedbackRating;
  fairness: FeedbackRating;
  replay: FeedbackRating;
  comment: string;
}

export interface SurvivorFeedbackInput {
  runId: string;
  seed: number;
  participant: { id: string; name: string; dexId: number };
  summary: SurvivorSummary;
  move: { type: PokemonType; category: MoveCategory; effect: MoveEffect };
  preparation: string;
  state: Pick<SurvivorState, 'player' | 'special' | 'typeAffinity' | 'supports' | 'artifacts'>;
  answers: SurvivorFeedbackAnswers;
}

/** Estrutura decodificada. As chaves curtas mantêm o código fácil de copiar. */
export interface SurvivorFeedbackPayload {
  v: typeof SURVIVOR_FEEDBACK_VERSION;
  r: string;
  q: [FeedbackRating, FeedbackRating, FeedbackRating, FeedbackRating, FeedbackRating];
  c: string;
  seed: number;
  p: { i: string; n: string; d: number };
  m: { t: PokemonType; c: MoveCategory; e: MoveEffect };
  s: { t: number; l: number; k: number; w: number; tr: number; b: number; f: boolean; i: boolean; db: number; st: number };
  build: {
    prep: string;
    up: string[];
    sp: string | null;
    br: string | null;
    af: PokemonType | null;
    supports: number[];
    artifacts: string[];
    stats: { d: number; cd: number; rg: number; ra: number; hp: number; mv: number; xp: number };
  };
}

const text = (value: unknown, max: number): string => typeof value === 'string' ? value.slice(0, max) : '';
const finite = (value: unknown, fallback = 0): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const integer = (value: unknown, fallback = 0): number => Math.round(finite(value, fallback));
const rating = (value: unknown): FeedbackRating => {
  const n = Math.max(1, Math.min(5, integer(value, 3)));
  return n as FeedbackRating;
};

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function payloadOf(input: SurvivorFeedbackInput): SurvivorFeedbackPayload {
  const p = input.state.player;
  return {
    v: SURVIVOR_FEEDBACK_VERSION,
    r: text(input.runId, 80),
    q: [rating(input.answers.fun), rating(input.answers.difficulty), rating(input.answers.clarity), rating(input.answers.fairness), rating(input.answers.replay)],
    c: text(input.answers.comment.trim(), 240),
    seed: integer(input.seed),
    p: { i: text(input.participant.id, 80), n: text(input.participant.name, 48), d: integer(input.participant.dexId) },
    m: { t: input.move.type, c: input.move.category, e: input.move.effect },
    s: {
      t: integer(input.summary.survivedMs), l: integer(input.summary.level), k: integer(input.summary.kills), w: integer(input.summary.wave),
      tr: integer(input.summary.trainersBeaten), b: integer(input.summary.bossesBeaten), f: input.summary.finalBossBeaten === true,
      i: input.summary.infinite === true, db: integer(input.summary.digitalPokeballs), st: integer(input.summary.stage),
    },
    build: {
      prep: text(input.preparation, 40),
      up: Object.keys(p.upgradeLevels).filter((id) => /^[a-z0-9:_-]{1,80}$/i.test(id)).slice(0, 80),
      sp: input.state.special.selected ? text(input.state.special.selected, 40) : null,
      br: input.state.special.branch ? text(input.state.special.branch, 40) : null,
      af: input.state.typeAffinity?.type ?? null,
      supports: input.state.supports.map((support) => integer(support.dexId)).filter((id) => id > 0).slice(0, 5),
      artifacts: input.state.artifacts.map((artifact) => text(artifact.kind, 30)).filter(Boolean).slice(0, 12),
      stats: {
        d: finite(p.attackDamage), cd: finite(p.attackCooldownMs), rg: finite(p.attackRange), ra: finite(p.attackRadius),
        hp: finite(p.maxHp), mv: finite(p.speed), xp: finite(p.xpMultiplier, 1),
      },
    },
  };
}

/** Gera o código que o jogador pode copiar e enviar junto do feedback. */
export function encodeSurvivorFeedback(input: SurvivorFeedbackInput): string {
  return `${PREFIX}${toBase64Url(JSON.stringify(payloadOf(input)))}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

/** Decodifica apenas o formato conhecido; entradas coladas incompletas retornam null. */
export function decodeSurvivorFeedback(code: string): SurvivorFeedbackPayload | null {
  const raw = code.trim();
  if (!raw.startsWith(PREFIX) || raw.length > MAX_CODE_LENGTH) return null;
  try {
    const value: unknown = JSON.parse(fromBase64Url(raw.slice(PREFIX.length)));
    if (!isRecord(value) || value.v !== SURVIVOR_FEEDBACK_VERSION || !Array.isArray(value.q) || value.q.length !== 5 || !isRecord(value.p) || !isRecord(value.m) || !isRecord(value.s) || !isRecord(value.build)) return null;
    return value as unknown as SurvivorFeedbackPayload;
  } catch {
    return null;
  }
}

export const emptySurvivorFeedbackAnswers = (): SurvivorFeedbackAnswers => ({ fun: 0 as FeedbackRating, difficulty: 0 as FeedbackRating, clarity: 0 as FeedbackRating, fairness: 0 as FeedbackRating, replay: 0 as FeedbackRating, comment: '' });

