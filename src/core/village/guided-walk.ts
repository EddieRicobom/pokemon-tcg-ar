import type { Walker } from './actors';

export const GUIDED_DESTINATIONS = [
  { x: 47, y: 36, place: 'Fonte Central' },
  { x: 81, y: 16, place: 'Lago Azul' },
  { x: 10, y: 48, place: 'Parquinho' },
  { x: 58, y: 38, place: 'Mercado da Praça' },
  { x: 16, y: 47, place: 'Parquinho Oeste' },
  { x: 86, y: 50, place: 'Fazenda dos Canteiros' },
  { x: 22, y: 64, place: 'Bosque do Sul' },
  { x: 74, y: 18, place: 'Trilha do Lago' },
] as const;

/** O passeio só termina quando os dois chegaram, sem recompensar um companheiro ainda longe. */
export function guidedWalkArrived(player: Pick<Walker, 'x' | 'y' | 't'>, companion: Pick<Walker, 'x' | 'y' | 't'> | undefined, destination: { x: number; y: number }): boolean {
  return !!companion && player.t >= 1 && companion.t >= 1
    && Math.abs(player.x - destination.x) + Math.abs(player.y - destination.y) <= 2
    && Math.abs(player.x - companion.x) + Math.abs(player.y - companion.y) <= 2;
}
