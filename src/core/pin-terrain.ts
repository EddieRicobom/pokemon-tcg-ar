import type { Rng } from './battle';
import type { PokemonType } from './pokemon-data';
import { applyTerrain, buildGrid, cellAt, TERRAIN_FOR_TYPE } from './terrain';
import type { GroundKind, TerrainGrid, TerrainKind, TerrainReaction } from './terrain';

/**
 * O chão do Pin Mode é o mesmo da batalha da Caixa (`core/terrain.ts`): uma grade de blocos com o chão base e a marca
 * que os golpes elementais deixam. Aqui a marca também muda o atrito, e cada tipo de pin sente de um jeito. Lógica
 * pura; o desenho fica em `pins/terrain-paint.ts`.
 *
 * O mundo do Pin Mode tem y para baixo, e a grade tem a linha 0 em z = +meia-profundidade; por isso z = −y e a linha 0
 * cai no alto da tela (o mesmo sentido do desenho no canvas).
 */

/** Blocos na largura da arena. */
export const TERRAIN_COLS = 22;
/** O chão marcável termina antes da mureta. */
export const TERRAIN_MARGIN = 20;

export const terrainHalf = (radius: number): number => radius - TERRAIN_MARGIN;

export function createArenaGrid(seed: number): TerrainGrid {
  return buildGrid(TERRAIN_COLS, TERRAIN_COLS, 'ellipse', seed);
}

/** Bloco sob o ponto (x, y) do mundo, ou null fora do chão. */
export function cellOfWorld(grid: TerrainGrid, radius: number, x: number, y: number): number | null {
  const half = terrainHalf(radius);
  const cell = cellAt(grid, x, -y, half, half);
  return cell ? grid.index(cell.c, cell.r) : null;
}

// ----------------------------------------------------------------------------- atrito

/** Quanto cada chão base muda o atrito do chão comum (1). */
export const GROUND_FRICTION: Record<GroundKind, number> = { grass: 1, grass2: 1, flowers: 1, tall: 1.4, path: 0.9 };

/** Quanto cada marca muda o atrito do chão comum (1). A marca vale no lugar do chão base. */
export const MARK_FRICTION: Record<TerrainKind, number> = {
  scorch: 0.85,
  puddle: 1.9,
  thicket: 2.6,
  frost: 0.1,
  static: 0.75,
  crack: 1.4,
  rubble: 2.2,
  toxic: 3.2,
  psy: 0.9,
  shade: 1.15,
  bloom: 0.7,
};

/** O que cada marca faz, em uma frase (a legenda mostra só as marcas que existem na arena). */
export const MARK_HINT_PT: Record<TerrainKind, string> = {
  scorch: 'Cinzas: o pin escorrega um pouco mais.',
  puddle: 'Freia o pin.',
  thicket: 'Segura bastante o pin.',
  frost: 'Quase sem atrito: o pin escorrega longe.',
  static: 'Liso e rápido.',
  crack: 'Um pouco mais de atrito.',
  rubble: 'Prende o pin.',
  toxic: 'Lodo grudento: o pin quase para.',
  psy: 'Chão levemente liso.',
  shade: 'Um pouco mais de atrito.',
  bloom: 'Liso: o pin desliza mais.',
};

/**
 * Afinidade do tipo com a marca: 0 = não sente, 1 = sente normal, maior = sente mais. Voador paira e Fantasma flutua sobre
 * qualquer marca; o resto vem da tabela.
 */
const MARK_AFFINITY: Partial<Record<TerrainKind, Partial<Record<PokemonType, number>>>> = {
  scorch: { fire: 0.4, dragon: 0.6 },
  puddle: { water: 0, ice: 0.6, fire: 1.5, electric: 1.3, ground: 1.3, rock: 1.3 },
  thicket: { grass: 0.2, bug: 0.3 },
  frost: { ice: 0, steel: 1.2, fire: 1.2 },
  static: { electric: 1.4, steel: 0.8 },
  crack: { ground: 0.3, fighting: 0.5 },
  rubble: { rock: 0.2, ground: 0.3, steel: 0.4 },
  toxic: { poison: 0, steel: 0.3, bug: 0.8 },
  psy: { psychic: 0.3 },
  bloom: { fairy: 0.3 },
};
const FLOATING: Partial<Record<PokemonType, number>> = { flying: 0.3, ghost: 0.4 };

export function terrainAffinity(types: readonly PokemonType[], mark: TerrainKind): number {
  if (types.length === 0) return 1;
  const table = MARK_AFFINITY[mark];
  return Math.min(...types.map((t) => table?.[t] ?? FLOATING[t] ?? 1));
}

/** Atrito (múltiplo do chão comum) que um pin sente sobre o bloco `i`. */
export function frictionOfCell(grid: TerrainGrid, i: number, types: readonly PokemonType[]): number {
  const mark = grid.overlayAt(i);
  if (!mark) return GROUND_FRICTION[grid.groundAt(i)];
  return Math.max(0.05, 1 + (MARK_FRICTION[mark] - 1) * terrainAffinity(types, mark));
}

/** Atrito no ponto (x, y) do mundo (1 fora do chão). */
export function frictionAt(grid: TerrainGrid, radius: number, x: number, y: number, types: readonly PokemonType[]): number {
  const i = cellOfWorld(grid, radius, x, y);
  return i === null ? 1 : frictionOfCell(grid, i, types);
}

// ----------------------------------------------------------------------------- marcas

/** Um tipo que deixa cada marca (para o som da marca ter o timbre do tipo). */
export const TYPE_FOR_TERRAIN: Record<TerrainKind, PokemonType> = {
  scorch: 'fire',
  puddle: 'water',
  thicket: 'grass',
  frost: 'ice',
  static: 'electric',
  crack: 'ground',
  rubble: 'rock',
  toxic: 'poison',
  psy: 'psychic',
  shade: 'ghost',
  bloom: 'fairy',
};

export interface MarkResult {
  kind: TerrainKind;
  /** Índices dos blocos que mudaram. */
  cells: number[];
  reaction: TerrainReaction | null;
}

/** Marca o chão em (x, y) do mundo com a marca `kind`. Devolve null quando nada mudou. */
export function stampKind(grid: TerrainGrid, radius: number, kind: TerrainKind, x: number, y: number, power: number, rng: Rng): MarkResult | null {
  const half = terrainHalf(radius);
  const hit = applyTerrain(grid, kind, x, -y, half, half, power, rng);
  return hit.changed.length === 0 ? null : { kind, cells: hit.changed, reaction: hit.reaction };
}

/** O golpe de `type` cai em (x, y): marca o chão se o tipo deixa marca (Normal e Voador não deixam). */
export function stampType(grid: TerrainGrid, radius: number, type: PokemonType, x: number, y: number, power: number, rng: Rng): MarkResult | null {
  const kind = TERRAIN_FOR_TYPE[type];
  return kind ? stampKind(grid, radius, kind, x, y, power, rng) : null;
}

/** Marcas com que a arena começa (cada uma vira uma região pequena), longe de quem começa. */
const START_MARKS: readonly TerrainKind[] = ['frost', 'puddle', 'thicket', 'toxic', 'rubble', 'frost', 'puddle', 'thicket', 'toxic'];

export interface Spot {
  x: number;
  y: number;
  r: number;
}

export function seedMarks(grid: TerrainGrid, radius: number, rng: Rng, avoid: readonly Spot[] = []): MarkResult[] {
  const out: MarkResult[] = [];
  const centers: { x: number; y: number }[] = [];
  // As distâncias vêm do tamanho do bloco: uma marca alcança até ~3 blocos do centro.
  const cell = (2 * terrainHalf(radius)) / grid.cols;
  for (const kind of START_MARKS) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * radius * 0.72;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      if (avoid.some((s) => Math.hypot(s.x - x, s.y - y) < s.r + 3.2 * cell)) continue;
      if (centers.some((c) => Math.hypot(c.x - x, c.y - y) < 3 * cell)) continue;
      const hit = stampKind(grid, radius, kind, x, y, 0.55 + rng() * 0.45, rng);
      if (hit) {
        out.push(hit);
        centers.push({ x, y });
      }
      break;
    }
  }
  return out;
}
