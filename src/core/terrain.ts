import type { PokemonType } from './pokemon-data';
import { seededRng } from './battle';
import type { Rng } from './battle';

/**
 * Terreno da arena e da caixa: uma grade de blocos (chão base + marca do golpe por cima). Lógica pura; o desenho em
 * pixel art fica em `box/ground-art.ts` e o objeto 3D em `box/ground.ts`.
 *
 * Coordenadas: o bloco (c, r) fica em x = −halfW + (c+½)·largura e z = +halfD − (r+½)·altura, ou seja, a linha 0 é a da
 * frente (mais perto do celular). Assim a grade é gravada na textura sem inverter nada.
 */

export const GROUND_KINDS = ['grass', 'grass2', 'flowers', 'tall', 'path'] as const;
export type GroundKind = (typeof GROUND_KINDS)[number];

export const TERRAIN_KINDS = ['scorch', 'puddle', 'thicket', 'frost', 'static', 'crack', 'rubble', 'toxic', 'psy', 'shade', 'bloom'] as const;
export type TerrainKind = (typeof TERRAIN_KINDS)[number];

export const TERRAIN_LABELS_PT: Record<TerrainKind, string> = {
  scorch: 'Chão queimado',
  puddle: 'Poça',
  thicket: 'Mato alto',
  frost: 'Gelo',
  static: 'Chão chamuscado',
  crack: 'Rachaduras',
  rubble: 'Pedregulhos',
  toxic: 'Lodo tóxico',
  psy: 'Símbolos psíquicos',
  shade: 'Sombras',
  bloom: 'Flores de fada',
};

/** O que cada tipo de golpe deixa no chão (normal e voador não deixam marca). */
export const TERRAIN_FOR_TYPE: Partial<Record<PokemonType, TerrainKind>> = {
  fire: 'scorch',
  dragon: 'scorch',
  water: 'puddle',
  grass: 'thicket',
  bug: 'thicket',
  ice: 'frost',
  electric: 'static',
  ground: 'crack',
  fighting: 'crack',
  rock: 'rubble',
  steel: 'rubble',
  poison: 'toxic',
  psychic: 'psy',
  ghost: 'shade',
  dark: 'shade',
  fairy: 'bloom',
};

export type GroundShape = 'ellipse' | 'square';
export type GroundLayout = 'wild' | 'garden' | 'battle';

/** Distância à trilha contínua em coordenadas normalizadas; compartilhada pela grade e pelo desenho. */
export function gardenTrailDistance(nx: number, nz: number, seed: number): number {
  return Math.abs(nz - Math.sin((nx + 1) * Math.PI * 0.625 + seed * 0.73) * 0.2);
}

export class TerrainGrid {
  /** Chão base (índice em `GROUND_KINDS`) e marca do golpe (0 = nenhuma, senão 1 + índice em `TERRAIN_KINDS`). */
  readonly base: Uint8Array;
  readonly over: Uint8Array;
  /** 1 = bloco dentro do formato (elipse ou quadrado). */
  readonly inside: Uint8Array;

  constructor(readonly cols: number, readonly rows: number, readonly shape: GroundShape) {
    this.base = new Uint8Array(cols * rows);
    this.over = new Uint8Array(cols * rows);
    this.inside = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const nx = ((c + 0.5) / cols) * 2 - 1;
        const nz = ((r + 0.5) / rows) * 2 - 1;
        this.inside[r * cols + c] = shape === 'square' || nx * nx + nz * nz <= 1 ? 1 : 0;
      }
    }
  }

  index(c: number, r: number): number {
    return r * this.cols + c;
  }

  overlayAt(i: number): TerrainKind | null {
    const v = this.over[i]!;
    return v === 0 ? null : TERRAIN_KINDS[v - 1]!;
  }

  groundAt(i: number): GroundKind {
    return GROUND_KINDS[this.base[i]!] ?? 'grass';
  }

  /** Quantos blocos de cada marca existem agora. */
  counts(): Partial<Record<TerrainKind, number>> {
    const out: Partial<Record<TerrainKind, number>> = {};
    for (let i = 0; i < this.over.length; i++) {
      const kind = this.overlayAt(i);
      if (kind) out[kind] = (out[kind] ?? 0) + 1;
    }
    return out;
  }

  clearOverlays(): void {
    this.over.fill(0);
  }
}

/** O chão de partida: grama em dois tons, canteiros de flores, manchas de mato alto e uma trilha de terra. */
export function buildGrid(cols: number, rows: number, shape: GroundShape, seed: number, layout: GroundLayout = 'wild'): TerrainGrid {
  const grid = new TerrainGrid(cols, rows, shape);
  const rng = seededRng(seed);
  const patch = (count: number, radius: number, chance: number, kind: GroundKind): void => {
    for (let n = 0; n < count; n++) {
      const pc = rng() * cols;
      const pr = rng() * rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (Math.hypot(c + 0.5 - pc, r + 0.5 - pr) <= radius && rng() < chance) grid.base[grid.index(c, r)] = GROUND_KINDS.indexOf(kind);
        }
      }
    }
  };
  for (let i = 0; i < grid.base.length; i++) grid.base[i] = rng() < 0.5 ? 0 : 1;
  patch(Math.max(3, Math.round(cols / 6)), 2.1, 0.55, 'flowers');
  patch(Math.max(2, Math.round(cols / 9)), 2.4, 0.85, 'tall');
  // Trilha de terra de um lado ao outro, com uma curva suave.
  const phase = rng() * Math.PI * 2;
  const width = rows >= 18 ? 3 : 2;
  for (let c = 0; c < cols; c++) {
    const middle = rows / 2 + Math.sin(c * 0.4 + phase) * rows * 0.1;
    for (let r = 0; r < rows; r++) {
      if (Math.abs(r + 0.5 - middle) <= width / 2) grid.base[grid.index(c, r)] = GROUND_KINDS.indexOf('path');
    }
  }
  if (layout !== 'wild') {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = grid.index(c, r);
      const nx = ((c + 0.5) / cols) * 2 - 1;
      const nz = ((r + 0.5) / rows) * 2 - 1;
      if (layout === 'battle') {
        // Área de combate limpa e contínua, com jardim somente na borda.
        grid.base[i] = GROUND_KINDS.indexOf(nx * nx + nz * nz < 0.68 ** 2 ? 'path' : 'grass');
      } else {
        const edge = Math.max(Math.abs(nx), Math.abs(nz));
        const inTrail = gardenTrailDistance(nx, nz, seed) < 0.13;
        grid.base[i] = GROUND_KINDS.indexOf(inTrail ? 'path' : edge > 0.68 && rng() < 0.13 ? 'flowers' : rng() < 0.22 ? 'grass2' : 'grass');
      }
    }
  }
  return grid;
}

export function cellAt(grid: TerrainGrid, x: number, z: number, halfW: number, halfD: number): { c: number; r: number } | null {
  const c = Math.floor(((x + halfW) / (2 * halfW)) * grid.cols);
  const r = Math.floor(((halfD - z) / (2 * halfD)) * grid.rows);
  if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return null;
  return { c, r };
}

export function cellCenter(grid: TerrainGrid, c: number, r: number, halfW: number, halfD: number): { x: number; z: number } {
  return { x: -halfW + ((c + 0.5) / grid.cols) * 2 * halfW, z: halfD - ((r + 0.5) / grid.rows) * 2 * halfD };
}

// ----------------------------------------------------------------------------- reações

export interface TerrainReaction {
  text: string;
  color: string;
}

/** Quando um golpe cai sobre uma marca de outro elemento, o chão reage ("de" → "para"). */
const REACTIONS: Record<string, TerrainReaction> = {
  'scorch>puddle': { text: 'A água apagou o fogo!', color: '#7fd4ff' },
  'puddle>scorch': { text: 'A poça evaporou!', color: '#ffb48a' },
  'thicket>scorch': { text: 'O mato pegou fogo!', color: '#ff9b54' },
  'bloom>scorch': { text: 'As flores queimaram!', color: '#ff9b54' },
  'frost>scorch': { text: 'O gelo derreteu!', color: '#ffb48a' },
  'puddle>frost': { text: 'A poça congelou!', color: '#bfe9ff' },
  'thicket>frost': { text: 'O mato congelou!', color: '#bfe9ff' },
  'frost>puddle': { text: 'O gelo virou água!', color: '#7fd4ff' },
  'puddle>static': { text: 'A água conduziu a eletricidade!', color: '#ffe66b' },
  'puddle>toxic': { text: 'A água se contaminou!', color: '#d19bf0' },
  'scorch>thicket': { text: 'A grama brotou nas cinzas!', color: '#8fe06a' },
  'scorch>frost': { text: 'O fogo se apagou no gelo!', color: '#bfe9ff' },
};

export function reactionFor(from: TerrainKind, to: TerrainKind): TerrainReaction | null {
  return REACTIONS[`${from}>${to}`] ?? null;
}

export interface TerrainHit {
  /** Índices dos blocos alterados. */
  changed: number[];
  reaction: TerrainReaction | null;
}

/**
 * Um golpe do tipo `kind` cai em (x, z): um borrão irregular de blocos ao redor passa a ter a marca dele. O tamanho
 * cresce com a `power` (0,3–1,8). Só altera blocos dentro do formato. Se a maior parte do que foi coberto tinha
 * outra marca com reação conhecida, devolve a reação.
 */
export function applyTerrain(grid: TerrainGrid, kind: TerrainKind, x: number, z: number, halfW: number, halfD: number, power: number, rng: Rng): TerrainHit {
  const fc = ((x + halfW) / (2 * halfW)) * grid.cols;
  const fr = ((halfD - z) / (2 * halfD)) * grid.rows;
  const radius = 1.4 + 1.6 * Math.min(1.8, Math.max(0.3, power));
  const code = TERRAIN_KINDS.indexOf(kind) + 1;
  const changed: number[] = [];
  const previous = new Map<TerrainKind, number>();
  for (let r = Math.max(0, Math.floor(fr - radius - 1)); r <= Math.min(grid.rows - 1, Math.ceil(fr + radius + 1)); r++) {
    for (let c = Math.max(0, Math.floor(fc - radius - 1)); c <= Math.min(grid.cols - 1, Math.ceil(fc + radius + 1)); c++) {
      const i = grid.index(c, r);
      if (!grid.inside[i]) continue;
      const d = Math.hypot(c + 0.5 - fc, r + 0.5 - fr) + (rng() - 0.5) * 1.2;
      if (d > radius || grid.over[i] === code) continue;
      const before = grid.overlayAt(i);
      if (before) previous.set(before, (previous.get(before) ?? 0) + 1);
      grid.over[i] = code;
      changed.push(i);
    }
  }
  let reaction: TerrainReaction | null = null;
  let most = 0;
  for (const [before, n] of previous) {
    const found = reactionFor(before, kind);
    if (found && n >= Math.max(3, changed.length * 0.3) && n > most) {
      most = n;
      reaction = found;
    }
  }
  return { changed, reaction };
}

// ----------------------------------------------------------------------------- enfeites de pé

export const DECOR_KINDS = ['bush', 'tuft', 'flower-red', 'flower-yellow', 'flower-blue', 'rock', 'mushroom'] as const;
export type DecorKind = (typeof DECOR_KINDS)[number];

export interface DecorItem {
  kind: DecorKind;
  x: number;
  z: number;
  /** Altura em unidades da arena (antes de a arena encolher). */
  size: number;
  flip: boolean;
}

const TALL_DECOR: DecorKind[] = ['bush', 'bush', 'tuft', 'rock', 'mushroom', 'flower-red', 'flower-yellow', 'flower-blue'];
const LOW_DECOR: DecorKind[] = ['tuft', 'tuft', 'flower-red', 'flower-yellow', 'flower-blue', 'rock'];

/**
 * Enfeites (arbustos, flores, pedras, cogumelos) na faixa externa do chão, deixando o miolo livre para a luta.
 * Na frente (perto do celular) só entram os baixinhos, para nada tapar os lutadores.
 */
export function planDecor(halfW: number, halfD: number, shape: GroundShape, seed: number, count: number, unit = 0.16): DecorItem[] {
  const rng = seededRng(seed ^ 0x9e3779b9);
  const out: DecorItem[] = [];
  for (let n = 0; n < count; n++) {
    const t = (n + rng() * 0.8) / count;
    let x: number;
    let z: number;
    if (shape === 'ellipse') {
      const angle = t * Math.PI * 2;
      const rho = 0.86 + rng() * 0.12;
      x = Math.cos(angle) * halfW * rho;
      z = Math.sin(angle) * halfD * rho;
    } else {
      // Ao longo do perímetro do quadrado, um pouco para dentro.
      const side = Math.floor(t * 4);
      const u = (t * 4 - side) * 2 - 1;
      const edge = 1 - 0.06 - rng() * 0.08;
      [x, z] = side === 0 ? [u * halfW, -edge * halfD] : side === 1 ? [edge * halfW, u * halfD] : side === 2 ? [-u * halfW, edge * halfD] : [-edge * halfW, -u * halfD];
    }
    const front = z > halfD * 0.2;
    const pool = front ? LOW_DECOR : TALL_DECOR;
    const kind = pool[Math.floor(rng() * pool.length)]!;
    const base = kind === 'bush' ? 1.5 : kind === 'rock' || kind === 'mushroom' ? 0.8 : 0.9;
    out.push({ kind, x, z, size: unit * base * (0.85 + rng() * 0.35) * (front ? 0.85 : 1), flip: rng() < 0.5 });
  }
  return out;
}
