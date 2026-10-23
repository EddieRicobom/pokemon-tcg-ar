import { describe, expect, it } from 'vitest';
import { seededRng } from '../battle';
import { makeWalker } from './actors';
import type { Walker } from './actors';
import { BenchVisits, benchesFor } from './benches';
import { generateVillage, isWalkable } from './map';
import { blockedForResident, MoverGrid, StaticBlockGrid } from './occupancy';
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

describe('grade de moradores', () => {
  it('um morador não vê a própria marca; os outros sim, no bloco atual e no de destino', () => {
    const grid = new MoverGrid(8, 8);
    const a = makeWalker('a', 2, 2, 2.6);
    a.tx = 3; a.ty = 2; a.t = 0.5;
    grid.enter(a);
    expect(grid.occupiedByOther(2, 2, 'a')).toBe(false);
    expect(grid.occupiedByOther(3, 2, 'a')).toBe(false);
    expect(grid.occupiedByOther(2, 2, 'b')).toBe(true);
    expect(grid.occupiedByOther(3, 2, 'b')).toBe(true);
    expect(grid.occupiedByOther(4, 2, 'b')).toBe(false);
  });

  it('sair da grade libera os blocos; entrar de novo os marca; entrar duas vezes não conta em dobro', () => {
    const grid = new MoverGrid(8, 8);
    const a = makeWalker('a', 1, 1, 2.6);
    grid.enter(a);
    grid.enter(a);
    grid.leave('a');
    expect(grid.occupiedByOther(1, 1, 'b')).toBe(false);
    grid.enter(a);
    expect(grid.occupiedByOther(1, 1, 'b')).toBe(true);
    grid.leave('a');
    grid.leave('a');
    expect(grid.occupiedByOther(1, 1, 'b')).toBe(false);
  });

  it('andar por vários blocos mantém a grade igual à de uma grade montada do zero', () => {
    const rng = seededRng(11);
    const grid = new MoverGrid(16, 12);
    const walkers = Array.from({ length: 12 }, (_, i) => makeWalker(`w${i}`, i % 16, Math.floor(i / 2) % 12, 2.6));
    for (const w of walkers) grid.enter(w);
    for (let step = 0; step < 400; step++) {
      const w = walkers[Math.floor(rng() * walkers.length)]!;
      grid.leave(w.id);
      w.x = Math.floor(rng() * 16);
      w.y = Math.floor(rng() * 12);
      w.tx = Math.min(15, w.x + (rng() < 0.5 ? 1 : 0));
      w.ty = w.y;
      grid.enter(w);
      const fresh = new MoverGrid(16, 12);
      for (const other of walkers) fresh.enter(other);
      for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) {
        expect(grid.occupiedByOther(x, y, 'nenhum')).toBe(fresh.occupiedByOther(x, y, 'nenhum'));
      }
    }
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
    const movers = new MoverGrid(map.w, map.h);
    for (const [id, w] of villagers) if (!asleep.has(id)) movers.enter(w);
    const world: ResidentOccupancyWorld = {
      grid,
      movers,
      reservations: [(x, y, except) => benches.reserved(x, y, except), (x, y, except) => cafe.reserved(x, y, except)],
      player,
    };
    let blockedCount = 0;
    for (const id of ['m0', 'm1', 'm2', 'm4', 'm29']) {
      // Como no jogo: o morador que decide o passo já saiu da grade; a regra antiga e a nova têm de concordar.
      movers.leave(id);
      for (let y = 0; y < map.h; y++) {
        for (let x = 0; x < map.w; x++) {
          const expected = referenceBlocked(placed, crops, [benches, cafe], player, villagers, asleep, x, y, id);
          if (expected) blockedCount++;
          expect(blockedForResident(world, x, y, id), `${id} em ${x},${y}`).toBe(expected);
        }
      }
      const walker = villagers.get(id)!;
      if (!asleep.has(id)) movers.enter(walker);
    }
    // O cenário precisa de fato exercitar os bloqueios (senão a igualdade acima não prova nada).
    expect(blockedCount).toBeGreaterThan(400);
  });

  it('o próprio morador (mesmo ainda na grade) não bloqueia; quem dorme não bloqueia; o jogador e os outros sim', () => {
    const villagers = new Map<string, Walker>([['a', makeWalker('a', 10, 10, 2.6)], ['b', makeWalker('b', 12, 10, 2.6)], ['c', makeWalker('c', 14, 10, 2.6)]]);
    const grid = new StaticBlockGrid(map.w, map.h);
    grid.rebuild([]);
    const movers = new MoverGrid(map.w, map.h);
    for (const [id, w] of villagers) if (id !== 'c') movers.enter(w);
    const world: ResidentOccupancyWorld = { grid, movers, reservations: [], player: makeWalker('eu', 20, 20, 5.5) };
    expect(blockedForResident(world, 10, 10, 'a')).toBe(false);
    expect(blockedForResident(world, 12, 10, 'a')).toBe(true);
    expect(blockedForResident(world, 14, 10, 'a')).toBe(false);
    expect(blockedForResident(world, 20, 20, 'a')).toBe(true);
  });
});
