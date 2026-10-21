import type { Rng } from '../battle';
import { isSolidTile, tileAt } from './map';
import type { VillageMap } from './map';
import { pathStep } from './pathing';

/**
 * Quem anda pela Vila: você e os Pokémon. O movimento é de bloco em bloco (como nos jogos de portátil), com a posição
 * desenhada interpolada entre o bloco de saída e o de chegada.
 */

export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIR_DELTA: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export interface Walker {
  id: string;
  /** Bloco atual (de onde saiu) e o de destino. */
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** 0 a 1 do caminho entre (x, y) e (tx, ty). */
  t: number;
  dir: Dir;
  /** Blocos por segundo. */
  speed: number;
  /** Segundos parado até o próximo passeio (Pokémon). */
  idle: number;
  /** Passos dados (para a animação de andar). */
  steps: number;
}

export function makeWalker(id: string, x: number, y: number, speed: number): Walker {
  return { id, x, y, tx: x, ty: y, t: 1, dir: 'down', speed, idle: 0, steps: 0 };
}

/** Posição desenhada (em blocos). */
export function drawPos(w: Walker): { x: number; y: number } {
  return { x: w.x + (w.tx - w.x) * w.t, y: w.y + (w.ty - w.y) * w.t };
}

export const moving = (w: Walker): boolean => w.t < 1;

export type Blocked = (x: number, y: number) => boolean;

export const WALK_SPEED = { player: 5.5, resident: 2.6 } as const;

/** Passeio guiado acompanha a velocidade atual do treinador; encerrar restaura o passeio livre. */
export function syncFollowerSpeed(resident: Walker, leader: Walker, following: boolean): void {
  resident.speed = following ? leader.speed : WALK_SPEED.resident;
}

export function canEnter(map: VillageMap, x: number, y: number, blocked: Blocked): boolean {
  const tile = tileAt(map, x, y);
  return !isSolidTile(tile) && tile !== 'plot' && !blocked(x, y);
}

/** Tenta começar um passo na direção `dir`. Mesmo sem conseguir andar, vira para lá. */
export function tryStep(w: Walker, dir: Dir, map: VillageMap, blocked: Blocked): boolean {
  if (moving(w)) return false;
  w.dir = dir;
  const [dx, dy] = DIR_DELTA[dir];
  if (!canEnter(map, w.x + dx, w.y + dy, blocked)) return false;
  w.tx = w.x + dx;
  w.ty = w.y + dy;
  w.t = 0;
  return true;
}

/** Dois que estão lado a lado trocam de lugar (quem anda para cima de um Pokémon parado passa por ele, sem trancar a rua). */
export function swapPlaces(a: Walker, b: Walker): boolean {
  if (moving(a) || moving(b) || Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) return false;
  const [ax, ay, bx, by] = [a.x, a.y, b.x, b.y];
  a.tx = bx;
  a.ty = by;
  a.t = 0;
  a.dir = bx > ax ? 'right' : bx < ax ? 'left' : by > ay ? 'down' : 'up';
  b.tx = ax;
  b.ty = ay;
  b.t = 0;
  b.dir = ax > bx ? 'right' : ax < bx ? 'left' : ay > by ? 'down' : 'up';
  return true;
}

/** Avança o passo em curso. Devolve true quando chegou ao bloco de destino neste quadro. */
export function advance(w: Walker, dt: number): boolean {
  if (!moving(w)) return false;
  w.t = Math.min(1, w.t + dt * w.speed);
  if (w.t < 1) return false;
  w.x = w.tx;
  w.y = w.ty;
  w.steps++;
  return true;
}

/** O bloco à frente de quem anda (onde você interage). */
export function facing(w: Walker): { x: number; y: number } {
  const [dx, dy] = DIR_DELTA[w.dir];
  return { x: w.tx + dx, y: w.ty + dy };
}

/**
 * Um Pokémon passeando: fica um tempo parado, depois dá alguns passos para um lado livre. Quem segue você vai sempre
 * para o bloco onde você estava (atrás de você).
 */
export function stepVillager(w: Walker, dt: number, map: VillageMap, blocked: Blocked, rng: Rng, follow: { x: number; y: number } | null): void {
  advance(w, dt);
  if (moving(w)) return;
  if (follow) {
    const dx = follow.x - w.x;
    const dy = follow.y - w.y;
    if (Math.abs(dx) + Math.abs(dy) <= 1) return;
    // O caminho mais curto contornando prédios e a fonte; se não houver, tenta o passo em linha reta (mesmo que encoste).
    const along = pathStep(map, w, follow, blocked);
    if (along && tryStep(w, along, map, blocked)) return;
    const options: Dir[] = Math.abs(dx) >= Math.abs(dy) ? [dx > 0 ? 'right' : 'left', dy > 0 ? 'down' : 'up'] : [dy > 0 ? 'down' : 'up', dx > 0 ? 'right' : 'left'];
    for (const d of options) if (tryStep(w, d, map, blocked)) return;
    return;
  }
  w.idle -= dt;
  if (w.idle > 0) return;
  w.idle = 1.2 + rng() * 3.5;
  const dirs: Dir[] = ['up', 'down', 'left', 'right'];
  const first = dirs[Math.floor(rng() * 4)]!;
  if (!tryStep(w, first, map, blocked)) w.dir = first;
}
