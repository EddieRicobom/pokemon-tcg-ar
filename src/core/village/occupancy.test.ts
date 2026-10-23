import { describe, expect, it } from 'vitest';
import { seededRng } from '../battle';
import { makeWalker } from './actors';
import type { Walker } from './actors';
import { BenchVisits, benchesFor } from './benches';
import { generateVillage, isWalkable } from './map';
import { blockedForResident, StaticBlockGrid } from './occupancy';
import type { ResidentOccupancyWorld } from './occupancy';

const map = generateVillage(20261014);

describe('grade de blocos fixos', () => {
  it('marca só os blocos dados e ignora o que cai fora do mapa', () => {
    const grid = new StaticBlockGrid(10, 8);
    grid.rebuild([{ x: 1, y: 2 }, { x: 99, y: 2 }, { x: -1, y: 0 }], [{ x: 9, y: 7 }]);
    expect(grid.has(1, 2)).toBe(true);
    expect(grid.has(9, 7)).toBe(true);
    expect(grid.has(2, 1)).toBe(false);
    expect(grid.has(-1, 0)).toBe(false);
    expect(grid.has(10, 7)).toBe(false);
  });

  it('refazer a grade esquece o que saiu (móvel guardado, planta colhida)', () => {
    const grid = new StaticBlockGrid(6, 6);
    grid.rebuild([{ x: 3, y: 3 }]);
    expect(grid.has(3, 3)).toBe(true);
    grid.rebuild([]);
    expect(grid.has(3, 3)).toBe(false);
  });
});

/** A regra original de `VillageGame.occupied(x, y, id)` para moradores, escrita do jeito antigo (varrendo listas). */
function referenceBlocked(
  placed: readonly { x: number; y: number }[],
  crops: readonly { x: number; y: number }[],
  reservations: readonly BenchVisits[],
  player: Walker,
  villagers: ReadonlyMap<string, Walker>,
  asleep: ReadonlySet<string>,
  x: number,
  y: number,
  id: string,
): boolean {
  if (reservations.some((r) => [...r.visits].some(([other, v]) => other !== id && v.x === x && v.y === y))) return true;
  if (placed.some((f) => f.x === x && f.y === y) || crops.some((c) => c.x === x && c.y === y)) return true;
  if ((player.x === x && player.y === y) || (player.tx === x && player.ty === y)) return true;
  for (const [other, w] of villagers) {
    if (other === id || asleep.has(other)) continue;
    if ((w.x === x && w.y === y) || (w.tx === x && w.ty === y)) return true;
  }
  return false;
}

describe('blockedForResident', () => {
  it('responde igual à regra antiga em todos os blocos de um mapa com 30 moradores, móveis, plantas e reservas', () => {
    const rng = seededRng(7);
    const walkable: { x: number; y: number }[] = [];
    for (let y = 3; y < map.h - 3; y++) for (let x = 3; x < map.w - 3; x++) if (isWalkable(map, x, y)) walkable.push({ x, y });
    const pick = () => walkable[Math.floor(rng() * walkable.length)]!;
    const placed = Array.from({ length: 60 }, pick);
    const crops = Array.from({ length: 40 }, pick);
    const villagers = new Map<string, Walker>();
    for (let i = 0; i < 30; i++) {
      const at = pick();
      const w = makeWalker(`m${i}`, at.x, at.y, 2.6);
      if (i % 3 === 0) { w.tx = at.x + 1; w.ty = at.y; w.t = 0.4; }
      villagers.set(w.id, w);
    }
    const asleep = new Set(['m4', 'm9', 'm20']);
    const benches = new BenchVisits(benchesFor(map));
    const cafe = new BenchVisits([{ id: 'mesa', x: 63, y: 25 }], { distance: 60 });
    const bench = benchesFor(map)[0]!;
    benches.visits.set('m1', { bench: 'b', x: bench.x, y: bench.y, deadline: 1e9, until: null });
    cafe.visits.set('m2', { bench: 'mesa', x: 63, y: 25, deadline: 1e9, until: null });
    const player = makeWalker('eu', map.spawn.x, map.spawn.y, 5.5);
    player.tx = map.spawn.x + 1;
    const grid = new StaticBlockGrid(map.w, map.h);
    grid.rebuild(placed, crops);
    const world: ResidentOccupancyWorld = {
      grid,
      reservations: [(x, y, except) => benches.reserved(x, y, except), (x, y, except) => cafe.reserved(x, y, except)],
      player,
      villagers,
      asleep,
    };
    let blockedCount = 0;
    for (const id of ['m0', 'm1', 'm2', 'm4', 'm29']) {
      for (let y = 0; y < map.h; y++) {
        for (let x = 0; x < map.w; x++) {
          const expected = referenceBlocked(placed, crops, [benches, cafe], player, villagers, asleep, x, y, id);
          if (expected) blockedCount++;
          expect(blockedForResident(world, x, y, id), `${id} em ${x},${y}`).toBe(expected);
        }
      }
    }
    // O cenário precisa de fato exercitar os bloqueios (senão a igualdade acima não prova nada).
    expect(blockedCount).toBeGreaterThan(400);
  });

  it('o próprio morador e quem dorme não bloqueiam; o jogador e os outros sim', () => {
    const villagers = new Map<string, Walker>([['a', makeWalker('a', 10, 10, 2.6)], ['b', makeWalker('b', 12, 10, 2.6)], ['c', makeWalker('c', 14, 10, 2.6)]]);
    const grid = new StaticBlockGrid(map.w, map.h);
    grid.rebuild([]);
    const world: ResidentOccupancyWorld = { grid, reservations: [], player: makeWalker('eu', 20, 20, 5.5), villagers, asleep: new Set(['c']) };
    expect(blockedForResident(world, 10, 10, 'a')).toBe(false);
    expect(blockedForResident(world, 12, 10, 'a')).toBe(true);
    expect(blockedForResident(world, 14, 10, 'a')).toBe(false);
    expect(blockedForResident(world, 20, 20, 'a')).toBe(true);
  });
});
