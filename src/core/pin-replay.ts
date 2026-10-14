import type { PinWorld } from './pins';

/**
 * Repetição do último disparo do Pin Mode: guarda a posição dos pins a cada 1/60 s durante o disparo e devolve quadros
 * interpolados para a tela tocar em câmera lenta. Só conta (sem tela); a tela decide quando mostrar.
 */

export interface ReplayPin {
  id: string;
  x: number;
  y: number;
  /** 0 = em pé; de 0 a 1 enquanto cai. */
  fall: number;
  alive: boolean;
}

export interface ReplayFrame {
  /** Tempo do mundo (s) em que o quadro foi guardado. */
  t: number;
  pins: ReplayPin[];
  /** Raio da arena nesse momento. */
  limit: number;
}

/** Intervalo entre quadros guardados (s). */
export const SAMPLE_EVERY = 1 / 60;
/** Mais que isso (10 s de disparo) joga fora os quadros mais antigos. */
export const MAX_FRAMES = 600;
/** O trecho tocado: um pouco antes e depois do momento decisivo. */
export const REPLAY_BEFORE = 2.4;
export const REPLAY_AFTER = 1.3;
/** Velocidade da repetição (1 = tempo real). */
export const REPLAY_SPEED = 0.35;

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

export class ReplayRecorder {
  frames: ReplayFrame[] = [];
  /** Tempo do momento decisivo (a queda do último pin), ou null. */
  decisiveAt: number | null = null;

  /** Começa um disparo novo: apaga o anterior e guarda o quadro inicial. */
  start(world: PinWorld): void {
    this.frames = [];
    this.decisiveAt = null;
    this.push(world);
  }

  /** Guarda um quadro se já passou tempo suficiente desde o último. */
  capture(world: PinWorld): void {
    const last = this.frames[this.frames.length - 1];
    if (last && world.time - last.t < SAMPLE_EVERY - 1e-9) return;
    this.push(world);
  }

  /** Marca o momento atual como o decisivo (por exemplo, quando o último adversário caiu). */
  markDecisive(world: PinWorld): void {
    this.decisiveAt = world.time;
    this.push(world);
  }

  private push(world: PinWorld): void {
    this.frames.push({
      t: world.time,
      limit: world.limit ?? world.radius,
      pins: world.pins.map((p) => ({ id: p.id, x: p.x, y: p.y, fall: p.fall, alive: p.alive })),
    });
    if (this.frames.length > MAX_FRAMES) this.frames.splice(0, this.frames.length - MAX_FRAMES);
  }

  get hasReplay(): boolean {
    return this.frames.length >= 3 && this.decisiveAt !== null;
  }

  /** Trecho a tocar, em tempo do mundo: de `REPLAY_BEFORE` antes do momento decisivo a `REPLAY_AFTER` depois. */
  range(): { from: number; to: number } | null {
    const first = this.frames[0];
    const last = this.frames[this.frames.length - 1];
    if (!first || !last) return null;
    const at = this.decisiveAt ?? last.t;
    return { from: Math.max(first.t, at - REPLAY_BEFORE), to: Math.min(last.t, at + REPLAY_AFTER) };
  }

  /** Quanto tempo (s) a repetição dura na velocidade `speed`. */
  duration(speed = REPLAY_SPEED): number {
    const r = this.range();
    return r ? (r.to - r.from) / speed : 0;
  }

  /** O quadro no tempo `t` do mundo, interpolado entre os dois guardados mais próximos. */
  frameAt(t: number): ReplayFrame | null {
    const frames = this.frames;
    if (frames.length === 0) return null;
    if (t <= frames[0]!.t) return frames[0]!;
    const last = frames[frames.length - 1]!;
    if (t >= last.t) return last;
    // Busca binária do primeiro quadro com tempo >= t.
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid]!.t < t) lo = mid + 1;
      else hi = mid;
    }
    const b = frames[lo]!;
    const a = frames[lo - 1]!;
    const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
    return {
      t,
      limit: lerp(a.limit, b.limit, k),
      pins: a.pins.map((pa, i) => {
        const pb = b.pins[i] ?? pa;
        return { id: pa.id, x: lerp(pa.x, pb.x, k), y: lerp(pa.y, pb.y, k), fall: lerp(pa.fall, pb.fall, k), alive: pa.alive || pb.alive };
      }),
    };
  }
}
