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
  const map: VillageMap = { w, h, tiles: new Array<Tile>(w * h).fill('grass'), spawn: { x: Math.floor(w / 2), y: Math.floor(h / 2) + 3 }, plot: { x: Math.floor(w / 2) - 8, y: Math.floor(h / 2) + 2, w: 4, h: 3 }, shop: { x: Math.floor(w / 2) + 4, y: Math.floor(h / 2) - 4, w: 3, h: 2 }, buildings: buildingsFor(w, h) };
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
  // (a rua principal passa rente ao terreno: o que já é trilha continua trilha)
  for (let y = p.y - 1; y <= p.y + p.h; y++) for (let x = p.x - 1; x <= p.x + p.w; x++) if (tileAt(map, x, y) !== 'path') setTile(map, x, y, 'grass');
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
    for (let y = b.y - 1; y <= b.y + b.h; y++) for (let x = b.x - 1; x <= b.x + b.w; x++) if (!['path', 'plot', 'shop'].includes(tileAt(map, x, y))) setTile(map, x, y, 'grass');
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) setTile(map, x, y, 'building');
    if (b.kind !== 'fountain') for (let x = b.x; x < b.x + b.w; x++) setTile(map, x, b.y + b.h, 'path');
  }
  for (const l of lampSpots(w, h)) if (['grass', 'flower', 'tall', 'path'].includes(tileAt(map, l.x, l.y))) setTile(map, l.x, l.y, 'lamp');
  // Onde você aparece: na trilha, livre.
  setTile(map, map.spawn.x, map.spawn.y, 'path');
  repairLayout(map);
  return map;
}

// ----------------------------------------------------------------------------- caminhos

const STEPS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Dá para pisar no bloco? (o terreno da casa não conta: ele é só a planta da sua casa) */
export function isWalkable(map: VillageMap, x: number, y: number): boolean {
  const t = tileAt(map, x, y);
  return !isSolidTile(t) && t !== 'plot';
}

/**
 * Os blocos que dá para alcançar andando a partir de (x, y), como uma grade de 0/1. `taken` marca blocos ocupados à
 * parte do mapa (móveis, hortas, ou um Pokémon parado no caminho).
 */
export function reachableFrom(map: VillageMap, x: number, y: number, taken?: (x: number, y: number) => boolean): Uint8Array {
  const seen = new Uint8Array(map.w * map.h);
  if (!isWalkable(map, x, y) || taken?.(x, y)) return seen;
  const stack = [y * map.w + x];
  seen[y * map.w + x] = 1;
  while (stack.length > 0) {
    const i = stack.pop()!;
    const cx = i % map.w;
    const cy = (i - cx) / map.w;
    for (const [dx, dy] of STEPS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      const j = ny * map.w + nx;
      if (seen[j] || !isWalkable(map, nx, ny) || taken?.(nx, ny)) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return seen;
}

/**
 * Os lugares aonde você sempre precisa conseguir chegar: onde você nasce, a porta de cada casa e prédio, a frente da
 * loja, a ponta da trilha do terreno da sua casa e a beira do lago.
 */
export function keyPoints(map: VillageMap): { x: number; y: number }[] {
  const out = [{ ...map.spawn }];
  for (const b of map.buildings) out.push({ ...b.door });
  out.push({ x: map.shop.x + 1, y: map.shop.y + map.shop.h });
  out.push({ x: map.plot.x + map.plot.w, y: map.plot.y + map.plot.h - 1 });
  return out;
}

/** Os blocos que precisam ficar livres: onde você nasce e a calçada na frente de cada prédio e da loja. */
export function isFront(map: VillageMap, x: number, y: number): boolean {
  if (x === map.spawn.x && y === map.spawn.y) return true;
  if (y === map.shop.y + map.shop.h && x >= map.shop.x && x < map.shop.x + map.shop.w) return true;
  return map.buildings.some((b) => b.kind !== 'fountain' && y === b.y + b.h && x >= b.x && x < b.x + b.w);
}

/** Algum lugar importante ficou isolado de onde você nasce? (`taken` = o que está atrapalhando o caminho) */
export function cutsOff(map: VillageMap, taken: (x: number, y: number) => boolean): boolean {
  const seen = reachableFrom(map, map.spawn.x, map.spawn.y, taken);
  return keyPoints(map).some((k) => !taken(k.x, k.y) && !seen[k.y * map.w + k.x]);
}

/**
 * Blocos que, se alguém (ou alguma coisa) parar ali, isolam um lugar importante: os gargalos de 1 bloco de largura.
 * Um bom mapa não tem nenhum. Uma busca só (pontos de articulação do grafo de blocos livres, a partir de onde você nasce):
 * um bloco isola quando alguma parte da árvore de busca só se liga ao resto por ele e leva um lugar importante junto.
 */
export function chokepoints(map: VillageMap): { x: number; y: number }[] {
  const n = map.w * map.h;
  const key = new Uint8Array(n);
  for (const k of keyPoints(map)) key[k.y * map.w + k.x] = 1;
  const disc = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const holds = new Int32Array(n); // lugares importantes na subárvore de cada bloco
  const parent = new Int32Array(n).fill(-1);
  const next = new Uint8Array(n); // próximo vizinho a olhar
  const choke = new Uint8Array(n);
  const root = map.spawn.y * map.w + map.spawn.x;
  if (!isWalkable(map, map.spawn.x, map.spawn.y)) return [];
  let time = 0;
  const stack = [root];
  disc[root] = low[root] = time++;
  holds[root] = key[root]!;
  while (stack.length > 0) {
    const v = stack[stack.length - 1]!;
    const vx = v % map.w;
    const vy = (v - vx) / map.w;
    if (next[v]! < 4) {
      const [dx, dy] = STEPS[next[v]!++]!;
      const nx = vx + dx;
      const ny = vy + dy;
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h || !isWalkable(map, nx, ny)) continue;
      const u = ny * map.w + nx;
      if (disc[u]! < 0) {
        parent[u] = v;
        disc[u] = low[u] = time++;
        holds[u] = key[u]!;
        stack.push(u);
      } else if (u !== parent[v]) low[v] = Math.min(low[v]!, disc[u]!);
      continue;
    }
    stack.pop();
    const p = parent[v]!;
    if (p < 0) continue;
    low[p] = Math.min(low[p]!, low[v]!);
    holds[p] = holds[p]! + holds[v]!;
    if (p !== root && low[v]! >= disc[p]! && holds[v]! > 0) choke[p] = 1;
  }
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) if (choke[i] && !key[i]) out.push({ x: i % map.w, y: Math.floor(i / map.w) });
  return out;
}

/** O que o sorteio espalha pela grama e que dá para tirar do caminho sem estragar o desenho da cidade. */
const CLEARABLE = new Set<Tile>(['rock', 'bush', 'tree', 'lamp']);

/**
 * Garante que o mapa não tem ilhas nem gargalos: todo bloco livre se alcança a partir de onde você nasce (o que sobrar
 * isolado vira mata) e, onde um bloco fecharia o caminho, uma pedra, arbusto, árvore ou poste vizinho sai dali.
 */
export function repairLayout(map: VillageMap): void {
  const seen = reachableFrom(map, map.spawn.x, map.spawn.y);
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (isWalkable(map, x, y) && !seen[y * map.w + x]) setTile(map, x, y, 'tree');
  for (let round = 0; round < 40; round++) {
    const chokes = chokepoints(map);
    if (chokes.length === 0) return;
    let cleared = false;
    for (const c of chokes) {
      for (const [dx, dy] of STEPS) {
        const nx = c.x + dx;
        const ny = c.y + dy;
        const inner = nx >= 3 && ny >= 3 && nx < map.w - 3 && ny < map.h - 3;
        if (inner && CLEARABLE.has(tileAt(map, nx, ny))) {
          setTile(map, nx, ny, 'grass');
          cleared = true;
          break;
        }
      }
    }
    if (!cleared) return;
  }
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
