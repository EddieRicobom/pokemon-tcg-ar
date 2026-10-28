import { WEST } from './west';
import type { Walker } from './actors';
import { LEISURE_SPOTS } from './expansion';

export const GUIDED_DESTINATIONS = [
  { x: WEST + 47, y: 36, place: 'Fonte Central' },
  { x: WEST + 81, y: 16, place: 'Lago Azul' },
  { x: WEST + 10, y: 48, place: 'Parquinho' },
  { x: WEST + 58, y: 38, place: 'Mercado da Praça' },
  { x: WEST + 16, y: 47, place: 'Parquinho Oeste' },
  { x: WEST + 86, y: 50, place: 'Fazenda dos Canteiros' },
  { x: WEST + 22, y: 64, place: 'Bosque do Sul' },
  { x: WEST + 74, y: 18, place: 'Trilha do Lago' },
  ...LEISURE_SPOTS.map((place) => ({ x: place.x, y: place.y, place: place.name })),
  { x: WEST + 67, y: 26, place: 'Terraço do Café' },
  { x: WEST + 15, y: 13, place: 'Trilha da Madeireira' },
  { x: WEST + 17, y: 66, place: 'Pedreira do Sul' },
] as const;

export interface GuidedWalkProgress {
  playerDistance: number;
  companionDistance: number | null;
  arrived: boolean;
}

/** Distâncias em blocos para a HUD; a recompensa continua dependendo da chegada dos dois. */
export function guidedWalkProgress(
  player: Pick<Walker, 'x' | 'y' | 't'>,
  companion: Pick<Walker, 'x' | 'y' | 't'> | undefined,
  destination: { x: number; y: number },
): GuidedWalkProgress {
  const playerDistance = Math.abs(player.x - destination.x) + Math.abs(player.y - destination.y);
  const companionDistance = companion ? Math.abs(companion.x - destination.x) + Math.abs(companion.y - destination.y) : null;
  return { playerDistance, companionDistance, arrived: guidedWalkArrived(player, companion, destination) };
}

/** O passeio só termina quando os dois chegaram, sem recompensar um companheiro ainda longe. */
export function guidedWalkArrived(player: Pick<Walker, 'x' | 'y' | 't'>, companion: Pick<Walker, 'x' | 'y' | 't'> | undefined, destination: { x: number; y: number }): boolean {
  return !!companion && player.t >= 1 && companion.t >= 1
    && Math.abs(player.x - destination.x) + Math.abs(player.y - destination.y) <= 2
    && Math.abs(player.x - companion.x) + Math.abs(player.y - companion.y) <= 2;
}
