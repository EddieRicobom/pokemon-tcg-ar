import { FURNITURE_IDS, itemDef } from './catalog';
import type { VillageState } from './life';

/** A planta da casa é pequena de propósito: funciona bem no celular e cada peça continua legível. */
export const HOME_INTERIOR_WIDTH = 7;
export const HOME_INTERIOR_HEIGHT = 5;

export const HOME_WALLPAPERS = ['creme', 'floral', 'noite', 'madeira'] as const;
export const HOME_FLOORS = ['carvalho', 'xadrez', 'grama', 'ladrilho'] as const;
export type HomeWallpaper = typeof HOME_WALLPAPERS[number];
export type HomeFloor = typeof HOME_FLOORS[number];

export interface HomePlaced {
  x: number;
  y: number;
  item: string;
}

export interface HomeInterior {
  wallpaper: HomeWallpaper;
  floor: HomeFloor;
  placed: HomePlaced[];
}

/** Interiores dos moradores, indexados pelo número do terreno. Saves antigos começam vazios e ganham decoração aos poucos. */
export type HomeInteriors = Record<string, HomeInterior>;

export interface HomeInteraction {
  ok: boolean;
  message: string;
}

export function emptyHomeInterior(): HomeInterior {
  return { wallpaper: 'creme', floor: 'carvalho', placed: [] };
}

function inRoom(x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < HOME_INTERIOR_WIDTH && y < HOME_INTERIOR_HEIGHT;
}

export function normalizeHomeInterior(raw: unknown): HomeInterior {
  const base = emptyHomeInterior();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<HomeInterior>;
  const wallpaper = HOME_WALLPAPERS.includes(r.wallpaper as HomeWallpaper) ? r.wallpaper as HomeWallpaper : base.wallpaper;
  const floor = HOME_FLOORS.includes(r.floor as HomeFloor) ? r.floor as HomeFloor : base.floor;
  const used = new Set<string>();
  const placed: HomePlaced[] = [];
  if (Array.isArray(r.placed)) {
    for (const entry of r.placed) {
      if (!entry || typeof entry !== 'object') continue;
      const p = entry as Partial<HomePlaced>;
      if (!inRoom(p.x ?? NaN, p.y ?? NaN) || typeof p.item !== 'string' || !FURNITURE_IDS.includes(p.item)) continue;
      const key = `${p.x},${p.y}`;
      if (used.has(key)) continue;
      used.add(key);
      placed.push({ x: p.x!, y: p.y!, item: p.item });
      if (placed.length >= HOME_INTERIOR_WIDTH * HOME_INTERIOR_HEIGHT) break;
    }
  }
  return { wallpaper, floor, placed };
}

export function normalizeHomeInteriors(raw: unknown): HomeInteriors {
  if (!raw || typeof raw !== 'object') return {};
  const out: HomeInteriors = {};
  for (const [lot, value] of Object.entries(raw as Record<string, unknown>).slice(0, 80)) {
    if (!/^\d+$/.test(lot)) continue;
    const interior = normalizeHomeInterior(value);
    if (interior.placed.length > 0 || interior.wallpaper !== 'creme' || interior.floor !== 'carvalho') out[lot] = interior;
  }
  return out;
}

export function homePlace(s: VillageState, item: string, x: number, y: number): HomeInteraction {
  if (s.house < 1) return { ok: false, message: 'Construa a primeira casa antes de decorar.' };
  if (!inRoom(x, y)) return { ok: false, message: 'Esse canto não faz parte da casa.' };
  if (itemDef(item)?.kind !== 'furniture') return { ok: false, message: 'Só móveis podem entrar na casa.' };
  if ((s.inventory[item] ?? 0) <= 0) return { ok: false, message: `Você não tem ${itemDef(item)?.name ?? item}.` };
  if (s.homeInterior.placed.some((p) => p.x === x && p.y === y)) return { ok: false, message: 'Já há um móvel nesse espaço.' };
  s.inventory[item] = (s.inventory[item] ?? 0) - 1;
  s.homeInterior.placed.push({ x, y, item });
  return { ok: true, message: `${itemDef(item)?.name ?? item} colocado na casa!` };
}

export function homePickUp(s: VillageState, x: number, y: number): HomeInteraction {
  const index = s.homeInterior.placed.findIndex((p) => p.x === x && p.y === y);
  if (index < 0) return { ok: false, message: 'Não há móvel nesse espaço.' };
  const [item] = s.homeInterior.placed.splice(index, 1);
  if (!item) return { ok: false, message: 'Não há móvel nesse espaço.' };
  s.inventory[item.item] = Math.min(999, (s.inventory[item.item] ?? 0) + 1);
  return { ok: true, message: `${itemDef(item.item)?.name ?? item.item} voltou para a mochila.` };
}
