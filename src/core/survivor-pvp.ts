import { typeEffectiveness } from './battle';
import type { PokemonType } from './pokemon-data';
import { statsOfDex } from './survivor-stats';
import type { MoveCategory, MoveEffect } from './survivor-moves';
import {
  distanceToSegment, FOCUS_SHOT_PIERCE, FOCUS_SHOT_SIZE_MULTIPLIER, FOCUS_SHOT_SPEED_MULTIPLIER, RAPID_BURST_MIN_CYCLE_MS,
  RAPID_BURST_SHOT_INTERVAL_MS, RAPID_BURST_SHOTS, RAPID_BURST_SPREAD, TELEPORT_HIT_RADIUS, TELEPORT_MIN_COOLDOWN_MS, TELEPORT_MIN_DAMAGE_MULTIPLIER,
} from './survivor-charge';
import { inSurvivorCone, survivorOrbiterHitRadius, survivorOrbitAngularSpeed, survivorOrbitHitIntervalMs, survivorOrbiters } from './survivor-shapes';

/**
 * PvP do Survival: 3 runs de 2 minutos rendem 3 Pokémon, e as duas equipes 3x3 lutam numa arena em tempo real.
 * Tudo aqui é puro e determinístico (sem relógio, sem sorteio): o anfitrião roda `stepArena` com as entradas dos dois e
 * o convidado só adota os instantâneos (`applyArenaSnapshot`). Dado que falta aparece como falta: sem stats da espécie
 * o Pokémon entra com números médios e `estimated: true` (a tela avisa).
 *
 * A mesma arena serve à luta 6x6 da Arena (`core/arena-prep.ts`, `core/arena-bot.ts`): lá cada Pokémon também traz um
 * segundo ataque (`alt`), trocado com um botão.
 */

export const SV_RUNS = 3;
export const SV_RUN_MS = 120_000;
export const SV_TEAM_SIZE = 3;
/** Maior equipe que a arena aceita: os 6 da luta da Arena. */
export const SV_MAX_TEAM = 6;

/** O campo inteiro. A tela mostra só um pedaço dele (`SV_VIEW_*`), e a câmera segue quem joga. */
export const SV_ARENA_W = 640;
export const SV_ARENA_H = 960;
export const SV_VIEW_W = 320;
export const SV_VIEW_H = 480;
/** Distância da largada até o meio do campo: os dois lados começam vendo um ao outro. */
export const SV_START_OFFSET = 100;
export const SV_MON_RADIUS = 18;
export const SV_SHOT_RADIUS = 6;
export const SV_SHOT_SPEED = 250;
/** A mesma duração-base do projétil da corrida; alcance vem da velocidade real do golpe. */
export const SV_SHOT_LIFE_MS = 1600;
/** Área e golpes que travam no alvo avisam no chão antes de acertar. */
export const SV_TELEGRAPH_MS = 1500;
/** Recarga entre trocas voluntárias (a troca forçada por desmaio não paga recarga). */
export const SV_SWITCH_COOLDOWN_MS = 5000;
/** Recarga entre duas trocas de ataque, para o botão não virar dois golpes de graça. */
export const SV_ATTACK_SWAP_CD_MS = 1500;
/** Quem entra fica protegido por um instante, para a troca nunca virar uma armadilha. */
export const SV_ENTRY_SHIELD_MS = 1200;
/** Escudo: cancela qualquer dano recebido por 2 s e só volta 10 s depois de ativado. */
export const SV_GUARD_MS = 2000;
export const SV_GUARD_COOLDOWN_MS = 10_000;
/** Trilha: a corrida enche a faixa em 2250 px andados; a arena é bem menor. O resto vem do golpe da corrida. */
export const SV_TRAIL_DISTANCE = 700;
export const SV_TRAIL_DRAW_MS = 4000;
export const SV_TRAIL_LIFE_MS = 3500;
export const SV_TRAIL_POINT_SPACING = 12;
export const SV_TRAIL_TICK_MS = 420;
export const SV_TRAIL_SPEED_MULTIPLIER = 1.25;
export const SV_TRAIL_MAX_POINTS = 40;
/** Efeitos dos golpes, com as mesmas durações da corrida (`EFFECT_MS`). */
const SV_EFFECT = { burnMs: 2000, burnFactor: 0.35, slowMs: 1500, stunMs: 400, stunCdMs: 5000, pushCdMs: 400, push: 14 } as const;
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
  /** O outro ataque do Pokémon, trocado com o botão. Fora da luta da Arena não existe. */
  alt?: SvAttackForm;
  /** Vida com que entra na luta, quando não entra cheio (corrida de Formatação). */
  startHp?: number;
}

/** Tudo o que muda ao trocar de ataque. A vida e a velocidade de andar são do Pokémon e não mudam. */
export interface SvAttackForm {
  attackType: PokemonType;
  power: number;
  fireMs: number;
  moveName: string;
  moveCategory: MoveCategory;
  moveEffect: MoveEffect;
  projectileSpeed: number;
  projectileSize: number;
  shots: number;
  pierce: number;
  attackRange: number;
  attackRadius: number;
  critChance: number;
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
  /** Está usando o segundo ataque. */
  altOn?: boolean;
  /** Dano que já causou e quantos derrubou nesta luta (só no anfitrião; não vai no instantâneo). */
  dealt?: number;
  kos?: number;
}

export interface ArenaTrailPoint {
  x: number;
  y: number;
  bornMs: number;
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
  /** Tempo até poder trocar de ataque de novo. */
  attackSwapCdMs: number;
  /** Proteção de quem acabou de entrar. */
  shieldMs: number;
  /** Escudo do botão: enquanto durar, nenhum dano entra. */
  guardMs: number;
  /** Recarga do escudo, contada desde que ele foi ativado. */
  guardCdMs: number;
  /** Fase dos orbitais (golpe de órbita) e tempo até o próximo toque. */
  orbitAngle: number;
  orbitCdMs: number;
  /** Rajada: salvas que ainda faltam e o intervalo até a próxima. */
  rapidPending: number;
  rapidDelayMs: number;
  /** Trilha: carga (0–1), tempo desenhando, pontos da faixa e tempo até o próximo pulso. */
  trailCharge: number;
  trailMs: number;
  trail: ArenaTrailPoint[];
  trailTickMs: number;
  /** Efeitos do golpe do rival no Pokémon em campo. */
  burnMs: number;
  burnDps: number;
  slowMs: number;
  stunMs: number;
  stunCdMs: number;
  pushCdMs: number;
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
  /** Só no anfitrião: vida do golpe e se já acertou (um golpe que atravessa não acerta o mesmo alvo duas vezes). */
  lifeMs?: number;
  spent?: boolean;
  /** Dono do golpe: o efeito (queimar, empurrar…) sai do Pokémon que atirou, mesmo que ele troque depois. */
  effect?: MoveEffect;
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
  /** Limites de tempo: equipes maiores precisam de mais tempo (ver `createArena`). */
  suddenDeathMs: number;
  maxMs: number;
}

export interface ArenaInput {
  /** Direção desejada (−1 a 1 em cada eixo; vetores maiores que 1 são reduzidos). */
  dx: number;
  dy: number;
  /** Índice do Pokémon que o jogador quer em campo, ou −1. */
  switchTo: number;
  /** Tocou no botão de escudo neste quadro. */
  shield?: boolean;
  /** Tocou no botão de trocar de ataque neste quadro. */
  swapAttack?: boolean;
}

export const NO_INPUT: ArenaInput = { dx: 0, dy: 0, switchTo: -1 };

export type ArenaEvent =
  | { k: 'hit'; side: ArenaSide; damage: number; mult: number }
  | { k: 'telegraph'; side: ArenaSide; x: number; y: number; radius: number; type: PokemonType }
  | { k: 'faint'; side: ArenaSide; index: number }
  | { k: 'switch'; side: ArenaSide; index: number; forced: boolean }
  /** `side` trocou o ataque do Pokémon em campo. */
  | { k: 'attack'; side: ArenaSide; index: number }
  /** `side` = quem se protegeu. */
  | { k: 'guard'; side: ArenaSide }
  /** `side` = quem foi atacado e não levou o dano por causa do escudo. */
  | { k: 'block'; side: ArenaSide }
  | { k: 'cone'; side: ArenaSide; angle: number; range: number }
  | { k: 'pulse'; side: ArenaSide; radius: number }
  | { k: 'blink'; side: ArenaSide; x0: number; y0: number; x1: number; y1: number };

const startPosition = (side: ArenaSide): { x: number; y: number } => ({ x: SV_ARENA_W / 2, y: SV_ARENA_H / 2 + (side === 0 ? SV_START_OFFSET : -SV_START_OFFSET) });

/** Canto do pedaço do campo que a tela mostra: centrado em (x, y), sem passar da borda do campo. */
export function arenaCamera(x: number, y: number): { x: number; y: number } {
  return { x: clamp(x - SV_VIEW_W / 2, 0, SV_ARENA_W - SV_VIEW_W), y: clamp(y - SV_VIEW_H / 2, 0, SV_ARENA_H - SV_VIEW_H) };
}

/** Quem joga fica no centro da câmera, puxada um pouco para o rival: os dois cabem na tela mais vezes. */
export function arenaCameraTarget(me: { x: number; y: number }, foe: { x: number; y: number }): { x: number; y: number } {
  const lead = (d: number, max: number): number => clamp(d * 0.35, -max, max);
  return arenaCamera(me.x + lead(foe.x - me.x, SV_VIEW_W * 0.25), me.y + lead(foe.y - me.y, SV_VIEW_H * 0.25));
}

/** Seta na borda da tela para quem está fora dela (posição já na tela); null quando dá para ver. */
export function offscreenPointer(x: number, y: number, margin = 18): { x: number; y: number; angle: number } | null {
  if (x >= 0 && x <= SV_VIEW_W && y >= 0 && y <= SV_VIEW_H) return null;
  return { x: clamp(x, margin, SV_VIEW_W - margin), y: clamp(y, margin, SV_VIEW_H - margin), angle: Math.atan2(y - SV_VIEW_H / 2, x - SV_VIEW_W / 2) };
}

function teamState(side: ArenaSide, specs: readonly SvMonSpec[]): ArenaTeamState {
  const { x, y } = startPosition(side);
  const mons: ArenaMon[] = specs.map((s) => ({ ...s, types: [...s.types], ...(s.alt ? { alt: { ...s.alt } } : {}), hp: clamp(s.startHp ?? s.maxHp, 0, s.maxHp) }));
  return {
    mons, active: Math.max(0, mons.findIndex((m) => m.hp > 0)), x, y, fireMs: 600, switchCdMs: 0, attackSwapCdMs: 0, shieldMs: 0,
    guardMs: 0, guardCdMs: 0, orbitAngle: 0, orbitCdMs: 0, rapidPending: 0, rapidDelayMs: 0, trailCharge: 0, trailMs: 0, trail: [], trailTickMs: 0,
    burnMs: 0, burnDps: 0, slowMs: 0, stunMs: 0, stunCdMs: 0, pushCdMs: 0,
  };
}

/** Lado 0 = anfitrião (embaixo), lado 1 = convidado (em cima). */
export function createArena(host: readonly SvMonSpec[], guest: readonly SvMonSpec[]): ArenaState {
  // A morte súbita apressa o Pokémon em campo: seis de cada lado precisam do dobro do tempo de três.
  const scale = Math.max(1, Math.max(host.length, guest.length) / SV_TEAM_SIZE);
  return {
    timeMs: 0, countdownMs: SV_COUNTDOWN_MS, sides: [teamState(0, host), teamState(1, guest)], shots: [], markers: [], nextShotId: 1, winner: null,
    suddenDeathMs: SV_SUDDEN_DEATH_MS * scale, maxMs: SV_MAX_MS * scale,
  };
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

/** Pode ativar o escudo agora? */
export function canGuard(state: ArenaState, side: ArenaSide): boolean {
  const team = state.sides[side];
  const mon = team.mons[team.active];
  return state.winner === null && state.countdownMs <= 0 && !!mon && mon.hp > 0 && team.guardCdMs <= 0;
}

/** Por que o escudo não vale agora; null quando vale. */
export function guardBlockReason(state: ArenaState, side: ArenaSide): string | null {
  const team = state.sides[side];
  if (state.winner !== null) return 'A luta acabou.';
  if (state.countdownMs > 0) return 'A luta ainda não começou.';
  if (team.guardMs > 0) return 'O escudo já está ativo.';
  if (team.guardCdMs > 0) return `Escudo em ${Math.ceil(team.guardCdMs / 1000)} s.`;
  return null;
}

/** Pode trocar o ataque do Pokémon em campo agora? */
export function canSwapAttack(state: ArenaState, side: ArenaSide): boolean {
  const team = state.sides[side];
  const mon = team.mons[team.active];
  return state.winner === null && state.countdownMs <= 0 && !!mon && mon.hp > 0 && !!mon.alt && team.attackSwapCdMs <= 0;
}

/** Por que a troca de ataque não vale agora; null quando vale. */
export function attackSwapBlockReason(state: ArenaState, side: ArenaSide): string | null {
  const team = state.sides[side];
  if (state.winner !== null) return 'A luta acabou.';
  if (state.countdownMs > 0) return 'A luta ainda não começou.';
  if (!team.mons[team.active]?.alt) return 'Este Pokémon só tem um ataque.';
  if (team.attackSwapCdMs > 0) return `Troca de ataque em ${Math.ceil(team.attackSwapCdMs / 1000)} s.`;
  return null;
}

/** Troca os números do ataque em uso pelos do outro: todo o resto do motor lê só os do ataque em uso. */
function swapForm(mon: ArenaMon): void {
  if (!mon.alt) return;
  const next = mon.alt;
  mon.alt = {
    attackType: mon.attackType, power: mon.power, fireMs: mon.fireMs, moveName: mon.moveName ?? 'Golpe', moveCategory: mon.moveCategory ?? 'projetil',
    moveEffect: mon.moveEffect ?? 'nenhum', projectileSpeed: mon.projectileSpeed ?? SV_SHOT_SPEED, projectileSize: mon.projectileSize ?? SV_SHOT_RADIUS,
    shots: mon.shots ?? 1, pierce: mon.pierce ?? 0, attackRange: mon.attackRange ?? 200, attackRadius: mon.attackRadius ?? SV_MON_RADIUS * 2, critChance: mon.critChance ?? 0,
  };
  Object.assign(mon, next);
  mon.altOn = !mon.altOn;
}

function sanitize(input: ArenaInput | undefined): ArenaInput {
  const num = (v: number): number => (Number.isFinite(v) ? clamp(v, -1, 1) : 0);
  return { dx: num(input?.dx ?? 0), dy: num(input?.dy ?? 0), switchTo: Number.isInteger(input?.switchTo) ? (input as ArenaInput).switchTo : -1, shield: input?.shield === true, swapAttack: input?.swapAttack === true };
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
  // Efeitos, rajada e faixa são do Pokémon que estava em campo: quem entra começa limpo.
  team.burnMs = team.burnDps = team.slowMs = team.stunMs = 0;
  team.rapidPending = 0;
  team.trailCharge = team.trailMs = 0;
  team.trail = [];
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

/**
 * Os golpes da arena seguem os da corrida: projétil, rajada (3 salvas), foco (tiro largo que atravessa), cone, aura,
 * órbita, área, teleporte e trilha usam a mesma geometria (`survivor-shapes`) e as mesmas constantes (`survivor-charge`),
 * e os efeitos (queimar, lentidão, empurrar, atordoar, atravessar, roubar) duram o mesmo. O duelo não tem botão de
 * carga: o golpe dispara sozinho no rival, e o teleporte salta até ele.
 */
const categoryOf = (mon: ArenaMon): MoveCategory => mon.moveCategory ?? 'projetil';
const arenaRadius = (mon: ArenaMon): number => mon.attackRadius ?? SV_MON_RADIUS * 2;
const arenaRange = (mon: ArenaMon): number => mon.attackRange ?? 200;
const arenaShotRadius = (mon: ArenaMon): number => Math.max(SV_SHOT_RADIUS, mon.projectileSize ?? SV_SHOT_RADIUS);
const arenaShotSpeed = (mon: ArenaMon): number => mon.projectileSpeed ?? SV_SHOT_SPEED;
const arenaShotCount = (mon: ArenaMon): number => Math.max(1, mon.shots ?? 1);
const arenaDamage = (mon: ArenaMon): number => mon.power * (1 + Math.max(0, mon.critChance ?? 0) * 0.5);
const round1n = (n: number): number => Math.round(n * 10) / 10;

/** Tempo entre golpes: a rajada e o teleporte têm um piso, como na corrida. */
function cycleMs(mon: ArenaMon): number {
  const category = categoryOf(mon);
  if (category === 'rapido') return Math.max(RAPID_BURST_MIN_CYCLE_MS, mon.fireMs);
  if (category === 'teleporte') return Math.max(TELEPORT_MIN_COOLDOWN_MS, mon.fireMs);
  return mon.fireMs;
}

interface HitSource {
  team: ArenaTeamState;
  mon: ArenaMon;
}

/** Efeito do golpe no Pokémon em campo de quem foi atingido (só se ele continua de pé). */
function applyEffect(effect: MoveEffect | undefined, source: HitSource | null, target: ArenaTeamState, dealt: number): void {
  switch (effect) {
    case 'queimar':
      target.burnMs = SV_EFFECT.burnMs;
      target.burnDps = Math.max(target.burnDps, round1n(dealt * SV_EFFECT.burnFactor));
      break;
    case 'lentidao':
      target.slowMs = Math.max(target.slowMs, SV_EFFECT.slowMs);
      break;
    case 'atordoar':
      if (target.stunCdMs <= 0) {
        target.stunMs = Math.max(target.stunMs, SV_EFFECT.stunMs);
        target.stunCdMs = SV_EFFECT.stunCdMs;
      }
      break;
    case 'empurrar': {
      if (!source || target.pushCdMs > 0) break;
      const dx = target.x - source.team.x;
      const dy = target.y - source.team.y;
      const d = Math.hypot(dx, dy) || 1;
      target.x = clamp(target.x + (dx / d) * SV_EFFECT.push, SV_MON_RADIUS, SV_ARENA_W - SV_MON_RADIUS);
      target.y = clamp(target.y + (dy / d) * SV_EFFECT.push, SV_MON_RADIUS, SV_ARENA_H - SV_MON_RADIUS);
      target.pushCdMs = SV_EFFECT.pushCdMs;
      break;
    }
    case 'roubar':
      if (source && source.mon.hp > 0) source.mon.hp = Math.min(source.mon.maxHp, source.mon.hp + Math.max(1, Math.round(source.mon.maxHp * 0.01)));
      break;
    default:
      break;
  }
}

function hitActive(target: ArenaTeamState, side: ArenaSide, type: PokemonType, damage: number, events: ArenaEvent[], effect?: MoveEffect, source: HitSource | null = null): void {
  const defender = target.mons[target.active];
  if (!defender || defender.hp <= 0 || target.shieldMs > 0) return;
  // O escudo do botão cancela tudo: o dano e também o efeito (queimar, empurrar…).
  if (target.guardMs > 0) {
    events.push({ k: 'block', side });
    return;
  }
  const mult = typeEffectiveness(type, defender.types);
  const dealt = mult === 0 ? 0 : Math.max(1, Math.round(damage * mult));
  events.push({ k: 'hit', side, damage: dealt, mult });
  damageActive(target, side, dealt, events);
  if (source) {
    source.mon.dealt = (source.mon.dealt ?? 0) + dealt;
    if (defender.hp <= 0) source.mon.kos = (source.mon.kos ?? 0) + 1;
  }
  if (dealt > 0 && defender.hp > 0) applyEffect(effect, source, target, dealt);
}

interface ShotPlan {
  damageFactor?: number;
  speedFactor?: number;
  sizeFactor?: number;
  extraPierce?: number;
  count?: number;
  spread?: number;
}

/** Leque de projéteis em direção ao rival (projétil, uma salva da rajada ou o tiro do foco). */
function pushShots(state: ArenaState, side: ArenaSide, plan: ShotPlan = {}): void {
  const team = state.sides[side];
  const foe = state.sides[side === 0 ? 1 : 0];
  const mon = team.mons[team.active];
  if (!mon) return;
  const base = Math.atan2(foe.y - team.y, foe.x - team.x);
  const count = plan.count ?? arenaShotCount(mon);
  const spread = count > 1 ? plan.spread ?? 0.26 : 0;
  const speed = arenaShotSpeed(mon) * (plan.speedFactor ?? 1);
  const pierce = (mon.pierce ?? 0) + (mon.moveEffect === 'atravessar' ? 1 : 0) + (plan.extraPierce ?? 0);
  for (let i = 0; i < count; i++) {
    const angle = base + (i - (count - 1) / 2) * spread;
    state.shots.push({
      id: state.nextShotId++, side, x: team.x, y: team.y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      damage: arenaDamage(mon) * (plan.damageFactor ?? 1), type: mon.attackType, ageMs: 0,
      radius: arenaShotRadius(mon) * (plan.sizeFactor ?? 1), pierce,
      lifeMs: Math.max(SV_SHOT_LIFE_MS, Math.ceil(((arenaRange(mon) + 30) / Math.max(1, speed)) * 1000) + 50),
      effect: mon.moveEffect,
    });
  }
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
  const aim = Math.atan2(ay, ax);
  const source: HitSource = { team, mon };

  switch (category) {
    case 'orbit':
    case 'trilha':
      return; // dano contínuo (orbitais e faixa): ver `stepOrbit` e `stepTrail`
    case 'aura': {
      // A aura pulsa sempre e só causa dano se o rival está dentro do raio (80% do raio do golpe, como na corrida).
      const pulse = arenaRadius(mon) * 0.8;
      events.push({ k: 'pulse', side, radius: pulse });
      if (dist <= pulse + SV_MON_RADIUS) hitActive(foe, foeSide, mon.attackType, arenaDamage(mon), events, mon.moveEffect, source);
      return;
    }
    case 'area': {
      // Área fixa a posição atual do alvo e revela o círculo por 1,5 s. Não há dano instantâneo nem perseguição invisível.
      const radius = arenaRadius(mon);
      state.markers.push({ id: state.nextShotId++, side, x: foe.x, y: foe.y, radius, damage: arenaDamage(mon), type: mon.attackType, leftMs: SV_TELEGRAPH_MS });
      events.push({ k: 'telegraph', side, x: foe.x, y: foe.y, radius, type: mon.attackType });
      return;
    }
    case 'cone': {
      const range = arenaRange(mon);
      events.push({ k: 'cone', side, angle: round1n(aim * 100) / 100, range });
      if (inSurvivorCone({ x: team.x, y: team.y, aimAngle: aim, facing: 1 }, foe.x, foe.y, range, SV_MON_RADIUS)) {
        hitActive(foe, foeSide, mon.attackType, arenaDamage(mon), events, mon.moveEffect, source);
      }
      return;
    }
    case 'teleporte': {
      // Salta até o rival e acerta quem está no caminho (a corrida faz isso ao soltar a carga; aqui é automático).
      const x0 = team.x;
      const y0 = team.y;
      const travel = Math.max(0, Math.min(arenaRange(mon), dist - SV_MON_RADIUS * 2));
      team.x = clamp(x0 + (ax / dist) * travel, SV_MON_RADIUS, SV_ARENA_W - SV_MON_RADIUS);
      team.y = clamp(y0 + (ay / dist) * travel, SV_MON_RADIUS, SV_ARENA_H - SV_MON_RADIUS);
      team.shieldMs = Math.max(team.shieldMs, 300);
      events.push({ k: 'blink', side, x0: round1n(x0), y0: round1n(y0), x1: round1n(team.x), y1: round1n(team.y) });
      if (distanceToSegment(foe.x, foe.y, x0, y0, team.x, team.y) <= TELEPORT_HIT_RADIUS) {
        hitActive(foe, foeSide, mon.attackType, arenaDamage(mon) * TELEPORT_MIN_DAMAGE_MULTIPLIER, events, mon.moveEffect, source);
      }
      return;
    }
    case 'rapido':
      // Três salvas seguidas; a onda inteira vale o dano de um golpe (cada salva 62%).
      pushShots(state, side, { damageFactor: 0.62, spread: RAPID_BURST_SPREAD });
      team.rapidPending = RAPID_BURST_SHOTS - 1;
      team.rapidDelayMs = RAPID_BURST_SHOT_INTERVAL_MS;
      return;
    case 'foco':
      // Um tiro largo e lento que atravessa.
      pushShots(state, side, { count: 1, speedFactor: FOCUS_SHOT_SPEED_MULTIPLIER, sizeFactor: FOCUS_SHOT_SIZE_MULTIPLIER, extraPierce: FOCUS_SHOT_PIERCE });
      return;
    default:
      pushShots(state, side);
  }
}

/** Órbita: os orbitais giram o tempo todo e acertam quem tocam, com um intervalo entre toques. */
function stepOrbit(state: ArenaState, side: ArenaSide, dt: number, events: ArenaEvent[]): void {
  const team = state.sides[side];
  const mon = team.mons[team.active];
  if (!mon || mon.hp <= 0 || categoryOf(mon) !== 'orbit') return;
  team.orbitAngle = (team.orbitAngle + survivorOrbitAngularSpeed(mon.fireMs) * dt) % (Math.PI * 2);
  team.orbitCdMs = Math.max(0, team.orbitCdMs - dt);
  if (team.orbitCdMs > 0) return;
  const shape = { x: team.x, y: team.y, shots: arenaShotCount(mon), attackRadius: arenaRadius(mon), orbitAngle: team.orbitAngle };
  const hitRadius = survivorOrbiterHitRadius(shape);
  const foeSide: ArenaSide = side === 0 ? 1 : 0;
  const foe = state.sides[foeSide];
  if (survivorOrbiters(shape).some((o) => Math.hypot(foe.x - o.x, foe.y - o.y) <= hitRadius + SV_MON_RADIUS)) {
    hitActive(foe, foeSide, mon.attackType, arenaDamage(mon), events, mon.moveEffect, { team, mon });
    team.orbitCdMs = survivorOrbitHitIntervalMs(shape, mon.fireMs);
  }
}

/** Trilha: anda para encher, desenha a faixa por 4 s (25% mais rápido) e o rival que a pisa leva pulsos de dano. */
function stepTrail(state: ArenaState, side: ArenaSide, moved: number, dt: number, events: ArenaEvent[]): void {
  const team = state.sides[side];
  const mon = team.mons[team.active];
  if (!mon || mon.hp <= 0 || categoryOf(mon) !== 'trilha') return;
  if (team.trailMs <= 0) {
    team.trailCharge = Math.min(1, team.trailCharge + moved / SV_TRAIL_DISTANCE);
    if (team.trailCharge >= 1) {
      team.trailCharge = 0;
      team.trailMs = SV_TRAIL_DRAW_MS;
    }
  }
  team.trail = team.trail.filter((p) => state.timeMs - p.bornMs < SV_TRAIL_LIFE_MS);
  if (team.trailMs > 0) {
    team.trailMs = Math.max(0, team.trailMs - dt);
    const last = team.trail[team.trail.length - 1];
    if (!last || Math.hypot(last.x - team.x, last.y - team.y) >= SV_TRAIL_POINT_SPACING) team.trail.push({ x: team.x, y: team.y, bornMs: state.timeMs });
  }
  team.trailTickMs = Math.max(0, team.trailTickMs - dt);
  if (team.trailTickMs > 0) return;
  const foeSide: ArenaSide = side === 0 ? 1 : 0;
  const foe = state.sides[foeSide];
  const width = Math.min(arenaRadius(mon), 36);
  if (team.trail.some((p) => Math.hypot(foe.x - p.x, foe.y - p.y) <= width + SV_MON_RADIUS)) {
    hitActive(foe, foeSide, mon.attackType, arenaDamage(mon) * 0.9, events, mon.moveEffect, { team, mon });
    team.trailTickMs = Math.max(160, SV_TRAIL_TICK_MS);
  }
}

function decideWinner(state: ArenaState): ArenaWinner | null {
  const a = aliveCount(state.sides[0]);
  const b = aliveCount(state.sides[1]);
  if (a === 0 && b === 0) return 'draw';
  if (a === 0) return 1;
  if (b === 0) return 0;
  if (state.timeMs >= state.maxMs) {
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
    team.attackSwapCdMs = Math.max(0, team.attackSwapCdMs - dt);
    team.shieldMs = Math.max(0, team.shieldMs - dt);
    team.guardMs = Math.max(0, team.guardMs - dt);
    team.guardCdMs = Math.max(0, team.guardCdMs - dt);
    team.stunCdMs = Math.max(0, team.stunCdMs - dt);
    team.pushCdMs = Math.max(0, team.pushCdMs - dt);
    if (input.switchTo >= 0 && canSwitch(state, side, input.switchTo)) {
      enter(team, input.switchTo);
      team.switchCdMs = SV_SWITCH_COOLDOWN_MS;
      events.push({ k: 'switch', side, index: input.switchTo, forced: false });
    }
    if (input.swapAttack && canSwapAttack(state, side)) {
      const current = team.mons[team.active] as ArenaMon;
      swapForm(current);
      team.attackSwapCdMs = SV_ATTACK_SWAP_CD_MS;
      // Rajada e faixa são do ataque que saiu; o novo começa em seguida, sem disparar no mesmo quadro.
      team.rapidPending = 0;
      team.trailCharge = team.trailMs = 0;
      team.trail = [];
      team.fireMs = Math.min(Math.max(team.fireMs, 250), current.fireMs);
      events.push({ k: 'attack', side, index: team.active });
    }
    if (input.shield && canGuard(state, side)) {
      team.guardMs = SV_GUARD_MS;
      team.guardCdMs = SV_GUARD_COOLDOWN_MS;
      events.push({ k: 'guard', side });
    }
    // Queimadura: dano por segundo enquanto durar (o escudo também a cancela).
    if (team.burnMs > 0) {
      team.burnMs = Math.max(0, team.burnMs - dt);
      if (team.guardMs <= 0 && team.shieldMs <= 0) damageActive(team, side, team.burnDps * sec, events);
      if (team.burnMs <= 0) team.burnDps = 0;
    }
    team.slowMs = Math.max(0, team.slowMs - dt);
    team.stunMs = Math.max(0, team.stunMs - dt);
    const mon = team.mons[team.active];
    if (!mon || mon.hp <= 0) continue;
    const beforeX = team.x;
    const beforeY = team.y;
    if (team.stunMs <= 0) {
      const len = Math.hypot(input.dx, input.dy);
      const scale = len > 1 ? 1 / len : 1;
      const speed = mon.speed * (team.slowMs > 0 ? 0.5 : 1) * (team.trailMs > 0 ? SV_TRAIL_SPEED_MULTIPLIER : 1);
      team.x = clamp(team.x + input.dx * scale * speed * sec, SV_MON_RADIUS, SV_ARENA_W - SV_MON_RADIUS);
      team.y = clamp(team.y + input.dy * scale * speed * sec, SV_MON_RADIUS, SV_ARENA_H - SV_MON_RADIUS);
    }
    stepTrail(state, side, Math.hypot(team.x - beforeX, team.y - beforeY), dt, events);
    stepOrbit(state, side, dt, events);
  }

  // A marca de área nunca acompanha o alvo. Quem sair do círculo antes do fim não é atingido.
  const markers: ArenaMarker[] = [];
  for (const marker of state.markers) {
    marker.leftMs -= dt;
    if (marker.leftMs > 0) { markers.push(marker); continue; }
    const targetSide: ArenaSide = marker.side === 0 ? 1 : 0;
    const target = state.sides[targetSide];
    if (Math.hypot(marker.x - target.x, marker.y - target.y) <= marker.radius + SV_MON_RADIUS) {
      const owner = state.sides[marker.side];
      const ownerMon = owner.mons[owner.active];
      hitActive(target, targetSide, marker.type, marker.damage, events, ownerMon?.moveEffect, ownerMon ? { team: owner, mon: ownerMon } : null);
    }
  }
  state.markers = markers;

  // Golpes novos preservam a forma e os buffs conquistados na run. Marcadores criados aqui
  // só começam a contar no próximo quadro: os 1,5 s inteiros ficam visíveis no chão.
  for (const side of [0, 1] as const) {
    const team = state.sides[side];
    const mon = team.mons[team.active];
    if (!mon || mon.hp <= 0 || team.stunMs > 0) continue;
    if (team.rapidPending > 0) {
      team.rapidDelayMs -= dt;
      if (team.rapidDelayMs <= 0) {
        pushShots(state, side, { damageFactor: 0.62, spread: RAPID_BURST_SPREAD });
        team.rapidPending--;
        team.rapidDelayMs = RAPID_BURST_SHOT_INTERVAL_MS;
      }
    }
    team.fireMs -= dt;
    if (team.fireMs > 0) continue;
    team.fireMs = cycleMs(mon);
    fireAttack(state, side, events);
  }

  // Golpes no ar: andam, acertam o Pokémon em campo do outro lado ou somem. Quem atravessa segue depois de acertar.
  const kept: ArenaShot[] = [];
  for (const shot of state.shots) {
    shot.x += shot.vx * sec;
    shot.y += shot.vy * sec;
    shot.ageMs += dt;
    if (shot.ageMs > (shot.lifeMs ?? SV_SHOT_LIFE_MS) || shot.x < -20 || shot.x > SV_ARENA_W + 20 || shot.y < -20 || shot.y > SV_ARENA_H + 20) continue;
    const targetSide: ArenaSide = shot.side === 0 ? 1 : 0;
    const target = state.sides[targetSide];
    const defender = target.mons[target.active];
    if (!shot.spent && defender && defender.hp > 0 && Math.hypot(shot.x - target.x, shot.y - target.y) < SV_MON_RADIUS + shot.radius) {
      const owner = state.sides[shot.side];
      const ownerMon = owner.mons[owner.active];
      hitActive(target, targetSide, shot.type, shot.damage, events, shot.effect, ownerMon ? { team: owner, mon: ownerMon } : null);
      if (shot.pierce > 0) {
        shot.pierce--;
        shot.spent = true;
        kept.push(shot);
      }
      continue;
    }
    kept.push(shot);
  }
  state.shots = kept;

  if (state.timeMs > state.suddenDeathMs) {
    for (const side of [0, 1] as const) {
      const team = state.sides[side];
      const mon = team.mons[team.active];
      if (mon && mon.hp > 0 && team.guardMs <= 0) damageActive(team, side, mon.maxHp * SV_SUDDEN_DRAIN_PER_S * sec, events);
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
  /** Escudo do botão e a recarga dele. */
  guardMs?: number;
  guardCdMs?: number;
  /** Fase dos orbitais e carga/tempo/pontos da Trilha: a tela do convidado desenha o mesmo que o anfitrião. */
  orbitAngle?: number;
  trailCharge?: number;
  trailMs?: number;
  trail?: { x: number; y: number }[];
  /** Efeitos em andamento (só para mostrar o ícone). */
  burnMs?: number;
  slowMs?: number;
  stunMs?: number;
  /** Quem está usando o segundo ataque e a recarga do botão. */
  alt?: boolean[];
  attackSwapCdMs?: number;
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
    guardMs: Math.round(t.guardMs), guardCdMs: Math.round(t.guardCdMs), orbitAngle: Math.round(t.orbitAngle * 1000) / 1000,
    trailCharge: Math.round(t.trailCharge * 100) / 100, trailMs: Math.round(t.trailMs),
    trail: t.trail.slice(-SV_TRAIL_MAX_POINTS).map((p) => ({ x: round1(p.x), y: round1(p.y) })),
    burnMs: Math.round(t.burnMs), slowMs: Math.round(t.slowMs), stunMs: Math.round(t.stunMs),
    ...(t.mons.some((m) => m.alt) ? { alt: t.mons.map((m) => m.altOn === true), attackSwapCdMs: Math.round(t.attackSwapCdMs) } : {}),
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
    team.mons.forEach((m, i) => {
      m.hp = clamp(s.hp[i] ?? 0, 0, m.maxHp);
      if (s.alt && (s.alt[i] === true) !== (m.altOn === true)) swapForm(m);
    });
    team.attackSwapCdMs = s.attackSwapCdMs ?? 0;
    team.active = s.active;
    team.x = s.x;
    team.y = s.y;
    team.fireMs = s.fireMs;
    team.switchCdMs = s.switchCdMs;
    team.shieldMs = s.shieldMs;
    team.guardMs = s.guardMs ?? 0;
    team.guardCdMs = s.guardCdMs ?? 0;
    team.orbitAngle = s.orbitAngle ?? 0;
    team.trailCharge = s.trailCharge ?? 0;
    team.trailMs = s.trailMs ?? 0;
    team.trail = (s.trail ?? []).map((p) => ({ x: p.x, y: p.y, bornMs: snap.timeMs }));
    team.burnMs = s.burnMs ?? 0;
    team.slowMs = s.slowMs ?? 0;
    team.stunMs = s.stunMs ?? 0;
  }
  state.timeMs = snap.timeMs;
  state.countdownMs = snap.countdownMs;
  state.winner = snap.winner;
  state.shots = snap.shots.map((s) => ({ id: s.id, side: s.side, x: s.x, y: s.y, vx: s.vx, vy: s.vy, damage: 0, type: s.type, ageMs: 0, radius: s.radius, pierce: 0 }));
  state.markers = snap.markers.map((m) => ({ id: m.id, side: m.side, x: m.x, y: m.y, radius: m.radius, damage: 0, type: m.type, leftMs: m.leftMs }));
  return true;
}
