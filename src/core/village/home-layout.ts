import { itemDef } from './catalog';
import { HOME_INTERIOR_WIDTH, HOME_INTERIOR_HEIGHT } from './home-interior';
import type { HomeInterior, HomePlaced } from './home-interior';

export type RoomZone = 'rest' | 'kitchen' | 'social' | 'wall';
export const ROOM_ZONE_NAMES: Record<RoomZone, string> = { rest: 'Descanso', kitchen: 'Cozinha', social: 'Convivência', wall: 'Organização' };

export function furnitureZone(item: string): RoomZone {
  const def = itemDef(item);
  if (def?.roomZone) return def.roomZone;
  if (/^(cama|comoda|criado|guarda|cesto|abajur|rede)/.test(item)) return 'rest';
  if (/^(fogao|pia|geladeira|mesa-cha|armario|prateleira)/.test(item)) return 'kitchen';
  if (/^(mesa|sofa|poltrona|pufe|tapete|cadeira|bola|pelucia|cama-elastica)/.test(item)) return 'social';
  return 'wall';
}

export function furniturePurpose(item: string): string {
  return itemDef(item)?.purpose ?? {
    rest: 'Um canto reservado para descansar, afastado da saída.',
    kitchen: 'Faz parte do cantinho de refeições e preparo de comida.',
    social: 'Compõe o espaço de convivência da casa.',
    wall: 'Organiza e personaliza as laterais da casa.',
  }[furnitureZone(item)];
}

export function isHomeEntrance(x: number, y: number): boolean {
  return x === Math.floor(HOME_INTERIOR_WIDTH / 2) && y === HOME_INTERIOR_HEIGHT - 1;
}

/** Compra nova usa um setor coerente e preserva a circulação central; nunca reorganiza o save silenciosamente. */
export function findHomeFurnitureSlot(interior: HomeInterior, item: string): Omit<HomePlaced, 'item'> | null {
  const zones: Record<RoomZone, readonly (readonly [number, number])[]> = {
    rest: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]],
    kitchen: [[6, 0], [5, 0], [6, 1], [5, 1], [6, 2], [5, 2]],
    social: [[2, 2], [4, 2], [2, 3], [4, 3], [1, 3], [5, 3]],
    wall: [[2, 0], [4, 0], [0, 3], [6, 3], [0, 4], [6, 4], [1, 4], [5, 4]],
  };
  const candidates = [...zones[furnitureZone(item)], ...Object.values(zones).flat()];
  for (const [x, y] of candidates) if (!interior.placed.some((p) => p.x === x && p.y === y)) return { x, y };
  return null;
}
