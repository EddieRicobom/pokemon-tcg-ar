import type { SurvivorUpgradeRarity } from '../core/survivor-types';
import { POKEMON_TYPES } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import type { MoveCategory, MoveEffect } from '../core/survivor-moves';
import { SV_ARENA_H, SV_ARENA_W, SV_LIMITS, SV_MAX_TEAM } from '../core/survivor-pvp';
import type { ArenaEvent, ArenaInput, ArenaSnapshot, ArenaWinner, SvAttackForm, SvMonSpec } from '../core/survivor-pvp';

/**
 * Mensagens do PvP do Survival. Cada celular faz as suas 3 runs sozinho e manda a equipe pronta (`sv-team`); com as duas
 * equipes, o anfitrião manda `sv-start` e a luta roda nele: o convidado manda só as entradas (`sv-input`) e recebe
 * instantâneos (`sv-snap`, ~15 Hz). Tudo o que chega é dado não confiável: números fora dos limites = mensagem recusada.
 */

export type SurvivalWireMessage =
  /** A minha equipe, depois das 3 runs. */
  | { t: 'sv-team'; name: string; team: SvMonSpec[] }
  /** Quantas runs eu já terminei (0 a 3), para o amigo saber quanto falta. */
  | { t: 'sv-progress'; done: number }
  /** Anfitrião → convidado: as duas equipes estão aqui, carreguem os sprites. */
  | { t: 'sv-start' }
  /** Cada celular avisa que chegou à largada da run `index` (resultado da anterior visto, pronto para começar). */
  | { t: 'sv-run-ready'; index: number }
  /** Anfitrião → convidado: larguem a run `index` agora (os dois começam juntos, depois de uma contagem curta). */
  | { t: 'sv-run-go'; index: number }
  /** Terminei de carregar (`ok: false` = faltou algum sprite, a luta segue com o nome no lugar). */
  | { t: 'sv-ready'; ok: boolean }
  /** Anfitrião → convidado: os dois estão prontos, a contagem começa. */
  | { t: 'sv-go' }
  /** Convidado → anfitrião: para onde andar e quem quer em campo. `seq` cresce a cada envio. */
  | { t: 'sv-input'; seq: number; dx: number; dy: number; switchTo: number; shield?: boolean; swapAttack?: boolean }
  /** Anfitrião → convidado: o estado da arena e o que aconteceu desde o último. */
  | { t: 'sv-snap'; snap: ArenaSnapshot; events: ArenaEvent[] }
  /** Peguei uma carta de melhoria na run: id e raridade das regras reais, nome só para mostrar. */
  | { t: 'sv-buff'; id: string; name: string; rarity: SurvivorUpgradeRarity };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isInt = (v: unknown, lo: number, hi: number): v is number => isNum(v, lo, hi) && Number.isInteger(v);
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const TYPES = new Set<string>(POKEMON_TYPES);
const isType = (v: unknown): v is PokemonType => typeof v === 'string' && TYPES.has(v);
const CATEGORIES = new Set<MoveCategory>(['projetil', 'aura', 'area', 'cone', 'orbit', 'foco', 'rapido', 'teleporte', 'trilha']);
const EFFECTS = new Set<MoveEffect>(['queimar', 'lentidao', 'empurrar', 'saltar', 'atordoar', 'atravessar', 'roubar', 'nenhum']);
const isCategory = (v: unknown): v is MoveCategory => typeof v === 'string' && CATEGORIES.has(v as MoveCategory);
const isEffect = (v: unknown): v is MoveEffect => typeof v === 'string' && EFFECTS.has(v as MoveEffect);
const RARITIES: readonly string[] = ['normal', 'raro', 'lendario', 'ancestral'];
const isBuffRarity = (v: unknown): v is SurvivorUpgradeRarity => typeof v === 'string' && RARITIES.includes(v);
/** Buff raro = qualquer raridade acima da normal. */
export const isRareBuff = (rarity: SurvivorUpgradeRarity): boolean => rarity !== 'normal';
const isSide = (v: unknown): v is 0 | 1 => v === 0 || v === 1;

function parseAttackForm(v: unknown): SvAttackForm | null {
  if (!isObj(v) || !isType(v.attackType) || !isNum(v.power, ...SV_LIMITS.power) || !isNum(v.fireMs, ...SV_LIMITS.fireMs)) return null;
  if (!isStr(v.moveName, 60) || !isCategory(v.moveCategory) || !isEffect(v.moveEffect)) return null;
  if (!isNum(v.projectileSpeed, 120, 700) || !isNum(v.projectileSize, 3, 18) || !isInt(v.shots, 1, 5) || !isInt(v.pierce, 0, 4)) return null;
  if (!isNum(v.attackRange, 40, 360) || !isNum(v.attackRadius, 18, 160) || !isNum(v.critChance, 0, 0.6)) return null;
  return {
    attackType: v.attackType, power: v.power, fireMs: v.fireMs, moveName: v.moveName, moveCategory: v.moveCategory, moveEffect: v.moveEffect,
    projectileSpeed: v.projectileSpeed, projectileSize: v.projectileSize, shots: v.shots, pierce: v.pierce, attackRange: v.attackRange, attackRadius: v.attackRadius, critChance: v.critChance,
  };
}

export function parseSvMon(v: unknown): SvMonSpec | null {
  if (!isObj(v) || !isStr(v.id, 80) || v.id.length === 0 || !isStr(v.name, 60) || v.name.length === 0) return null;
  if (!isInt(v.dexId, 1, 100000) || typeof v.shiny !== 'boolean' || typeof v.estimated !== 'boolean') return null;
  if (!Array.isArray(v.types) || v.types.length > 2 || !v.types.every(isType) || !isType(v.attackType)) return null;
  if (!isNum(v.maxHp, ...SV_LIMITS.maxHp) || !isNum(v.power, ...SV_LIMITS.power) || !isNum(v.speed, ...SV_LIMITS.speed)) return null;
  if (!isNum(v.fireMs, ...SV_LIMITS.fireMs) || !isNum(v.score, ...SV_LIMITS.score)) return null;
  const alt = v.alt === undefined ? undefined : parseAttackForm(v.alt);
  if (alt === null) return null;
  const base: SvMonSpec = {
    id: v.id, name: v.name, dexId: v.dexId, shiny: v.shiny, types: [...(v.types as PokemonType[])], attackType: v.attackType,
    maxHp: v.maxHp, power: v.power, speed: v.speed, fireMs: v.fireMs, score: v.score, estimated: v.estimated, ...(alt ? { alt } : {}),
  };
  const supplied = ['moveName', 'moveCategory', 'moveEffect', 'projectileSpeed', 'projectileSize', 'shots', 'pierce', 'attackRange', 'attackRadius', 'critChance', 'buffs']
    .some((key) => key in v);
  if (!supplied) return base;
  if (!isStr(v.moveName, 60) || !isCategory(v.moveCategory) || !isEffect(v.moveEffect)) return null;
  if (!isNum(v.projectileSpeed, 120, 700) || !isNum(v.projectileSize, 3, 18) || !isInt(v.shots, 1, 5) || !isInt(v.pierce, 0, 4)) return null;
  if (!isNum(v.attackRange, 40, 360) || !isNum(v.attackRadius, 18, 160) || !isNum(v.critChance, 0, 0.6)) return null;
  if (!Array.isArray(v.buffs) || v.buffs.length > 24 || !v.buffs.every((buff) => isStr(buff, 80))) return null;
  return {
    ...base,
    moveName: v.moveName,
    moveCategory: v.moveCategory,
    moveEffect: v.moveEffect,
    projectileSpeed: v.projectileSpeed,
    projectileSize: v.projectileSize,
    shots: v.shots,
    pierce: v.pierce,
    attackRange: v.attackRange,
    attackRadius: v.attackRadius,
    critChance: v.critChance,
    buffs: [...v.buffs],
  };
}

export function parseSvTeam(v: unknown): SvMonSpec[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > SV_MAX_TEAM) return null;
  const out: SvMonSpec[] = [];
  for (const item of v) {
    const mon = parseSvMon(item);
    if (!mon) return null;
    out.push(mon);
  }
  return new Set(out.map((m) => m.id)).size === out.length ? out : null;
}

function parseWinner(v: unknown): ArenaWinner | null | undefined {
  if (v === null) return null;
  if (v === 0 || v === 1 || v === 'draw') return v;
  return undefined;
}

function parseSideSnap(v: unknown): ArenaSnapshot['sides'][0] | null {
  if (!isObj(v) || !Array.isArray(v.hp) || v.hp.length === 0 || v.hp.length > SV_MAX_TEAM || !v.hp.every((n) => isNum(n, 0, SV_LIMITS.maxHp[1]))) return null;
  if (!isInt(v.active, 0, SV_MAX_TEAM - 1) || !isNum(v.x, 0, SV_ARENA_W) || !isNum(v.y, 0, SV_ARENA_H)) return null;
  if (!isNum(v.fireMs, 0, 5000) || !isNum(v.switchCdMs, 0, 60000) || !isNum(v.shieldMs, 0, 10000)) return null;
  const side: ArenaSnapshot['sides'][0] = { hp: v.hp as number[], active: v.active, x: v.x, y: v.y, fireMs: v.fireMs, switchCdMs: v.switchCdMs, shieldMs: v.shieldMs };
  // Escudo, órbita, Trilha e efeitos: opcionais (um anfitrião mais antigo não manda), mas se vierem têm de estar nos limites.
  const optional: [keyof ArenaSnapshot['sides'][0], number][] = [['guardMs', 3000], ['guardCdMs', 20000], ['orbitAngle', 7], ['trailCharge', 1], ['trailMs', 6000], ['burnMs', 5000], ['slowMs', 5000], ['stunMs', 5000]];
  for (const [key, max] of optional) {
    if (v[key] === undefined) continue;
    if (!isNum(v[key], 0, max)) return null;
    (side as unknown as Record<string, number>)[key] = v[key] as number;
  }
  if (v.attackSwapCdMs !== undefined) {
    if (!isNum(v.attackSwapCdMs, 0, 10000)) return null;
    side.attackSwapCdMs = v.attackSwapCdMs;
  }
  if (v.alt !== undefined) {
    if (!Array.isArray(v.alt) || v.alt.length !== v.hp.length || !v.alt.every((on) => typeof on === 'boolean')) return null;
    side.alt = v.alt as boolean[];
  }
  if (v.trail !== undefined) {
    if (!Array.isArray(v.trail) || v.trail.length > 60) return null;
    const trail: { x: number; y: number }[] = [];
    for (const p of v.trail) {
      if (!isObj(p) || !isNum(p.x, 0, SV_ARENA_W) || !isNum(p.y, 0, SV_ARENA_H)) return null;
      trail.push({ x: p.x, y: p.y });
    }
    side.trail = trail;
  }
  return side;
}

export function parseSvSnapshot(v: unknown): ArenaSnapshot | null {
  if (!isObj(v) || !isInt(v.tick, 0, 1e9) || !isNum(v.timeMs, 0, 1e7) || !isNum(v.countdownMs, 0, 60000)) return null;
  const winner = parseWinner(v.winner);
  if (winner === undefined || !Array.isArray(v.sides) || v.sides.length !== 2 || !Array.isArray(v.shots) || v.shots.length > 160 || !Array.isArray(v.markers) || v.markers.length > 16) return null;
  const a = parseSideSnap(v.sides[0]);
  const b = parseSideSnap(v.sides[1]);
  if (!a || !b) return null;
  const shots: ArenaSnapshot['shots'] = [];
  for (const s of v.shots) {
    if (!isObj(s) || !isInt(s.id, 0, 1e9) || !isSide(s.side) || !isNum(s.x, -100, SV_ARENA_W + 100) || !isNum(s.y, -100, SV_ARENA_H + 100)) return null;
    if (!isNum(s.vx, -1000, 1000) || !isNum(s.vy, -1000, 1000) || !isNum(s.radius, 3, 60) || !isType(s.type)) return null;
    shots.push({ id: s.id, side: s.side, x: s.x, y: s.y, vx: s.vx, vy: s.vy, type: s.type, radius: s.radius });
  }
  const markers: ArenaSnapshot['markers'] = [];
  for (const marker of v.markers) {
    if (!isObj(marker) || !isInt(marker.id, 0, 1e9) || !isSide(marker.side) || !isNum(marker.x, 0, SV_ARENA_W) || !isNum(marker.y, 0, SV_ARENA_H)) return null;
    if (!isNum(marker.radius, 18, 160) || !isType(marker.type) || !isNum(marker.leftMs, 0, 1500)) return null;
    markers.push({ id: marker.id, side: marker.side, x: marker.x, y: marker.y, radius: marker.radius, type: marker.type, leftMs: marker.leftMs });
  }
  return { tick: v.tick, timeMs: v.timeMs, countdownMs: v.countdownMs, winner, sides: [a, b], shots, markers };
}

function parseEvents(v: unknown): ArenaEvent[] | null {
  if (!Array.isArray(v) || v.length > 40) return null;
  const out: ArenaEvent[] = [];
  for (const e of v) {
    if (!isObj(e) || !isSide(e.side)) return null;
    if (e.k === 'hit' && isNum(e.damage, 0, 5000) && isNum(e.mult, 0, 16)) out.push({ k: 'hit', side: e.side, damage: e.damage, mult: e.mult });
    else if (e.k === 'telegraph' && isNum(e.x, 0, SV_ARENA_W) && isNum(e.y, 0, SV_ARENA_H) && isNum(e.radius, 18, 160) && isType(e.type)) out.push({ k: 'telegraph', side: e.side, x: e.x, y: e.y, radius: e.radius, type: e.type });
    else if (e.k === 'faint' && isInt(e.index, 0, SV_MAX_TEAM - 1)) out.push({ k: 'faint', side: e.side, index: e.index });
    else if (e.k === 'switch' && isInt(e.index, 0, SV_MAX_TEAM - 1) && typeof e.forced === 'boolean') out.push({ k: 'switch', side: e.side, index: e.index, forced: e.forced });
    else if (e.k === 'clash' && isNum(e.x, -100, SV_ARENA_W + 100) && isNum(e.y, -100, SV_ARENA_H + 100) && isType(e.a) && isType(e.b)) out.push({ k: 'clash', side: e.side, x: e.x, y: e.y, a: e.a, b: e.b });
    else if (e.k === 'attack' && isInt(e.index, 0, SV_MAX_TEAM - 1)) out.push({ k: 'attack', side: e.side, index: e.index });
    else if (e.k === 'guard') out.push({ k: 'guard', side: e.side });
    else if (e.k === 'block') out.push({ k: 'block', side: e.side });
    else if (e.k === 'cone' && isNum(e.angle, -7, 7) && isNum(e.range, 0, 600)) out.push({ k: 'cone', side: e.side, angle: e.angle, range: e.range });
    else if (e.k === 'pulse' && isNum(e.radius, 0, 400)) out.push({ k: 'pulse', side: e.side, radius: e.radius });
    else if (e.k === 'blink' && isNum(e.x0, 0, SV_ARENA_W) && isNum(e.y0, 0, SV_ARENA_H) && isNum(e.x1, 0, SV_ARENA_W) && isNum(e.y1, 0, SV_ARENA_H)) out.push({ k: 'blink', side: e.side, x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1 });
    else return null;
  }
  return out;
}

/** Lê as mensagens `sv-*` (o `parseMessage` de `wire.ts` entrega o objeto já lido do JSON). */
export function parseSurvivalMessage(v: Record<string, unknown>): SurvivalWireMessage | null {
  switch (v.t) {
    case 'sv-team': {
      const team = parseSvTeam(v.team);
      return team && isStr(v.name, 16) ? { t: 'sv-team', name: v.name, team } : null;
    }
    case 'sv-progress':
      return isInt(v.done, 0, 3) ? { t: 'sv-progress', done: v.done } : null;
    case 'sv-start':
      return { t: 'sv-start' };
    case 'sv-run-ready':
      return isInt(v.index, 0, 2) ? { t: 'sv-run-ready', index: v.index } : null;
    case 'sv-run-go':
      return isInt(v.index, 0, 2) ? { t: 'sv-run-go', index: v.index } : null;
    case 'sv-go':
      return { t: 'sv-go' };
    case 'sv-ready':
      return typeof v.ok === 'boolean' ? { t: 'sv-ready', ok: v.ok } : null;
    case 'sv-input':
      return isInt(v.seq, 0, 1e9) && isNum(v.dx, -1.0001, 1.0001) && isNum(v.dy, -1.0001, 1.0001) && isInt(v.switchTo, -1, SV_MAX_TEAM - 1)
        ? { t: 'sv-input', seq: v.seq, dx: v.dx, dy: v.dy, switchTo: v.switchTo, ...(v.shield === true ? { shield: true } : {}), ...(v.swapAttack === true ? { swapAttack: true } : {}) }
        : null;
    case 'sv-snap': {
      const snap = parseSvSnapshot(v.snap);
      const events = parseEvents(v.events);
      return snap && events ? { t: 'sv-snap', snap, events } : null;
    }
    case 'sv-buff':
      return isStr(v.id, 80) && v.id.length > 0 && isStr(v.name, 40) && v.name.length > 0 && isBuffRarity(v.rarity)
        ? { t: 'sv-buff', id: v.id, name: v.name, rarity: v.rarity }
        : null;
    default:
      return null;
  }
}

export const inputOf = (m: { dx: number; dy: number; switchTo: number; shield?: boolean; swapAttack?: boolean }): ArenaInput => ({ dx: m.dx, dy: m.dy, switchTo: m.switchTo, shield: m.shield === true, swapAttack: m.swapAttack === true });
