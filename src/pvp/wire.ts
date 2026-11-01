import { parseBoxMessage } from './box-wire';
import { parseSurvivalMessage } from './survival-wire';
import type { SurvivalWireMessage } from './survival-wire';
import type { BoxWireMessage } from './box-wire';
import type { Rng } from '../core/battle';
import { ARENA_RADIUS, EFFECT_KINDS, MAX_MOVES, MAX_PER_SIDE, pinFromSpec } from '../core/pins';
import type { Patch, PinSpec, PinWorld, Shot, ShotEffect } from '../core/pins';
import { createArenaGrid, TERRAIN_COLS } from '../core/pin-terrain';
import { POKEMON_TYPES, STAT_ORDER } from '../core/pokemon-data';
import type { BaseStats, CardAttack, PokemonType } from '../core/pokemon-data';
import { MAX_BACKUP_TRANSFER_BYTES, MAX_BACKUP_TRANSFER_CHUNKS } from './backup-transfer';
import { parseDungeonMessage } from './dungeon-wire';
import type { DungeonWireMessage } from './dungeon-wire';
import { parseTauntMessage } from './taunts';
import type { TauntMessage } from './taunts';

/**
 * PvP do Pin Mode: as mensagens entre os dois celulares e a tradução entre o mundo de cada um e o que vai pelo fio.
 *
 * Cada celular joga com **os seus pins embaixo** (lado 0, azul). O que vai pelo fio está sempre no ponto de vista do
 * **anfitrião** (`'host'`): o convidado (`'guest'`) vê o mundo girado 180° (x e y trocam de sinal) e com os lados trocados.
 * Quem dispara roda a física e, quando tudo para, manda o estado final (`settled`); o outro celular também roda o disparo
 * para mostrar o movimento, mas no fim adota o estado de quem disparou. Assim uma diferença de arredondamento entre
 * aparelhos nunca separa os dois jogos.
 *
 * Tudo o que chega do outro celular é dado não confiável: `parseMessage` confere formato e limites antes de qualquer uso.
 */

export const WIRE_VERSION = 1;
/** Pins por jogador no PvP (os dois lados levam o mesmo número). */
export const PVP_MAX_PINS = MAX_PER_SIDE[0];

export type Frame = 'host' | 'guest';

/** Um pin como o outro celular o recebe: o que `pinFromSpec` precisa mais o número do sprite. `id` já vem com o prefixo de quem enviou. */
export interface WireSpec extends PinSpec {
  sprite: number;
}

export interface WirePin {
  id: string;
  x: number;
  y: number;
  alive: boolean;
  fall: number;
  cooldowns: number[];
  active: ShotEffect | null;
}

export interface WireWorld {
  pins: WirePin[];
  patches: Patch[];
  /** Marcas do chão (índice por bloco, 0 = nenhuma), no ponto de vista do anfitrião. */
  over: number[];
  limit: number;
  round: number;
}

export interface WireInit extends WireWorld {
  /** Chão base por bloco, no ponto de vista do anfitrião. */
  base: number[];
  shrink: boolean;
  marks: boolean;
}

export type WireMessage =
  | BoxWireMessage
  | SurvivalWireMessage
  | DungeonWireMessage
  | TauntMessage
  | { t: 'hello'; v: number }
  | { t: 'team'; ready: boolean; specs: WireSpec[] }
  | { t: 'options'; shrink: boolean; marks: boolean }
  | { t: 'start'; hostSpecs: WireSpec[]; guestSpecs: WireSpec[]; init: WireInit }
  | { t: 'shot'; pinId: string; moveIndex: number | null; dirX: number; dirY: number; power: number }
  | { t: 'settled'; world: WireWorld }
  /** Mira ao vivo enquanto o outro arrasta (várias por segundo); `pinId: null` limpa. Só desenho: nunca muda o jogo. */
  | { t: 'aim'; pinId: string | null; dirX: number; dirY: number; power: number }
  | { t: 'backup-offer'; id: string; name: string; bytes: number; chunks: number }
  | { t: 'backup-chunk'; id: string; index: number; total: number; data: string }
  | { t: 'backup-end'; id: string }
  | { t: 'backup-received'; id: string }
  | { t: 'backup-failed'; id: string; reason: string }
  | { t: 'bye' }
  | { t: 'ping' }
  | { t: 'pong' };

const CELLS = TERRAIN_COLS * TERRAIN_COLS;
const TYPES = new Set<string>(POKEMON_TYPES);
const EFFECTS = new Set<string>(EFFECT_KINDS);

// ----------------------------------------------------------------------------- geometria

/** Gira um ponto entre o seu mundo e o do fio (a mesma conta nos dois sentidos). */
export const turn = (frame: Frame, v: number): number => (frame === 'host' ? v : -v);

/** O lado de um pin do fio no mundo de quem lê: o convidado enxerga os lados trocados. */
export const localSide = (frame: Frame, wireSide: 0 | 1): 0 | 1 => (frame === 'host' ? wireSide : ((1 - wireSide) as 0 | 1));

/** Girar 180° uma grade de blocos é inverter a ordem dos índices. */
const turnCells = (frame: Frame, cells: ArrayLike<number>): number[] => (frame === 'host' ? Array.from(cells) : Array.from(cells).reverse());

export function shotToWire(frame: Frame, shot: Shot): { dirX: number; dirY: number; power: number } {
  return { dirX: turn(frame, shot.dirX), dirY: turn(frame, shot.dirY), power: shot.power };
}

export function shotFromWire(frame: Frame, msg: { dirX: number; dirY: number; power: number }): Shot {
  return { dirX: turn(frame, msg.dirX), dirY: turn(frame, msg.dirY), power: msg.power };
}

// ----------------------------------------------------------------------------- estado do mundo

function effectOf(effect: ShotEffect | null): ShotEffect | null {
  return effect ? { kind: effect.kind, type: effect.type, ...(effect.used ? { used: true } : {}) } : null;
}

/** O estado do seu mundo, escrito no ponto de vista do anfitrião. */
export function snapshotWorld(world: PinWorld, frame: Frame): WireWorld {
  return {
    pins: world.pins.map((p) => ({
      id: p.id,
      x: turn(frame, p.x),
      y: turn(frame, p.y),
      alive: p.alive,
      fall: p.fall,
      cooldowns: [...p.cooldowns],
      active: effectOf(p.active),
    })),
    patches: world.patches.map((p) => ({ kind: p.kind, x: turn(frame, p.x), y: turn(frame, p.y), r: p.r, angle: frame === 'host' ? p.angle : p.angle + Math.PI })),
    over: turnCells(frame, world.terrain?.over ?? []),
    limit: world.limit ?? world.radius,
    round: world.round ?? 0,
  };
}

export function snapshotInit(world: PinWorld, options: { shrink: boolean; marks: boolean }): WireInit {
  return { ...snapshotWorld(world, 'host'), base: Array.from(world.terrain?.base ?? []), shrink: options.shrink, marks: options.marks };
}

export interface AppliedWorld {
  /** Blocos do chão cuja marca mudou (a tela repinta só eles). */
  changedCells: number[];
  limitChanged: boolean;
  patchesChanged: boolean;
}

/** Adota o estado do fio no seu mundo: posições, quem caiu, recargas, efeitos, chão e borda. Os pins são casados pelo `id`. */
export function applyWorld(world: PinWorld, snap: WireWorld, frame: Frame): AppliedWorld {
  const byId = new Map(world.pins.map((p) => [p.id, p]));
  for (const w of snap.pins) {
    const pin = byId.get(w.id);
    if (!pin) continue;
    pin.x = turn(frame, w.x);
    pin.y = turn(frame, w.y);
    pin.vx = 0;
    pin.vy = 0;
    pin.alive = w.alive;
    pin.fall = w.fall;
    pin.cooldowns = pin.moves.map((_, i) => w.cooldowns[i] ?? 0);
    pin.active = effectOf(w.active);
    pin.lastMark = null;
  }
  const changedCells: number[] = [];
  const over = turnCells(frame, snap.over);
  const grid = world.terrain;
  if (grid && over.length === grid.over.length) {
    for (let i = 0; i < over.length; i++) {
      if (grid.over[i] !== over[i]) {
        grid.over[i] = over[i]!;
        changedCells.push(i);
      }
    }
  }
  const previous = world.patches;
  world.patches = snap.patches.map((p) => ({ kind: p.kind, x: turn(frame, p.x), y: turn(frame, p.y), r: p.r, angle: frame === 'host' ? p.angle : p.angle - Math.PI }));
  const patchesChanged = previous.length !== world.patches.length;
  const limitChanged = (world.limit ?? world.radius) !== snap.limit;
  world.limit = snap.limit;
  world.round = snap.round;
  return { changedCells, limitChanged, patchesChanged };
}

/** O mundo do convidado (ou o espelho do anfitrião) a partir da mensagem `start`: os seus pins embaixo, os do amigo em cima. */
export function buildPvpWorld(init: WireInit, hostSpecs: WireSpec[], guestSpecs: WireSpec[], frame: Frame, rng: Rng): PinWorld {
  const mine = frame === 'host' ? hostSpecs : guestSpecs;
  const theirs = frame === 'host' ? guestSpecs : hostSpecs;
  const terrain = createArenaGrid(0);
  const base = turnCells(frame, init.base);
  if (base.length === terrain.base.length) terrain.base.set(base);
  const world: PinWorld = {
    radius: ARENA_RADIUS,
    patches: [],
    pins: [...mine.map((s) => pinFromSpec(s, 0)), ...theirs.map((s) => pinFromSpec(s, 1))],
    time: 0,
    terrain,
    markRng: init.marks ? rng : null,
    limit: ARENA_RADIUS,
    round: 0,
    shrinking: init.shrink,
  };
  applyWorld(world, init, frame);
  return world;
}

// ----------------------------------------------------------------------------- validação

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const isBase64Url = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]+$/.test(v);

function parseAttack(v: unknown): CardAttack | null {
  if (!isObj(v) || !isStr(v.name, 60) || !Array.isArray(v.cost) || v.cost.length > 8 || !v.cost.every((c) => isStr(c, 20))) return null;
  if (v.damage !== undefined && !isStr(v.damage, 12)) return null;
  return { name: v.name, cost: [...(v.cost as string[])], ...(v.damage !== undefined ? { damage: v.damage as string } : {}) };
}

export function parseSpec(v: unknown): WireSpec | null {
  if (!isObj(v) || !isStr(v.id, 80) || v.id.length === 0 || !isStr(v.name, 60) || !isNum(v.sprite, 1, 100000) || !Number.isInteger(v.sprite)) return null;
  if (!Array.isArray(v.types) || v.types.length > 2 || !v.types.every((t) => typeof t === 'string' && TYPES.has(t))) return null;
  let stats: BaseStats | null = null;
  if (v.stats !== null) {
    if (!isObj(v.stats)) return null;
    const out: Partial<BaseStats> = {};
    for (const key of STAT_ORDER) {
      const n = v.stats[key];
      if (!isNum(n, 0, 400)) return null;
      out[key] = n;
    }
    stats = out as BaseStats;
  }
  if (v.weightKg !== null && !isNum(v.weightKg, 0, 100000)) return null;
  let attacks: CardAttack[] | undefined;
  if (v.attacks !== undefined) {
    if (!Array.isArray(v.attacks) || v.attacks.length > MAX_MOVES) return null;
    attacks = [];
    for (const a of v.attacks) {
      const parsed = parseAttack(a);
      if (!parsed) return null;
      attacks.push(parsed);
    }
  }
  return { id: v.id, name: v.name, types: v.types as PokemonType[], stats, weightKg: v.weightKg as number | null, sprite: v.sprite, ...(attacks ? { attacks } : {}) };
}

function parseSpecs(v: unknown): WireSpec[] | null {
  if (!Array.isArray(v) || v.length > PVP_MAX_PINS) return null;
  const out: WireSpec[] = [];
  for (const s of v) {
    const parsed = parseSpec(s);
    if (!parsed) return null;
    out.push(parsed);
  }
  return new Set(out.map((s) => s.id)).size === out.length ? out : null;
}

function parseEffect(v: unknown): ShotEffect | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || typeof v.kind !== 'string' || !EFFECTS.has(v.kind)) return undefined;
  if (v.type !== null && !(typeof v.type === 'string' && TYPES.has(v.type))) return undefined;
  return { kind: v.kind as ShotEffect['kind'], type: v.type as PokemonType | null, ...(v.used === true ? { used: true } : {}) };
}

function parseWorld(v: unknown): WireWorld | null {
  if (!isObj(v) || !Array.isArray(v.pins) || v.pins.length > PVP_MAX_PINS * 2 || !Array.isArray(v.patches) || v.patches.length > 8) return null;
  if (!Array.isArray(v.over) || v.over.length !== CELLS || !v.over.every((n) => isNum(n, 0, 20) && Number.isInteger(n))) return null;
  if (!isNum(v.limit, 100, 1000) || !isNum(v.round, 0, 10000) || !Number.isInteger(v.round)) return null;
  const pins: WirePin[] = [];
  for (const p of v.pins) {
    if (!isObj(p) || !isStr(p.id, 80) || !isNum(p.x, -3000, 3000) || !isNum(p.y, -3000, 3000) || typeof p.alive !== 'boolean' || !isNum(p.fall, 0, 1)) return null;
    if (!Array.isArray(p.cooldowns) || p.cooldowns.length > MAX_MOVES || !p.cooldowns.every((n) => isNum(n, 0, 10))) return null;
    const active = parseEffect(p.active);
    if (active === undefined) return null;
    pins.push({ id: p.id, x: p.x, y: p.y, alive: p.alive, fall: p.fall, cooldowns: p.cooldowns as number[], active });
  }
  const patches: Patch[] = [];
  for (const p of v.patches) {
    if (!isObj(p) || p.kind !== 'bumper' || !isNum(p.x, -3000, 3000) || !isNum(p.y, -3000, 3000) || !isNum(p.r, 1, 200) || !isNum(p.angle, -100, 100)) return null;
    patches.push({ kind: 'bumper', x: p.x, y: p.y, r: p.r, angle: p.angle });
  }
  return { pins, patches, over: v.over as number[], limit: v.limit, round: v.round };
}

function parseInit(v: unknown): WireInit | null {
  const world = parseWorld(v);
  if (!world || !isObj(v) || !Array.isArray(v.base) || v.base.length !== CELLS || !v.base.every((n) => isNum(n, 0, 20) && Number.isInteger(n))) return null;
  if (typeof v.shrink !== 'boolean' || typeof v.marks !== 'boolean') return null;
  return { ...world, base: v.base as number[], shrink: v.shrink, marks: v.marks };
}

/** Lê uma mensagem do fio (texto JSON). Devolve null para qualquer coisa fora do formato. */
export function parseMessage(raw: unknown): WireMessage | null {
  if (typeof raw !== 'string' || raw.length > 60000) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v) || typeof v.t !== 'string') return null;
  switch (v.t) {
    case 'hello':
      return isNum(v.v, 0, 1000) ? { t: 'hello', v: v.v } : null;
    case 'team': {
      const specs = parseSpecs(v.specs);
      return specs && typeof v.ready === 'boolean' ? { t: 'team', ready: v.ready, specs } : null;
    }
    case 'options':
      return typeof v.shrink === 'boolean' && typeof v.marks === 'boolean' ? { t: 'options', shrink: v.shrink, marks: v.marks } : null;
    case 'start': {
      const hostSpecs = parseSpecs(v.hostSpecs);
      const guestSpecs = parseSpecs(v.guestSpecs);
      const init = parseInit(v.init);
      return hostSpecs && guestSpecs && init && hostSpecs.length > 0 && hostSpecs.length === guestSpecs.length ? { t: 'start', hostSpecs, guestSpecs, init } : null;
    }
    case 'shot':
      if (!isStr(v.pinId, 80) || !(v.moveIndex === null || (isNum(v.moveIndex, 0, MAX_MOVES) && Number.isInteger(v.moveIndex)))) return null;
      if (!isNum(v.dirX, -1.0001, 1.0001) || !isNum(v.dirY, -1.0001, 1.0001) || !isNum(v.power, 0, 1)) return null;
      return { t: 'shot', pinId: v.pinId, moveIndex: v.moveIndex as number | null, dirX: v.dirX, dirY: v.dirY, power: v.power };
    case 'aim':
      if (!(v.pinId === null || (isStr(v.pinId, 80) && v.pinId.length > 0))) return null;
      if (!isNum(v.dirX, -1.0001, 1.0001) || !isNum(v.dirY, -1.0001, 1.0001) || !isNum(v.power, 0, 1)) return null;
      return { t: 'aim', pinId: v.pinId as string | null, dirX: v.dirX, dirY: v.dirY, power: v.power };
    case 'backup-offer':
      return isStr(v.id, 80) && v.id.length > 0 && isStr(v.name, 160) && v.name.length > 0
        && isNum(v.bytes, 1, MAX_BACKUP_TRANSFER_BYTES) && Number.isInteger(v.bytes)
        && isNum(v.chunks, 1, MAX_BACKUP_TRANSFER_CHUNKS) && Number.isInteger(v.chunks)
        ? { t: 'backup-offer', id: v.id, name: v.name, bytes: v.bytes, chunks: v.chunks }
        : null;
    case 'backup-chunk':
      return isStr(v.id, 80) && v.id.length > 0 && isNum(v.index, 0, MAX_BACKUP_TRANSFER_CHUNKS - 1) && Number.isInteger(v.index)
        && isNum(v.total, 1, MAX_BACKUP_TRANSFER_CHUNKS) && Number.isInteger(v.total)
        && v.index < v.total && isBase64Url(v.data) && v.data.length > 0
        ? { t: 'backup-chunk', id: v.id, index: v.index, total: v.total, data: v.data }
        : null;
    case 'backup-end':
      return isStr(v.id, 80) && v.id.length > 0 ? { t: 'backup-end', id: v.id } : null;
    case 'backup-received':
      return isStr(v.id, 80) && v.id.length > 0 ? { t: 'backup-received', id: v.id } : null;
    case 'backup-failed':
      return isStr(v.id, 80) && v.id.length > 0 && isStr(v.reason, 160) ? { t: 'backup-failed', id: v.id, reason: v.reason } : null;
    case 'settled': {
      const world = parseWorld(v.world);
      return world ? { t: 'settled', world } : null;
    }
    case 'cx-team':
    case 'cx-start':
    case 'cx-ready':
    case 'cx-go':
      return parseBoxMessage(v);
    case 'sv-team':
    case 'sv-progress':
    case 'sv-start':
    case 'sv-ready':
    case 'sv-go':
    case 'sv-input':
    case 'sv-snap':
    case 'sv-buff':
      return parseSurvivalMessage(v);
    case 'dd-ready':
    case 'dd-start':
    case 'dd-prog':
    case 'dd-team':
    case 'dd-act':
    case 'dd-desync':
    case 'dd-forfeit':
      return parseDungeonMessage(v);
    case 'taunt':
    case 'buff-event':
      return parseTauntMessage(v);
    case 'bye':
    case 'ping':
    case 'pong':
      return { t: v.t };
    default:
      return null;
  }
}

export const encodeMessage = (msg: WireMessage): string => JSON.stringify(msg);

/** Põe o prefixo de quem envia no `id` dos pins, para os dois lados nunca repetirem um `id` (as duas pessoas podem ter a mesma carta). */
export const prefixSpecs = (frame: Frame, specs: readonly WireSpec[]): WireSpec[] => specs.map((s) => ({ ...s, id: `${frame === 'host' ? 'h' : 'g'}:${s.id}` }));
