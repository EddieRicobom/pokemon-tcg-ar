import { seededRng } from '../battle';
import type { Rng } from '../battle';
import { buildingsFor, DECOR, FIELDS, lampSpots, TOWN } from './town-layout';
import type { Building, Decor } from './town-layout';

/**
 * O mapa da Vila: uma grade de blocos. A cidade tem desenho fixo (`town-layout.ts`: ruas, praça, prédios, casas,
 * parque e fazenda); em volta, o sorteio (por semente) espalha matas, um lago com praia, campos de mato alto, flores,
 * pedras e arbustos de frutas. Tudo puro: o desenho fica em `village/village-game.ts` e `village/ground-tiles.ts`.
 */

export type Tile =
  | 'grass' | 'tall' | 'flower' | 'path' | 'sand' | 'water' | 'tree' | 'rock' | 'bush' | 'plot' | 'shop' | 'building' | 'lamp'
  /** Trilha de terra (fora da cidade), piso de pedra da praça, canteiro arado da fazenda e enfeite fixo (`DECOR`). */
  | 'trail' | 'plaza' | 'field' | 'deco';
export const TILES: readonly Tile[] = ['grass', 'tall', 'flower', 'path', 'sand', 'water', 'tree', 'rock', 'bush', 'plot', 'shop', 'building', 'lamp', 'trail', 'plaza', 'field', 'deco'];

/** Blocos que não dá para atravessar. */
const SOLID = new Set<Tile>(['water', 'tree', 'rock', 'bush', 'shop', 'building', 'lamp', 'deco']);

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
  /** Enfeites fixos (parquinho, celeiro, jardineiras, árvores grandes); o chão deles é o bloco `deco`. */
  decor: Decor[];
}

/** O prédio que ocupa o bloco (x, y), se houver. */
export function buildingAt(map: VillageMap, x: number, y: number): Building | null {
  return map.buildings.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) ?? null;
}

export const MAP_W = TOWN.w;
export const MAP_H = TOWN.h;

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

function fill(map: VillageMap, x: number, y: number, w: number, h: number, tile: Tile, only?: Tile[]): void {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (!only || only.includes(tileAt(map, i, j))) setTile(map, i, j, tile);
}

const NATURE: Tile[] = ['grass', 'tall', 'flower', 'tree', 'rock', 'bush'];

/** Uma trilha de terra (2 blocos) de (x0, y0) até (x1, y1): na horizontal, depois na vertical, só por cima da natureza. */
function trail(map: VillageMap, x0: number, y0: number, x1: number, y1: number): void {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1) + 1; x++) fill(map, x, y0, 1, 2, 'trail', NATURE);
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1) + 1; y++) fill(map, x1, y, 2, 1, 'trail', NATURE);
}

export function generateVillage(seed: number, w = MAP_W, h = MAP_H): VillageMap {
  const rng = seededRng(seed);
  const map: VillageMap = { w, h, tiles: new Array<Tile>(w * h).fill('grass'), spawn: { ...TOWN.spawn }, plot: { ...TOWN.plot }, shop: { ...TOWN.shop }, buildings: buildingsFor(w, h), decor: [] };
  // Borda de floresta (3 a 4 blocos, irregular).
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (edge < 3 || (edge < 4 && rng() < 0.55)) setTile(map, x, y, 'tree');
    }
  }
  // Matas: o bosque do noroeste (atrás da Rua dos Jogos), faixas a oeste e a leste e um capão ao norte.
  const grove = (x0: number, y0: number, x1: number, y1: number, density: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (tileAt(map, x, y) === 'grass' && rng() < density) setTile(map, x, y, 'tree');
  };
  grove(4, 4, 40, 12, 0.42);
  grove(4, 14, 9, 36, 0.35);
  grove(88, 22, 92, 40, 0.35);
  grove(56, 4, 68, 9, 0.3);
  for (let n = 0; n < 10; n++) blob(map, rng, 6 + rng() * 30, 5 + rng() * 7, 1.6, 'grass', ['tree']); // clareiras no bosque
  // Lago com praia (a areia separa a água da grama).
  const lake = TOWN.lake;
  blob(map, rng, lake.x, lake.y, lake.sand, 'sand', NATURE);
  blob(map, rng, lake.x, lake.y, lake.water, 'water');
  // Campos de mato alto, flores, pedras e arbustos de frutas.
  for (const [mx, my, r] of [[60, 66, 3.2], [30, 66, 2.8], [12, 30, 2.6], [64, 14, 2.4], [88, 64, 2.2], [24, 8, 2.4]] as const) {
    blob(map, rng, mx + (rng() - 0.5) * 3, my + (rng() - 0.5) * 2, r, 'tall', ['grass']);
  }
  for (let n = 0; n < 26; n++) blob(map, rng, 5 + rng() * (w - 10), 5 + rng() * (h - 10), 1.3, 'flower', ['grass']);
  for (let n = 0; n < 46; n++) {
    const x = 4 + Math.floor(rng() * (w - 8));
    const y = 4 + Math.floor(rng() * (h - 8));
    if (tileAt(map, x, y) === 'grass') setTile(map, x, y, rng() < 0.5 ? 'rock' : 'bush');
  }
  // Pedreira do sudoeste.
  for (let n = 0; n < 16; n++) {
    const x = 4 + Math.floor(rng() * 16);
    const y = 60 + Math.floor(rng() * 8);
    if (tileAt(map, x, y) === 'grass') setTile(map, x, y, 'rock');
  }
  // A cidade por cima de tudo: o miolo fica livre de mata (flores podem ficar), depois ruas, praça, terrenos e prédios.
  fill(map, 10, 14, 70, 52, 'grass', ['tree', 'rock', 'bush', 'tall', 'sand', 'water']);
  const av = TOWN.avenueX;
  fill(map, av, 4, 2, h - 8, 'path');
  fill(map, 4, TOWN.mainStreetY, w - 8, 2, 'path');
  fill(map, 10, TOWN.gamesStreetY, 68, 2, 'path');
  fill(map, 20, TOWN.homesStreetY, 58, 2, 'path');
  fill(map, 20, TOWN.southStreetY, 58, 2, 'path');
  const pz = TOWN.plaza;
  fill(map, pz.x, pz.y, pz.w, pz.h, 'plaza');
  // Trilhas de terra para fora da cidade: até o lago, o parque, a fazenda, a pedreira e o bosque.
  trail(map, av + 2, 15, lake.x - 7, lake.y + 7);
  // A trilha do parque liga a Rua Principal às duas ruas de casas (sem beco no meio do gramado).
  trail(map, 12, TOWN.mainStreetY + 2, 12, TOWN.southStreetY - 1);
  trail(map, 12, TOWN.homesStreetY, 19, TOWN.homesStreetY);
  trail(map, 12, TOWN.southStreetY, 19, TOWN.southStreetY);
  trail(map, 78, TOWN.mainStreetY + 2, 83, 46);
  trail(map, 18, 15, av - 14, 8);
  trail(map, 76, TOWN.southStreetY, 86, 64);
  // Canteiros da fazenda.
  for (const f of FIELDS) fill(map, f.x, f.y, f.w, f.h, 'field');
  // Terreno da sua casa, com caminhos até a avenida e até a rua principal.
  const p = map.plot;
  for (let y = p.y - 1; y <= p.y + p.h; y++) for (let x = p.x - 1; x <= p.x + p.w; x++) if (!['path', 'plaza'].includes(tileAt(map, x, y))) setTile(map, x, y, 'grass');
  fill(map, p.x, p.y, p.w, p.h, 'plot');
  for (let x = p.x + p.w; x < pz.x; x++) setTile(map, x, p.y + p.h - 1, 'path');
  for (let y = p.y + p.h; y < TOWN.mainStreetY; y++) setTile(map, p.x + 2, y, 'path');
  // O mercado da praça, com a frente para a rua.
  const shop = map.shop;
  for (let y = shop.y - 1; y <= shop.y + shop.h; y++) for (let x = shop.x - 1; x <= shop.x + shop.w; x++) if (!['path', 'plaza'].includes(tileAt(map, x, y))) setTile(map, x, y, 'grass');
  fill(map, shop.x, shop.y, shop.w, shop.h, 'shop');
  fill(map, shop.x, shop.y + shop.h, shop.w, TOWN.mainStreetY - shop.y - shop.h, 'path');
  for (const b of map.buildings) {
    for (let y = b.y - 1; y <= b.y + b.h; y++) for (let x = b.x - 1; x <= b.x + b.w; x++) if (!['path', 'plot', 'shop', 'plaza'].includes(tileAt(map, x, y))) setTile(map, x, y, 'grass');
    fill(map, b.x, b.y, b.w, b.h, 'building');
    if (b.kind !== 'fountain') fill(map, b.x, b.y + b.h, b.w, 1, 'path');
  }
  // Enfeites fixos (só os que cabem no mapa).
  for (const d of DECOR) {
    if (d.x < 3 || d.y < 3 || d.x + d.w > w - 3 || d.y + d.h > h - 3) continue;
    fill(map, d.x, d.y, d.w, d.h, 'deco');
    map.decor.push({ ...d });
  }
  for (const l of lampSpots(w, h)) if (['grass', 'flower', 'tall'].includes(tileAt(map, l.x, l.y))) setTile(map, l.x, l.y, 'lamp');
  // Água nunca encosta direto na grama: em volta dela, o que sobrar vira areia.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (tileAt(map, x, y) !== 'water') continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (['grass', 'tall', 'flower', 'trail', 'tree', 'rock', 'bush'].includes(tileAt(map, x + dx, y + dy))) setTile(map, x + dx, y + dy, 'sand');
    }
  }
  // Onde você aparece: livre.
  if (tileAt(map, map.spawn.x, map.spawn.y) !== 'plaza') setTile(map, map.spawn.x, map.spawn.y, 'path');
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
      return (t === 'grass' || t === 'path' || t === 'flower' || t === 'tall' || t === 'trail' || t === 'plaza') && !blocked(c.x, c.y);
    });
    if (ok.length > 0) return ok[Math.floor(rng() * ok.length)]!;
  }
  return { ...map.spawn };
}
