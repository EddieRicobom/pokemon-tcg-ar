import { seededRng } from '../battle';
import type { Rng } from '../battle';
import { buildingsFor, lampSpots, lowerStreetRow } from './town-layout';
import type { Building } from './town-layout';

/**
 * O mapa da Vila (modo vida da Caixa, sem câmera): uma grade de blocos gerada por semente. Borda de floresta, praça
 * no meio com trilhas em cruz, um lago com praia, bosques, pedras, arbustos de frutas, flores e o terreno da sua casa
 * perto de onde você começa. Tudo puro: o desenho fica em `village/render.ts`.
 */

export type Tile = 'grass' | 'tall' | 'flower' | 'path' | 'sand' | 'water' | 'tree' | 'rock' | 'bush' | 'plot' | 'shop' | 'building' | 'lamp';
export const TILES: readonly Tile[] = ['grass', 'tall', 'flower', 'path', 'sand', 'water', 'tree', 'rock', 'bush', 'plot', 'shop', 'building', 'lamp'];

/** Blocos que não dá para atravessar. */
const SOLID = new Set<Tile>(['water', 'tree', 'rock', 'bush', 'shop', 'building', 'lamp']);

export interface VillageMap {
  w: number;
  h: number;
  tiles: Tile[];
  /** Onde você aparece. */
  spawn: { x: number; y: number };
  /** Canto superior esquerdo do terreno da casa (4×3 blocos). */
  plot: { x: number; y: number; w: number; h: number };
  /** A loja da praça (3×2 blocos, sólida). */
  shop: { x: number; y: number; w: number; h: number };
  /** As casas dos Pokémon e os prédios da cidade (ver `town-layout.ts`); o chão deles é o bloco `building`. */
  buildings: Building[];
}

/** O prédio que ocupa o bloco (x, y), se houver. */
export function buildingAt(map: VillageMap, x: number, y: number): Building | null {
  return map.buildings.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) ?? null;
}

export const MAP_W = 48;
export const MAP_H = 40;

export function tileAt(map: VillageMap, x: number, y: number): Tile {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return 'tree';
  return map.tiles[y * map.w + x]!;
}

export function setTile(map: VillageMap, x: number, y: number, tile: Tile): void {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return;
  map.tiles[y * map.w + x] = tile;
}

export function isSolidTile(tile: Tile): boolean {
  return SOLID.has(tile);
}

function blob(map: VillageMap, rng: Rng, cx: number, cy: number, r: number, tile: Tile, only?: Tile[]): void {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const d = Math.hypot(x - cx, (y - cy) * 1.1) + (rng() - 0.5) * 1.2;
      if (d <= r && (!only || only.includes(tileAt(map, x, y)))) setTile(map, x, y, tile);
    }
  }
}

export function generateVillage(seed: number, w = MAP_W, h = MAP_H): VillageMap {
  const rng = seededRng(seed);
  const map: VillageMap = { w, h, tiles: new Array<Tile>(w * h).fill('grass'), spawn: { x: Math.floor(w / 2), y: Math.floor(h / 2) + 3 }, plot: { x: Math.floor(w / 2) - 8, y: Math.floor(h / 2) + 1, w: 4, h: 3 }, shop: { x: Math.floor(w / 2) + 4, y: Math.floor(h / 2) - 4, w: 3, h: 2 }, buildings: buildingsFor(w, h) };
  // Borda de floresta (2 a 3 blocos, irregular).
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (edge < 2 || (edge < 3 && rng() < 0.55)) setTile(map, x, y, 'tree');
    }
  }
  // Lago com praia no canto de cima à direita.
  const lake = { x: Math.floor(w * 0.74), y: Math.floor(h * 0.2) };
  blob(map, rng, lake.x, lake.y, 6.2, 'sand', ['grass']);
  blob(map, rng, lake.x, lake.y, 4.4, 'water');
  // Bosques nos outros cantos, com clareiras de mato alto.
  for (const [fx, fy] of [[0.2, 0.25], [0.22, 0.78], [0.78, 0.78]] as const) {
    for (let n = 0; n < 14; n++) {
      const x = Math.floor(w * fx + (rng() - 0.5) * 12);
      const y = Math.floor(h * fy + (rng() - 0.5) * 9);
      if (tileAt(map, x, y) === 'grass') setTile(map, x, y, 'tree');
    }
    blob(map, rng, w * fx + (rng() - 0.5) * 4, h * fy + (rng() - 0.5) * 4, 2.6, 'tall', ['grass']);
  }
  // Flores, pedras e arbustos de frutas espalhados.
  for (let n = 0; n < 9; n++) blob(map, rng, 3 + rng() * (w - 6), 3 + rng() * (h - 6), 1.3, 'flower', ['grass']);
  for (let n = 0; n < 14; n++) {
    const x = 3 + Math.floor(rng() * (w - 6));
    const y = 3 + Math.floor(rng() * (h - 6));
    if (tileAt(map, x, y) === 'grass') setTile(map, x, y, rng() < 0.5 ? 'rock' : 'bush');
  }
  // Praça e trilhas em cruz (por cima de tudo, para sempre dar passagem).
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  for (let x = 2; x < w - 2; x++) for (const y of [cy, cy + 1]) setTile(map, x, y, 'path');
  for (let y = 2; y < h - 2; y++) for (const x of [cx, cx + 1]) setTile(map, x, y, 'path');
  blob(map, rng, cx + 0.5, cy + 0.5, 3.2, 'path');
  // Trilha até a beira do lago.
  for (let x = cx; x <= lake.x - 4; x++) setTile(map, x, lake.y, tileAt(map, x, lake.y) === 'water' ? 'water' : 'path');
  // Terreno da casa, limpo, com uma trilha até a praça.
  const p = map.plot;
  for (let y = p.y - 1; y <= p.y + p.h; y++) for (let x = p.x - 1; x <= p.x + p.w; x++) setTile(map, x, y, 'grass');
  for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) setTile(map, x, y, 'plot');
  for (let x = p.x + p.w; x < cx; x++) setTile(map, x, p.y + p.h - 1, 'path');
  // Loja na praça, com a frente para a trilha.
  const shop = map.shop;
  for (let y = shop.y - 1; y <= shop.y + shop.h; y++) for (let x = shop.x - 1; x <= shop.x + shop.w; x++) if (tileAt(map, x, y) !== 'path') setTile(map, x, y, 'grass');
  for (let y = shop.y; y < shop.y + shop.h; y++) for (let x = shop.x; x < shop.x + shop.w; x++) setTile(map, x, y, 'shop');
  for (let x = shop.x; x < shop.x + shop.w; x++) setTile(map, x, shop.y + shop.h, 'path');
  // A rua de baixo, de ponta a ponta, e as casas e os prédios da cidade (a calçada na frente de cada um).
  const lower = lowerStreetRow(h);
  if (lower + 1 < h - 3) for (let x = 2; x < w - 2; x++) for (const y of [lower, lower + 1]) setTile(map, x, y, 'path');
  for (const b of map.buildings) {
    for (let y = b.y - 1; y <= b.y + b.h; y++) for (let x = b.x - 1; x <= b.x + b.w; x++) if (tileAt(map, x, y) !== 'path') setTile(map, x, y, 'grass');
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) setTile(map, x, y, 'building');
    if (b.kind !== 'fountain') for (let x = b.x; x < b.x + b.w; x++) setTile(map, x, b.y + b.h, 'path');
  }
  for (const l of lampSpots(w, h)) if (['grass', 'flower', 'tall', 'path'].includes(tileAt(map, l.x, l.y))) setTile(map, l.x, l.y, 'lamp');
  // Onde você aparece: na trilha, livre.
  setTile(map, map.spawn.x, map.spawn.y, 'path');
  return map;
}

/** Vizinhos livres (para Pokémon passearem e para colocar móveis). */
export function freeAround(map: VillageMap, x: number, y: number, blocked: (x: number, y: number) => boolean): { x: number; y: number }[] {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dy]) => ({ x: x + dx!, y: y + dy! }))
    .filter((c) => !isSolidTile(tileAt(map, c.x, c.y)) && tileAt(map, c.x, c.y) !== 'plot' && !blocked(c.x, c.y));
}

/** Um bloco livre de grama/trilha perto de (x, y), procurando em espiral. */
export function findFree(map: VillageMap, x: number, y: number, blocked: (x: number, y: number) => boolean, rng: Rng = Math.random): { x: number; y: number } {
  for (let r = 0; r < Math.max(map.w, map.h); r++) {
    const ring: { x: number; y: number }[] = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) ring.push({ x: x + dx, y: y + dy });
    const ok = ring.filter((c) => {
      const t = tileAt(map, c.x, c.y);
      return (t === 'grass' || t === 'path' || t === 'flower' || t === 'tall') && !blocked(c.x, c.y);
    });
    if (ok.length > 0) return ok[Math.floor(rng() * ok.length)]!;
  }
  return { ...map.spawn };
}
