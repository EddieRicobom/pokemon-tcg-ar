import type { PokemonType } from '../core/pokemon-data';
import type { Impact } from '../core/survivor-impacts';

/** Partículas do impacto dos golpes. Somem sozinhas em menos de um segundo: nada fica pintado no chão. */

type Rng = () => number;

const rngOf = (seed: number): Rng => {
  let state = seed | 1;
  return () => {
    state = (state * 1664525 + 1013904223) | 0;
    return ((state >>> 8) & 0xffffff) / 0x1000000;
  };
};

interface Spot {
  x: number;
  y: number;
  /** Direção em que o golpe empurrou este ponto. */
  dir: number;
}

/** Um ponto dentro da forma do golpe. */
function spotIn(impact: Impact, rng: Rng): Spot {
  if (impact.shape === 'cone') {
    const dir = impact.angle + (rng() * 2 - 1) * impact.spread;
    const d = 0.25 + 0.75 * Math.sqrt(rng());
    return { x: impact.x + Math.cos(dir) * d * impact.r, y: impact.y + Math.sin(dir) * d * impact.r * 0.85, dir };
  }
  if (impact.shape === 'line') {
    const along = rng() * impact.length;
    const side = rng() * 2 - 1;
    return {
      x: impact.x + Math.cos(impact.angle) * along - Math.sin(impact.angle) * side * impact.r,
      y: impact.y + Math.sin(impact.angle) * along + Math.cos(impact.angle) * side * impact.r,
      dir: impact.angle,
    };
  }
  const dir = rng() * Math.PI * 2;
  const d = Math.sqrt(rng());
  return { x: impact.x + Math.cos(dir) * d * impact.r, y: impact.y + Math.sin(dir) * d * impact.r * 0.72, dir };
}

/** Área da forma: golpe maior solta mais partículas. */
const areaOf = (impact: Impact): number => {
  if (impact.shape === 'line') return impact.length * impact.r * 2;
  if (impact.shape === 'cone') return impact.r * impact.r * impact.spread;
  return Math.PI * impact.r * impact.r * 0.72;
};

interface SparkStyle {
  colors: readonly string[];
  /** Velocidade para fora, para cima (positivo sobe) e queda. */
  speed: number;
  rise: number;
  gravity: number;
  size: number;
  lifeMs: number;
  /** Zigue-zague lateral (folha, fagulha elétrica). */
  wobble: number;
}

const SPARKS: Record<PokemonType, SparkStyle> = {
  fire: { colors: ['#ffc040', '#ff7a2a', '#c8381c'], speed: 40, rise: 70, gravity: 0, size: 2, lifeMs: 620, wobble: 12 },
  water: { colors: ['#9fd8ff', '#ffffff', '#4f9fe8'], speed: 110, rise: 130, gravity: 340, size: 2, lifeMs: 520, wobble: 0 },
  ice: { colors: ['#ffffff', '#bfe9ff', '#7cc4e8'], speed: 130, rise: 60, gravity: 220, size: 3, lifeMs: 480, wobble: 0 },
  electric: { colors: ['#ffe36e', '#ffffff'], speed: 190, rise: 0, gravity: 0, size: 2, lifeMs: 240, wobble: 170 },
  grass: { colors: ['#6fbf52', '#a8e070', '#3f8a3c'], speed: 60, rise: 50, gravity: 40, size: 3, lifeMs: 780, wobble: 60 },
  poison: { colors: ['#b86ae8', '#8ae05a'], speed: 24, rise: 44, gravity: 0, size: 3, lifeMs: 700, wobble: 18 },
  ground: { colors: ['#a07c50', '#6e5234', '#c0a070'], speed: 100, rise: 110, gravity: 320, size: 3, lifeMs: 460, wobble: 0 },
  rock: { colors: ['#8e887c', '#b4ac9c', '#5e584e'], speed: 120, rise: 140, gravity: 420, size: 4, lifeMs: 520, wobble: 0 },
  psychic: { colors: ['#ff9ad8', '#ffffff'], speed: 34, rise: 56, gravity: 0, size: 2, lifeMs: 640, wobble: 40 },
  ghost: { colors: ['#8a6ad8', '#3c2470'], speed: 16, rise: 52, gravity: 0, size: 3, lifeMs: 800, wobble: 30 },
  dark: { colors: ['#2a1a3a', '#6a3a6a'], speed: 60, rise: 20, gravity: 0, size: 3, lifeMs: 420, wobble: 0 },
  dragon: { colors: ['#a080ff', '#5a3ae0', '#ffffff'], speed: 130, rise: 30, gravity: 0, size: 2, lifeMs: 420, wobble: 30 },
  steel: { colors: ['#ffffff', '#c8d4e4', '#ffd080'], speed: 200, rise: 60, gravity: 260, size: 2, lifeMs: 300, wobble: 0 },
  fighting: { colors: ['#f0d0a0', '#ffffff', '#a08060'], speed: 150, rise: 50, gravity: 160, size: 3, lifeMs: 320, wobble: 0 },
  normal: { colors: ['#d8ccb4', '#a89878'], speed: 90, rise: 40, gravity: 140, size: 2, lifeMs: 340, wobble: 0 },
  flying: { colors: ['#ffffff', '#d0ecff'], speed: 160, rise: 16, gravity: 0, size: 2, lifeMs: 420, wobble: 50 },
  bug: { colors: ['#b8c860', '#f0f0e0'], speed: 60, rise: 30, gravity: 30, size: 2, lifeMs: 560, wobble: 70 },
  fairy: { colors: ['#ffb0dc', '#ffffff', '#ffe36e'], speed: 40, rise: 60, gravity: 10, size: 2, lifeMs: 760, wobble: 34 },
};

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ageMs: number;
  style: SparkStyle;
  color: string;
}

const MAX_SPARKS = 140;

/** Partículas do impacto: o tipo decide cor, peso e jeito; a forma do golpe decide de onde saem e para onde vão. */
export class ImpactSparks {
  private sparks: Spark[] = [];
  private lastMs = 0;

  burst(impact: Impact): void {
    const style = SPARKS[impact.type];
    const rng = rngOf(impact.seed + 7);
    const amount = Math.min(26, Math.round(6 + Math.sqrt(areaOf(impact)) * 0.28));
    for (let i = 0; i < amount; i++) {
      if (this.sparks.length >= MAX_SPARKS) this.sparks.shift();
      const spot = spotIn(impact, rng);
      const speed = style.speed * (0.5 + rng() * 0.8);
      this.sparks.push({
        x: spot.x,
        y: spot.y,
        vx: Math.cos(spot.dir) * speed,
        vy: Math.sin(spot.dir) * speed * 0.75 - style.rise * (0.6 + rng() * 0.6),
        ageMs: rng() * 60,
        style,
        color: style.colors[i % style.colors.length] ?? '#ffffff',
      });
    }
  }

  draw(c: CanvasRenderingContext2D, nowMs: number): void {
    const dt = Math.min(50, Math.max(0, nowMs - this.lastMs)) / 1000;
    this.lastMs = nowMs;
    if (this.sparks.length === 0) return;
    let kept = 0;
    c.save();
    for (const spark of this.sparks) {
      spark.ageMs += dt * 1000;
      const left = 1 - spark.ageMs / spark.style.lifeMs;
      if (left <= 0) continue;
      spark.vy += spark.style.gravity * dt;
      spark.x += (spark.vx + Math.sin(spark.ageMs / 60) * spark.style.wobble) * dt;
      spark.y += spark.vy * dt;
      c.globalAlpha = Math.min(1, left * 2);
      c.fillStyle = spark.color;
      c.fillRect(Math.round(spark.x), Math.round(spark.y), spark.style.size, spark.style.size);
      this.sparks[kept++] = spark;
    }
    this.sparks.length = kept;
    c.restore();
  }

  clear(): void {
    this.sparks = [];
  }
}
