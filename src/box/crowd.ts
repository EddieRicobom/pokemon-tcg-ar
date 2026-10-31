import type { Rng } from './wander';

/**
 * Torcida da Arena 3D (palco virtual): os moradores da Caixa que não lutam vão para a arquibancada do fundo, cada um no
 * lado da equipe que fica daquele lado (vermelha à esquerda da tela, azul à direita, como a pintura da arquibancada).
 * Eles comemoram, sofrem e puxam coro com balões de emoji e pulinhos, conforme o que acontece na luta. Lógica pura: os
 * assentos são ângulos e fileiras, e as reações saem por `hooks`, então é testável sem navegador.
 */

/** No máximo esta quantidade de torcedores (o resto continua escondido, como antes). */
export const MAX_SPECTATORS = 18;
/** Os torcedores são desenhados maiores que na arena: estão bem mais longe da câmera. */
export const SPECTATOR_SCALE = 2.6;

const PER_ROW = 6;
/** Fileiras usadas (0 = rente ao muro, 1 = topo): só as de baixo, que cabem na visão inicial. */
const ROWS = [0.1, 0.3, 0.5] as const;
const EVEN_OFFSETS = [0.12, -0.12, 0.3, -0.3, 0.48, -0.48] as const;
const ODD_OFFSETS = [0.21, -0.21, 0.39, -0.39, 0.57, -0.57] as const;

export interface Seat {
  /** Ângulo em volta do centro da arena (mesma conta do cilindro da arquibancada: π é o fundo, de frente para a câmera). */
  angle: number;
  /** Altura na arquibancada: 0 rente ao muro, 1 no topo. */
  row: number;
  /** Equipe que este lado da arquibancada apoia: 0 (vermelha, à esquerda da tela) ou 1 (azul, à direita). */
  team: 0 | 1;
}

/**
 * Assentos para `count` torcedores no fundo da arquibancada, alternando esquerda e direita para os dois lados ficarem
 * parecidos. Fileiras ímpares ficam desencontradas, para ninguém tapar quem está logo atrás.
 */
export function seatLayout(count: number): Seat[] {
  const n = Math.max(0, Math.min(MAX_SPECTATORS, Math.floor(count)));
  const seats: Seat[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / PER_ROW);
    const offset = (r % 2 === 0 ? EVEN_OFFSETS : ODD_OFFSETS)[i % PER_ROW]!;
    // sin(π + o) = −sin(o): deslocamento positivo cai à esquerda da tela (x negativo), o lado vermelho.
    seats.push({ angle: Math.PI + offset, row: ROWS[r] ?? ROWS[ROWS.length - 1]!, team: offset > 0 ? 0 : 1 });
  }
  return seats;
}

/** Algo que a torcida vê na luta. `team` é a equipe que se deu bem (null em "todos contra todos"). */
export type CrowdEventKind = 'go' | 'crit' | 'super' | 'ko' | 'endure' | 'win';
export interface CrowdEvent {
  kind: CrowdEventKind;
  team: number | null;
}

export interface CrowdHooks {
  bubble(index: number, emoji: string, ms: number): void;
  hop(index: number): void;
}

interface Reaction {
  /** Chance de cada torcedor reagir. */
  chance: number;
  happy: readonly string[];
  sad: readonly string[];
  neutral: readonly string[];
  /** Quem comemora pula; com `wave`, pula em ola (um depois do outro, de um canto ao outro). */
  wave?: boolean;
  ms: number;
}

const REACTIONS: Record<CrowdEventKind, Reaction> = {
  go: { chance: 0.9, happy: ['📣', '🔥', '💪', '👏'], sad: ['📣', '🔥', '💪', '👏'], neutral: ['📣', '👏', '🔥'], ms: 1500 },
  crit: { chance: 0.55, happy: ['🔥', '💥', '😮', '👏'], sad: ['😱', '😬'], neutral: ['😮', '💥'], ms: 1300 },
  super: { chance: 0.45, happy: ['💪', '✨', '👏'], sad: ['😬', '😰'], neutral: ['✨', '😮'], ms: 1200 },
  ko: { chance: 0.85, happy: ['🎉', '🙌', '💥', '🔥'], sad: ['😭', '😱', '💔'], neutral: ['😱', '😮', '👏'], ms: 1800 },
  endure: { chance: 0.6, happy: ['🥹', '💪', '👏'], sad: ['😤', '😮'], neutral: ['😮', '👏'], ms: 1500 },
  win: { chance: 1, happy: ['🏆', '🎉', '🙌', '🥳'], sad: ['😭', '💔', '👏'], neutral: ['👏', '🎉', '✨'], wave: true, ms: 2600 },
};

/** Coro de quem está só assistindo, de vez em quando. */
const CHANTS = ['📣', '👏', '🎶', '🙌', '⭐', '💪', '🔥'] as const;
const IDLE_MIN_MS = 900;
const IDLE_SPREAD_MS = 1600;
/** Espalha as reações de um mesmo lance (ninguém reage no mesmo quadro). */
const REACT_SPREAD_MS = 650;
const WAVE_STEP_MS = 110;

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

interface Pending {
  at: number;
  index: number;
  emoji: string;
  ms: number;
  hop: boolean;
  /** Ola: depois do primeiro, pula mais uma vez. */
  again?: boolean;
}

export class CrowdDirector {
  private clock = 0;
  private nextIdle: number;
  private queue: Pending[] = [];
  /** Até quando cada torcedor está ocupado com um balão (para um coro não atropelar uma comemoração). */
  private readonly busyUntil: number[];
  /** Empolgação (0–1) de cada torcedor: sobe com os lances e desce sozinha; deixa o balanço mais forte. */
  private readonly hype: number[];

  constructor(readonly seats: readonly Seat[], private readonly rng: Rng) {
    this.busyUntil = seats.map(() => 0);
    this.hype = seats.map(() => 0.2);
    this.nextIdle = IDLE_MIN_MS * 0.5;
  }

  get size(): number {
    return this.seats.length;
  }

  /** Empolgação de um torcedor agora (0–1). */
  excitement(index: number): number {
    return this.hype[index] ?? 0;
  }

  /** Reações pendentes (para testes e depuração). */
  get pending(): number {
    return this.queue.length;
  }

  /** Um lance da luta: cada torcedor reage conforme o lado dele. */
  event(e: CrowdEvent): void {
    const r = REACTIONS[e.kind];
    // A ola corre da esquerda para a direita da tela (ângulo maior = mais à esquerda).
    const order = this.seats.map((s, i) => ({ s, i })).sort((a, b) => b.s.angle - a.s.angle);
    order.forEach(({ s, i }, rank) => {
      if (this.rng() >= r.chance) return;
      const mood = e.team === null ? 'neutral' : e.team === s.team ? 'happy' : 'sad';
      const delay = r.wave ? rank * WAVE_STEP_MS : this.rng() * REACT_SPREAD_MS;
      const happy = mood !== 'sad';
      this.hype[i] = Math.min(1, (this.hype[i] ?? 0) + (happy ? 0.6 : 0.25));
      this.queue.push({ at: this.clock + delay, index: i, emoji: pick(r[mood], this.rng), ms: r.ms, hop: happy, again: r.wave && happy });
    });
  }

  update(dtMs: number, hooks: CrowdHooks): void {
    if (this.seats.length === 0) return;
    const dt = Math.max(0, dtMs);
    this.clock += dt;
    for (let i = 0; i < this.hype.length; i++) this.hype[i] = Math.max(0.15, this.hype[i]! - dt / 4000);
    const due = this.queue.filter((p) => p.at <= this.clock);
    if (due.length > 0) {
      this.queue = this.queue.filter((p) => p.at > this.clock);
      for (const p of due) {
        // `ms` 0 é só o segundo pulo da ola, sem balão novo.
        if (p.ms > 0) {
          hooks.bubble(p.index, p.emoji, p.ms);
          this.busyUntil[p.index] = this.clock + p.ms;
        }
        if (p.hop) hooks.hop(p.index);
        if (p.again) this.queue.push({ at: this.clock + 520, index: p.index, emoji: p.emoji, ms: 0, hop: true });
      }
    }
    if (this.clock >= this.nextIdle) {
      this.nextIdle = this.clock + IDLE_MIN_MS + this.rng() * IDLE_SPREAD_MS;
      const free = this.seats.map((_, i) => i).filter((i) => this.busyUntil[i]! <= this.clock);
      if (free.length > 0) {
        const i = pick(free, this.rng);
        hooks.bubble(i, pick(CHANTS, this.rng), 1400);
        if (this.rng() < 0.5) hooks.hop(i);
        this.busyUntil[i] = this.clock + 1400;
      }
    }
  }
}

/** Balanço lateral (m, antes da escala) de um torcedor: mais forte quanto mais empolgado. */
export function crowdSway(index: number, nowMs: number, excitement: number): number {
  return Math.sin(nowMs / 260 + index * 1.9) * (0.008 + 0.02 * excitement);
}
