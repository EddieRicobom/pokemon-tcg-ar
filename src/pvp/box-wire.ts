import type { BattleMove, DataQuality, Fighter, Personality } from '../core/battle';
import { POKEMON_TYPES } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';

/**
 * Mensagens do PvP da Caixa (batalha automática entre dois celulares). Cada celular monta os lutadores da própria
 * equipe (dados da PokéAPI e das cartas dele) e manda prontos; o anfitrião sorteia a semente e o modo. Como a
 * simulação é determinística (mesmos lutadores, mesma ordem, mesma semente), os dois celulares veem a mesma luta.
 */

export type BoxPvpMode = '1x1' | '3x3' | '6x6';
export const BOX_PVP_MODES: readonly BoxPvpMode[] = ['1x1', '3x3', '6x6'];
export const BOX_PVP_SIZE: Record<BoxPvpMode, number> = { '1x1': 1, '3x3': 3, '6x6': 6 };
export const BOX_PVP_LABELS_PT: Record<BoxPvpMode, { title: string; hint: string }> = {
  '1x1': { title: '1 contra 1', hint: 'Um Pokémon de cada lado, duelo único.' },
  '3x3': { title: '3 contra 3', hint: 'Três de cada lado, um duelo por vez: quando um cai, entra o próximo.' },
  '6x6': { title: 'Equipe 6 contra 6', hint: 'A equipe inteira, um duelo 1x1 por vez, até alguém ficar sem Pokémon.' },
};

export interface BoxPvpMon {
  /** Id da carta no aparelho de quem manda. */
  id: string;
  name: string;
  /** Id do sprite (Pokédex ou forma) para o outro celular baixar o GIF. */
  sprite: number;
  shiny: boolean;
  fighter: Fighter;
}

export interface BoxPvpTeam {
  name: string;
  /** Id do sprite de treinador (ver `trainer-sprites.ts`). */
  trainer: string;
  mons: BoxPvpMon[];
}

export type BoxWireMessage =
  /** A minha equipe (já com os lutadores prontos). `placed`: a minha caixa já está no chão (dá para ver a luta). */
  | { t: 'cx-team'; team: BoxPvpTeam; placed: boolean }
  /** Anfitrião → convidado: começa. Os lutadores vão na ordem anfitrião, convidado. */
  | { t: 'cx-start'; mode: BoxPvpMode; seed: number; host: number; guest: number };

export const BOX_PVP_MAX = 6;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const TYPES = new Set<string>(POKEMON_TYPES);
const isType = (v: unknown): v is PokemonType => typeof v === 'string' && TYPES.has(v);
const PERSONALITIES = new Set<string>(['agressivo', 'defensivo', 'veloz', 'equilibrado']);
const QUALITIES = new Set<string>(['completo', 'parcial', 'sem-dados']);
const SOURCES = new Set<string>(['carta', 'jogo', 'padrao']);

function parseMove(v: unknown): BattleMove | null {
  if (!isObj(v) || !isStr(v.name, 60) || !isType(v.type) || !isNum(v.power, 0, 300) || !isNum(v.accuracy, 0, 100) || typeof v.special !== 'boolean') return null;
  if (typeof v.source !== 'string' || !SOURCES.has(v.source)) return null;
  return { name: v.name, type: v.type, power: v.power, accuracy: v.accuracy, special: v.special, source: v.source as BattleMove['source'] };
}

/** Lê um lutador vindo do outro celular, com limites (números absurdos ou campos estranhos = recusa). */
export function parseFighter(v: unknown): Fighter | null {
  if (!isObj(v) || !isStr(v.id, 80) || !isStr(v.name, 60)) return null;
  if (!Array.isArray(v.types) || v.types.length > 2 || !v.types.every(isType)) return null;
  for (const key of ['maxHp', 'attack', 'defense', 'spAttack', 'spDefense', 'speed'] as const) if (!isNum(v[key], 1, 1500)) return null;
  if (!Array.isArray(v.moves) || v.moves.length === 0 || v.moves.length > 8) return null;
  const moves: BattleMove[] = [];
  for (const m of v.moves) {
    const parsed = parseMove(m);
    if (!parsed) return null;
    moves.push(parsed);
  }
  if (typeof v.personality !== 'string' || !PERSONALITIES.has(v.personality) || typeof v.quality !== 'string' || !QUALITIES.has(v.quality)) return null;
  const notes = Array.isArray(v.notes) ? v.notes.filter((n): n is string => isStr(n, 120)).slice(0, 6) : [];
  return {
    id: v.id, name: v.name, types: v.types as PokemonType[],
    maxHp: v.maxHp as number, attack: v.attack as number, defense: v.defense as number, spAttack: v.spAttack as number, spDefense: v.spDefense as number, speed: v.speed as number,
    moves, personality: v.personality as Personality, quality: v.quality as DataQuality, notes,
    ...(isNum(v.bond, 0, 4) && Number.isInteger(v.bond) ? { bond: v.bond } : {}),
  };
}

function parseTeam(v: unknown): BoxPvpTeam | null {
  if (!isObj(v) || !isStr(v.name, 40) || !isStr(v.trainer, 40) || !Array.isArray(v.mons) || v.mons.length === 0 || v.mons.length > BOX_PVP_MAX) return null;
  const mons: BoxPvpMon[] = [];
  for (const m of v.mons) {
    if (!isObj(m) || !isStr(m.id, 80) || !isStr(m.name, 60) || !isNum(m.sprite, 1, 100000) || !Number.isInteger(m.sprite) || typeof m.shiny !== 'boolean') return null;
    const fighter = parseFighter(m.fighter);
    if (!fighter) return null;
    mons.push({ id: m.id, name: m.name, sprite: m.sprite, shiny: m.shiny, fighter });
  }
  return { name: v.name, trainer: v.trainer, mons };
}

/** Lê as mensagens do PvP da Caixa (`t` começa com "cx-"). Devolve null para o que não for válido. */
export function parseBoxMessage(v: Record<string, unknown>): BoxWireMessage | null {
  if (v.t === 'cx-team') {
    const team = parseTeam(v.team);
    return team && typeof v.placed === 'boolean' ? { t: 'cx-team', team, placed: v.placed } : null;
  }
  if (v.t === 'cx-start') {
    if (typeof v.mode !== 'string' || !(BOX_PVP_MODES as readonly string[]).includes(v.mode)) return null;
    if (!isNum(v.seed, 0, 2 ** 32) || !Number.isInteger(v.seed)) return null;
    if (!isNum(v.host, 1, BOX_PVP_MAX) || !isNum(v.guest, 1, BOX_PVP_MAX) || !Number.isInteger(v.host) || !Number.isInteger(v.guest)) return null;
    return { t: 'cx-start', mode: v.mode as BoxPvpMode, seed: v.seed, host: v.host, guest: v.guest };
  }
  return null;
}

/** Quantos de cada lado lutam no modo (limitado ao que cada um tem). */
export function sideSizes(mode: BoxPvpMode, host: number, guest: number): { host: number; guest: number } {
  const size = BOX_PVP_SIZE[mode];
  return { host: Math.max(0, Math.min(size, host)), guest: Math.max(0, Math.min(size, guest)) };
}

/**
 * Lutadores na ordem da simulação (anfitrião primeiro), com ids únicos (as duas pessoas podem ter a mesma carta) e o
 * plano: equipes 0 (anfitrião) e 1 (convidado), em revezamento.
 */
export function boxPvpBattle(host: BoxPvpTeam, guest: BoxPvpTeam, counts: { host: number; guest: number }) {
  const h = host.mons.slice(0, counts.host).map((m) => ({ ...m, fighter: { ...m.fighter, id: `h:${m.fighter.id}` } }));
  const g = guest.mons.slice(0, counts.guest).map((m) => ({ ...m, fighter: { ...m.fighter, id: `g:${m.fighter.id}` } }));
  const mons = [...h, ...g];
  return {
    mons,
    fighters: mons.map((m) => m.fighter),
    plan: {
      picks: mons.map((_, i) => i),
      teams: mons.map((_, i) => (i < h.length ? 0 : 1)),
      relay: true,
      teamNames: [host.name, guest.name],
      banner: { text: `${host.name} contra ${guest.name}!`, sub: `${h.length} contra ${g.length}, um duelo por vez` },
    },
  };
}
