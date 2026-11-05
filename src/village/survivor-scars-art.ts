import type { PokemonType } from '../core/pokemon-data';
import { chunksTouched, isChunkLost, SCAR_CHUNK } from '../core/survivor-scars';
import type { Scar } from '../core/survivor-scars';

/**
 * Desenho das marcas dos golpes. Cada marca é pintada uma vez num pedaço de chão guardado em canvas, então ficar no mapa
 * não custa nada por quadro: desenhar é só copiar os pedaços visíveis. Longe do jogador o pedaço se perde, e as marcas junto.
 */

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
  /** 0 no miolo, 1 na borda. */
  edge: number;
}

/** Um ponto dentro da forma do golpe. */
function spotIn(scar: Scar, rng: Rng): Spot {
  if (scar.shape === 'cone') {
    const dir = scar.angle + (rng() * 2 - 1) * scar.spread;
    const d = 0.25 + 0.75 * Math.sqrt(rng());
    return { x: scar.x + Math.cos(dir) * d * scar.r, y: scar.y + Math.sin(dir) * d * scar.r * 0.85, dir, edge: d };
  }
  if (scar.shape === 'line') {
    const along = rng() * scar.length;
    const side = rng() * 2 - 1;
    return {
      x: scar.x + Math.cos(scar.angle) * along - Math.sin(scar.angle) * side * scar.r,
      y: scar.y + Math.sin(scar.angle) * along + Math.cos(scar.angle) * side * scar.r,
      dir: scar.angle,
      edge: Math.abs(side),
    };
  }
  const dir = rng() * Math.PI * 2;
  const d = Math.sqrt(rng());
  return { x: scar.x + Math.cos(dir) * d * scar.r, y: scar.y + Math.sin(dir) * d * scar.r * 0.72, dir, edge: d };
}

/** Quantos toques a forma pede para ficar coberta. */
const areaOf = (scar: Scar): number => {
  if (scar.shape === 'line') return scar.length * scar.r * 2;
  if (scar.shape === 'cone') return scar.r * scar.r * scar.spread;
  return Math.PI * scar.r * scar.r * 0.72;
};

/** Mancha em três passadas: quase nada na borda e mais densa no miolo, para o chão continuar aparecendo por baixo. */
function blotches(c: CanvasRenderingContext2D, scar: Scar, rng: Rng, color: string, grow: number): void {
  const size = Math.max(4, Math.min(11, scar.r * 0.2)) * grow;
  const count = Math.min(170, Math.ceil(areaOf(scar) / (size * size * 0.6)));
  const before = c.globalAlpha;
  c.fillStyle = color;
  for (const [limit, alpha] of [[1.1, 0.34], [0.72, 0.4], [0.42, 0.46]] as const) {
    c.globalAlpha = before * alpha;
    c.beginPath();
    for (let i = 0; i < count; i++) {
      const s = spotIn(scar, rng);
      if (s.edge > limit) continue;
      const rx = size * (0.7 + rng() * 0.6);
      c.moveTo(s.x + rx, s.y);
      c.ellipse(s.x, s.y, rx, rx * 0.72, 0, 0, Math.PI * 2);
    }
    c.fill();
  }
  c.globalAlpha = before;
}

/** Rachadura em zigue-zague, com galhos curtos. */
function crack(c: CanvasRenderingContext2D, rng: Rng, x: number, y: number, dir: number, length: number, branch: boolean): void {
  c.moveTo(x, y);
  let px = x;
  let py = y;
  let angle = dir;
  const steps = Math.max(3, Math.round(length / 7));
  for (let i = 0; i < steps; i++) {
    angle += (rng() - 0.5) * 1;
    px += Math.cos(angle) * 7;
    py += Math.sin(angle) * 7 * 0.8;
    c.lineTo(px, py);
    if (branch && i > 0 && rng() < 0.3) {
      crack(c, rng, px, py, angle + (rng() < 0.5 ? 0.9 : -0.9), length * 0.3, false);
      c.moveTo(px, py);
    }
  }
}

function cracks(c: CanvasRenderingContext2D, scar: Scar, rng: Rng, color: string, width: number, count: number, reach: number): void {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineJoin = 'miter';
  c.beginPath();
  for (let i = 0; i < count; i++) {
    const s = scar.shape === 'round' ? { x: scar.x, y: scar.y, dir: (i / count) * Math.PI * 2 + rng() * 0.5 } : spotIn(scar, rng);
    crack(c, rng, s.x, s.y, s.dir, reach * (0.45 + rng() * 0.4), true);
  }
  c.stroke();
}

function specks(c: CanvasRenderingContext2D, scar: Scar, rng: Rng, colors: readonly string[], count: number, size: number): void {
  for (let i = 0; i < count; i++) {
    const s = spotIn(scar, rng);
    c.fillStyle = colors[i % colors.length] ?? '#fff';
    c.fillRect(Math.round(s.x), Math.round(s.y), size, Math.max(1, size - 1));
  }
}

/** Sulcos paralelos na direção do golpe. */
function gouges(c: CanvasRenderingContext2D, scar: Scar, rng: Rng, color: string, light: string, count: number): void {
  for (let i = 0; i < count; i++) {
    const s = spotIn(scar, rng);
    const length = 10 + rng() * Math.min(34, scar.r);
    const ex = s.x + Math.cos(s.dir) * length;
    const ey = s.y + Math.sin(s.dir) * length * 0.8;
    c.lineWidth = 3;
    c.strokeStyle = color;
    c.beginPath();
    c.moveTo(s.x, s.y);
    c.lineTo(ex, ey);
    c.stroke();
    c.lineWidth = 1;
    c.strokeStyle = light;
    c.beginPath();
    c.moveTo(s.x + 1, s.y - 2);
    c.lineTo(ex + 1, ey - 2);
    c.stroke();
  }
}

const count = (scar: Scar, per: number, max: number): number => Math.min(max, Math.ceil(areaOf(scar) / per));

const SCAR_PAINT: Record<PokemonType, (c: CanvasRenderingContext2D, scar: Scar, rng: Rng) => void> = {
  fire: (c, s, r) => {
    blotches(c, s, r, 'rgba(120, 66, 30, 0.55)', 1.25);
    blotches(c, s, r, 'rgba(26, 18, 16, 0.86)', 1);
    specks(c, s, r, ['#ff7a2a', '#ffc040', '#c8381c'], count(s, 150, 60), 2);
  },
  water: (c, s, r) => {
    blotches(c, s, r, 'rgba(40, 70, 90, 0.4)', 1.25);
    blotches(c, s, r, 'rgba(58, 130, 208, 0.62)', 0.95);
    specks(c, s, r, ['#bfe6ff', '#ffffff'], count(s, 320, 30), 3);
  },
  ice: (c, s, r) => {
    blotches(c, s, r, 'rgba(176, 226, 248, 0.78)', 1.05);
    cracks(c, s, r, 'rgba(255, 255, 255, 0.9)', 1, 6, s.r * 0.8);
    specks(c, s, r, ['#ffffff', '#7cc4e8'], count(s, 240, 40), 3);
  },
  electric: (c, s, r) => {
    blotches(c, s, r, 'rgba(30, 26, 30, 0.42)', 0.7);
    cracks(c, s, r, 'rgba(20, 16, 20, 0.92)', 3, 7, s.r * 1.1);
    cracks(c, s, r, '#ffe36e', 1, 5, s.r * 0.9);
  },
  grass: (c, s, r) => {
    blotches(c, s, r, 'rgba(46, 92, 46, 0.6)', 1.05);
    const tufts = count(s, 110, 70);
    c.fillStyle = '#6fbf52';
    for (let i = 0; i < tufts; i++) {
      const p = spotIn(s, r);
      c.fillRect(Math.round(p.x), Math.round(p.y) - 4, 1, 4);
      c.fillRect(Math.round(p.x) + 2, Math.round(p.y) - 3, 1, 3);
      c.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 1, 2);
    }
    specks(c, s, r, ['#ffe36e', '#ffffff', '#ff8ab0'], count(s, 500, 20), 2);
  },
  poison: (c, s, r) => {
    blotches(c, s, r, 'rgba(78, 34, 110, 0.76)', 1);
    const bubbles = count(s, 300, 26);
    for (let i = 0; i < bubbles; i++) {
      const p = spotIn(s, r);
      c.strokeStyle = i % 2 ? '#b86ae8' : '#8ae05a';
      c.lineWidth = 1;
      c.beginPath();
      c.arc(p.x, p.y, 2 + r() * 3, 0, Math.PI * 2);
      c.stroke();
    }
  },
  ground: (c, s, r) => {
    blotches(c, s, r, 'rgba(120, 88, 56, 0.72)', 1.1);
    cracks(c, s, r, 'rgba(36, 22, 14, 0.92)', 3, 8, s.r * 1.1);
    specks(c, s, r, ['#c0a070', '#8a6a44'], count(s, 170, 50), 3);
  },
  rock: (c, s, r) => {
    blotches(c, s, r, 'rgba(92, 66, 44, 0.75)', 1.25);
    blotches(c, s, r, 'rgba(28, 22, 22, 0.9)', 0.8);
    const rocks = count(s, 240, 36);
    for (let i = 0; i < rocks; i++) {
      const p = spotIn(s, r);
      const w = 4 + Math.floor(r() * 7);
      c.fillStyle = '#6e685e';
      c.fillRect(Math.round(p.x), Math.round(p.y), w, 4);
      c.fillStyle = '#b4ac9c';
      c.fillRect(Math.round(p.x), Math.round(p.y) - 2, w, 2);
    }
  },
  psychic: (c, s, r) => {
    blotches(c, s, r, 'rgba(230, 90, 170, 0.22)', 1);
    c.strokeStyle = 'rgba(255, 130, 200, 0.75)';
    c.lineWidth = 2;
    if (s.shape === 'round') {
      for (const k of [1, 0.66]) {
        c.beginPath();
        c.ellipse(s.x, s.y, s.r * k, s.r * k * 0.72, 0, 0, Math.PI * 2);
        c.stroke();
      }
    }
    specks(c, s, r, ['#ffc0e4', '#ffffff'], count(s, 220, 40), 2);
  },
  ghost: (c, s, r) => {
    blotches(c, s, r, 'rgba(44, 28, 72, 0.6)', 1.1);
    gouges(c, s, r, 'rgba(26, 14, 48, 0.7)', 'rgba(150, 120, 220, 0.5)', count(s, 500, 14));
  },
  dark: (c, s, r) => {
    blotches(c, s, r, 'rgba(14, 10, 22, 0.72)', 1.1);
    gouges(c, s, r, 'rgba(6, 4, 10, 0.85)', 'rgba(120, 60, 110, 0.45)', count(s, 500, 12));
  },
  dragon: (c, s, r) => {
    blotches(c, s, r, 'rgba(46, 30, 90, 0.5)', 0.9);
    gouges(c, s, r, 'rgba(24, 14, 56, 0.9)', '#a080ff', count(s, 300, 20));
  },
  steel: (c, s, r) => {
    blotches(c, s, r, 'rgba(70, 76, 90, 0.42)', 0.8);
    gouges(c, s, r, 'rgba(40, 44, 54, 0.85)', '#dfe6ee', count(s, 280, 20));
    specks(c, s, r, ['#e8eef4', '#9aa4b4'], count(s, 300, 26), 2);
  },
  fighting: (c, s, r) => {
    blotches(c, s, r, 'rgba(96, 62, 44, 0.6)', 0.75);
    cracks(c, s, r, 'rgba(30, 18, 14, 0.9)', 3, 6, s.r * 1);
    specks(c, s, r, ['#b08a60'], count(s, 300, 24), 3);
  },
  normal: (c, s, r) => {
    blotches(c, s, r, 'rgba(84, 66, 50, 0.46)', 0.85);
    gouges(c, s, r, 'rgba(60, 46, 36, 0.6)', 'rgba(200, 186, 160, 0.5)', count(s, 500, 10));
  },
  flying: (c, s, r) => {
    const lines = count(s, 180, 40);
    c.lineWidth = 1;
    for (let i = 0; i < lines; i++) {
      const p = spotIn(s, r);
      const a = p.dir + 1.2;
      c.strokeStyle = i % 2 ? 'rgba(230, 244, 255, 0.6)' : 'rgba(70, 90, 100, 0.4)';
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.quadraticCurveTo(p.x + Math.cos(a) * 10, p.y + Math.sin(a) * 8, p.x + Math.cos(a + 0.8) * 22, p.y + Math.sin(a + 0.8) * 16);
      c.stroke();
    }
  },
  bug: (c, s, r) => {
    blotches(c, s, r, 'rgba(120, 136, 60, 0.42)', 0.9);
    c.strokeStyle = 'rgba(240, 240, 228, 0.7)';
    c.lineWidth = 1;
    const threads = count(s, 180, 26);
    c.beginPath();
    for (let i = 0; i < threads; i++) {
      const a = spotIn(s, r);
      const b = spotIn(s, r);
      c.moveTo(a.x, a.y);
      c.lineTo((a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    c.stroke();
  },
  fairy: (c, s, r) => {
    blotches(c, s, r, 'rgba(255, 170, 214, 0.3)', 1);
    const flowers = count(s, 260, 30);
    for (let i = 0; i < flowers; i++) {
      const p = spotIn(s, r);
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      c.fillStyle = i % 2 ? '#ff9ad0' : '#ffffff';
      c.fillRect(x - 2, y, 5, 1);
      c.fillRect(x, y - 2, 1, 5);
      c.fillStyle = '#ffe36e';
      c.fillRect(x, y, 1, 1);
    }
  },
};

interface Chunk {
  canvas: HTMLCanvasElement;
  c: CanvasRenderingContext2D;
  cx: number;
  cy: number;
}

/** Marcas pintadas por quadro: uma rajada de golpes não trava o aparelho, o resto espera na fila. */
const BAKES_PER_FRAME = 2;
const MAX_QUEUE = 16;
/** Golpe repetido no mesmo lugar não vira borrão: mesma marca, no máximo tantas vezes por célula. */
const STAMP_CELL = 40;
const MAX_STAMPS = 2;

export class ScarField {
  private readonly chunks = new Map<string, Chunk>();
  private readonly stamps = new Map<string, number>();
  private queue: Scar[] = [];

  add(scar: Scar): void {
    const key = `${scar.type}:${scar.shape}:${Math.floor(scar.x / STAMP_CELL)},${Math.floor(scar.y / STAMP_CELL)}:${Math.round(scar.angle * 2)}`;
    const used = this.stamps.get(key) ?? 0;
    if (used >= MAX_STAMPS) return;
    this.stamps.set(key, used + 1);
    if (this.queue.length >= MAX_QUEUE) this.queue.shift();
    this.queue.push(scar);
  }

  private chunkAt(cx: number, cy: number): Chunk | null {
    const key = `${cx},${cy}`;
    const known = this.chunks.get(key);
    if (known) return known;
    const canvas = document.createElement('canvas');
    canvas.width = SCAR_CHUNK;
    canvas.height = SCAR_CHUNK;
    const c = canvas.getContext('2d');
    if (!c) return null;
    const chunk = { canvas, c, cx, cy };
    this.chunks.set(key, chunk);
    return chunk;
  }

  private bake(scar: Scar): void {
    for (const [cx, cy] of chunksTouched(scar)) {
      const chunk = this.chunkAt(cx, cy);
      if (!chunk) continue;
      chunk.c.save();
      chunk.c.translate(-cx * SCAR_CHUNK, -cy * SCAR_CHUNK);
      // A mesma semente em todo pedaço: a marca da divisa se encaixa.
      SCAR_PAINT[scar.type](chunk.c, scar, rngOf(scar.seed));
      chunk.c.restore();
    }
  }

  /** Pinta o que está na fila, esquece o chão que ficou para trás e copia o que está na tela. */
  draw(c: CanvasRenderingContext2D, view: { x: number; y: number; w: number; h: number }, playerX: number, playerY: number): void {
    for (let i = 0; i < BAKES_PER_FRAME && this.queue.length > 0; i++) {
      const scar = this.queue.shift();
      if (scar) this.bake(scar);
    }
    for (const [key, chunk] of this.chunks) {
      if (isChunkLost(chunk.cx, chunk.cy, playerX, playerY)) {
        this.chunks.delete(key);
        // O carimbo não sabe de que pedaço veio: quando o chão se perde, zera, e a área volta a aceitar marcas.
        this.stamps.clear();
        continue;
      }
      const x = chunk.cx * SCAR_CHUNK;
      const y = chunk.cy * SCAR_CHUNK;
      if (x > view.x + view.w || y > view.y + view.h || x + SCAR_CHUNK < view.x || y + SCAR_CHUNK < view.y) continue;
      c.drawImage(chunk.canvas, x, y);
    }
  }

  clear(): void {
    this.chunks.clear();
    this.stamps.clear();
    this.queue = [];
  }
}

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
export class ScarSparks {
  private sparks: Spark[] = [];
  private lastMs = 0;

  burst(scar: Scar): void {
    const style = SPARKS[scar.type];
    const rng = rngOf(scar.seed + 7);
    const amount = Math.min(26, Math.round(6 + Math.sqrt(areaOf(scar)) * 0.28));
    for (let i = 0; i < amount; i++) {
      if (this.sparks.length >= MAX_SPARKS) this.sparks.shift();
      const spot = spotIn(scar, rng);
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
