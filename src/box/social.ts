import { stepToward } from './wander';
import type { Rng, WanderState } from './wander';

/**
 * Vida social da Caixa: de vez em quando dois Pokémon se encontram (cumprimento, dança, pega-pega ou desafio) e, sozinhos,
 * eles também mostram emoções (sono, curiosidade, susto…). Cada emoção vira um balão de emoji sobre a cabeça. Lógica pura:
 * move só quem está num encontro (o passeio dos outros continua em `wander.ts`) e avisa por `hooks`, então é testável
 * sem navegador.
 */

export interface SocialActor {
  state: WanderState;
  fx: { facing: { x: number; z: number } | null };
}

export interface SocialHooks {
  bubble(index: number, emoji: string, ms: number): void;
  hop(index: number): void;
}

export type EncounterKind = 'greet' | 'dance' | 'chase' | 'duel';

type Who = 'a' | 'b' | 'win' | 'lose';
interface Cue {
  /** Instante (ms depois de os dois se encontrarem) em que acontece. */
  at: number;
  who: Who;
  emoji?: string;
  ms?: number;
  hop?: boolean;
}

interface Script {
  /** Distância (m) que o primeiro para antes do segundo. */
  gap: number;
  /** Duração da parte principal (ms). */
  duration: number;
  cues: Cue[];
}

const MARGIN = 0.9;
const APPROACH_SPEED = 0.6;
const APPROACH_TIMEOUT_MS = 8000;

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

function scriptFor(kind: EncounterKind, rng: Rng): Script {
  switch (kind) {
    case 'greet':
      return {
        gap: 0.38,
        duration: 2300,
        cues: [
          { at: 100, who: 'a', emoji: pick(['👋', '😄', '🙌'], rng), ms: 1900, hop: true },
          { at: 450, who: 'b', emoji: pick(['😊', '👋', '🥰'], rng), ms: 1900, hop: true },
        ],
      };
    case 'dance': {
      const cues: Cue[] = [
        { at: 0, who: 'a', emoji: '🎵', ms: 2000, hop: true },
        { at: 300, who: 'b', emoji: '🎶', ms: 2000, hop: true },
        { at: 1800, who: 'a', emoji: '✨', ms: 1500 },
      ];
      for (let at = 550; at < 3300; at += 550) cues.push({ at, who: 'a', hop: true }, { at, who: 'b', hop: true });
      return { gap: 0.46, duration: 3500, cues };
    }
    case 'chase':
      return {
        gap: 0.5,
        duration: 3900,
        cues: [
          { at: 0, who: 'a', emoji: '😆', ms: 1700 },
          { at: 150, who: 'b', emoji: '😜', ms: 1700 },
          { at: 3400, who: 'a', emoji: '😂', ms: 1500, hop: true },
          { at: 3500, who: 'b', emoji: '😅', ms: 1400 },
        ],
      };
    case 'duel':
      return {
        gap: 0.62,
        duration: 3300,
        cues: [
          { at: 0, who: 'a', emoji: '😤', ms: 1500 },
          { at: 150, who: 'b', emoji: '😠', ms: 1500 },
          { at: 1400, who: 'win', emoji: pick(['😎', '😏', '💪'], rng), ms: 1700, hop: true },
          { at: 1550, who: 'lose', emoji: pick(['😰', '😅', '🙃'], rng), ms: 1600 },
        ],
      };
  }
}

interface Solo {
  emoji: string;
  ms: number;
  /** Quanto tempo (ms) o Pokémon para para sentir a emoção. */
  hold: number;
  hop: boolean;
  weight: number;
}

/** Emoções de um Pokémon sozinho. */
export const SOLO_EMOTIONS: readonly Solo[] = [
  { emoji: '💤', ms: 4200, hold: 4600, hop: false, weight: 3 },
  { emoji: '🎵', ms: 2600, hold: 0, hop: true, weight: 3 },
  { emoji: '❓', ms: 2000, hold: 1800, hop: false, weight: 2 },
  { emoji: '❗', ms: 1600, hold: 900, hop: true, weight: 1 },
  { emoji: '😋', ms: 2200, hold: 0, hop: false, weight: 2 },
  { emoji: '❤️', ms: 2400, hold: 0, hop: false, weight: 2 },
  { emoji: '🤔', ms: 2200, hold: 1600, hop: false, weight: 2 },
  { emoji: '😊', ms: 2000, hold: 0, hop: false, weight: 2 },
  { emoji: '😢', ms: 2400, hold: 1400, hop: false, weight: 0.7 },
];

/** Todos os emojis que a Caixa pode mostrar (para pré-desenhar os balões). */
export function allEmojis(): string[] {
  const set = new Set<string>(SOLO_EMOTIONS.map((e) => e.emoji));
  const rng = (() => {
    let i = 0;
    return () => (i++ % 7) / 7;
  })();
  for (const kind of ['greet', 'dance', 'chase', 'duel'] as const) {
    for (let round = 0; round < 7; round++) for (const cue of scriptFor(kind, rng).cues) if (cue.emoji) set.add(cue.emoji);
  }
  return [...set];
}

interface Encounter {
  kind: EncounterKind;
  a: number;
  b: number;
  phase: 'approach' | 'main';
  /** Tempo na fase atual (ms). */
  t: number;
  script: Script;
  fired: boolean[];
  /** Duelo: quem ganhou. */
  winner: 'a' | 'b';
  /** Pega-pega: para onde o fugitivo corre agora. */
  tx: number;
  tz: number;
}

const KIND_WEIGHTS: readonly [EncounterKind, number][] = [['greet', 0.3], ['dance', 0.25], ['chase', 0.25], ['duel', 0.2]];

function weighted<T>(items: readonly (readonly [T, number])[], rng: Rng): T {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [item, w] of items) {
    roll -= w;
    if (roll <= 0) return item;
  }
  return items[items.length - 1]![0];
}

export class SocialDirector {
  private encounters: Encounter[] = [];
  private nextMs: number;

  constructor(
    private readonly rng: Rng,
    /** Chance de o próximo evento ser um encontro de dois (senão é uma emoção sozinho). */
    private readonly pairChance = 0.55,
  ) {
    this.nextMs = 2500 + rng() * 2500;
  }

  /** Está num encontro (o passeio normal dele fica suspenso). */
  isBusy(index: number): boolean {
    return this.encounters.some((e) => e.a === index || e.b === index);
  }

  get active(): readonly { kind: EncounterKind; a: number; b: number }[] {
    return this.encounters;
  }

  /** Esquece tudo (a lista de Pokémon mudou, a batalha começou ou o recurso foi desligado). */
  reset(actors: readonly SocialActor[] = []): void {
    for (const actor of actors) actor.fx.facing = null;
    this.encounters = [];
    this.nextMs = 2500 + this.rng() * 2500;
  }

  update(dtMs: number, actors: readonly SocialActor[], half: number, hooks: SocialHooks): void {
    const dt = Math.min(Math.max(dtMs, 0), 200);
    const limit = half * MARGIN;
    if (actors.length === 0) return;
    this.encounters = this.encounters.filter((e) => actors[e.a] && actors[e.b]);

    this.nextMs -= dt;
    if (this.nextMs <= 0) {
      this.startSomething(actors, hooks, limit);
      const crowd = actors.length >= 10 ? 0.65 : actors.length <= 2 ? 1.25 : 1;
      this.nextMs = (4000 + this.rng() * 5000) * crowd;
    }

    const still: Encounter[] = [];
    for (const e of this.encounters) {
      if (this.advance(e, dt, actors, hooks, limit)) still.push(e);
      else this.release(e, actors);
    }
    this.encounters = still;
  }

  private startSomething(actors: readonly SocialActor[], hooks: SocialHooks, limit: number): void {
    const free = actors.map((_, i) => i).filter((i) => !this.isBusy(i));
    if (free.length === 0) return;
    if (free.length >= 2 && this.rng() < this.pairChance) {
      const a = pick(free, this.rng);
      const others = free.filter((i) => i !== a);
      const sa = actors[a]!.state;
      // Prefere um vizinho (um dos mais próximos); se não houver, qualquer um.
      const near = others.map((i) => ({ i, d: Math.hypot(actors[i]!.state.x - sa.x, actors[i]!.state.z - sa.z) })).sort((p, q) => p.d - q.d).slice(0, 3);
      const b = pick(near, this.rng).i;
      const kind = weighted(KIND_WEIGHTS, this.rng);
      const script = scriptFor(kind, this.rng);
      this.encounters.push({
        kind, a, b, phase: 'approach', t: 0, script, fired: script.cues.map(() => false), winner: this.rng() < 0.5 ? 'a' : 'b', tx: 0, tz: 0,
      });
      for (const index of [a, b]) {
        const s = actors[index]!.state;
        s.vx = 0;
        s.vz = 0;
        s.pauseMs = 0;
      }
      return;
    }
    const index = pick(free, this.rng);
    const solo = weighted(SOLO_EMOTIONS.map((e) => [e, e.weight] as const), this.rng);
    const s = actors[index]!.state;
    if (solo.hold > 0) {
      s.vx = 0;
      s.vz = 0;
      s.pauseMs = Math.max(s.pauseMs, solo.hold);
    }
    hooks.bubble(index, solo.emoji, solo.ms);
    if (solo.hop) hooks.hop(index);
    void limit;
  }

  private face(a: SocialActor, b: SocialActor): void {
    const dx = b.state.x - a.state.x;
    const dz = b.state.z - a.state.z;
    const len = Math.hypot(dx, dz);
    a.fx.facing = len > 1e-4 ? { x: dx / len, z: dz / len } : null;
    b.fx.facing = len > 1e-4 ? { x: -dx / len, z: -dz / len } : null;
  }

  /** Avança um encontro; devolve false quando acabou. */
  private advance(e: Encounter, dt: number, actors: readonly SocialActor[], hooks: SocialHooks, limit: number): boolean {
    const A = actors[e.a]!;
    const B = actors[e.b]!;
    const clamp = (v: number) => Math.min(limit, Math.max(-limit, v));
    e.t += dt;
    if (e.phase === 'approach') {
      this.face(A, B);
      B.state.vx = 0;
      B.state.vz = 0;
      const dx = B.state.x - A.state.x;
      const dz = B.state.z - A.state.z;
      const dist = Math.hypot(dx, dz) || 1;
      const arrived = dist <= e.script.gap + 0.05;
      if (!arrived) {
        stepToward(A.state, clamp(B.state.x - (dx / dist) * e.script.gap), clamp(B.state.z - (dz / dist) * e.script.gap), dt, APPROACH_SPEED);
        if (e.t > APPROACH_TIMEOUT_MS) return false;
        return true;
      }
      A.state.vx = 0;
      A.state.vz = 0;
      e.phase = 'main';
      e.t = 0;
      // Pega-pega: o fugitivo escolhe o primeiro destino.
      if (e.kind === 'chase') this.newFleeTarget(e, A, limit);
    }

    // Parte principal.
    const script = e.script;
    for (let i = 0; i < script.cues.length; i++) {
      const cue = script.cues[i]!;
      if (e.fired[i] || e.t < cue.at) continue;
      e.fired[i] = true;
      const index = cue.who === 'a' ? e.a : cue.who === 'b' ? e.b : (cue.who === 'win') === (e.winner === 'a') ? e.a : e.b;
      if (cue.emoji) hooks.bubble(index, cue.emoji, cue.ms ?? 1800);
      if (cue.hop) hooks.hop(index);
    }
    if (e.kind === 'chase') {
      const fleeing = B.state;
      if (stepToward(fleeing, e.tx, e.tz, dt, 0.75)) this.newFleeTarget(e, A, limit);
      stepToward(A.state, clamp(fleeing.x), clamp(fleeing.z), dt, 0.62);
      A.fx.facing = null;
      B.fx.facing = null;
    } else {
      this.face(A, B);
      if (e.kind === 'duel' && e.t > 1400) {
        // O que perdeu recua um pouco, de costas para o vencedor.
        const win = e.winner === 'a' ? A : B;
        const lose = e.winner === 'a' ? B : A;
        const dx = lose.state.x - win.state.x;
        const dz = lose.state.z - win.state.z;
        const dist = Math.hypot(dx, dz) || 1;
        stepToward(lose.state, clamp(win.state.x + (dx / dist) * 1.1), clamp(win.state.z + (dz / dist) * 1.1), dt, 0.45);
      } else {
        A.state.vx = A.state.vz = B.state.vx = B.state.vz = 0;
      }
    }
    return e.t < script.duration;
  }

  private newFleeTarget(e: Encounter, chaser: SocialActor, limit: number): void {
    for (let i = 0; i < 8; i++) {
      const x = (this.rng() * 2 - 1) * limit;
      const z = (this.rng() * 2 - 1) * limit;
      e.tx = x;
      e.tz = z;
      if (Math.hypot(x - chaser.state.x, z - chaser.state.z) > 0.9) return;
    }
  }

  private release(e: Encounter, actors: readonly SocialActor[]): void {
    for (const index of [e.a, e.b]) {
      const actor = actors[index];
      if (!actor) continue;
      actor.fx.facing = null;
      actor.state.vx = 0;
      actor.state.vz = 0;
      // Um instante parado e depois o passeio escolhe outro destino.
      actor.state.pauseMs = 300 + this.rng() * 900;
    }
  }
}
