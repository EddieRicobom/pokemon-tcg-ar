import type { Tile, VillageMap } from './map';
import { WEST } from './west';

/**
 * O Monte Miragem, a oeste da Vila: uma montanha grande em quatro terraços (vista de cima, como o Monte Pirâmide ou a
 * Rota 210), com escadas cortando cada paredão, pedras e pinheiros nos patamares e, no topo, a Estátua do Mew. Puro: o
 * mapa ganha os blocos `mtn` (chão de rocha), `cliff` (borda e paredão, sólidos) e `stairs` (degraus), e a altura de
 * cada bloco em `map.elev` (0 = chão da Vila) para o desenho saber qual lado do penhasco aparece.
 */

/** Um terraço: retângulo [x0, x1] × [y0, y1] (inclusive). As duas últimas linhas são o paredão (face sul). */
export interface Terrace {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Colunas (2 de largura) da escada que sobe o paredão sul deste terraço. */
  stairsX: number;
}

/** Do pé ao topo. As escadas alternam de lado: a subida vira um zigue-zague pelos patamares. */
export const TERRACES: readonly Terrace[] = [
  { x0: 4, y0: 7, x1: 27, y1: 34, stairsX: 22 },
  { x0: 7, y0: 10, x1: 24, y1: 28, stairsX: 8 },
  { x0: 10, y0: 12, x1: 22, y1: 23, stairsX: 19 },
  { x0: 13, y0: 13, x1: 19, y1: 19, stairsX: 14 },
];

/** A Estátua do Mew no topo (2×1 sólido) e o bloco à frente dela, de onde se medita. */
export const MEW_STATUE = { x: 16, y: 15, w: 2, h: 1 } as const;
export const MEW_STATUE_FRONT = { x: 16, y: 16 } as const;
/** Onde a trilha do monte encontra a Rua Principal (a rua antiga começava em x = WEST + 4). */
export const MOUNTAIN_GATE = { x: 22, y: 38 } as const;
/** Patamares onde os moradores gostam de parar (um por terraço, longe das escadas). */
export const MOUNTAIN_SPOTS: readonly { x: number; y: number }[] = [
  { x: 12, y: 31 },
  { x: 20, y: 26 },
  { x: 15, y: 21 },
  { x: 18, y: 16 },
];

const hash = (x: number, y: number, seed: number): number => {
  let h = Math.imul(x * 374761393 + y * 668265263 + seed, 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 3266489917) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};

/** Desloca o mapa do quadro antigo `WEST` blocos para a direita (prédios, enfeites, terreno, loja, onde você nasce). */
export function shiftWest(base: VillageMap): VillageMap {
  const w = base.w + WEST;
  const tiles = new Array<Tile>(w * base.h).fill('grass');
  for (let y = 0; y < base.h; y++) for (let x = 0; x < base.w; x++) tiles[y * w + x + WEST] = base.tiles[y * base.w + x]!;
  const sx = <T extends { x: number }>(p: T): T => ({ ...p, x: p.x + WEST });
  return {
    ...base,
    w,
    tiles,
    spawn: sx(base.spawn),
    plot: sx(base.plot),
    shop: sx(base.shop),
    buildings: base.buildings.map((b) => ({ ...sx(b), door: sx(b.door) })),
    decor: base.decor.map(sx),
    elev: new Uint8Array(w * base.h),
  };
}

/**
 * Monta o Monte Miragem nas `WEST` colunas da esquerda (já abertas por `shiftWest`): a antiga borda de mata do oeste
 * vira o sopé, com pinheiros, pedras e mato alto, e por cima vêm os terraços, as escadas, a trilha até a Rua Principal e
 * a estátua. Determinístico pela semente.
 */
export function addMountain(map: VillageMap, seed: number): VillageMap {
  const elev = map.elev ?? new Uint8Array(map.w * map.h);
  map.elev = elev;
  const at = (x: number, y: number) => y * map.w + x;
  const put = (x: number, y: number, tile: Tile, level?: number) => {
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return;
    map.tiles[at(x, y)] = tile;
    if (level !== undefined) elev[at(x, y)] = level;
  };
  const get = (x: number, y: number): Tile => map.tiles[at(x, y)]!;
  // Sopé: a faixa nova e a antiga borda de mata do oeste (4 blocos) viram campo com pinheiros, pedras e mato alto.
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < WEST + 4; x++) {
      const edge = Math.min(x, y, map.h - 1 - y);
      if (x >= WEST && get(x, y) !== 'tree') continue;
      const r = hash(x, y, seed ^ 0x6d77);
      const dense = Math.max(0, 1 - Math.abs(y - 21) / 26) * 0.1 + (y > 40 ? 0.24 : 0.12) + (x < 8 ? 0.2 : 0);
      put(x, y, edge < 3 || r < dense ? 'tree' : r < dense + 0.03 ? 'rock' : r < dense + 0.1 ? 'tall' : 'grass');
    }
  }
  // Terraços, do pé ao topo: borda e paredão sólidos, patamar de rocha por dentro.
  TERRACES.forEach((t, i) => {
    const level = i + 1;
    for (let y = t.y0; y <= t.y1; y++) {
      for (let x = t.x0; x <= t.x1; x++) {
        const rim = x === t.x0 || x === t.x1 || y === t.y0 || y >= t.y1 - 1;
        put(x, y, rim ? 'cliff' : 'mtn', level);
      }
    }
    for (let y = t.y1 - 1; y <= t.y1; y++) for (let x = t.stairsX; x < t.stairsX + 2; x++) put(x, y, 'stairs', level);
  });
  // Pinheiros e pedras nos patamares largos (nunca colados numa escada, na trilha do zigue-zague nem na estátua).
  const keepFree = (x: number, y: number) =>
    TERRACES.some((t) => Math.abs(x - t.stairsX - 0.5) <= 2.5 && (Math.abs(y - (t.y1 + 1)) <= 1 || Math.abs(y - (t.y1 - 2)) <= 1)) ||
    MOUNTAIN_SPOTS.some((s) => Math.abs(s.x - x) + Math.abs(s.y - y) <= 1) ||
    (Math.abs(x - MEW_STATUE.x - 0.5) <= 3 && y >= MEW_STATUE.y - 1 && y <= MEW_STATUE.y + 2);
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < WEST; x++) {
      if (get(x, y) !== 'mtn' || keepFree(x, y)) continue;
      // Só onde o patamar tem folga dos dois lados (blocos de rocha em volta): o caminho continua com 2 de largura.
      let room = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (get(x + dx, y + dy) === 'mtn') room++;
      if (room < 9) continue;
      const r = hash(x, y, seed ^ 0x51ab);
      if (r < 0.1) put(x, y, 'tree');
      else if (r < 0.17) put(x, y, 'rock');
    }
  }
  // A estátua no topo (enfeite fixo) e a trilha do sopé até a Rua Principal.
  for (let x = MEW_STATUE.x; x < MEW_STATUE.x + MEW_STATUE.w; x++) put(x, MEW_STATUE.y, 'deco');
  map.decor = [...map.decor, { kind: 'mew-statue', ...MEW_STATUE }];
  const first = TERRACES[0]!;
  for (let y = first.y1 + 1; y <= MOUNTAIN_GATE.y + 1; y++) for (let x = first.stairsX; x < first.stairsX + 2; x++) put(x, y, 'trail', 0);
  for (let x = first.stairsX; x < WEST + 4; x++) for (let y = MOUNTAIN_GATE.y; y <= MOUNTAIN_GATE.y + 1; y++) put(x, y, 'trail', 0);
  // Trilha do sopé ao bosque do sul, para o monte não ficar com uma entrada só.
  for (let y = MOUNTAIN_GATE.y + 2; y <= 50; y++) for (let x = 12; x < 14; x++) put(x, y, 'trail', 0);
  for (let x = 12; x < WEST + 4; x++) for (let y = 50; y <= 51; y++) put(x, y, 'trail', 0);
  for (let x = 12; x < first.stairsX; x++) for (let y = MOUNTAIN_GATE.y; y <= MOUNTAIN_GATE.y + 1; y++) put(x, y, 'trail', 0);
  return map;
}

/** Altura do bloco (0 = chão da Vila; 1 a 4 = terraços do monte). */
export function elevationAt(map: VillageMap, x: number, y: number): number {
  if (!map.elev || x < 0 || y < 0 || x >= map.w || y >= map.h) return 0;
  return map.elev[y * map.w + x]!;
}

export type CliffPart = 'top' | 'side-left' | 'side-right' | 'face-top' | 'face-bottom' | 'corner-left' | 'corner-right';

/**
 * Que parte do penhasco o bloco `cliff` mostra: a borda de cima, uma lateral, o paredão (linha de cima ou de baixo) ou
 * o canto de baixo do paredão. Decide pelo terraço a que o bloco pertence.
 */
export function cliffPart(x: number, y: number): CliffPart | null {
  for (let i = TERRACES.length - 1; i >= 0; i--) {
    const t = TERRACES[i]!;
    if (x < t.x0 || x > t.x1 || y < t.y0 || y > t.y1) continue;
    const face = y >= t.y1 - 1;
    if (face) {
      if (x === t.x0) return 'corner-left';
      if (x === t.x1) return 'corner-right';
      return y === t.y1 ? 'face-bottom' : 'face-top';
    }
    if (y === t.y0) return 'top';
    if (x === t.x0) return 'side-left';
    if (x === t.x1) return 'side-right';
    return null;
  }
  return null;
}
