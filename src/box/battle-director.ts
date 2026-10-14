import { Sprite, SpriteMaterial, AdditiveBlending, Vector3 } from 'three';
import type { PerspectiveCamera, Scene } from 'three';
import { effectivenessLabel } from '../core/battle';
import type { BattleResult, BattleTurn, Fighter, Rng } from '../core/battle';
import { TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import type { BoxCreature } from './creature';
import { neutralFx } from './creature';
import { emitBurst, emitCharge, emitConfetti, emitTrail, ParticleField, typeColorHex } from './effects';
import { stepToward } from './wander';

export type LabelTone = 'damage' | 'crit' | 'good' | 'bad' | 'miss' | 'info';

export interface HudBar {
  id: string;
  name: string;
  types: PokemonType[];
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

// Tempos (ms).
export const INTRO_MAX_MS = 2600;
const INTRO_MIN_MS = 1100;
export const MELEE = { windup: 350, approach: 520, strike: 170, settle: 700, faintExtra: 450 } as const;
export const RANGED = { windup: 560, travel: 430, settle: 700, faintExtra: 450 } as const;
const HP_TWEEN_MS = 450;
const LABEL_TTL_MS = 1200;
const CONFETTI_MS = 3500;
const MELEE_GAP_M = 0.42;

/** Duração total de um golpe (para testes e para a interface estimar). */
export function turnDuration(turn: Pick<BattleTurn, 'move' | 'fainted'>): number {
  const base = turn.move.special ? RANGED.windup + RANGED.travel + RANGED.settle : MELEE.windup + MELEE.approach + MELEE.strike + MELEE.settle;
  return base + (turn.fainted ? (turn.move.special ? RANGED.faintExtra : MELEE.faintExtra) : 0);
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

interface FloatLabel {
  key: number;
  text: string;
  tone: LabelTone;
  color: string;
  at: Vector3;
  born: number;
}

/**
 * Encena uma batalha já simulada (`simulateBattle`): reúne os Pokémon em roda, depois, golpe a golpe, o atacante
 * encara o alvo, se agacha, avança (golpe físico) ou lança um projétil (golpe especial) na cor do tipo; o alvo
 * pisca, treme, perde PS na barra e pode desmaiar. No fim o vencedor comemora. O texto (barras, números, avisos)
 * sai em `hud` para a interface desenhar por cima da câmera.
 */
export class BattleDirector {
  readonly particles = new ParticleField();
  private readonly projectile: Sprite;
  private clock = 0;
  private phase: BattleHud['phase'] = 'intro';
  private turnIndex = 0;
  private turnClock = 0;
  private impactDone = false;
  private faintStartedAt = -1;
  private labelSeq = 0;
  private labels: FloatLabel[] = [];
  private banner: BattleHud['banner'] = null;
  private readonly home: { x: number; z: number }[] = [];
  private readonly shownHp: number[];
  private readonly hpAnim: { from: number; to: number; at: number }[];
  private readonly flashUntil: number[];
  private readonly shakeUntil: number[];
  private readonly dodgeUntil: number[];
  private finishedAt = 0;
  private lastConfetti = 0;
  private cachedHud: BattleHud | null = null;

  constructor(private readonly o: DirectorOptions) {
    const n = o.fighters.length;
    this.shownHp = o.fighters.map((f) => f.maxHp);
    this.hpAnim = o.fighters.map((f) => ({ from: f.maxHp, to: f.maxHp, at: 0 }));
    this.flashUntil = new Array<number>(n).fill(0);
    this.shakeUntil = new Array<number>(n).fill(0);
    this.dodgeUntil = new Array<number>(n).fill(0);
    const radius = Math.min(o.half * 0.62, Math.max(0.45, 0.2 + n * 0.1));
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2 + Math.PI / 2;
      this.home.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius });
    }
    for (const c of o.creatures) Object.assign(c.fx, neutralFx());
    o.scene.add(this.particles.group);
    this.projectile = new Sprite(new SpriteMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false }));
    this.projectile.material.map = this.particles.group.children[0] instanceof Sprite ? this.particles.group.children[0].material.map : null;
    this.projectile.visible = false;
    o.scene.add(this.projectile);
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

  private world(i: number, lift = 0): Vector3 {
    const c = this.o.creatures[i]!;
    const a = this.o.anchor();
    return new Vector3(a.x + c.state.x + c.fx.dx, a.y + lift, a.z + c.state.z + c.fx.dz);
  }

  private chest(i: number): Vector3 {
    const c = this.o.creatures[i]!;
    return this.world(i, c.height * 0.5 * c.fx.scale);
  }

  private addLabel(text: string, tone: LabelTone, color: string, at: Vector3): void {
    this.labels.push({ key: ++this.labelSeq, text, tone, color, at: at.clone(), born: this.clock });
    if (this.labels.length > 12) this.labels.shift();
  }

  update(dtMs: number): void {
    const dt = Math.min(Math.max(dtMs, 0), 100);
    this.clock += dt;
    this.particles.update(dt);
    this.labels = this.labels.filter((l) => this.clock - l.born < LABEL_TTL_MS);
    this.tweenHp();
    for (let i = 0; i < this.o.creatures.length; i++) this.applyIdleFx(i);

    if (this.phase === 'intro') this.updateIntro(dt);
    else if (this.phase === 'fight') this.updateTurn(dt);
    else this.updateFinished();
    this.cachedHud = null;
  }

  private updateIntro(dt: number): void {
    let allThere = true;
    this.o.creatures.forEach((c, i) => {
      const spot = this.home[i]!;
      const arrived = stepToward(c.state, spot.x, spot.z, dt, 1.3);
      if (!arrived) allThere = false;
      c.fx.facing = { x: -spot.x, z: -spot.z };
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

  private currentTurnData(): BattleTurn | null {
    return this.o.result.turns[this.turnIndex] ?? null;
  }

  private startTurn(): void {
    const turn = this.currentTurnData();
    if (!turn) return this.finish();
    this.impactDone = false;
    this.faintStartedAt = -1;
    const fighter = this.o.fighters[turn.attacker]!;
    const source = turn.move.source === 'carta' ? 'ataque da carta' : turn.move.source === 'jogo' ? 'golpe do jogo' : 'golpe padrão';
    this.banner = {
      text: `${fighter.name} usou ${turn.move.name}!`,
      sub: `${TYPE_LABELS_PT[turn.move.type]} · ${turn.move.special ? 'especial' : 'físico'} · ${source}`,
      color: TYPE_COLORS[turn.move.type],
    };
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
    const attacker = this.o.creatures[turn.attacker]!;
    const target = this.o.creatures[turn.target]!;
    const color = typeColorHex(turn.move.type);
    this.face(turn.attacker, turn.target);
    const ranged = turn.move.special;
    const homeA = this.home[turn.attacker]!;
    const homeT = this.home[turn.target]!;

    attacker.state.vx = 0;
    attacker.state.vz = 0;
    let impactAt: number;
    if (!ranged) {
      const { windup, approach, strike } = MELEE;
      impactAt = windup + approach + strike;
      const dirX = homeT.x - homeA.x;
      const dirZ = homeT.z - homeA.z;
      const dist = Math.hypot(dirX, dirZ) || 1;
      const stand = { x: homeT.x - (dirX / dist) * MELEE_GAP_M, z: homeT.z - (dirZ / dist) * MELEE_GAP_M };
      if (t < windup) {
        attacker.fx.squash = 1 - 0.2 * Math.sin((t / windup) * Math.PI * 0.5);
        if (Math.floor(t / 90) !== Math.floor((t - dt) / 90)) emitCharge(this.particles, this.chest(turn.attacker), turn.move.type, this.o.rng);
      } else if (t < windup + approach) {
        const u = easeInOut((t - windup) / approach);
        attacker.fx.squash = 1;
        attacker.state.x = homeA.x + (stand.x - homeA.x) * u;
        attacker.state.z = homeA.z + (stand.z - homeA.z) * u;
        attacker.state.vx = dirX / dist;
        attacker.state.vz = dirZ / dist;
        attacker.state.hopPhase += (dt / 1000) * 14;
      } else if (t < impactAt) {
        const u = (t - windup - approach) / strike;
        attacker.state.x = stand.x;
        attacker.state.z = stand.z;
        // Bote para a frente e volta.
        attacker.fx.dx = (dirX / dist) * 0.2 * Math.sin(u * Math.PI);
        attacker.fx.dz = (dirZ / dist) * 0.2 * Math.sin(u * Math.PI);
        attacker.fx.scale = 1 + 0.18 * Math.sin(u * Math.PI);
      } else {
        attacker.fx.dx = 0;
        attacker.fx.dz = 0;
        attacker.fx.scale = 1;
        const back = clamp01((t - impactAt - 200) / 450);
        const u = easeInOut(back);
        attacker.state.x = stand.x + (homeA.x - stand.x) * u;
        attacker.state.z = stand.z + (homeA.z - stand.z) * u;
        if (back > 0 && back < 1) {
          attacker.state.vx = -dirX / dist;
          attacker.state.vz = -dirZ / dist;
          attacker.state.hopPhase += (dt / 1000) * 10;
        }
      }
    } else {
      const { windup, travel } = RANGED;
      impactAt = windup + travel;
      if (t < windup) {
        const u = t / windup;
        attacker.fx.squash = 1 - 0.16 * Math.sin(u * Math.PI);
        attacker.fx.scale = 1 + 0.1 * u;
        if (Math.floor(t / 45) !== Math.floor((t - dt) / 45)) emitCharge(this.particles, this.chest(turn.attacker), turn.move.type, this.o.rng);
      } else if (t < impactAt) {
        attacker.fx.squash = 1;
        attacker.fx.scale = 1.1 - 0.1 * ((t - windup) / travel);
        const u = (t - windup) / travel;
        const from = this.chest(turn.attacker);
        const to = this.chest(turn.target);
        const pos = from.clone().lerp(to, u);
        pos.y += Math.sin(u * Math.PI) * 0.12;
        this.projectile.visible = true;
        this.projectile.position.copy(pos);
        this.projectile.material.color.setHex(color);
        this.projectile.scale.setScalar(0.24 + 0.06 * Math.sin(u * 20));
        emitTrail(this.particles, pos, turn.move.type, this.o.rng);
      } else {
        attacker.fx.scale = 1;
        this.projectile.visible = false;
      }
    }

    if (t >= impactAt && !this.impactDone) this.impact(turn);
    if (this.impactDone) this.applyTargetReaction(turn, target);
    if (turn.fainted && this.impactDone) {
      if (this.faintStartedAt < 0) this.faintStartedAt = t;
      const since = t - this.faintStartedAt - 300;
      target.fx.faint = easeInOut(clamp01(since / 600));
    }
    if (t >= turnDuration(turn)) {
      attacker.fx.squash = 1;
      attacker.fx.scale = 1;
      attacker.fx.dx = 0;
      attacker.fx.dz = 0;
      attacker.state.x = homeA.x;
      attacker.state.z = homeA.z;
      attacker.state.vx = 0;
      attacker.state.vz = 0;
      this.turnIndex++;
      this.turnClock = 0;
      if (this.turnIndex >= this.o.result.turns.length) this.finish();
      else this.startTurn();
    }
  }

  private impact(turn: BattleTurn): void {
    this.impactDone = true;
    this.projectile.visible = false;
    const target = turn.target;
    const at = this.chest(target);
    const top = this.world(target, this.o.creatures[target]!.height + 0.1);
    const css = TYPE_COLORS[turn.move.type];
    if (!turn.hit) {
      this.dodgeUntil[target] = this.clock + 420;
      this.addLabel('Errou!', 'miss', '#cbd5e1', top);
      return;
    }
    if (turn.damage === 0) {
      emitBurst(this.particles, at, turn.move.type, 0.4, this.o.rng);
      this.addLabel(effectivenessLabel(0) ?? 'Não afeta…', 'info', '#cbd5e1', top);
      return;
    }
    const strength = 0.8 * Math.sqrt(turn.effectiveness) * (turn.critical ? 1.4 : 1);
    emitBurst(this.particles, at, turn.move.type, strength, this.o.rng);
    this.flashUntil[target] = this.clock + 320;
    this.shakeUntil[target] = this.clock + 420;
    this.hpAnim[target] = { from: this.shownHp[target]!, to: turn.targetHpAfter, at: this.clock };
    this.addLabel(`-${turn.damage}`, turn.critical ? 'crit' : 'damage', css, top);
    const label = effectivenessLabel(turn.effectiveness);
    if (label) this.addLabel(label, turn.effectiveness > 1 ? 'good' : 'bad', turn.effectiveness > 1 ? '#86efac' : '#fca5a5', top.clone().add(new Vector3(0, 0.12, 0)));
    if (turn.critical) this.addLabel('Golpe crítico!', 'crit', '#fde047', top.clone().add(new Vector3(0, 0.24, 0)));
    if (turn.fainted) this.addLabel(`${this.o.fighters[target]!.name} desmaiou!`, 'info', '#f8fafc', top.clone().add(new Vector3(0, 0.36, 0)));
  }

  private applyTargetReaction(turn: BattleTurn, target: BoxCreature): void {
    const i = turn.target;
    const fx = target.fx;
    if (this.clock < this.flashUntil[i]!) fx.tint = 0xff6b6b;
    else fx.tint = 0xffffff;
    if (this.clock < this.shakeUntil[i]!) {
      const k = (this.shakeUntil[i]! - this.clock) / 420;
      fx.dx = Math.sin(this.clock * 0.09) * 0.045 * k;
    } else if (this.clock < this.dodgeUntil[i]!) {
      const u = 1 - (this.dodgeUntil[i]! - this.clock) / 420;
      fx.dx = Math.sin(u * Math.PI) * 0.22;
      fx.dy = Math.sin(u * Math.PI) * 0.1;
    } else {
      fx.dx = 0;
      if (!turn.fainted) fx.dy = 0;
    }
  }

  private tweenHp(): void {
    this.hpAnim.forEach((anim, i) => {
      const u = clamp01((this.clock - anim.at) / HP_TWEEN_MS);
      this.shownHp[i] = anim.from + (anim.to - anim.from) * easeInOut(u);
    });
  }

  /** Ajustes que valem o tempo todo: quem caiu fica caído. */
  private applyIdleFx(i: number): void {
    const fx = this.o.creatures[i]!.fx;
    const down = this.shownHp[i]! <= 0.5 && this.hpAnim[i]!.to <= 0 && this.clock - this.hpAnim[i]!.at > HP_TWEEN_MS + 300;
    if (down) fx.faint = 1;
  }

  private finish(): void {
    this.phase = 'finished';
    this.finishedAt = this.clock;
    this.projectile.visible = false;
    const w = this.o.result.winner;
    const fighter = this.o.fighters[w]!;
    for (const [i, c] of this.o.creatures.entries()) {
      const down = (this.o.result.hpLeft[i] ?? 0) <= 0;
      c.fx.faint = down ? 1 : 0;
      c.fx.tint = 0xffffff;
      c.fx.dx = 0;
      c.fx.squash = 1;
      c.fx.scale = 1;
      c.fx.dy = 0;
      this.shownHp[i] = this.o.result.hpLeft[i] ?? 0;
      this.hpAnim[i] = { from: this.shownHp[i]!, to: this.shownHp[i]!, at: this.clock };
      c.state.vx = 0;
      c.state.vz = 0;
    }
    this.banner = {
      text: `${fighter.name} venceu!`,
      sub: this.o.result.reason === 'ko' ? `Restaram ${this.o.result.hpLeft[w]} de ${fighter.maxHp} PS` : 'Fim do tempo: venceu quem tinha mais PS',
      color: '#ffcb05',
    };
  }

  private updateFinished(): void {
    const w = this.o.result.winner;
    const c = this.o.creatures[w]!;
    const since = this.clock - this.finishedAt;
    c.fx.dy = Math.abs(Math.sin(since * 0.008)) * 0.14;
    c.fx.scale = 1 + 0.08 * Math.abs(Math.sin(since * 0.008));
    c.fx.facing = null;
    if (since < CONFETTI_MS && this.clock - this.lastConfetti > 50) {
      this.lastConfetti = this.clock;
      emitConfetti(this.particles, this.world(w), this.o.rng);
    }
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
        id: f.id, name: f.name, types: f.types, hp, maxHp: f.maxHp, frac: clamp01(this.shownHp[i]! / f.maxHp),
        ...pos, fainted: c.fx.faint >= 0.5, quality: f.quality,
      };
    });
    const labels: HudLabel[] = this.labels.map((l) => {
      const age = clamp01((this.clock - l.born) / LABEL_TTL_MS);
      const pos = this.project(l.at.clone().add(new Vector3(0, age * 0.3, 0)));
      return { key: l.key, text: l.text, tone: l.tone, color: l.color, ...pos, age };
    });
    const w = result.winner;
    this.cachedHud = {
      phase: this.phase,
      banner: this.banner,
      bars,
      labels,
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
    this.projectile.material.dispose();
    this.projectile.removeFromParent();
  }
}
