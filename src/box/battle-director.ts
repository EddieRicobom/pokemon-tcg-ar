import { AdditiveBlending, Sprite, SpriteMaterial, Vector3 } from 'three';
import type { Object3D, PerspectiveCamera } from 'three';
import { ArenaStage } from './arena';
import { effectivenessLabel, PERSONALITY_LABELS_PT, STATUS_LABELS_PT, TEAM_COLORS, TEAM_NAMES_PT } from '../core/battle';
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
import { FloorPools } from './fx-lights';
import type { SoundCue, SoundSink } from './sound-recipes';
import type { FxLight } from './fx-lights';
import { stepToward } from './wander';
import type { Ground } from './ground';

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
  /** É a vez dele (quem está agindo agora). */
  acting: boolean;
  quality: Fighter['quality'];
  /** Equipe (0 ou 1) e a cor dela; nulos em "todos contra todos". */
  team: number | null;
  teamColor: string | null;
  /** 3x3: está esperando a vez no banco. */
  reserve: boolean;
}

/** Placar das equipes: quantos ainda estão de pé. */
export interface HudTeamScore {
  team: number;
  name: string;
  color: string;
  alive: number;
  total: number;
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
  /** Tamanho relativo do texto (golpes grandes, números maiores). */
  size: number;
}

/** Aviso grande no meio da tela (crítico, super efetivo, nocaute…). */
export interface HudCallout {
  key: number;
  text: string;
  color: string;
  /** 0–1. */
  age: number;
}

/** Luz de golpe projetada na tela (%): o ambiente real (o vídeo) é clareado em volta dela. */
export interface HudLight {
  x: number;
  y: number;
  color: string;
  /** 0–1,5. */
  intensity: number;
  /** Raio na tela, em % da largura. */
  radius: number;
}

export interface BattleHud {
  phase: 'intro' | 'fight' | 'finished';
  banner: { text: string; sub: string; color: string } | null;
  bars: HudBar[];
  labels: HudLabel[];
  /** Clarão sobre a tela toda (golpes fortes). */
  flash: { color: string; strength: number } | null;
  /** Tremor e "soco" de zoom da imagem desenhada (em pixels e fator), nos golpes fortes. */
  shake: { x: number; y: number; zoom: number };
  /** Escurecimento da câmera (0–1) para dar foco ao golpe. */
  dim: number;
  /** Luzes dos golpes (carga, projétil, impacto) para clarear o vídeo em volta. */
  lights: HudLight[];
  callout: HudCallout | null;
  winner: { id: string; name: string; hpLeft: number; maxHp: number; team: number | null; teamName: string | null } | null;
  /** Só nas batalhas por equipes. */
  scoreboard: HudTeamScore[] | null;
  turn: number;
  totalTurns: number;
  round: number;
}

export interface DirectorOptions {
  fighters: readonly Fighter[];
  creatures: readonly BoxCreature[];
  result: BattleResult;
  /** Raiz da arena: ela fica no chão, girada para a tela e encolhida; tudo da batalha mora dentro dela. */
  root: Object3D;
  camera: PerspectiveCamera;
  /** Meios-eixos da arena (unidades da arena). */
  rx: number;
  rz: number;
  rng: Rng;
  /** Quem toca os sons da batalha (opcional: sem ele a batalha é muda). */
  sound?: SoundSink;
  /** Chão em pixel art que os golpes elementais marcam (padrão: desligado). */
  terrain?: boolean;
  /** Nomes das equipes (Ginásio: você e o líder; PvP: os dois treinadores). Padrão: Vermelha e Azul. */
  teamNames?: readonly string[];
  /** Faixa de abertura no lugar da padrão (ex.: "Roark desafia você!"). */
  banner?: { text: string; sub: string };
}

// ----------------------------------------------------------------------------- tempos de cada golpe (ms)

export const INTRO_MAX_MS = 2800;
const INTRO_MIN_MS = 1300;
const SETTLE_MS = 700;
const FAINT_EXTRA_MS = 450;
export const GUARD_MS = 950;
export const SKIP_MS = 850;
export const RESIDUAL_MS = 900;
export const ENTER_MS = 1000;

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
  if (turn.kind === 'enter') return { style: null, windup: 0, travel: 0, strike: 0, impactAt: 0, total: ENTER_MS };
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
const CALLOUT_MS = 950;
/** Faixa horizontal (% da tela) onde barras e avisos ficam inteiros, mesmo se o Pokémon estiver na borda. */
const BAR_X = { min: 14, max: 86 };
const LABEL_X = { min: 19, max: 81 };

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
  size: number;
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
  /** Luzes ativas neste quadro, em coordenadas da arena (o BoxScene as passa para os sprites). */
  readonly lights: FxLight[] = [];
  private readonly pools = new FloorPools();
  /** Luz dos golpes ligada (desligar poupa a GPU). */
  lighting = true;
  private impactLight: { x: number; y: number; z: number; color: number; strength: number; radius: number; at: number } | null = null;
  private readonly bolt = new BoltLine();
  private readonly projectile: Sprite;
  private readonly shields: Sprite[];
  private clock = 0;
  private phase: BattleHud['phase'] = 'intro';
  private turnIndex = 0;
  private turnClock = 0;
  private impactDone = false;
  private miniDone = new Set<number>();
  private launchDone = false;
  private labelSeq = 0;
  private labels: FloatLabel[] = [];
  private banner: BattleHud['banner'] = null;
  private readonly home: { x: number; z: number }[] = [];
  /** Equipe de cada um (ou null), quem já está em campo e de onde o reserva sai ao entrar. */
  private readonly teamOf: (number | null)[];
  private readonly onField: boolean[];
  private enterFrom = { x: 0, z: 0 };
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
  private readonly stage: ArenaStage;
  private readonly spotlight: Sprite;
  /** Relógio real (sem câmera lenta) e o que depende dele. */
  private realClock = 0;
  private slowUntil = 0;
  private slowScale = 1;
  private shakePower = 0;
  private dimNow = 0;
  private callout: { key: number; text: string; color: string; born: number } | null = null;
  private calloutSeq = 0;
  private lastRing = 0;

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
    const teams = o.result.teams;
    this.teamOf = o.fighters.map((_, i) => teams?.[i] ?? null);
    this.onField = o.fighters.map((_, i) => !o.result.relay || this.teamFront(i) === i);
    if (teams) {
      // Equipes: uma de cada lado da tela, de frente uma para a outra (z > 0 = mais perto do celular).
      for (let i = 0; i < n; i++) this.home.push(this.teamSpot(i));
    } else {
      // Elipse de frente para a tela: o primeiro à esquerda, os outros em volta.
      for (let i = 0; i < n; i++) {
        const angle = Math.PI + (i / n) * Math.PI * 2;
        this.home.push({ x: Math.cos(angle) * o.rx, z: Math.sin(angle) * o.rz });
      }
    }
    for (const c of o.creatures) Object.assign(c.fx, neutralFx());
    // Entram correndo de fora da arena.
    o.creatures.forEach((c, i) => {
      const spot = this.home[i]!;
      c.state.x = spot.x * 2.3;
      c.state.z = spot.z * 1.5;
      c.state.vx = 0;
      c.state.vz = 0;
    });
    this.stage = new ArenaStage(o.rx, o.rz, o.terrain === true, o.terrain === true ? Math.floor(o.rng() * 0x7fffffff) : 1);
    this.spotlight = new Sprite(new SpriteMaterial({ map: glowMap(), color: 0xffe27a, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0.7 }));
    this.spotlight.visible = false;
    o.root.add(this.stage.group, this.pools.group, this.spotlight, this.particles.group, this.rings.group, this.bolt.group);
    this.projectile = new Sprite(new SpriteMaterial({ map: glowMap(), color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false }));
    this.projectile.visible = false;
    o.root.add(this.projectile);
    this.shields = o.fighters.map(() => {
      const shield = new Sprite(new SpriteMaterial({ map: glowMap(), color: 0x7fd4ff, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0.55 }));
      shield.visible = false;
      o.root.add(shield);
      return shield;
    });
    const intro = !teams ? `${n} Pokémon, todos contra todos` : o.result.relay ? `${this.teamName(0)} contra ${this.teamName(1)}, um duelo por vez` : `${n} Pokémon em duas equipes`;
    const relayTitle = (() => {
      const sizes = [0, 1].map((t) => o.fighters.filter((_, i) => this.teamOf[i] === t).length);
      return `${sizes[0]} contra ${sizes[1]}!`;
    })();
    this.banner = o.banner ? { ...o.banner, color: '#ffcb05' } : { text: o.result.relay ? relayTitle : teams ? 'Batalha de equipes!' : 'Batalha!', sub: intro, color: '#ffcb05' };
    this.cue({ kind: 'intro' });
  }

  /** Nome da equipe `team` (os personalizados, se houver). */
  teamName(team: number): string {
    return this.o.teamNames?.[team] ?? TEAM_NAMES_PT[team] ?? `Equipe ${team + 1}`;
  }

  /** Meio-eixo x da arena (para recentralizar sem refazer o cálculo). */
  get arenaRx(): number {
    return this.o.rx;
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

  /** Membros da equipe, na ordem em que entram. */
  private teamMembers(team: number): number[] {
    return this.teamOf.flatMap((t, i) => (t === team ? [i] : []));
  }

  /** O primeiro da equipe de `i` (quem abre a luta no 3x3). */
  private teamFront(i: number): number {
    return this.teamMembers(this.teamOf[i] ?? 0)[0] ?? i;
  }

  /** Onde `i` fica: no 3x3 o primeiro de cada equipe fica no centro e os outros esperam nas pontas; senão a equipe se alinha de um lado. */
  private teamSpot(i: number): { x: number; z: number } {
    const { rx, rz } = this.o;
    const team = this.teamOf[i] ?? 0;
    const side = team === 0 ? -1 : 1;
    const members = this.teamMembers(team);
    const k = members.indexOf(i);
    if (this.o.result.relay) {
      if (k === 0) return { x: side * rx * 0.42, z: 0 };
      const reserves = members.length - 1;
      const u = reserves === 1 ? 0.5 : (k - 1) / (reserves - 1);
      return { x: side * rx * 0.95, z: (-0.75 + 1.5 * u) * rz };
    }
    const m = members.length;
    const z = m === 1 ? 0 : (-0.8 + (1.6 * k) / (m - 1)) * rz;
    return { x: side * rx * (0.5 + 0.22 * (Math.abs(z) / rz)), z };
  }

  /** O lugar de combate de quem entra no 3x3 (o centro da equipe). */
  private frontSpot(team: number): { x: number; z: number } {
    return { x: (team === 0 ? -1 : 1) * this.o.rx * 0.42, z: 0 };
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
    return new Vector3(c.state.x + c.fx.dx, lift, c.state.z + c.fx.dz);
  }

  private chest(i: number): Vector3 {
    const c = this.o.creatures[i]!;
    return this.world(i, c.height * 0.5 * c.fx.scale + Math.max(0, c.fx.dy));
  }

  private top(i: number, extra = 0.1): Vector3 {
    return this.world(i, this.o.creatures[i]!.height + extra);
  }

  private addLabel(text: string, tone: LabelTone, color: string, at: Vector3, size = 1): void {
    this.labels.push({ key: ++this.labelSeq, text, tone, color, at: at.clone(), born: this.clock, size });
    if (this.labels.length > 14) this.labels.shift();
  }

  private cue(c: SoundCue): void {
    this.o.sound?.play(c);
  }

  private flash(color: string, strength: number): void {
    this.screenFlash = { color, at: this.clock, strength };
  }

  private every(t: number, dt: number, period: number): boolean {
    return Math.floor(t / period) !== Math.floor((t - dt) / period);
  }

  /** Congela (parada de 1 quadro nos golpes fortes) ou desacelera o tempo da batalha por `realMs` de tempo real. */
  private slowMo(realMs: number, scale: number): void {
    if (this.realClock >= this.slowUntil) {
      this.slowScale = scale;
      this.slowUntil = this.realClock + realMs;
    } else {
      this.slowScale = Math.min(this.slowScale, scale);
      this.slowUntil = Math.max(this.slowUntil, this.realClock + realMs);
    }
  }

  private shake(power: number): void {
    this.shakePower = Math.min(1, Math.max(this.shakePower, power));
  }

  private shout(text: string, color: string): void {
    this.callout = { key: ++this.calloutSeq, text, color, born: this.realClock };
  }

  get slowed(): boolean {
    return this.realClock < this.slowUntil;
  }

  update(dtMs: number): void {
    const real = Math.min(Math.max(dtMs, 0), 100);
    this.realClock += real;
    const dt = this.realClock < this.slowUntil ? real * this.slowScale : real;
    this.shakePower = Math.max(0, this.shakePower - real / 380);
    this.clock += dt;
    this.stage.update(real);
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
    this.updateDirecting(real);
    this.updateLights();
    this.commit();
    this.cachedHud = null;
  }

  /** Foco do cinema: escurece a câmera durante o golpe, acende a borda da arena e liga o refletor do vencedor. */
  private updateDirecting(real: number): void {
    const turn = this.phase === 'fight' ? this.currentTurnData() : null;
    let dimTarget = 0;
    let glow = 0;
    if (turn && turn.kind === 'attack') {
      const plan = turnPlan(turn, this.personality(turn.attacker));
      const t = this.turnClock;
      if (t > plan.windup * 0.2 && t < plan.impactAt + 350) {
        dimTarget = 0.34;
        glow = 1;
      }
    }
    if (this.slowed && this.slowScale >= 0.2 && this.slowScale < 0.5) dimTarget = Math.max(dimTarget, 0.3);
    if (this.phase === 'finished') {
      dimTarget = 0.32;
      glow = 0.6;
    }
    this.dimNow += (dimTarget - this.dimNow) * Math.min(1, real / 160);
    this.stage.setGlow(glow);
    if (this.phase === 'finished') this.updateSpotlight();
  }

  /** Quanto o ambiente escureceu para dar foco (0–0,34): os sprites escurecem junto e só a luz do golpe os clareia. */
  get ambientDim(): number {
    return this.dimNow;
  }

  /**
   * Luzes do momento: a carga no atacante, o projétil em viagem, o clarão do impacto no alvo, a defesa e o
   * refletor do vencedor. Vão para os sprites (relight), para o chão (poças) e para o vídeo (HUD).
   */
  private updateLights(): void {
    const out = this.lights;
    out.length = 0;
    if (!this.lighting) {
      this.pools.update(out);
      return;
    }
    const push = (at: Vector3, color: number, intensity: number, radius: number): void => {
      out.push({ x: at.x, y: at.y, z: at.z, color, intensity, radius });
    };
    const turn = this.phase === 'fight' ? this.currentTurnData() : null;
    if (turn && turn.kind === 'attack') {
      const plan = turnPlan(turn, this.personality(turn.attacker));
      const t = this.turnClock;
      const color = typeColorHex(turn.move.type);
      if (t < plan.impactAt) {
        const from = this.chest(turn.attacker);
        const charge = clamp01(t / Math.max(1, plan.windup));
        push(from, color, 0.3 + 0.7 * charge, 0.9);
        if (plan.style?.family === 'ranged' && t >= plan.windup) {
          const u = clamp01((t - plan.windup) / Math.max(1, plan.travel));
          push(from.clone().lerp(this.chest(turn.target), u), color, 1.1, 0.8);
        }
      }
    }
    for (let i = 0; i < this.guard.length; i++) {
      if (this.guard[i] && this.faintAt[i]! < 0) push(this.chest(i), 0x7fd4ff, 0.35, 0.7);
    }
    const hit = this.impactLight;
    if (hit) {
      const k = Math.exp(-(this.clock - hit.at) / 240);
      if (k < 0.03) this.impactLight = null;
      else push(new Vector3(hit.x, hit.y, hit.z), hit.color, hit.strength * k, hit.radius);
    }
    if (this.phase === 'finished') push(this.world(this.o.result.winner, 0.5), 0xffe27a, 0.7, 1.3);
    this.pools.update(out);
  }

  private updateSpotlight(): void {
    const w = this.o.result.winner;
    const c = this.o.creatures[w]!;
    this.spotlight.visible = true;
    const pulse = 1 + 0.05 * Math.sin(this.clock * 0.006);
    this.spotlight.position.set(c.state.x, 0.95, c.state.z);
    this.spotlight.scale.set(Math.max(0.5, c.width * 2.2) * pulse, 2.2, 1);
    // Ondas de luz no chão.
    if (this.clock - this.lastRing > 900) {
      this.lastRing = this.clock;
      this.rings.emit(this.world(w), 0xffe27a, 0.5, 900);
    }
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
      this.shout('Já!', '#ffcb05');
      this.cue({ kind: 'go' });
      this.rings.emit(new Vector3(0, 0, 0), 0xffcb05, Math.max(this.o.rx, 0.5) * 1.3, 800);
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
    this.launchDone = false;
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
      // A borda da arena acende na cor do golpe e um anel de carga abre sob quem ataca.
      this.stage.setColor(typeColorHex(turn.move.type));
      this.rings.emit(this.world(turn.attacker), typeColorHex(turn.move.type), 0.45, 600);
      const startPlan = turnPlan(turn, fighter.personality);
      this.cue({ kind: 'charge', type: turn.move.type, ranged: startPlan.style?.family === 'ranged', ms: startPlan.windup });
      if (turn.thawed) {
        this.status[turn.attacker] = null;
        this.addLabel('Descongelou!', 'status', STATUS_COLORS_CSS.freeze, this.top(turn.attacker, 0.15));
        emitBurst(this.particles, this.chest(turn.attacker), 'ice', 0.8, this.o.rng);
      }
      if (turn.revenge) this.addLabel('Vingança!', 'info', '#fda4af', this.top(turn.attacker, 0.22));
    } else if (turn.kind === 'enter') {
      const team = this.teamOf[turn.attacker] ?? 0;
      const c = this.o.creatures[turn.attacker]!;
      this.enterFrom = { x: c.state.x, z: c.state.z };
      this.home[turn.attacker] = this.frontSpot(team);
      this.onField[turn.attacker] = true;
      const waiting = this.teamMembers(team).filter((j) => !this.onField[j] && this.faintAt[j]! < 0).length;
      this.banner = {
        text: `${fighter.name} entra na luta!`,
        sub: `${this.teamName(team)} · ${waiting === 0 ? 'último da equipe' : waiting === 1 ? 'resta 1 no banco' : `restam ${waiting} no banco`}`,
        color: TEAM_COLORS[team] ?? '#ffcb05',
      };
      this.cue({ kind: 'enter' });
      this.shout('Entra!', TEAM_COLORS[team] ?? '#ffcb05');
      this.rings.emit(this.world(turn.attacker), typeColorHex(fighter.types[0] ?? 'normal'), 0.5, 700);
    } else if (turn.kind === 'guard') {
      this.cue({ kind: 'guard' });
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
    if (turn.kind !== 'enter') this.o.creatures.forEach((_, i) => this.face(i, i === turn.target ? turn.attacker : turn.target));

    if (turn.kind === 'attack' && !this.launchDone && t >= plan.windup && plan.style) {
      this.launchDone = true;
      this.cue(plan.style.family === 'melee'
        ? { kind: 'launch', type: turn.move.type, melee: plan.style.variant, ms: plan.travel + plan.strike }
        : { kind: 'launch', type: turn.move.type, delivery: plan.style.delivery, ms: plan.travel });
    }
    if (turn.kind === 'attack') this.runAttack(turn, plan, t, dt);
    else if (turn.kind === 'guard') this.runGuard(turn, t, dt);
    else if (turn.kind === 'skip') this.runSkip(turn, t);
    else if (turn.kind === 'enter') this.runEnter(turn, t);
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

  /** O golpe elemental deixa a marca dele no chão onde caiu; certas combinações reagem (água apaga fogo...). */
  private markTerrain(turn: BattleTurn, strength: number): void {
    const ground = this.stage.ground;
    if (!ground) return;
    const c = this.o.creatures[turn.target]!.state;
    const hit = ground.hit(turn.move.type, c.x, c.z, strength);
    if (hit?.reaction) this.addLabel(hit.reaction.text, 'info', hit.reaction.color, this.top(turn.target, 0.3), 1.15);
  }

  /** O chão em pixel art da arena (null com o terreno desligado). */
  get ground(): Ground | null {
    return this.stage.ground;
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
      this.cue({ kind: 'miss' });
      this.addLabel('Errou!', 'miss', '#cbd5e1', top);
      // Vento da esquiva.
      for (let i = 0; i < 6; i++) emitBurst(this.particles, at, 'flying', 0.15, this.o.rng);
      return;
    }
    if (turn.damage === 0) {
      this.cue({ kind: 'immune' });
      emitBurst(this.particles, at, type, 0.4, this.o.rng);
      this.addLabel(effectivenessLabel(0) ?? 'Não afeta…', 'info', '#cbd5e1', top);
      return;
    }
    const guarded = turn.guardedHit === true;
    const strength = (guarded ? 0.5 : 0.8) * Math.sqrt(turn.effectiveness) * (turn.critical ? 1.4 : 1);
    emitImpact(this.particles, this.rings, at, type, strength, this.o.rng);
    this.markTerrain(turn, strength);
    this.cue({ kind: 'impact', type, strength, critical: turn.critical, effectiveness: turn.effectiveness, guarded });
    this.flashUntil[target] = this.clock + 320;
    this.flashColor[target] = hitTint(type);
    const bigHit = Math.min(1.6, 0.7 + (turn.damage / this.o.fighters[target]!.maxHp) * 1.6 + (turn.critical ? 0.4 : 0) + (turn.effectiveness >= 2 ? 0.2 : 0));
    this.impactLight = { x: at.x, y: at.y, z: at.z, color: turn.critical ? 0xffffff : typeColorHex(type), strength: bigHit * (guarded ? 0.6 : 1), radius: 0.9 + bigHit * 0.5, at: this.clock };
    this.shakeUntil[target] = this.clock + 420;
    // Empurrão: para longe de quem atacou, proporcional ao tamanho do golpe.
    const a = this.home[turn.attacker]!;
    const b = this.home[target]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const frac = turn.damage / this.o.fighters[target]!.maxHp;
    const mag = Math.min(0.2, 0.04 + frac * 0.5) * (guarded ? 0.4 : 1);
    this.knock[target] = { x: ((b.x - a.x) / len) * mag, z: ((b.z - a.z) / len) * mag, at: this.clock };
    this.hpAnim[target] = { from: this.shownHp[target]!, to: turn.targetHpAfter, at: this.clock };
    const maxHp = this.o.fighters[target]!.maxHp;
    const size = Math.min(2.4, 0.9 + (turn.damage / maxHp) * 2.6 + (turn.critical ? 0.3 : 0));
    this.addLabel(`-${turn.damage}`, turn.critical ? 'crit' : 'damage', css, top, size);
    let lift = 0.12;
    if (guarded) {
      this.guard[target] = false;
      this.addLabel('Bloqueou parte!', 'info', '#7fd4ff', top.clone().add(new Vector3(0, lift, 0)));
      lift += 0.12;
    }
    const label = turn.effectiveness >= 2 ? null : effectivenessLabel(turn.effectiveness);
    if (label) {
      this.addLabel(label, turn.effectiveness > 1 ? 'good' : 'bad', turn.effectiveness > 1 ? '#86efac' : '#fca5a5', top.clone().add(new Vector3(0, lift, 0)));
      lift += 0.12;
    }
    if (turn.inflicted) {
      this.status[target] = turn.inflicted;
      this.cue({ kind: 'status', status: turn.inflicted });
      this.addLabel(STATUS_LABELS_PT[turn.inflicted] + '!', 'status', STATUS_COLORS_CSS[turn.inflicted], top.clone().add(new Vector3(0, lift, 0)));
      lift += 0.12;
    }
    if (turn.endured) {
      this.addLabel('Aguentou firme por você!', 'good', '#ffcb05', top.clone().add(new Vector3(0, lift, 0)));
      this.shout(`${this.o.fighters[target]!.name} aguentou firme por você!`, '#ffcb05');
      lift += 0.12;
    }
    if (turn.fainted) {
      this.faintAt[target] = this.clock;
      this.cue({ kind: 'faint' });
      this.status[target] = null;
      this.guard[target] = false;
      this.addLabel(`${this.o.fighters[target]!.name} desmaiou!`, 'info', '#f8fafc', top.clone().add(new Vector3(0, lift, 0)));
    }
    // Clarão na tela: crítico, super efetivo forte ou tipos de energia bruta.
    if (turn.critical) this.flash('#ffffff', 0.35);
    else if (IMPACT_STYLES[type].flash) this.flash(css, 0.28);
    else if (turn.effectiveness >= 4) this.flash(css, 0.3);
    this.dramatize(turn, frac, guarded);
  }

  /** Tremor da imagem, parada rápida / câmera lenta e aviso grande, conforme a força do golpe. */
  private dramatize(turn: BattleTurn, frac: number, guarded: boolean): void {
    this.shake(Math.min(1, (0.2 + frac * 1.3) * (guarded ? 0.5 : 1) * (turn.critical ? 1.3 : 1) * (turn.fainted ? 1.3 : 1)));
    if (turn.fainted) {
      this.shout('Nocaute!', '#fb7185');
      this.slowMo(700, 0.3);
      this.rings.emit(this.world(turn.target), 0xffffff, 0.8, 800);
      emitBurst(this.particles, this.chest(turn.target), turn.move.type, 1.6, this.o.rng);
    } else if (turn.critical) {
      this.shout('Crítico!', '#fde047');
      this.slowMo(160, 0.08);
    } else if (turn.effectiveness >= 2) {
      this.shout(turn.effectiveness >= 4 ? 'Super efetivo ×4!' : 'Super efetivo!', '#86efac');
      this.slowMo(110, 0.08);
    } else if (frac > 0.3) {
      this.slowMo(90, 0.08);
    }
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

  /** 3x3: o próximo da equipe corre do banco até o centro. */
  private runEnter(turn: BattleTurn, t: number): void {
    const i = turn.attacker;
    const c = this.o.creatures[i]!;
    const f = this.frames[i]!;
    const to = this.home[i]!;
    const u = easeInOut(clamp01(t / (ENTER_MS * 0.75)));
    c.state.x = this.enterFrom.x + (to.x - this.enterFrom.x) * u;
    c.state.z = this.enterFrom.z + (to.z - this.enterFrom.z) * u;
    c.fx.facing = { x: to.x - this.enterFrom.x, z: to.z - this.enterFrom.z };
    if (u < 1) f.dy += Math.abs(Math.sin(t * 0.016)) * 0.07;
    else {
      c.fx.facing = { x: -to.x, z: 0 };
      f.scale *= 1 + 0.1 * Math.sin(clamp01((t - ENTER_MS * 0.75) / (ENTER_MS * 0.25)) * Math.PI);
    }
  }

  private runSkip(turn: BattleTurn, t: number): void {
    const i = turn.attacker;
    const f = this.frames[i]!;
    const cause = turn.cause ?? 'paralysis';
    if (!this.impactDone && t > 150) {
      this.impactDone = true;
      this.cue({ kind: 'skip', cause });
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
      this.cue({ kind: 'tick', cause });
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
    this.shout('Vitória!', '#ffcb05');
    this.cue({ kind: 'victory', personality: this.personality(w) });
    this.slowMo(600, 0.4);
    const winTeam = this.o.result.winningTeam;
    const left = this.o.result.reason === 'ko' ? `Restaram ${this.o.result.hpLeft[w]} de ${fighter.maxHp} PS` : 'Fim do tempo: venceu quem tinha mais PS';
    this.banner = winTeam === undefined
      ? { text: `${fighter.name} venceu!`, sub: left, color: '#ffcb05' }
      : {
          text: `${this.teamName(winTeam)} venceu!`,
          sub: this.o.result.reason === 'ko' ? `${fighter.name} terminou de pé com ${this.o.result.hpLeft[w]} de ${fighter.maxHp} PS` : left,
          color: TEAM_COLORS[winTeam] ?? '#ffcb05',
        };
  }

  private updateFinished(): void {
    const w = this.o.result.winner;
    const since = this.clock - this.finishedAt;
    // Em equipes, todos os que terminaram de pé na equipe vencedora comemoram.
    const winTeam = this.o.result.winningTeam;
    const celebrating = winTeam === undefined ? [w] : this.teamMembers(winTeam).filter((j) => (this.o.result.hpLeft[j] ?? 0) > 0);
    for (const j of celebrating) {
      const f = this.frames[j]!;
      const style = CELEBRATE[this.personality(j)];
      const phase = since * style.freq + (j === w ? 0 : j * 0.9);
      f.dy += Math.abs(Math.sin(phase)) * style.height;
      f.scale *= 1 + style.scale * Math.abs(Math.sin(phase));
    }
    if (since < CONFETTI_MS && this.clock - this.lastConfetti > 50) {
      this.lastConfetti = this.clock;
      emitConfetti(this.particles, this.world(w), this.o.rng);
    }
    // Os derrotados ficam caídos; os demais respiram.
  }

  private project(point: Vector3): { x: number; y: number; visible: boolean } {
    const p = this.o.root.localToWorld(point.clone()).project(this.o.camera);
    return { x: (p.x * 0.5 + 0.5) * 100, y: (1 - (p.y * 0.5 + 0.5)) * 100, visible: p.z < 1 && Math.abs(p.x) < 1.15 && Math.abs(p.y) < 1.15 };
  }

  /** Estado para a interface (calculado uma vez por quadro). */
  get hud(): BattleHud {
    if (this.cachedHud) return this.cachedHud;
    const { fighters, creatures, result } = this.o;
    const actor = this.phase === 'fight' ? (this.currentTurnData()?.attacker ?? -1) : this.phase === 'finished' ? this.o.result.winner : -1;
    const bars: HudBar[] = fighters.map((f, i) => {
      const c = creatures[i]!;
      const pos = this.project(this.world(i, c.height * c.fx.scale + 0.14));
      const hp = Math.max(0, Math.round(this.shownHp[i]!));
      return {
        id: f.id, name: f.name, types: f.types, personality: f.personality, status: this.status[i] ?? null, guard: this.guard[i] ?? false,
        hp, maxHp: f.maxHp, frac: clamp01(this.shownHp[i]! / f.maxHp), ...pos, x: Math.min(BAR_X.max, Math.max(BAR_X.min, pos.x)), fainted: c.fx.faint >= 0.5, acting: actor === i, quality: f.quality,
        team: this.teamOf[i] ?? null, teamColor: this.teamOf[i] === null || this.teamOf[i] === undefined ? null : (TEAM_COLORS[this.teamOf[i]!] ?? null),
        reserve: !this.onField[i]! && this.faintAt[i]! < 0 && this.phase !== 'finished',
      };
    });
    const labels: HudLabel[] = this.labels.map((l) => {
      const age = clamp01((this.clock - l.born) / LABEL_TTL_MS);
      const pos = this.project(l.at.clone().add(new Vector3(0, age * 0.3, 0)));
      return { key: l.key, text: l.text, tone: l.tone, color: l.color, ...pos, x: Math.min(LABEL_X.max, Math.max(LABEL_X.min, pos.x)), age, size: l.size };
    });
    const lights: HudLight[] = this.lights.map((l) => {
      const pos = this.project(new Vector3(l.x, l.y, l.z));
      return { x: pos.x, y: pos.y, color: '#' + l.color.toString(16).padStart(6, '0'), intensity: l.intensity, radius: 14 + 22 * Math.min(1, l.radius / 1.6) };
    });
    const flashAge = this.screenFlash ? (this.clock - this.screenFlash.at) / FLASH_MS : 1;
    const w = result.winner;
    const calloutAge = this.callout ? (this.realClock - this.callout.born) / CALLOUT_MS : 1;
    const power = this.shakePower * this.shakePower;
    this.cachedHud = {
      phase: this.phase,
      banner: this.banner,
      bars,
      labels,
      flash: this.screenFlash && flashAge < 1 ? { color: this.screenFlash.color, strength: this.screenFlash.strength * (1 - flashAge) } : null,
      shake: { x: Math.sin(this.realClock * 0.13) * 11 * power, y: Math.cos(this.realClock * 0.17) * 8 * power, zoom: 1 + 0.035 * power },
      dim: this.dimNow,
      lights,
      callout: this.callout && calloutAge < 1 ? { key: this.callout.key, text: this.callout.text, color: this.callout.color, age: calloutAge } : null,
      winner: this.phase === 'finished'
        ? { id: fighters[w]!.id, name: fighters[w]!.name, hpLeft: result.hpLeft[w] ?? 0, maxHp: fighters[w]!.maxHp, team: result.winningTeam ?? null, teamName: result.winningTeam === undefined ? null : this.teamName(result.winningTeam) }
        : null,
      scoreboard: result.teams
        ? [0, 1].map((team) => {
            const members = this.teamMembers(team);
            return {
              team, name: this.teamName(team), color: TEAM_COLORS[team] ?? '#ffffff', total: members.length,
              alive: members.filter((j) => bars[j]!.hp > 0 && !bars[j]!.fainted).length,
            };
          })
        : null,
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
    this.stage.dispose();
    this.pools.dispose();
    this.spotlight.material.dispose();
    this.spotlight.removeFromParent();
    for (const s of this.shields) {
      s.material.dispose();
      s.removeFromParent();
    }
  }
}
