import { typeEffectiveness } from './battle';
import type { PokemonType } from './pokemon-data';
import { statsOfDex } from './survivor-stats';
import type { MoveCategory, MoveEffect } from './survivor-moves';

/**
 * PvP do Survival: 3 runs de 2 minutos rendem 3 Pokémon, e as duas equipes 3x3 lutam numa arena em tempo real.
 * Tudo aqui é puro e determinístico (sem relógio, sem sorteio): o anfitrião roda `stepArena` com as entradas dos dois e
 * o convidado só adota os instantâneos (`applyArenaSnapshot`). Dado que falta aparece como falta: sem stats da espécie
 * o Pokémon entra com números médios e `estimated: true` (a tela avisa).
 */

export const SV_RUNS = 3;
export const SV_RUN_MS = 120_000;
export const SV_TEAM_SIZE = 3;

export const SV_ARENA_W = 320;
export const SV_ARENA_H = 480;
export const SV_MON_RADIUS = 18;
export const SV_SHOT_RADIUS = 6;
export const SV_SHOT_SPEED = 250;
/** A mesma duração-base do projétil da corrida; alcance vem da velocidade real do golpe. */
export const SV_SHOT_LIFE_MS = 1600;
/** Área e golpes que travam no alvo avisam no chão antes de acertar. */
export const SV_TELEGRAPH_MS = 1500;
/** Recarga entre trocas voluntárias (a troca forçada por desmaio não paga recarga). */
export const SV_SWITCH_COOLDOWN_MS = 5000;
/** Quem entra fica protegido por um instante, para a troca nunca virar uma armadilha. */
export const SV_ENTRY_SHIELD_MS = 1200;
export const SV_COUNTDOWN_MS = 3000;
/** Depois disso o Pokémon em campo perde vida sozinho, para a luta sempre terminar. */
export const SV_SUDDEN_DEATH_MS = 90_000;
export const SV_SUDDEN_DRAIN_PER_S = 0.06;
export const SV_MAX_MS = 170_000;
/** Intervalo entre instantâneos do anfitrião (~15 Hz). */
export const SV_SNAPSHOT_MS = 66;
export const SV_MAX_DT_MS = 60;

export const SV_LIMITS = {
  maxHp: [20, 1500],
  power: [1, 150],
  speed: [40, 220],
  fireMs: [250, 2000],
  score: [0, 100],
} as const;

const AVERAGE_STATS = { hp: 70, attack: 70, defense: 70, spAttack: 70, spDefense: 70, speed: 70 };

// ----------------------------------------------------------------------------- da run para o Pokémon

/** O que uma run de 2 minutos entrega. */
export interface SvRunResult {
  /** Id da carta ou do Digital Pokémon no aparelho de quem jogou. */
  id: string;
  dexId: number;
  name: string;
  shiny: boolean;
  types: PokemonType[];
  /** Tipo do golpe usado na run (o que ele dispara na arena). */
  attackType: PokemonType;
  survivedMs: number;
  kills: number;
  level: number;
  /** A run acabou porque o Pokémon caiu, antes dos 2 minutos. */
  defeated: boolean;
  /** Foto dos atributos conquistados na run. Ela evita que buffs e a forma do golpe sumam ao entrar na arena. */
  combat?: SvCombatProfile;
}

/** A parte da corrida que muda de verdade o combate da arena. */
export interface SvCombatProfile {
  moveName: string;
  category: MoveCategory;
  effect: MoveEffect;
  maxHp: number;
  power: number;
  speed: number;
  cooldownMs: number;
  projectileSpeed: number;
  projectileSize: number;
  shots: number;
  pierce: number;
  attackRange: number;
  attackRadius: number;
  critChance: number;
  /** Cartas escolhidas: vão junto para a arena e ficam legíveis na equipe. */
  buffs: string[];
}

/** O Pokémon como vai pelo fio e entra na arena. */
export interface SvMonSpec {
  id: string;
  name: string;
  dexId: number;
  shiny: boolean;
  types: PokemonType[];
  attackType: PokemonType;
  maxHp: number;
  /** Dano de cada golpe, antes da vantagem de tipo. */
  power: number;
  /** Unidades da arena por segundo. */
  speed: number;
  /** Tempo entre golpes. */
  fireMs: number;
  /** Nota da run (0–100). */
  score: number;
  /** Sem stats reais da espécie: números médios. */
  estimated: boolean;
  moveName?: string;
  moveCategory?: MoveCategory;
  moveEffect?: MoveEffect;
  projectileSpeed?: number;
  projectileSize?: number;
  shots?: number;
  pierce?: number;
  attackRange?: number;
  attackRadius?: number;
  critChance?: number;
  buffs?: string[];
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** Nota 0–100: tempo vivo, vitórias e nível. Monótona em cada parte. */
export function svRunScore(r: Pick<SvRunResult, 'survivedMs' | 'kills' | 'level'>): number {
  return clamp(Math.round(Math.max(0, r.survivedMs) / 2000 + Math.max(0, r.kills) * 0.4 + Math.max(0, r.level) * 2), 0, 100);
}

/** Vida, dano, velocidade e ritmo de golpe vêm dos stats reais da espécie; a nota da run dá até +30%. */
export function svMonFromRun(r: SvRunResult, id: string): SvMonSpec {
  const real = statsOfDex(r.dexId);
  const s = real ?? AVERAGE_STATS;
  const score = svRunScore(r);
  const bonus = 1 + (score / 100) * 0.3;
  const c = r.combat;
  if (c) {
    return {
      id,
      name: r.name,
      dexId: r.dexId,
      shiny: r.shiny,
      types: [...r.types],
      attackType: r.attackType,
      maxHp: Math.round(clamp(c.maxHp, ...SV_LIMITS.maxHp)),
      power: Math.round(clamp(c.power, ...SV_LIMITS.power)),
      // A arena é maior e precisa responder logo ao arrasto. O bônus mantém entre os Pokémon a diferença conquistada na run.
      speed: Math.round(clamp(c.speed * 1.35, ...SV_LIMITS.speed)),
      fireMs: Math.round(clamp(c.cooldownMs, ...SV_LIMITS.fireMs)),
      score,
      estimated: real === null,
      moveName: c.moveName,
      moveCategory: c.category,
      moveEffect: c.effect,
      projectileSpeed: clamp(c.projectileSpeed, 120, 700),
      projectileSize: clamp(c.projectileSize, 3, 18),
      shots: Math.round(clamp(c.shots, 1, 5)),
      pierce: Math.round(clamp(c.pierce, 0, 4)),
      attackRange: clamp(c.attackRange, 40, 360),
      attackRadius: clamp(c.attackRadius, 18, 160),
      critChance: clamp(c.critChance, 0, 0.6),
      buffs: [...c.buffs].slice(0, 24),
    };
  }
  return {
    id,
    name: r.name,
    dexId: r.dexId,
    shiny: r.shiny,
    types: [...r.types],
    attackType: r.attackType,
    maxHp: Math.round(clamp((60 + s.hp * 1.4 + (s.defense + s.spDefense) * 0.25) * bonus, ...SV_LIMITS.maxHp)),
    power: Math.round(clamp((6 + Math.max(s.attack, s.spAttack) * 0.12) * bonus, ...SV_LIMITS.power)),
    speed: Math.round(clamp(70 + s.speed * 0.5, ...SV_LIMITS.speed)),
    fireMs: Math.round(clamp(900 - s.speed * 2, 450, 1100)),
    score,
    estimated: real === null,
  };
}

// ----------------------------------------------------------------------------- arena

export type ArenaSide = 0 | 1;
export type ArenaWinner = ArenaSide | 'draw';

export interface ArenaMon extends SvMonSpec {
  hp: number;
}

export interface ArenaTeamState {
  mons: ArenaMon[];
  /** Quem está em campo. */
  active: number;
  x: number;
  y: number;
  /** Tempo até o próximo golpe. */
  fireMs: number;
  /** Tempo até poder trocar de novo por vontade própria. */
  switchCdMs: number;
  /** Proteção de quem acabou de entrar. */
  shieldMs: number;
}

export interface ArenaShot {
  id: number;
  side: ArenaSide;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  type: PokemonType;
  ageMs: number;
  radius: number;
  pierce: number;
}

/** Aviso persistente no chão; só resolve o dano quando a contagem chega a zero. */
export interface ArenaMarker {
  id: number;
  side: ArenaSide;
  x: number;
  y: number;
  radius: number;
  damage: number;
  type: PokemonType;
  leftMs: number;
}

export interface ArenaState {
  timeMs: number;
  countdownMs: number;
  sides: [ArenaTeamState, ArenaTeamState];
  shots: ArenaShot[];
  markers: ArenaMarker[];
  nextShotId: number;
  winner: ArenaWinner | null;
}

export interface ArenaInput {
  /** Direção desejada (−1 a 1 em cada eixo; vetores maiores que 1 são reduzidos). */
  dx: number;
  dy: number;
  /** Índice do Pokémon que o jogador quer em campo, ou −1. */
  switchTo: number;
}

export const NO_INPUT: ArenaInput = { dx: 0, dy: 0, switchTo: -1 };

export type ArenaEvent =
  | { k: 'hit'; side: ArenaSide; damage: number; mult: number }
  | { k: 'telegraph'; side: ArenaSide; x: number; y: number; radius: number; type: PokemonType }
  | { k: 'faint'; side: ArenaSide; index: number }
  | { k: 'switch'; side: ArenaSide; index: number; forced: boolean };

const startPosition = (side: ArenaSide): { x: number; y: number } => ({ x: SV_ARENA_W / 2, y: side === 0 ? SV_ARENA_H - 90 : 90 });

function teamState(side: ArenaSide, specs: readonly SvMonSpec[]): ArenaTeamState {
  const { x, y } = startPosition(side);
  return { mons: specs.map((s) => ({ ...s, types: [...s.types], hp: s.maxHp })), active: 0, x, y, fireMs: 600, switchCdMs: 0, shieldMs: 0 };
}

/** Lado 0 = anfitrião (embaixo), lado 1 = convidado (em cima). */
export function createArena(host: readonly SvMonSpec[], guest: readonly SvMonSpec[]): ArenaState {
  return { timeMs: 0, countdownMs: SV_COUNTDOWN_MS, sides: [teamState(0, host), teamState(1, guest)], shots: [], markers: [], nextShotId: 1, winner: null };
}

export const aliveCount = (team: ArenaTeamState): number => team.mons.filter((m) => m.hp > 0).length;
export const activeMon = (team: ArenaTeamState): ArenaMon | undefined => team.mons[team.active];

/** Pode entrar o Pokémon `to` por vontade própria agora? */
export function canSwitch(state: ArenaState, side: ArenaSide, to: number): boolean {
  const team = state.sides[side];
  const mon = team.mons[to];
  return state.winner === null && state.countdownMs <= 0 && !!mon && mon.hp > 0 && to !== team.active && team.switchCdMs <= 0;
}

/** Por que a troca não vale agora; null quando vale. Alimenta o aviso curto da tela. */
export function switchBlockReason(state: ArenaState, side: ArenaSide, to: number): string | null {
  const team = state.sides[side];
  const mon = team.mons[to];
  if (!mon) return 'Sem Pokémon aí.';
  if (to === team.active) return 'Ele já está em campo.';
  if (mon.hp <= 0) return `${mon.name} está fora de combate.`;
  if (state.countdownMs > 0) return 'A luta ainda não começou.';
  if (state.winner !== null) return 'A luta acabou.';
  if (team.switchCdMs > 0) return `Troca em ${Math.ceil(team.switchCdMs / 1000)} s.`;
  return null;
}

function sanitize(input: ArenaInput | undefined): ArenaInput {
  const num = (v: number): number => (Number.isFinite(v) ? clamp(v, -1, 1) : 0);
  return { dx: num(input?.dx ?? 0), dy: num(input?.dy ?? 0), switchTo: Number.isInteger(input?.switchTo) ? (input as ArenaInput).switchTo : -1 };
}

function nextAlive(team: ArenaTeamState): number {
  for (let step = 1; step <= team.mons.length; step++) {
    const i = (team.active + step) % team.mons.length;
    if ((team.mons[i]?.hp ?? 0) > 0) return i;
  }
  return -1;
}

function enter(team: ArenaTeamState, index: number): void {
  team.active = index;
  team.shieldMs = SV_ENTRY_SHIELD_MS;
  team.fireMs = Math.max(team.fireMs, 400);
}

/** Tira vida do Pokémon em campo; se cai, a troca forçada põe o próximo de pé (sem recarga). */
function damageActive(team: ArenaTeamState, side: ArenaSide, amount: number, events: ArenaEvent[]): void {
  const mon = team.mons[team.active];
  if (!mon || mon.hp <= 0) return;
  mon.hp = Math.max(0, mon.hp - amount);
  if (mon.hp > 0) return;
  events.push({ k: 'faint', side, index: team.active });
  const next = nextAlive(team);
  if (next >= 0) {
    enter(team, next);
    events.push({ k: 'switch', side, index: next, forced: true });
  }
}

function remainingFraction(team: ArenaTeamState): number {
  return team.mons.reduce((sum, m) => sum + m.hp / m.maxHp, 0);
}

const categoryOf = (mon: ArenaMon): MoveCategory => mon.moveCategory ?? 'projetil';
const arenaRadius = (mon: ArenaMon): number => mon.attackRadius ?? SV_MON_RADIUS * 2;
const arenaShotRadius = (mon: ArenaMon): number => Math.max(SV_SHOT_RADIUS, mon.projectileSize ?? SV_SHOT_RADIUS);
const arenaShotSpeed = (mon: ArenaMon): number => mon.projectileSpeed ?? SV_SHOT_SPEED;
const arenaShotCount = (mon: ArenaMon): number => Math.max(1, mon.shots ?? 1);
const arenaDamage = (mon: ArenaMon): number => mon.power * (1 + Math.max(0, mon.critChance ?? 0) * 0.5);

function hitActive(target: ArenaTeamState, side: ArenaSide, type: PokemonType, damage: number, events: ArenaEvent[]): void {
  const defender = target.mons[target.active];
  if (!defender || defender.hp <= 0 || target.shieldMs > 0) return;
  const mult = typeEffectiveness(type, defender.types);
  const dealt = mult === 0 ? 0 : Math.max(1, Math.round(damage * mult));
  events.push({ k: 'hit', side, damage: dealt, mult });
  damageActive(target, side, dealt, events);
}

function fireAttack(state: ArenaState, side: ArenaSide, events: ArenaEvent[]): void {
  const team = state.sides[side];
  const foeSide: ArenaSide = side === 0 ? 1 : 0;
  const foe = state.sides[foeSide];
  const mon = team.mons[team.active];
  if (!mon || mon.hp <= 0) return;
  const category = categoryOf(mon);
  const ax = foe.x - team.x;
  const ay = foe.y - team.y;
  const dist = Math.hypot(ax, ay) || 1;

  // Aura já é visível ao redor do usuário e só causa dano se o rival entrou no seu raio.
  if (category === 'aura') {
    if (dist <= arenaRadius(mon) + SV_MON_RADIUS) hitActive(foe, foeSide, mon.attackType, arenaDamage(mon), events);
    return;
  }
  // Área fixa a posição atual do alvo e revela o círculo por 1,5 s. Não há dano instantâneo nem perseguição invisível.
  if (category === 'area') {
    const radius = arenaRadius(mon);
    state.markers.push({ id: state.nextShotId++, side, x: foe.x, y: foe.y, radius, damage: arenaDamage(mon), type: mon.attackType, leftMs: SV_TELEGRAPH_MS });
    events.push({ k: 'telegraph', side, x: foe.x, y: foe.y, radius, type: mon.attackType });
    return;
  }

  const base = Math.atan2(ay, ax);
  const count = arenaShotCount(mon);
  const spread = count > 1 ? 0.26 : 0;
  for (let i = 0; i < count; i++) {
    const angle = base + (i - (count - 1) / 2) * spread;
    state.shots.push({
      id: state.nextShotId++, side, x: team.x, y: team.y,
      vx: Math.cos(angle) * arenaShotSpeed(mon), vy: Math.sin(angle) * arenaShotSpeed(mon),
      damage: arenaDamage(mon), type: mon.attackType, ageMs: 0, radius: arenaShotRadius(mon), pierce: mon.pierce ?? 0,
    });
  }
}

function decideWinner(state: ArenaState): ArenaWinner | null {
  const a = aliveCount(state.sides[0]);
  const b = aliveCount(state.sides[1]);
  if (a === 0 && b === 0) return 'draw';
  if (a === 0) return 1;
  if (b === 0) return 0;
  if (state.timeMs >= SV_MAX_MS) {
    if (a !== b) return a > b ? 0 : 1;
    const ra = remainingFraction(state.sides[0]);
    const rb = remainingFraction(state.sides[1]);
    return Math.abs(ra - rb) < 1e-9 ? 'draw' : ra > rb ? 0 : 1;
  }
  return null;
}

/** Avança a arena `dtMs` com as entradas dos dois lados. Devolve o que aconteceu (para sons, avisos e piscadas). */
export function stepArena(state: ArenaState, inputs: readonly [ArenaInput | undefined, ArenaInput | undefined], dtMs: number): ArenaEvent[] {
  const events: ArenaEvent[] = [];
  if (state.winner !== null) return events;
  const dt = clamp(Number.isFinite(dtMs) ? dtMs : 0, 0, SV_MAX_DT_MS);
  if (state.countdownMs > 0) {
    state.countdownMs = Math.max(0, state.countdownMs - dt);
    return events;
  }
  state.timeMs += dt;
  const sec = dt / 1000;

  for (const side of [0, 1] as const) {
    const team = state.sides[side];
    const input = sanitize(inputs[side]);
    team.switchCdMs = Math.max(0, team.switchCdMs - dt);
    team.shieldMs = Math.max(0, team.shieldMs - dt);
    if (input.switchTo >= 0 && canSwitch(state, side, input.switchTo)) {
      enter(team, input.switchTo);
      team.switchCdMs = SV_SWITCH_COOLDOWN_MS;
      events.push({ k: 'switch', side, index: input.switchTo, forced: false });
    }
    const mon = team.mons[team.active];
    if (!mon || mon.hp <= 0) continue;
    const len = Math.hypot(input.dx, input.dy);
    const scale = len > 1 ? 1 / len : 1;
    team.x = clamp(team.x + input.dx * scale * mon.speed * sec, SV_MON_RADIUS, SV_ARENA_W - SV_MON_RADIUS);
    team.y = clamp(team.y + input.dy * scale * mon.speed * sec, SV_MON_RADIUS, SV_ARENA_H - SV_MON_RADIUS);
  }

  // A marca de área nunca acompanha o alvo. Quem sair do círculo antes do fim não é atingido.
  const markers: ArenaMarker[] = [];
  for (const marker of state.markers) {
    marker.leftMs -= dt;
    if (marker.leftMs > 0) { markers.push(marker); continue; }
    const targetSide: ArenaSide = marker.side === 0 ? 1 : 0;
    const target = state.sides[targetSide];
    if (Math.hypot(marker.x - target.x, marker.y - target.y) <= marker.radius + SV_MON_RADIUS) hitActive(target, targetSide, marker.type, marker.damage, events);
  }
  state.markers = markers;

  // Golpes novos preservam a forma e os buffs conquistados na run. Marcadores criados aqui
  // só começam a contar no próximo quadro: os 1,5 s inteiros ficam visíveis no chão.
  for (const side of [0, 1] as const) {
    const team = state.sides[side];
    const mon = team.mons[team.active];
    if (!mon || mon.hp <= 0) continue;
    team.fireMs -= dt;
    if (team.fireMs > 0) continue;
    team.fireMs = mon.fireMs;
    fireAttack(state, side, events);
  }

  // Golpes no ar: andam, acertam o Pokémon em campo do outro lado ou somem.
  const kept: ArenaShot[] = [];
  for (const shot of state.shots) {
    shot.x += shot.vx * sec;
    shot.y += shot.vy * sec;
    shot.ageMs += dt;
    if (shot.ageMs > SV_SHOT_LIFE_MS || shot.x < -20 || shot.x > SV_ARENA_W + 20 || shot.y < -20 || shot.y > SV_ARENA_H + 20) continue;
    const targetSide: ArenaSide = shot.side === 0 ? 1 : 0;
    const target = state.sides[targetSide];
    const defender = target.mons[target.active];
    if (defender && defender.hp > 0 && Math.hypot(shot.x - target.x, shot.y - target.y) < SV_MON_RADIUS + shot.radius) {
      hitActive(target, targetSide, shot.type, shot.damage, events);
      continue;
    }
    kept.push(shot);
  }
  state.shots = kept;

  if (state.timeMs > SV_SUDDEN_DEATH_MS) {
    for (const side of [0, 1] as const) {
      const team = state.sides[side];
      const mon = team.mons[team.active];
      if (mon && mon.hp > 0) damageActive(team, side, mon.maxHp * SV_SUDDEN_DRAIN_PER_S * sec, events);
    }
  }

  state.winner = decideWinner(state);
  return events;
}

// ----------------------------------------------------------------------------- instantâneo (anfitrião → convidado)

export interface ArenaTeamSnap {
  hp: number[];
  active: number;
  x: number;
  y: number;
  fireMs: number;
  switchCdMs: number;
  shieldMs: number;
}

export interface ArenaShotSnap {
  id: number;
  side: ArenaSide;
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: PokemonType;
  radius: number;
}

export interface ArenaMarkerSnap {
  id: number;
  side: ArenaSide;
  x: number;
  y: number;
  radius: number;
  type: PokemonType;
  leftMs: number;
}

export interface ArenaSnapshot {
  tick: number;
  timeMs: number;
  countdownMs: number;
  winner: ArenaWinner | null;
  sides: [ArenaTeamSnap, ArenaTeamSnap];
  shots: ArenaShotSnap[];
  markers: ArenaMarkerSnap[];
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function snapshotArena(state: ArenaState, tick: number): ArenaSnapshot {
  const side = (t: ArenaTeamState): ArenaTeamSnap => ({
    hp: t.mons.map((m) => Math.round(m.hp)), active: t.active, x: round1(t.x), y: round1(t.y),
    fireMs: Math.round(t.fireMs), switchCdMs: Math.round(t.switchCdMs), shieldMs: Math.round(t.shieldMs),
  });
  return {
    tick, timeMs: Math.round(state.timeMs), countdownMs: Math.round(state.countdownMs), winner: state.winner,
    sides: [side(state.sides[0]), side(state.sides[1])],
    shots: state.shots.map((s) => ({ id: s.id, side: s.side, x: round1(s.x), y: round1(s.y), vx: round1(s.vx), vy: round1(s.vy), type: s.type, radius: round1(s.radius) })),
    markers: state.markers.map((m) => ({ id: m.id, side: m.side, x: round1(m.x), y: round1(m.y), radius: round1(m.radius), type: m.type, leftMs: Math.max(0, Math.round(m.leftMs)) })),
  };
}

/** O convidado adota o que o anfitrião mandou. Devolve false (sem mudar nada) se o instantâneo não casa com as equipes. */
export function applyArenaSnapshot(state: ArenaState, snap: ArenaSnapshot): boolean {
  for (const side of [0, 1] as const) {
    const team = state.sides[side];
    const s = snap.sides[side];
    if (s.hp.length !== team.mons.length || s.active < 0 || s.active >= team.mons.length) return false;
  }
  for (const side of [0, 1] as const) {
    const team = state.sides[side];
    const s = snap.sides[side];
    team.mons.forEach((m, i) => (m.hp = clamp(s.hp[i] ?? 0, 0, m.maxHp)));
    team.active = s.active;
    team.x = s.x;
    team.y = s.y;
    team.fireMs = s.fireMs;
    team.switchCdMs = s.switchCdMs;
    team.shieldMs = s.shieldMs;
  }
  state.timeMs = snap.timeMs;
  state.countdownMs = snap.countdownMs;
  state.winner = snap.winner;
  state.shots = snap.shots.map((s) => ({ id: s.id, side: s.side, x: s.x, y: s.y, vx: s.vx, vy: s.vy, damage: 0, type: s.type, ageMs: 0, radius: s.radius, pierce: 0 }));
  state.markers = snap.markers.map((m) => ({ id: m.id, side: m.side, x: m.x, y: m.y, radius: m.radius, damage: 0, type: m.type, leftMs: m.leftMs }));
  return true;
}
