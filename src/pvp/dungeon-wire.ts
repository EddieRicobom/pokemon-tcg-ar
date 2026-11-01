import { GEM_KINDS, GEM_SLOTS, LEGENDARY_KINDS, LEGENDARY_SLOT } from '../core/dungeon-gems';
import type { Gem } from '../core/dungeon-gems';
import { POKEMON_TYPES } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';

/**
 * Mensagens do PvP da Masmorra (descida de 4 andares e duelo por turnos). Os dois celulares jogam a mesma semente cada
 * um na sua tela; só o progresso, a equipe final e cada jogada do duelo viajam. Tudo o que chega é dado não confiável:
 * `parseDungeonMessage` confere tipos e limites. O que depende dos dados do app (stats, tipos e arma de cada espécie)
 * nunca vem do fio: quem recebe recalcula pelo número da Pokédex (`pvp/dungeon-roster.ts`).
 *
 * Fica num arquivo à parte, como `box-wire.ts`, e entra em `wire.ts` só pelo prefixo `dd-`.
 */

export const DUEL_MAX_TEAM = 6;

/** Um membro da equipe como o adversário o recebe: só o que não se deduz da espécie. */
export interface WireDuelMember {
  id: string;
  dexId: number;
  name: string;
  hp: number;
  charge: number;
  ammo: PokemonType[];
  gems: (Gem | null)[];
}

export interface WireDuelRoster {
  members: WireDuelMember[];
  fusionCharges: number;
  potions: number;
}

/** Uma jogada do duelo (as coordenadas são do tabuleiro canônico: o anfitrião embaixo). */
export type WireDuelAction =
  | { k: 'move'; x: number; y: number }
  | { k: 'attack'; x: number; y: number }
  | { k: 'switch'; i: number }
  | { k: 'potion' }
  | { k: 'fuse'; a: number; b: number }
  | { k: 'ammo'; m: number; ammo: PokemonType[] }
  | { k: 'end' };

export type DungeonProgressState = 'fighting' | 'cleared' | 'fallen';

export type DungeonWireMessage =
  /** Na escolha do Pokémon inicial: o jogador está pronto para descer. */
  | { t: 'dd-ready'; ready: boolean; name: string }
  /** Anfitrião → convidado: os dois estão prontos; esta é a semente da expedição. */
  | { t: 'dd-start'; seed: number }
  /** Onde o jogador está na descida (só para o indicador do amigo; nunca muda o jogo). */
  | { t: 'dd-prog'; floor: number; state: DungeonProgressState; foes: number }
  /** A equipe final, depois do último andar (também significa «pronto para o duelo»). */
  | { t: 'dd-team'; roster: WireDuelRoster }
  /** Uma jogada do duelo; `seq` conta as jogadas de quem envia e `sum` é o resumo do estado depois dela. */
  | { t: 'dd-act'; seq: number; act: WireDuelAction; sum: number }
  | { t: 'dd-desync' }
  | { t: 'dd-forfeit' };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const TYPES = new Set<string>(POKEMON_TYPES);
const COMMON = new Set<string>(GEM_KINDS);
const LEGENDARY = new Set<string>(LEGENDARY_KINDS);

/** Grau máximo aceito numa gema (quatro andares não passam de 3 ou 4; sobra folga sem abrir a porta para números absurdos). */
export const DUEL_MAX_GEM_TIER = 8;

function parseGem(v: unknown, slot: number): Gem | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isInt(v.id, 0, 1_000_000) || typeof v.kind !== 'string' || typeof v.legendary !== 'boolean') return undefined;
  if (v.legendary !== (slot === LEGENDARY_SLOT)) return undefined;
  if (v.legendary ? !LEGENDARY.has(v.kind) || v.tier !== 1 : !COMMON.has(v.kind) || !isInt(v.tier, 1, DUEL_MAX_GEM_TIER)) return undefined;
  return { id: v.id, kind: v.kind as Gem['kind'], tier: v.tier as number, legendary: v.legendary };
}

export function parseDuelMember(v: unknown): WireDuelMember | null {
  if (!isObj(v) || !isStr(v.id, 80) || v.id.length === 0 || !isInt(v.dexId, 1, 2000) || !isStr(v.name, 40)) return null;
  if (!isInt(v.hp, 0, 20000) || !isInt(v.charge, 0, 500)) return null;
  if (!Array.isArray(v.ammo) || v.ammo.length < 1 || v.ammo.length > 2 || !v.ammo.every((t) => typeof t === 'string' && TYPES.has(t))) return null;
  if (!Array.isArray(v.gems) || v.gems.length !== GEM_SLOTS) return null;
  const gems: (Gem | null)[] = [];
  for (let slot = 0; slot < GEM_SLOTS; slot++) {
    const gem = parseGem(v.gems[slot], slot);
    if (gem === undefined) return null;
    gems.push(gem);
  }
  return { id: v.id, dexId: v.dexId, name: v.name, hp: v.hp, charge: v.charge, ammo: [...(v.ammo as PokemonType[])], gems };
}

export function parseDuelRoster(v: unknown): WireDuelRoster | null {
  if (!isObj(v) || !Array.isArray(v.members) || v.members.length < 1 || v.members.length > DUEL_MAX_TEAM) return null;
  if (!isInt(v.fusionCharges, 0, 50) || !isInt(v.potions, 0, 50)) return null;
  const members: WireDuelMember[] = [];
  for (const m of v.members) {
    const parsed = parseDuelMember(m);
    if (!parsed) return null;
    members.push(parsed);
  }
  return new Set(members.map((m) => m.id)).size === members.length ? { members, fusionCharges: v.fusionCharges, potions: v.potions } : null;
}

export function parseDuelAction(v: unknown): WireDuelAction | null {
  if (!isObj(v) || typeof v.k !== 'string') return null;
  switch (v.k) {
    case 'move':
      return isInt(v.x, 0, 6) && isInt(v.y, 0, 6) ? { k: 'move', x: v.x, y: v.y } : null;
    case 'attack':
      return isInt(v.x, 0, 6) && isInt(v.y, 0, 6) ? { k: 'attack', x: v.x, y: v.y } : null;
    case 'switch':
      return isInt(v.i, 0, DUEL_MAX_TEAM - 1) ? { k: 'switch', i: v.i } : null;
    case 'potion':
      return { k: 'potion' };
    case 'end':
      return { k: 'end' };
    case 'fuse':
      return isInt(v.a, 0, DUEL_MAX_TEAM - 1) && isInt(v.b, 0, DUEL_MAX_TEAM - 1) ? { k: 'fuse', a: v.a, b: v.b } : null;
    case 'ammo':
      return isInt(v.m, 0, DUEL_MAX_TEAM - 1) && Array.isArray(v.ammo) && v.ammo.length >= 1 && v.ammo.length <= 2 && v.ammo.every((t) => typeof t === 'string' && TYPES.has(t))
        ? { k: 'ammo', m: v.m, ammo: [...(v.ammo as PokemonType[])] }
        : null;
    default:
      return null;
  }
}

/** Lê uma mensagem `dd-*` já decodificada do JSON. Devolve null para qualquer coisa fora do formato. */
export function parseDungeonMessage(v: Record<string, unknown>): DungeonWireMessage | null {
  switch (v.t) {
    case 'dd-ready':
      return typeof v.ready === 'boolean' && isStr(v.name, 40) ? { t: 'dd-ready', ready: v.ready, name: v.name } : null;
    case 'dd-start':
      return isInt(v.seed, 0, 0xffffffff) ? { t: 'dd-start', seed: v.seed } : null;
    case 'dd-prog':
      return isInt(v.floor, 1, 99) && (v.state === 'fighting' || v.state === 'cleared' || v.state === 'fallen') && isInt(v.foes, 0, 20)
        ? { t: 'dd-prog', floor: v.floor, state: v.state, foes: v.foes }
        : null;
    case 'dd-team': {
      const roster = parseDuelRoster(v.roster);
      return roster ? { t: 'dd-team', roster } : null;
    }
    case 'dd-act': {
      const act = parseDuelAction(v.act);
      return act && isInt(v.seq, 0, 100000) && isInt(v.sum, 0, 0xffffffff) ? { t: 'dd-act', seq: v.seq, act, sum: v.sum } : null;
    }
    case 'dd-desync':
      return { t: 'dd-desync' };
    case 'dd-forfeit':
      return { t: 'dd-forfeit' };
    default:
      return null;
  }
}
