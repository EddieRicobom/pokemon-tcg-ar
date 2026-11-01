import { seededRng } from './battle';
import {
  attack, attackArea, attacker, attackReach, attacksLeft, attackTargets, autoCover, damage, defenseOf, fielded, fuse, GRID_H, GRID_W, hurtTeam, key, move,
  previewAttack, previewFusion, reachable, recoverTeam, setAmmo, switchTo, tickFusion, turnAp, usePotion,
} from './dungeon';
import type { ActionResult, Attacker, Cell, DamagePart, DungeonState, Enemy, Member } from './dungeon';
import { DUNGEON_BIOMES } from './dungeon-biomes';
import type { PokemonType } from './pokemon-data';

/**
 * Duelo da Masmorra (PvP): depois de descer {@link DUEL_FLOORS} andares, cada jogador entra na mesma sala 7×7 com a equipe
 * que montou (vida e carga como terminaram o último andar) e os dois se alternam em turnos de PA, com as armas, cargas,
 * trocas, poções e fusões de sempre. Quem fica sem Pokémon de pé perde.
 *
 * Tudo aqui é puro e determinístico: os dois celulares partem do mesmo `DuelState` (mesma semente, mesmas equipes) e
 * aplicam cada jogada com as mesmas funções, então só a jogada viaja pela rede. O anfitrião é o lado 0 (embaixo no
 * mundo canônico) e o convidado o lado 1; a tela do convidado gira o tabuleiro 180° para ele se ver embaixo.
 *
 * As regras de golpe, alcance, mecanismos e gemas são as da expedição: cada ação monta uma «visão» `DungeonState` do
 * lado que joga, com o Pokémon em campo do adversário no papel de único inimigo (um alvo com a defesa e os tipos dele,
 * sem morrer), roda a função da expedição e devolve o dano à equipe do adversário (bloqueio, Fênix, fusão e quedas
 * seguem `hurtTeam`). Sem moedas, XP nem gemas no fim: o duelo não rende prêmio.
 */

export const DUEL_FLOORS = 4;
/** Fração do dano da expedição aplicada no duelo: dá tempo de usar troca e fusão antes de alguém cair. */
export const DUEL_DAMAGE = 0.7;
/** Limite de rodadas: depois dele vence quem tem mais vida (em %) ou há empate. */
export const DUEL_MAX_ROUNDS = 30;
/** Pontos de vida do «inimigo» que representa o adversário: grande demais para morrer no meio de um golpe. */
const PROXY_HP = 1_000_000;

export type Side = 0 | 1;
export const SIDES: readonly Side[] = [0, 1];
export const other = (side: Side): Side => (side === 0 ? 1 : 0);
/** Onde cada lado começa: o anfitrião embaixo, o convidado em cima. */
export const DUEL_SPAWN: readonly [Cell, Cell] = [{ x: 3, y: GRID_H - 1 }, { x: 3, y: 0 }];
/** A casa vista do outro lado do tabuleiro (giro de 180°). */
export const mirrorCell = (c: Cell): Cell => ({ x: GRID_W - 1 - c.x, y: GRID_H - 1 - c.y });

const same = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;
const dist = (a: Cell, b: Cell): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const inside = (c: Cell): boolean => Number.isInteger(c.x) && Number.isInteger(c.y) && c.x >= 0 && c.y >= 0 && c.x < GRID_W && c.y < GRID_H;
const fail = (reason: string): ActionResult => ({ ok: false, reason });

export interface DuelSide {
  team: Member[];
  active: number;
  pos: Cell;
  fusion: DungeonState['fusion'];
  fusionCharges: number;
  potions: number;
  /** O ativo caiu ou esgotou: a próxima troca é gratuita. */
  mustSwitch: boolean;
  /** Bloqueio para o próximo golpe recebido (dura até acabar o turno do adversário). */
  guard: { reduce: number; counter: number };
  /** Armadilhas que este lado instalou: disparam em quem o adversário colocar na casa. */
  traps: DungeonState['traps'];
  /** Ataques deste lado no turno (mecanismo Sequência). */
  combo: number;
  /** Defesa abalada pelo golpe do adversário, até o fim do turno dele. */
  shaken: boolean;
  burn: { amount: number; rounds: number } | null;
}

export type DuelReason = 'down' | 'forfeit' | 'left' | 'rounds' | 'draw' | 'desync';

export interface DuelLine { side: Side; text: string }

export interface DuelState {
  seed: number;
  /** Geração do cenário (0–8), sorteada pela semente. */
  biome: number;
  round: number;
  /** Quem começou: a rodada conta quando a vez volta para ele. */
  first: Side;
  turn: Side;
  ap: number;
  phase: 'duel' | 'over';
  winner: Side | null;
  reason: DuelReason | null;
  walls: Cell[];
  barriers: { pos: Cell; rounds: number }[];
  sides: [DuelSide, DuelSide];
  rollCount: number;
  log: DuelLine[];
}

export interface DuelRoster { members: Member[]; fusionCharges: number; potions: number }

export type DuelAction =
  | { k: 'move'; x: number; y: number }
  | { k: 'attack'; x: number; y: number }
  | { k: 'switch'; i: number }
  | { k: 'potion' }
  | { k: 'fuse'; a: number; b: number }
  | { k: 'ammo'; m: number; ammo: PokemonType[] }
  | { k: 'end' };

// ----------------------------------------------------------------------------- criação

/** Todas as casas livres se alcançam a partir do início de um lado (e do outro). */
function connected(walls: readonly Cell[]): boolean {
  const wall = new Set(walls.map(key));
  const seen = new Set<string>([key(DUEL_SPAWN[0])]);
  const queue: Cell[] = [DUEL_SPAWN[0]];
  while (queue.length) {
    const c = queue.shift()!;
    for (const d of [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]) {
      const n = { x: c.x + d.x, y: c.y + d.y };
      if (!inside(n) || wall.has(key(n)) || seen.has(key(n))) continue;
      seen.add(key(n));
      queue.push(n);
    }
  }
  return seen.size === GRID_W * GRID_H - wall.size;
}

/** Pilares em pares espelhados (180°), para o tabuleiro ser justo para os dois lados. Nunca isolam uma casa. */
export function duelWalls(seed: number): Cell[] {
  const rng = seededRng((seed ^ 0xd0e1) >>> 0);
  const walls: Cell[] = [];
  const pairs = 3 + Math.floor(rng() * 3);
  for (let tries = 0, made = 0; made < pairs && tries < 80; tries++) {
    const c = { x: Math.floor(rng() * GRID_W), y: 1 + Math.floor(rng() * 3) };
    const m = mirrorCell(c);
    if (same(c, m) || walls.some((w) => same(w, c) || same(w, m))) continue;
    walls.push(c, m);
    if (connected(walls)) made++;
    else { walls.pop(); walls.pop(); }
  }
  return walls;
}

function sideOf(roster: DuelRoster, spawn: Cell): DuelSide {
  const members = roster.members;
  for (const m of members) {
    m.phoenixUsed = false;
    m.cooldown = 0;
    m.status = m.hp > 0 ? 'ready' : 'down';
  }
  const lead = members.findIndex((m) => m.hp > 0 && m.charge > 0);
  return {
    team: members, active: lead >= 0 ? lead : Math.max(0, members.findIndex((m) => m.hp > 0)), pos: { ...spawn }, fusion: null,
    fusionCharges: roster.fusionCharges, potions: roster.potions, mustSwitch: false, guard: { reduce: 0, counter: 0 }, traps: [], combo: 0, shaken: false, burn: null,
  };
}

/** Começa o duelo: as duas equipes (já montadas) no tabuleiro. Lança erro se uma das equipes não tem ninguém de pé. */
export function startDuel(seed: number, hostRoster: DuelRoster, guestRoster: DuelRoster): DuelState {
  for (const r of [hostRoster, guestRoster]) {
    if (r.members.length === 0 || !r.members.some((m) => m.hp > 0)) throw new Error('Cada equipe precisa de ao menos um Pokémon de pé.');
  }
  const first: Side = (seed >>> 4) & 1 ? 1 : 0;
  const d: DuelState = {
    seed: seed >>> 0, biome: (seed >>> 0) % DUNGEON_BIOMES.length, round: 1, first, turn: first, ap: 0, phase: 'duel', winner: null, reason: null,
    walls: duelWalls(seed), barriers: [], sides: [sideOf(hostRoster, DUEL_SPAWN[0]), sideOf(guestRoster, DUEL_SPAWN[1])], rollCount: 0, log: [],
  };
  d.ap = turnAp(bareView(d, first));
  d.log.push({ side: first, text: 'O duelo começa!' });
  return d;
}

// ----------------------------------------------------------------------------- visões

/** O lado como uma expedição de um jogador só (compartilha equipe e armadilhas com o duelo; sem inimigos). */
function bareView(d: DuelState, side: Side): DungeonState {
  const a = d.sides[side];
  return {
    seed: d.seed, floor: DUEL_FLOORS + 1, round: d.round, ap: side === d.turn && d.phase === 'duel' ? d.ap : 0, phase: 'player', team: a.team, active: a.active, pos: a.pos,
    enemies: [], walls: d.walls, loot: [], stairs: null, bag: [], fusion: a.fusion, fusionCharges: a.fusionCharges, potions: a.potions, mustSwitch: a.mustSwitch,
    log: [], nextUid: 2, nextGemId: 1, rollCount: d.rollCount, rewardOptions: [], bossThreat: null, turnQueue: [], pool: [],
    stats: { kills: 0, gems: 0, legendaries: 0, deepest: 1, elites: 0, bosses: 0 }, guard: a.guard, barriers: d.barriers, traps: a.traps, combo: a.combo,
    biome: d.biome, hazards: [],
  };
}

/** Quem o adversário tem em campo, no papel de inimigo: defesa e tipos de quem está em campo (a fusão faz a média). */
function proxyFor(d: DuelState, foe: Side): Enemy {
  const f = d.sides[foe];
  const v = bareView(d, foe);
  const mons = fielded(v);
  const lead = mons[0]!;
  const phys = defenseOf(v, 'physical');
  const spec = defenseOf(v, 'special');
  return {
    uid: 1, dexId: lead.dexId, name: v.fusion ? v.fusion.name : lead.name, types: phys.types, stats: { hp: 1, attack: 1, defense: phys.def, spAttack: 1, spDefense: spec.def, speed: 1 },
    hp: PROXY_HP, maxHp: PROXY_HP, pos: { ...f.pos }, weapon: lead.weapon, boss: false, miniBoss: false, elite: false, profile: 'bruto', affixes: [], atkMul: 1, defMul: 1,
    summoned: false, shaken: f.shaken, burn: f.burn ? { ...f.burn } : null,
  };
}

/** A visão de quem joga: o seu lado e o adversário como único inimigo. Só leitura para a tela; as jogadas a usam por dentro. */
export function duelView(d: DuelState, side: Side): DungeonState {
  const v = bareView(d, side);
  v.enemies = [proxyFor(d, other(side))];
  return v;
}

const sideName = (v: DungeonState): string => (v.fusion ? v.fusion.name : v.team[v.active]?.name ?? '?');

/** O ativo caiu e ninguém está pronto para assumir: o lado continua com quem ainda tem vida (e só se mexe). */
function settleSide(a: DuelSide): void {
  if (!a.team.some((m) => m.hp > 0)) return;
  const current = a.team[a.active];
  if (current && current.hp > 0 && current.status !== 'down') return;
  const pick = a.team.findIndex((m) => m.hp > 0 && m.status === 'ready');
  a.active = pick >= 0 ? pick : a.team.findIndex((m) => m.hp > 0);
  a.mustSwitch = false;
}

/** Devolve ao duelo o que a função da expedição mudou na visão. */
function commit(d: DuelState, side: Side, v: DungeonState, own: { ap?: boolean; shared?: boolean }): void {
  const a = d.sides[side];
  if (v.phase === 'lost') {
    // Na expedição, sem ninguém para assumir a posição a equipe cai; no duelo só cai quem fica sem vida.
    v.phase = 'player';
    v.log = v.log.filter((line) => !line.includes('a expedição terminou'));
  }
  a.active = v.active;
  a.pos = v.pos;
  a.fusion = v.fusion;
  a.fusionCharges = v.fusionCharges;
  a.potions = v.potions;
  a.mustSwitch = v.mustSwitch;
  a.guard = v.guard;
  a.traps = v.traps;
  a.combo = v.combo;
  if (own.ap) d.ap = v.ap;
  if (own.shared) {
    d.rollCount = v.rollCount;
    d.barriers = v.barriers;
  }
  for (const text of v.log) d.log.push({ side, text });
  if (d.log.length > 80) d.log.splice(0, d.log.length - 80);
  settleSide(a);
}

/** Tira vida da equipe de `victim`; quem cai é coberto na hora pelo próximo pronto. Devolve o dano efetivo. */
function hurtSide(d: DuelState, victim: Side, total: number, attackerAt: Cell | null, ignoreGuard = false): number {
  const v = bareView(d, victim);
  const name = sideName(v);
  const saved = v.guard;
  if (ignoreGuard) v.guard = { reduce: 0, counter: 0 };
  let counter = 0;
  const dealt = hurtTeam(v, total, (amount, guard) => {
    v.log.push(`${name} sofre −${amount} HP.`);
    if (guard.reduce > 0) v.log.push('O bloqueio amortece o golpe.');
    if (guard.counter > 0 && attackerAt && dist(attackerAt, v.pos) === 1) counter = guard.counter;
  });
  if (ignoreGuard) v.guard = saved;
  if (v.mustSwitch) autoCover(v);
  commit(d, victim, v, {});
  if (counter > 0 && d.sides[victim].team.some((m) => m.hp > 0)) {
    d.log.push({ side: victim, text: `Revide em ${sideName(bareView(d, other(victim)))}.` });
    hurtSide(d, other(victim), Math.max(1, Math.round(counter * DUEL_DAMAGE)), null);
  }
  return dealt;
}

// ----------------------------------------------------------------------------- fim do duelo

const standing = (a: DuelSide): boolean => a.team.some((m) => m.hp > 0);
const hpShare = (a: DuelSide): number => {
  const max = a.team.reduce((s, m) => s + m.maxHp, 0);
  return max > 0 ? a.team.reduce((s, m) => s + Math.max(0, m.hp), 0) / max : 0;
};

function finish(d: DuelState, winner: Side | null, reason: DuelReason, text: string): void {
  if (d.phase === 'over') return;
  d.phase = 'over';
  d.winner = winner;
  d.reason = reason;
  d.log.push({ side: winner ?? d.turn, text });
}

/** Acaba o duelo se alguém ficou sem Pokémon de pé. */
export function checkOver(d: DuelState): void {
  if (d.phase === 'over') return;
  const alive = d.sides.map(standing);
  if (!alive[0] && !alive[1]) finish(d, null, 'draw', 'Os dois lados caíram juntos: empate.');
  else if (!alive[0]) finish(d, 1, 'down', 'Todos os Pokémon do anfitrião caíram.');
  else if (!alive[1]) finish(d, 0, 'down', 'Todos os Pokémon do convidado caíram.');
}

/** Desistência ou desconexão: o outro lado vence. */
export function concede(d: DuelState, loser: Side, reason: 'forfeit' | 'left' | 'desync'): void {
  if (reason === 'desync') return finish(d, null, 'desync', 'Os dois jogos não bateram mais: o duelo foi encerrado sem vencedor.');
  finish(d, other(loser), reason, reason === 'forfeit' ? 'Desistência.' : 'O adversário saiu do duelo.');
}

// ----------------------------------------------------------------------------- jogadas

function springTrap(d: DuelState, victim: Side): void {
  const foe = d.sides[other(victim)];
  const me = d.sides[victim];
  const trap = foe.traps.find((t) => same(t.pos, me.pos));
  if (!trap) return;
  foe.traps = foe.traps.filter((t) => t !== trap);
  const { def, types } = defenseOf(bareView(d, victim), trap.kind);
  const total = Math.max(1, Math.round(damage(trap.power, trap.atk, def, trap.ammo, trap.types, types).total * DUEL_DAMAGE));
  d.log.push({ side: other(victim), text: 'Uma armadilha é acionada!' });
  hurtSide(d, victim, total, null);
}

function strike(d: DuelState, me: Side, target: Cell): ActionResult {
  const foeSide = other(me);
  const v = duelView(d, me);
  const proxy = v.enemies[0]!;
  const r = attack(v, target);
  if (!r.ok) return r;
  const raw = PROXY_HP - proxy.hp;
  const foe = d.sides[foeSide];
  foe.pos = { ...proxy.pos };
  foe.shaken = proxy.shaken;
  foe.burn = proxy.burn ? { ...proxy.burn } : null;
  const from = { ...v.pos };
  // Os números do golpe contra o «inimigo» são do alvo sem a redução do duelo: quem conta é a linha de dano de `hurtSide`.
  v.log = v.log.filter((line) => !/−\d+ HP\./.test(line));
  commit(d, me, v, { ap: true, shared: true });
  if (raw > 0) hurtSide(d, foeSide, Math.max(1, Math.round(raw * DUEL_DAMAGE)), from);
  return { ok: true };
}

/**
 * Aplica a jogada de `side`. Tudo o que chega do adversário passa por aqui: vez, tipos, limites e regras são conferidos,
 * e uma jogada ilegal devolve `{ ok: false }` sem mudar nada.
 */
export function applyAction(d: DuelState, side: Side, act: DuelAction): ActionResult {
  if (d.phase !== 'duel') return fail('O duelo terminou.');
  if (d.turn !== side) return fail('Não é a vez deste lado.');
  const me = d.sides[side];
  const int = (n: unknown, lo: number, hi: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;
  let result: ActionResult;
  switch (act.k) {
    case 'move': {
      if (!int(act.x, 0, GRID_W - 1) || !int(act.y, 0, GRID_H - 1)) return fail('Casa fora do tabuleiro.');
      const v = duelView(d, side);
      result = move(v, { x: act.x, y: act.y });
      if (!result.ok) return result;
      commit(d, side, v, { ap: true, shared: true });
      springTrap(d, side);
      break;
    }
    case 'attack': {
      if (!int(act.x, 0, GRID_W - 1) || !int(act.y, 0, GRID_H - 1)) return fail('Casa fora do tabuleiro.');
      result = strike(d, side, { x: act.x, y: act.y });
      if (!result.ok) return result;
      break;
    }
    case 'switch': {
      if (!int(act.i, 0, me.team.length - 1)) return fail('Pokémon da equipe não encontrado.');
      const v = duelView(d, side);
      result = switchTo(v, act.i);
      if (!result.ok) return result;
      commit(d, side, v, { ap: true });
      break;
    }
    case 'potion': {
      const v = duelView(d, side);
      result = usePotion(v);
      if (!result.ok) return result;
      commit(d, side, v, { ap: true });
      break;
    }
    case 'fuse': {
      if (!int(act.a, 0, me.team.length - 1) || !int(act.b, 0, me.team.length - 1)) return fail('Escolha dois membros da equipe.');
      const v = duelView(d, side);
      result = fuse(v, act.a, act.b);
      if (!result.ok) return result;
      commit(d, side, v, { ap: true });
      break;
    }
    case 'ammo': {
      if (!int(act.m, 0, me.team.length - 1) || !Array.isArray(act.ammo)) return fail('Munição inválida.');
      const v = duelView(d, side);
      result = setAmmo(v, act.m, act.ammo);
      if (!result.ok) return result;
      commit(d, side, v, {});
      break;
    }
    case 'end': {
      if (me.mustSwitch) return fail('Escolha quem assume a posição.');
      result = endDuelTurn(d);
      break;
    }
    default:
      return fail('Jogada desconhecida.');
  }
  checkOver(d);
  return result;
}

/** Fecha o turno de quem joga: fusão, recuperação, queimadura no adversário; passa a vez e dá os PA do próximo. */
export function endDuelTurn(d: DuelState): ActionResult {
  if (d.phase !== 'duel') return fail('O duelo terminou.');
  const cur = d.turn;
  const next = other(cur);
  const foe = d.sides[next];
  const v = bareView(d, cur);
  tickFusion(v);
  recoverTeam(v);
  v.combo = 0;
  commit(d, cur, v, { shared: true });
  foe.shaken = false;
  foe.guard = { reduce: 0, counter: 0 };
  if (foe.burn) {
    const amount = Math.max(1, Math.round(foe.burn.amount * DUEL_DAMAGE));
    if (--foe.burn.rounds <= 0) foe.burn = null;
    d.log.push({ side: cur, text: 'A queimadura castiga o adversário.' });
    hurtSide(d, next, amount, null, true);
  }
  checkOver(d);
  if (d.phase === 'over') return { ok: true };
  d.turn = next;
  if (next === d.first) {
    d.round++;
    d.barriers = d.barriers.filter((b) => --b.rounds > 0);
    if (d.round > DUEL_MAX_ROUNDS) {
      const a = hpShare(d.sides[0]);
      const b = hpShare(d.sides[1]);
      const winner: Side | null = Math.abs(a - b) < 1e-9 ? null : a > b ? 0 : 1;
      finish(d, winner, winner === null ? 'draw' : 'rounds', winner === null ? `Limite de ${DUEL_MAX_ROUNDS} rodadas: empate.` : `Limite de ${DUEL_MAX_ROUNDS} rodadas: vence quem tem mais vida.`);
      return { ok: true };
    }
  }
  d.ap = turnAp(bareView(d, next));
  d.sides[next].combo = 0;
  d.log.push({ side: next, text: `Vez do ${next === 0 ? 'anfitrião' : 'convidado'}.` });
  return { ok: true };
}

// ----------------------------------------------------------------------------- leitura (a tela e a prévia)

/** Casas a que o lado chega a pé neste turno (vazio fora da vez). */
export function duelReachable(d: DuelState, side: Side): Map<string, number> {
  if (d.phase !== 'duel' || d.turn !== side) return new Map();
  return reachable(duelView(d, side));
}

export function duelTargets(d: DuelState, side: Side): Cell[] {
  return d.phase === 'duel' && d.turn === side ? attackTargets(duelView(d, side)) : [];
}

export function duelArea(d: DuelState, side: Side, target: Cell): Cell[] {
  return attackArea(duelView(d, side), target);
}

export function duelReach(d: DuelState, side: Side): Cell[] {
  return attackReach(duelView(d, side));
}

export function duelAttacker(d: DuelState, side: Side): Attacker {
  return attacker(duelView(d, side));
}

export function duelAttacksLeft(d: DuelState, side: Side): { count: number; limit: 'ap' | 'charge' } {
  return attacksLeft(duelView(d, side));
}

export interface DuelPreview { damage: number; parts: DamagePart[]; target: string; ap: number; cost: number; reason: string | null; trap: boolean }

export function duelPreview(d: DuelState, side: Side, target: Cell): DuelPreview {
  const v = duelView(d, side);
  const p = previewAttack(v, target);
  const hit = p.hits[0];
  const reason = d.phase !== 'duel' ? 'O duelo terminou.' : d.turn !== side ? 'Não é a sua vez.' : p.reason === 'Nenhum inimigo nessa mira.' ? 'Nada do adversário nessa mira.' : p.reason;
  return {
    damage: hit ? Math.max(1, Math.round(hit.damage * DUEL_DAMAGE)) : 0, parts: hit?.parts ?? [], target: hit?.enemy.name ?? '', ap: p.ap, cost: p.cost, reason, trap: p.trap,
  };
}

export function duelFusionPreview(d: DuelState, side: Side, a: number, b: number): ReturnType<typeof previewFusion> {
  return previewFusion(duelView(d, side), a, b);
}

/** Soma de vida em % (0–1) de cada equipe, para a barra do adversário. */
export const duelHpShare = hpShare;

// ----------------------------------------------------------------------------- conferência entre os dois celulares

/** Resumo do estado que os dois celulares comparam depois de cada jogada: se não bate, os jogos divergiram. */
export function duelDigest(d: DuelState): number {
  const parts: (string | number)[] = [d.turn, d.round, d.ap, d.rollCount, d.phase, d.winner ?? -1, d.barriers.length];
  for (const s of d.sides) {
    parts.push(s.pos.x, s.pos.y, s.active, s.potions, s.fusionCharges, s.mustSwitch ? 1 : 0, s.traps.length, s.fusion ? s.fusion.turnsLeft * 100 + s.fusion.charge : -1, s.burn?.rounds ?? -1, s.guard.reduce, s.shaken ? 1 : 0);
    for (const m of s.team) parts.push(m.hp, m.charge, m.status, m.cooldown);
  }
  let h = 0x811c9dc5;
  const text = parts.join(',');
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
