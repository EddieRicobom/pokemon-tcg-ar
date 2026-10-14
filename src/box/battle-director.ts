import { AdditiveBlending, Sprite, SpriteMaterial, Vector3 } from 'three';
import type { PerspectiveCamera, Scene } from 'three';
import { effectivenessLabel, PERSONALITY_LABELS_PT, STATUS_LABELS_PT } from '../core/battle';
import type { BattleResult, BattleTurn, Fighter, Personality, Rng, StatusKind } from '../core/battle';
import { TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import type { BoxCreature } from './creature';
import { neutralFx } from './creature';
import {
  BoltLine, emitBeamStep, emitBurst, emitCharge, emitConfetti, emitImpact, emitQuakeStep, emitSlash, emitStatusAmbient, emitStreamStep,
  emitSwarmStep, emitTrail, glowMap, hitTint, IMPACT_STYLES, ParticleField, PHYSICAL_STYLE, RingField, SPECIAL_DELIVERY, STATUS_COLORS_CSS,
  STATUS_TINTS, typeColorHex,
} from './effects';
import type { PhysicalStyle, SpecialDelivery } from './effects';
import { stepToward } from './wander';

export type LabelTone = 'damage' | 'crit' | 'good' | 'bad' | 'miss' | 'info' | 'status';

export interface HudBar {
  id: string;
  name: string;
  types: PokemonType[];
  personality: Personality;
  status: StatusKind | null;
  guard: boolean;
  hp: number;
  maxHp: number;
  /** 0–1, já animado. */
  frac: number;
  /** Posição na tela (0–100 %). */
  x: number;
  y: number;
  visible: boolean;
  fainted: boolean;
  quality: Fighter['quality'];
}

export interface HudLabel {
  key: number;
  text: string;
  tone: LabelTone;
  color: string;
  x: number;
  y: number;
  visible: boolean;
  /** 0–1. */
  age: number;
}

export interface BattleHud {
  phase: 'intro' | 'fight' | 'finished';
  banner: { text: string; sub: string; color: string } | null;
  bars: HudBar[];
  labels: HudLabel[];
  /** Clarão sobre a tela toda (golpes fortes). */
  flash: { color: string; strength: number } | null;
  winner: { id: string; name: string; hpLeft: number; maxHp: number } | null;
  turn: number;
  totalTurns: number;
  round: number;
}

export interface DirectorOptions {
  fighters: readonly Fighter[];
  creatures: readonly BoxCreature[];
  result: BattleResult;
  scene: Scene;
  camera: PerspectiveCamera;
  anchor: () => Vector3;
  half: number;
  rng: Rng;
}

// ----------------------------------------------------------------------------- tempos de cada golpe (ms)

export const INTRO_MAX_MS = 2800;
const INTRO_MIN_MS = 1300;
const SETTLE_MS = 700;
const FAINT_EXTRA_MS = 450;
export const GUARD_MS = 950;
export const SKIP_MS = 850;
export const RESIDUAL_MS = 900;

const MELEE_TIMES: Record<PhysicalStyle, { windup: number; approach: number; strike: number }> = {
  tackle: { windup: 350, approach: 520, strike: 170 },
  jab: { windup: 300, approach: 420, strike: 420 },
  dive: { windup: 300, approach: 650, strike: 140 },
  slash: { windup: 300, approach: 480, strike: 240 },
  stomp: { windup: 450, approach: 0, strike: 560 },
};
const RANGED_TIMES: Record<SpecialDelivery, { windup: number; travel: number }> = {
  orb: { windup: 560, travel: 430 },
  bolt: { windup: 480, travel: 380 },
  stream: { windup: 520, travel: 450 },
  swarm: { windup: 520, travel: 520 },
  beam: { windup: 520, travel: 480 },
  quake: { windup: 480, travel: 520 },
};
/** Quem é agressivo ataca sem enrolar; o veloz é rápido em tudo; o defensivo pensa mais. */
const WINDUP_SCALE: Record<Personality, number> = { agressivo: 0.8, veloz: 0.65, defensivo: 1.15, equilibrado: 1 };
const ACTIVE_SCALE: Record<Personality, number> = { agressivo: 1, veloz: 0.8, defensivo: 1, equilibrado: 1 };

export type AttackStyle = { family: 'melee'; variant: PhysicalStyle } | { family: 'ranged'; delivery: SpecialDelivery };

export interface TurnPlan {
  style: AttackStyle | null;
  windup: number;
  /** Aproximação (golpe físico) ou trajeto (especial). */
  travel: number;
  /** Só golpes físicos: duração do golpe em si, depois da aproximação. */
  strike: number;
  /** Instante (ms desde o começo do turno) em que o golpe acerta. */
  impactAt: number;
  total: number;
}

export function attackStyleOf(turn: Pick<BattleTurn, 'move'>): AttackStyle {
  return turn.move.special
    ? { family: 'ranged', delivery: SPECIAL_DELIVERY[turn.move.type] }
    : { family: 'melee', variant: PHYSICAL_STYLE[turn.move.type] };
}

export function turnPlan(turn: Pick<BattleTurn, 'kind' | 'move' | 'fainted'>, personality: Personality = 'equilibrado'): TurnPlan {
  const faint = turn.fainted ? FAINT_EXTRA_MS : 0;
  if (turn.kind === 'guard') return { style: null, windup: 0, travel: 0, strike: 0, impactAt: 0, total: GUARD_MS };
  if (turn.kind === 'skip') return { style: null, windup: 0, travel: 0, strike: 0, impactAt: 0, total: SKIP_MS };
  if (turn.kind === 'residual') return { style: null, windup: 0, travel: 0, strike: 0, impactAt: 0, total: RESIDUAL_MS + faint };
  const style = attackStyleOf(turn);
  const w = WINDUP_SCALE[personality];
  const a = ACTIVE_SCALE[personality];
  if (style.family === 'melee') {
    const t = MELEE_TIMES[style.variant];
    const windup = Math.round(t.windup * w);
    const travel = Math.round(t.approach * a);
    const strike = Math.round(t.strike * a);
    const impactAt = windup + travel + strike;
    return { style, windup, travel, strike, impactAt, total: impactAt + SETTLE_MS + faint };
  }
  const t = RANGED_TIMES[style.delivery];
  const windup = Math.round(t.windup * w);
  const travel = Math.round(t.travel * a);
  return { style, windup, travel, strike: 0, impactAt: windup + travel, total: windup + travel + SETTLE_MS + faint };
}

/** Duração total de um evento (para testes e para a interface estimar). */
export function turnDuration(turn: Pick<BattleTurn, 'kind' | 'move' | 'fainted'>, personality: Personality = 'equilibrado'): number {
  return turnPlan(turn, personality).total;
}

const HP_TWEEN_MS = 450;
const LABEL_TTL_MS = 1250;
const CONFETTI_MS = 3500;
const FLASH_MS = 260;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** Agitação parado, por personalidade: o agressivo é inquieto, o veloz saltita, o defensivo fica firme. */
const IDLE: Record<Personality, { amplitude: number; freq: number }> = {
  agressivo: { amplitude: 0.035, freq: 0.007 },
  veloz: { amplitude: 0.05, freq: 0.011 },
  defensivo: { amplitude: 0.012, freq: 0.003 },
  equilibrado: { amplitude: 0.02, freq: 0.005 },
};
/** Intensidade da comemoração do vencedor. */
const CELEBRATE: Record<Personality, { height: number; freq: number; scale: number }> = {
  agressivo: { height: 0.18, freq: 0.009, scale: 0.14 },
  veloz: { height: 0.14, freq: 0.014, scale: 0.06 },
  defensivo: { height: 0.08, freq: 0.005, scale: 0.1 },
  equilibrado: { height: 0.14, freq: 0.008, scale: 0.08 },
};

interface FloatLabel {
  key: number;
  text: string;
  tone: LabelTone;
  color: string;
  at: Vector3;
  born: number;
}

/** Efeitos de um quadro para um Pokémon, somados e depois escritos em `BoxCreature.fx`. */
interface Frame {
  dx: number;
  dy: number;
  dz: number;
  scale: number;
  squash: number;
  tint: number;
}

const newFrame = (): Frame => ({ dx: 0, dy: 0, dz: 0, scale: 1, squash: 1, tint: 0xffffff });

/**
 * Encena uma batalha já simulada (`simulateBattle`). Reúne os Pokémon em roda e, evento a evento, cada um age do
 * seu jeito: golpe físico corpo a corpo (investida, socos, mergulho, pisão ou cortes, conforme o tipo) ou especial
 * (bola, raio, jato, enxame, feixe ou tremor), com efeitos do tipo; defesa com escudo; paralisia, congelamento,
 * queimadura e veneno com efeito contínuo; impacto com empurrão, onda de choque e clarão. No fim o vencedor
 * comemora. Texto (barras, números, avisos) sai em `hud` para a interface desenhar sobre a câmera.
 */
export class BattleDirector {
  readonly particles = new ParticleField();
  readonly rings = new RingField();
  private readonly bolt = new BoltLine();
  private readonly projectile: Sprite;
  private readonly shields: Sprite[];
  private clock = 0;
  private phase: BattleHud['phase'] = 'intro';
  private turnIndex = 0;
  private turnClock = 0;
  private impactDone = false;
  private miniDone = new Set<number>();
  private labelSeq = 0;
  private labels: FloatLabel[] = [];
  private banner: BattleHud['banner'] = null;
  private readonly home: { x: number; z: number }[] = [];
  private readonly shownHp: number[];
  private readonly hpAnim: { from: number; to: number; at: number }[];
  private readonly flashUntil: number[];
  private readonly flashColor: number[];
  private readonly shakeUntil: number[];
  private readonly dodgeUntil: number[];
  private readonly knock: { x: number; z: number; at: number }[];
  private readonly faintAt: number[];
  private readonly status: (StatusKind | null)[];
  private readonly guard: boolean[];
  private readonly ambientAt: number[];
  private readonly frames: Frame[];
  private screenFlash: { color: string; at: number; strength: number } | null = null;
  private finishedAt = 0;
  private lastConfetti = 0;
  private lastBolt = 0;
  private cachedHud: BattleHud | null = null;

  constructor(private readonly o: DirectorOptions) {
    const n = o.fighters.length;
    this.shownHp = o.fighters.map((f) => f.maxHp);
    this.hpAnim = o.fighters.map((f) => ({ from: f.maxHp, to: f.maxHp, at: 0 }));
    this.flashUntil = new Array<number>(n).fill(0);
    this.flashColor = new Array<number>(n).fill(0xffffff);
    this.shakeUntil = new Array<number>(n).fill(0);
    this.dodgeUntil = new Array<number>(n).fill(0);
    this.knock = Array.from({ length: n }, () => ({ x: 0, z: 0, at: -1e9 }));
    this.faintAt = new Array<number>(n).fill(-1);
    this.status = new Array<StatusKind | null>(n).fill(null);
    this.guard = new Array<boolean>(n).fill(false);
    this.ambientAt = new Array<number>(n).fill(0);
    this.frames = Array.from({ length: n }, newFrame);
    const radius = Math.min(o.half * 0.62, Math.max(0.45, 0.2 + n * 0.1));
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2 + Math.PI / 2;
      this.home.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius });
    }
    for (const c of o.creatures) Object.assign(c.fx, neutralFx());
    o.scene.add(this.particles.group, this.rings.group, this.bolt.group);
    this.projectile = new Sprite(new SpriteMaterial({ map: glowMap(), color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false }));
    this.projectile.visible = false;
    o.scene.add(this.projectile);
    this.shields = o.fighters.map(() => {
      const shield = new Sprite(new SpriteMaterial({ map: glowMap(), color: 0x7fd4ff, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0.55 }));
      shield.visible = false;
      o.scene.add(shield);
      return shield;
    });
    this.banner = { text: 'Batalha!', sub: `${n} Pokémon, todos contra todos`, color: '#ffcb05' };
  }

  get finished(): boolean {
    return this.phase === 'finished';
  }

  get currentPhase(): BattleHud['phase'] {
    return this.phase;
  }

  get currentTurn(): number {
    return this.turnIndex;
  }

  /** Posição de cada um na roda de batalha (relativa ao centro da caixa). */
  homePosition(index: number): { x: number; z: number } {
    return this.home[index]!;
  }

  /** Condição atual de um lutador (para testes e a interface). */
  statusOf(index: number): StatusKind | null {
    return this.status[index] ?? null;
  }

  guarding(index: number): boolean {
    return this.guard[index] ?? false;
  }

  private personality(i: number): Personality {
    return this.o.fighters[i]!.personality;
  }

  private world(i: number, lift = 0): Vector3 {
    const c = this.o.creatures[i]!;
    const a = this.o.anchor();
    return new Vector3(a.x + c.state.x + c.fx.dx, a.y + lift, a.z + c.state.z + c.fx.dz);
  }

  private chest(i: number): Vector3 {
    const c = this.o.creatures[i]!;
    return this.world(i, c.height * 0.5 * c.fx.scale + Math.max(0, c.fx.dy));
  }

  private top(i: number, extra = 0.1): Vector3 {
    return this.world(i, this.o.creatures[i]!.height + extra);
  }

  private addLabel(text: string, tone: LabelTone, color: string, at: Vector3): void {
    this.labels.push({ key: ++this.labelSeq, text, tone, color, at: at.clone(), born: this.clock });
    if (this.labels.length > 14) this.labels.shift();
  }

  private flash(color: string, strength: number): void {
    this.screenFlash = { color, at: this.clock, strength };
  }

  private every(t: number, dt: number, period: number): boolean {
    return Math.floor(t / period) !== Math.floor((t - dt) / period);
  }

  update(dtMs: number): void {
    const dt = Math.min(Math.max(dtMs, 0), 100);
    this.clock += dt;
    this.particles.update(dt);
    this.rings.update(dt);
    this.labels = this.labels.filter((l) => this.clock - l.born < LABEL_TTL_MS);
    this.tweenHp();
    for (const f of this.frames) Object.assign(f, newFrame());
    for (let i = 0; i < this.o.creatures.length; i++) this.applyIdle(i);

    if (this.phase === 'intro') this.updateIntro(dt);
    else if (this.phase === 'fight') this.updateTurn(dt);
    else this.updateFinished();

    this.applyPersistent();
    this.commit();
    this.cachedHud = null;
  }

  // ------------------------------------------------------------------------- comportamento parado

  /** Cada personalidade se mexe de um jeito enquanto espera; com poucos PS o Pokémon treme de cansaço. */
  private applyIdle(i: number): void {
    if (this.faintAt[i]! >= 0 || (this.o.result.hpLeft[i] === 0 && this.phase === 'finished')) return;
    const f = this.frames[i]!;
    const style = IDLE[this.personality(i)];
    f.dy += Math.abs(Math.sin(this.clock * style.freq + i * 1.7)) * style.amplitude;
    const frac = this.shownHp[i]! / this.o.fighters[i]!.maxHp;
    if (frac < 0.3 && this.phase !== 'intro') {
      f.dx += Math.sin(this.clock * 0.05 + i) * 0.012;
      f.squash *= 0.97;
    }
  }

  /** Efeitos que valem o tempo todo: condições, escudos, empurrões, desmaio. */
  private applyPersistent(): void {
    this.o.creatures.forEach((c, i) => {
      const f = this.frames[i]!;
      const fainted = this.faintAt[i]! >= 0;
      // Empurrão do golpe: sai disparado e volta suave.
      const k = this.knock[i]!;
      const ku = clamp01((this.clock - k.at) / 520);
      if (ku < 1) {
        const push = Math.sin(ku * Math.PI) * (1 - ku * 0.2);
        f.dx += k.x * push;
        f.dz += k.z * push;
      }
      // Cor: clarão do golpe > cor da condição.
      const status = this.status[i] ?? null;
      if (this.clock < this.flashUntil[i]!) f.tint = this.flashColor[i]!;
      else if (status && !fainted) f.tint = status === 'paralysis' && Math.floor(this.clock / 90) % 4 === 0 ? 0xffffff : STATUS_TINTS[status];
      // Efeito contínuo da condição.
      if (status && !fainted && this.clock - this.ambientAt[i]! > (status === 'paralysis' ? 90 : 140)) {
        this.ambientAt[i] = this.clock;
        emitStatusAmbient(this.particles, this.chest(i), status, this.o.rng, c.height);
      }
      // Escudo da defesa.
      const shield = this.shields[i]!;
      shield.visible = this.guard[i]! && !fainted;
      if (shield.visible) {
        const pulse = 1 + 0.06 * Math.sin(this.clock * 0.012 + i);
        const size = Math.max(c.width, c.height) * 1.35 * pulse;
        shield.position.copy(this.chest(i));
        shield.scale.setScalar(size);
        shield.material.opacity = 0.45 + 0.15 * Math.sin(this.clock * 0.01);
      }
      if (fainted) {
        f.dy = 0;
        c.fx.faint = easeInOut(clamp01((this.clock - this.faintAt[i]! - 300) / 600));
      }
    });
  }

  private commit(): void {
    this.o.creatures.forEach((c, i) => {
      const f = this.frames[i]!;
      c.fx.dx = f.dx;
      c.fx.dy = f.dy;
      c.fx.dz = f.dz;
      c.fx.scale = f.scale;
      c.fx.squash = f.squash;
      c.fx.tint = f.tint;
    });
  }

  // ------------------------------------------------------------------------- introdução

  private updateIntro(dt: number): void {
    let allThere = true;
    this.o.creatures.forEach((c, i) => {
      const spot = this.home[i]!;
      const arrived = stepToward(c.state, spot.x, spot.z, dt, 1.3);
      if (!arrived) allThere = false;
      c.fx.facing = { x: -spot.x, z: -spot.z };
      // Depois de chegar, cada um faz a sua pose (um de cada vez).
      const t = this.clock - 600 - i * 140;
      if (arrived && t > 0 && t < 420) {
        const f = this.frames[i]!;
        const pose = this.personality(i);
        f.dy += Math.sin((t / 420) * Math.PI) * (pose === 'veloz' ? 0.2 : pose === 'defensivo' ? 0.06 : 0.14);
        f.scale *= 1 + (pose === 'agressivo' ? 0.18 : 0.08) * Math.sin((t / 420) * Math.PI);
      }
    });
    if ((allThere && this.clock >= INTRO_MIN_MS) || this.clock >= INTRO_MAX_MS) {
      for (const c of this.o.creatures) {
        c.state.vx = 0;
        c.state.vz = 0;
      }
      this.phase = 'fight';
      this.turnClock = 0;
      this.startTurn();
    }
  }

  // ------------------------------------------------------------------------- turnos

  private currentTurnData(): BattleTurn | null {
    return this.o.result.turns[this.turnIndex] ?? null;
  }

  private startTurn(): void {
    const turn = this.currentTurnData();
    if (!turn) return this.finish();
    this.impactDone = false;
    this.miniDone.clear();
    const fighter = this.o.fighters[turn.attacker]!;
    const personality = PERSONALITY_LABELS_PT[fighter.personality];
    // A guarda dura até ele agir de novo.
    if (turn.kind !== 'guard') this.guard[turn.attacker] = false;
    if (turn.kind === 'attack') {
      const source = turn.move.source === 'carta' ? 'ataque da carta' : turn.move.source === 'jogo' ? 'golpe do jogo' : 'golpe padrão';
      this.banner = {
        text: `${fighter.name} usou ${turn.move.name}!`,
        sub: `${personality} · ${TYPE_LABELS_PT[turn.move.type]} · ${turn.move.special ? 'especial' : 'físico'} · ${source}`,
        color: TYPE_COLORS[turn.move.type],
      };
      if (turn.thawed) {
        this.status[turn.attacker] = null;
        this.addLabel('Descongelou!', 'status', STATUS_COLORS_CSS.freeze, this.top(turn.attacker, 0.15));
        emitBurst(this.particles, this.chest(turn.attacker), 'ice', 0.8, this.o.rng);
      }
      if (turn.revenge) this.addLabel('Vingança!', 'info', '#fda4af', this.top(turn.attacker, 0.22));
    } else if (turn.kind === 'guard') {
      this.banner = { text: `${fighter.name} se defendeu!`, sub: `${personality} · o próximo golpe causa metade do dano`, color: '#7fd4ff' };
    } else if (turn.kind === 'skip') {
      this.banner = {
        text: turn.cause === 'freeze' ? `${fighter.name} está congelado!` : `${fighter.name} está paralisado!`,
        sub: 'Não consegue se mover',
        color: STATUS_COLORS_CSS[turn.cause ?? 'paralysis'],
      };
    } else {
      this.banner = {
        text: `${fighter.name} sofre com ${turn.cause === 'burn' ? 'a queimadura' : 'o veneno'}`,
        sub: STATUS_LABELS_PT[turn.cause ?? 'burn'],
        color: STATUS_COLORS_CSS[turn.cause ?? 'burn'],
      };
    }
  }

  private face(i: number, toward: number): void {
    const a = this.o.creatures[i]!;
    const b = this.o.creatures[toward]!;
    a.fx.facing = { x: b.state.x - a.state.x, z: b.state.z - a.state.z };
  }

  private updateTurn(dt: number): void {
    const turn = this.currentTurnData();
    if (!turn) return this.finish();
    this.turnClock += dt;
    const t = this.turnClock;
    const plan = turnPlan(turn, this.personality(turn.attacker));
    this.o.creatures.forEach((_, i) => this.face(i, i === turn.target ? turn.attacker : turn.target));

    if (turn.kind === 'attack') this.runAttack(turn, plan, t, dt);
    else if (turn.kind === 'guard') this.runGuard(turn, t, dt);
    else if (turn.kind === 'skip') this.runSkip(turn, t);
    else this.runResidual(turn, t);

    if (t >= plan.total) this.endTurn(turn);
  }

  private endTurn(turn: BattleTurn): void {
    const c = this.o.creatures[turn.attacker]!;
    const home = this.home[turn.attacker]!;
    c.state.x = home.x;
    c.state.z = home.z;
    c.state.vx = 0;
    c.state.vz = 0;
    this.projectile.visible = false;
    this.bolt.hide();
    this.turnIndex++;
    this.turnClock = 0;
    if (this.turnIndex >= this.o.result.turns.length) this.finish();
    else this.startTurn();
  }

  // --- golpe

  private runAttack(turn: BattleTurn, plan: TurnPlan, t: number, dt: number): void {
    const style = plan.style!;
    const attacker = this.o.creatures[turn.attacker]!;
    const fa = this.frames[turn.attacker]!;
    const type = turn.move.type;
    const homeA = this.home[turn.attacker]!;
    const homeT = this.home[turn.target]!;
    attacker.state.vx = 0;
    attacker.state.vz = 0;
    const personality = this.personality(turn.attacker);

    if (style.family === 'melee') {
      const variant = style.variant;
      const gap = variant === 'dive' ? 0.3 : variant === 'jab' ? 0.38 : 0.42;
      const dirX = homeT.x - homeA.x;
      const dirZ = homeT.z - homeA.z;
      const dist = Math.hypot(dirX, dirZ) || 1;
      const ux = dirX / dist;
      const uz = dirZ / dist;
      const stand = { x: homeT.x - ux * gap, z: homeT.z - uz * gap };
      const { windup, travel, strike, impactAt } = plan;

      if (variant === 'stomp') {
        // Pisão: agacha, salta no lugar, cai e a onda de choque corre pelo chão até o alvo.
        const jump = 260;
        const run = strike - jump;
        if (t < windup) {
          fa.squash *= 1 - 0.25 * Math.sin((t / windup) * Math.PI * 0.5);
          if (this.every(t, dt, 90)) emitCharge(this.particles, this.chest(turn.attacker), type, this.o.rng);
        } else if (t < windup + jump) {
          const u = (t - windup) / jump;
          fa.dy += Math.sin(u * Math.PI) * 0.38;
          fa.squash *= 1 + 0.1 * Math.sin(u * Math.PI);
        } else if (t < impactAt) {
          if (!this.miniDone.has(1)) {
            this.miniDone.add(1);
            this.rings.emit(this.world(turn.attacker), typeColorHex(type), 0.55, 480);
            emitBurst(this.particles, this.world(turn.attacker, 0.05), type, 0.6, this.o.rng);
          }
          const u = (t - windup - jump) / run;
          emitQuakeStep(this.particles, this.world(turn.attacker), this.world(turn.target), u, type, this.o.rng);
        }
      } else {
        if (t < windup) {
          fa.squash *= 1 - 0.2 * Math.sin((t / windup) * Math.PI * 0.5);
          if (personality === 'agressivo') fa.scale *= 1 + 0.12 * (t / windup);
          if (this.every(t, dt, 90)) emitCharge(this.particles, this.chest(turn.attacker), type, this.o.rng);
        } else if (t < windup + travel) {
          const u = easeInOut((t - windup) / travel);
          attacker.state.x = homeA.x + (stand.x - homeA.x) * u;
          attacker.state.z = homeA.z + (stand.z - homeA.z) * u;
          attacker.state.vx = ux;
          attacker.state.vz = uz;
          attacker.state.hopPhase += (dt / 1000) * (personality === 'veloz' ? 20 : 14);
          if (variant === 'dive') fa.dy += Math.sin(u * Math.PI) * 0.5;
          // Rastro de quem corre.
          if (personality === 'veloz' || variant === 'dive') emitTrail(this.particles, this.chest(turn.attacker), type, this.o.rng);
        } else if (t < impactAt) {
          const u = (t - windup - travel) / strike;
          attacker.state.x = stand.x;
          attacker.state.z = stand.z;
          if (variant === 'jab') {
            // Três socos rápidos; os dois primeiros só mostram faíscas.
            const phase = u * 3;
            const jab = Math.sin((phase % 1) * Math.PI);
            fa.dx += ux * 0.14 * jab;
            fa.dz += uz * 0.14 * jab;
            fa.scale *= 1 + 0.12 * jab;
            for (const n of [1, 2]) {
              if (phase >= n && !this.miniDone.has(n)) {
                this.miniDone.add(n);
                emitBurst(this.particles, this.chest(turn.target), type, 0.35, this.o.rng);
                this.knock[turn.target] = { x: ux * 0.03, z: uz * 0.03, at: this.clock };
              }
            }
          } else {
            const bump = Math.sin(u * Math.PI);
            fa.dx += ux * (variant === 'dive' ? 0.08 : 0.2) * bump;
            fa.dz += uz * (variant === 'dive' ? 0.08 : 0.2) * bump;
            fa.scale *= 1 + 0.18 * bump;
            if (variant === 'slash') {
              for (const [n, at] of [[1, 0.35], [2, 0.75]] as const) {
                if (u >= at && !this.miniDone.has(n)) {
                  this.miniDone.add(n);
                  emitSlash(this.particles, this.chest(turn.target), type, this.o.rng, n === 1 ? 1 : -1);
                }
              }
            }
          }
        } else {
          const back = clamp01((t - impactAt - 200) / 450);
          const u = easeInOut(back);
          attacker.state.x = stand.x + (homeA.x - stand.x) * u;
          attacker.state.z = stand.z + (homeA.z - stand.z) * u;
          if (back > 0 && back < 1) {
            attacker.state.vx = -ux;
            attacker.state.vz = -uz;
            attacker.state.hopPhase += (dt / 1000) * 10;
            if (variant === 'dive') fa.dy += Math.sin(back * Math.PI) * 0.3;
          }
        }
      }
    } else {
      this.runRanged(turn, style.delivery, plan, t, dt);
    }

    if (t >= plan.impactAt && !this.impactDone) this.impact(turn);
    if (this.impactDone) this.afterImpact(turn);
  }

  private runRanged(turn: BattleTurn, delivery: SpecialDelivery, plan: TurnPlan, t: number, dt: number): void {
    const type = turn.move.type;
    const fa = this.frames[turn.attacker]!;
    const { windup, travel, impactAt } = plan;
    const from = this.chest(turn.attacker);
    const to = this.chest(turn.target);
    if (t < windup) {
      const u = t / windup;
      fa.squash *= 1 - 0.16 * Math.sin(u * Math.PI);
      fa.scale *= 1 + 0.1 * u;
      if (this.every(t, dt, delivery === 'bolt' ? 30 : 45)) emitCharge(this.particles, from, type, this.o.rng);
      return;
    }
    if (t >= impactAt) {
      this.projectile.visible = false;
      this.bolt.hide();
      return;
    }
    const u = (t - windup) / travel;
    fa.scale *= 1.1 - 0.1 * u;
    switch (delivery) {
      case 'orb': {
        const pos = from.clone().lerp(to, u);
        pos.y += Math.sin(u * Math.PI) * 0.12;
        if (type === 'ghost' || type === 'dark') {
          // Orbes sombrios ondulam.
          pos.x += Math.sin(u * 24) * 0.04;
          pos.y += Math.cos(u * 18) * 0.03;
        }
        this.projectile.visible = true;
        this.projectile.position.copy(pos);
        this.projectile.material.color.setHex(typeColorHex(type));
        this.projectile.scale.setScalar((type === 'fire' ? 0.3 : 0.24) + 0.06 * Math.sin(u * 20));
        emitTrail(this.particles, pos, type, this.o.rng);
        if (type === 'fire') emitTrail(this.particles, pos, type, this.o.rng);
        break;
      }
      case 'bolt': {
        // Raio instantâneo que treme (refeito a cada ~45 ms), com faíscas no caminho.
        if (this.clock - this.lastBolt >= 45 || !this.bolt.visible) {
          this.lastBolt = this.clock;
          this.bolt.show(from, to, typeColorHex(type), this.o.rng, type === 'electric' ? 0.1 : 0.06);
          const p = from.clone().lerp(to, this.o.rng());
          emitBurst(this.particles, p, type, 0.25, this.o.rng);
        }
        break;
      }
      case 'stream':
        if (this.every(t, dt, 33)) emitStreamStep(this.particles, from, to, travel, type, this.o.rng);
        break;
      case 'swarm':
        emitSwarmStep(this.particles, from, to, u, type, this.clock * 0.02, this.o.rng);
        break;
      case 'beam':
        emitBeamStep(this.particles, from, to, Math.min(1, u * 1.5), type, this.o.rng);
        break;
      case 'quake':
        emitQuakeStep(this.particles, this.world(turn.attacker), this.world(turn.target), u, type, this.o.rng);
        break;
    }
  }

  private impact(turn: BattleTurn): void {
    this.impactDone = true;
    this.projectile.visible = false;
    this.bolt.hide();
    const target = turn.target;
    const at = this.chest(target);
    const top = this.top(target);
    const css = TYPE_COLORS[turn.move.type];
    const type = turn.move.type;
    if (!turn.hit) {
      this.dodgeUntil[target] = this.clock + 420;
      this.addLabel('Errou!', 'miss', '#cbd5e1', top);
      // Vento da esquiva.
      for (let i = 0; i < 6; i++) emitBurst(this.particles, at, 'flying', 0.15, this.o.rng);
      return;
    }
    if (turn.damage === 0) {
      emitBurst(this.particles, at, type, 0.4, this.o.rng);
      this.addLabel(effectivenessLabel(0) ?? 'Não afeta…', 'info', '#cbd5e1', top);
      return;
    }
    const guarded = turn.guardedHit === true;
    const strength = (guarded ? 0.5 : 0.8) * Math.sqrt(turn.effectiveness) * (turn.critical ? 1.4 : 1);
    emitImpact(this.particles, this.rings, at, type, strength, this.o.rng);
    this.flashUntil[target] = this.clock + 320;
    this.flashColor[target] = hitTint(type);
    this.shakeUntil[target] = this.clock + 420;
    // Empurrão: para longe de quem atacou, proporcional ao tamanho do golpe.
    const a = this.home[turn.attacker]!;
    const b = this.home[target]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const frac = turn.damage / this.o.fighters[target]!.maxHp;
    const mag = Math.min(0.28, 0.05 + frac * 0.6) * (guarded ? 0.4 : 1);
    this.knock[target] = { x: ((b.x - a.x) / len) * mag, z: ((b.z - a.z) / len) * mag, at: this.clock };
    this.hpAnim[target] = { from: this.shownHp[target]!, to: turn.targetHpAfter, at: this.clock };
    this.addLabel(`-${turn.damage}`, turn.critical ? 'crit' : 'damage', css, top);
    let lift = 0.12;
    if (guarded) {
      this.guard[target] = false;
      this.addLabel('Bloqueou parte!', 'info', '#7fd4ff', top.clone().add(new Vector3(0, lift, 0)));
      lift += 0.12;
    }
    const label = effectivenessLabel(turn.effectiveness);
    if (label) {
      this.addLabel(label, turn.effectiveness > 1 ? 'good' : 'bad', turn.effectiveness > 1 ? '#86efac' : '#fca5a5', top.clone().add(new Vector3(0, lift, 0)));
      lift += 0.12;
    }
    if (turn.critical) {
      this.addLabel('Golpe crítico!', 'crit', '#fde047', top.clone().add(new Vector3(0, lift, 0)));
      lift += 0.12;
    }
    if (turn.inflicted) {
      this.status[target] = turn.inflicted;
      this.addLabel(STATUS_LABELS_PT[turn.inflicted] + '!', 'status', STATUS_COLORS_CSS[turn.inflicted], top.clone().add(new Vector3(0, lift, 0)));
      lift += 0.12;
    }
    if (turn.fainted) {
      this.faintAt[target] = this.clock;
      this.status[target] = null;
      this.guard[target] = false;
      this.addLabel(`${this.o.fighters[target]!.name} desmaiou!`, 'info', '#f8fafc', top.clone().add(new Vector3(0, lift, 0)));
    }
    // Clarão na tela: crítico, super efetivo forte ou tipos de energia bruta.
    if (turn.critical) this.flash('#ffffff', 0.35);
    else if (IMPACT_STYLES[type].flash) this.flash(css, 0.28);
    else if (turn.effectiveness >= 4) this.flash(css, 0.3);
  }

  private afterImpact(turn: BattleTurn): void {
    const i = turn.target;
    const f = this.frames[i]!;
    if (this.clock < this.shakeUntil[i]!) {
      const k = (this.shakeUntil[i]! - this.clock) / 420;
      f.dx += Math.sin(this.clock * 0.09) * 0.045 * k;
    }
    if (this.clock < this.dodgeUntil[i]!) {
      const u = 1 - (this.dodgeUntil[i]! - this.clock) / 420;
      f.dx += Math.sin(u * Math.PI) * 0.22;
      f.dy += Math.sin(u * Math.PI) * 0.1;
    }
  }

  // --- defesa, imobilizado e perda de PS no fim da rodada

  private runGuard(turn: BattleTurn, t: number, dt: number): void {
    const i = turn.attacker;
    const f = this.frames[i]!;
    const u = clamp01(t / 450);
    f.squash *= 1 - 0.18 * Math.sin(u * Math.PI * 0.5);
    f.scale *= 1 + 0.06 * u;
    if (!this.impactDone && t > 250) {
      this.impactDone = true;
      this.guard[i] = true;
      this.rings.emit(this.world(i), 0x7fd4ff, 0.5, 520);
      this.addLabel('Defendeu!', 'info', '#7fd4ff', this.top(i, 0.12));
    }
    if (this.every(t, dt, 60)) emitCharge(this.particles, this.chest(i), 'steel', this.o.rng);
  }

  private runSkip(turn: BattleTurn, t: number): void {
    const i = turn.attacker;
    const f = this.frames[i]!;
    const cause = turn.cause ?? 'paralysis';
    if (!this.impactDone && t > 150) {
      this.impactDone = true;
      this.addLabel(cause === 'freeze' ? 'Congelado!' : 'Paralisado!', 'status', STATUS_COLORS_CSS[cause], this.top(i, 0.12));
      emitBurst(this.particles, this.chest(i), cause === 'freeze' ? 'ice' : 'electric', 0.5, this.o.rng);
    }
    // Tenta se mexer e não consegue.
    if (cause === 'paralysis') f.dx += Math.sin(t * 0.12) * 0.03;
    else f.dx += Math.sin(t * 0.04) * 0.008;
    f.squash *= 1 - 0.06 * Math.sin((t / 400) * Math.PI);
  }

  private runResidual(turn: BattleTurn, t: number): void {
    const i = turn.attacker;
    const f = this.frames[i]!;
    const cause = turn.cause ?? 'burn';
    if (!this.impactDone && t > 200) {
      this.impactDone = true;
      this.hpAnim[i] = { from: this.shownHp[i]!, to: turn.targetHpAfter, at: this.clock };
      this.addLabel(`-${turn.damage}`, 'status', STATUS_COLORS_CSS[cause], this.top(i));
      this.flashUntil[i] = this.clock + 260;
      this.flashColor[i] = cause === 'burn' ? 0xff8a5c : 0xc58bff;
      emitBurst(this.particles, this.chest(i), cause === 'burn' ? 'fire' : 'poison', 0.5, this.o.rng);
    }
    f.dy += Math.abs(Math.sin(t * 0.02)) * 0.03;
  }

  // ------------------------------------------------------------------------- fim

  private tweenHp(): void {
    this.hpAnim.forEach((anim, i) => {
      const u = clamp01((this.clock - anim.at) / HP_TWEEN_MS);
      this.shownHp[i] = anim.from + (anim.to - anim.from) * easeInOut(u);
    });
  }

  private finish(): void {
    this.phase = 'finished';
    this.finishedAt = this.clock;
    this.projectile.visible = false;
    this.bolt.hide();
    const w = this.o.result.winner;
    const fighter = this.o.fighters[w]!;
    for (const [i, c] of this.o.creatures.entries()) {
      const down = (this.o.result.hpLeft[i] ?? 0) <= 0;
      if (down && this.faintAt[i]! < 0) this.faintAt[i] = this.clock - 1000;
      this.guard[i] = false;
      this.status[i] = null;
      c.fx.facing = null;
      c.state.vx = 0;
      c.state.vz = 0;
      this.shownHp[i] = this.o.result.hpLeft[i] ?? 0;
      this.hpAnim[i] = { from: this.shownHp[i]!, to: this.shownHp[i]!, at: this.clock };
    }
    this.banner = {
      text: `${fighter.name} venceu!`,
      sub: this.o.result.reason === 'ko' ? `Restaram ${this.o.result.hpLeft[w]} de ${fighter.maxHp} PS` : 'Fim do tempo: venceu quem tinha mais PS',
      color: '#ffcb05',
    };
  }

  private updateFinished(): void {
    const w = this.o.result.winner;
    const f = this.frames[w]!;
    const since = this.clock - this.finishedAt;
    const style = CELEBRATE[this.personality(w)];
    f.dy += Math.abs(Math.sin(since * style.freq)) * style.height;
    f.scale *= 1 + style.scale * Math.abs(Math.sin(since * style.freq));
    if (since < CONFETTI_MS && this.clock - this.lastConfetti > 50) {
      this.lastConfetti = this.clock;
      emitConfetti(this.particles, this.world(w), this.o.rng);
    }
    // Os derrotados ficam caídos; os demais respiram.
  }

  private project(point: Vector3): { x: number; y: number; visible: boolean } {
    const p = point.clone().project(this.o.camera);
    return { x: (p.x * 0.5 + 0.5) * 100, y: (1 - (p.y * 0.5 + 0.5)) * 100, visible: p.z < 1 && Math.abs(p.x) < 1.15 && Math.abs(p.y) < 1.15 };
  }

  /** Estado para a interface (calculado uma vez por quadro). */
  get hud(): BattleHud {
    if (this.cachedHud) return this.cachedHud;
    const { fighters, creatures, result } = this.o;
    const bars: HudBar[] = fighters.map((f, i) => {
      const c = creatures[i]!;
      const pos = this.project(this.world(i, c.height * c.fx.scale + 0.14));
      const hp = Math.max(0, Math.round(this.shownHp[i]!));
      return {
        id: f.id, name: f.name, types: f.types, personality: f.personality, status: this.status[i] ?? null, guard: this.guard[i] ?? false,
        hp, maxHp: f.maxHp, frac: clamp01(this.shownHp[i]! / f.maxHp), ...pos, fainted: c.fx.faint >= 0.5, quality: f.quality,
      };
    });
    const labels: HudLabel[] = this.labels.map((l) => {
      const age = clamp01((this.clock - l.born) / LABEL_TTL_MS);
      const pos = this.project(l.at.clone().add(new Vector3(0, age * 0.3, 0)));
      return { key: l.key, text: l.text, tone: l.tone, color: l.color, ...pos, age };
    });
    const flashAge = this.screenFlash ? (this.clock - this.screenFlash.at) / FLASH_MS : 1;
    const w = result.winner;
    this.cachedHud = {
      phase: this.phase,
      banner: this.banner,
      bars,
      labels,
      flash: this.screenFlash && flashAge < 1 ? { color: this.screenFlash.color, strength: this.screenFlash.strength * (1 - flashAge) } : null,
      winner: this.phase === 'finished' ? { id: fighters[w]!.id, name: fighters[w]!.name, hpLeft: result.hpLeft[w] ?? 0, maxHp: fighters[w]!.maxHp } : null,
      turn: Math.min(this.turnIndex + 1, result.turns.length),
      totalTurns: result.turns.length,
      round: result.turns[Math.min(this.turnIndex, result.turns.length - 1)]?.round ?? 1,
    };
    return this.cachedHud;
  }

  /** Devolve tudo ao normal (efeitos dos Pokémon, partículas) e tira os objetos da cena. */
  dispose(): void {
    for (const c of this.o.creatures) Object.assign(c.fx, neutralFx());
    this.particles.dispose();
    this.rings.dispose();
    this.bolt.dispose();
    this.projectile.material.dispose();
    this.projectile.removeFromParent();
    for (const s of this.shields) {
      s.material.dispose();
      s.removeFromParent();
    }
  }
}
