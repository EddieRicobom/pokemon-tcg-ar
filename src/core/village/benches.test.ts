import { describe, expect, it } from 'vitest';
import { BenchVisits, benchesFor, PUBLIC_BENCHES } from './benches';
import { makeWalker } from './actors';
import { generateVillage, reachableFrom } from './map';

const map = generateVillage(20261014);
const rng = () => 0;
const free = () => false;
const bench = PUBLIC_BENCHES[0]!;

describe('bancos públicos', () => {
  it('os cinco bancos têm assentos e acesso alcançáveis no mapa real', () => {
    expect(benchesFor(map)).toHaveLength(5);
    const reachable = reachableFrom(map, map.spawn.x, map.spawn.y);
    for (const b of benchesFor(map)) for (const dx of [0, 1]) {
      expect(reachable[b.y * map.w + b.x + dx]).toBe(1);
      expect(reachable[(b.y + 1) * map.w + b.x + dx]).toBe(1);
    }
  });
  it('chega andando, senta e libera o lugar depois do descanso', () => {
    const visits = new BenchVisits([bench]);
    const w = makeWalker('a', bench.x, bench.y + 2, 4);
    for (let frame = 0; frame < 30; frame++) visits.step(w, 0.1, frame * 100, map, free, rng);
    expect(visits.seated(w.id, w)).toBe(true);
    expect([w.x, w.y, w.dir]).toEqual([bench.x, bench.y, 'down']);
    expect(visits.step(w, 0.1, 30000, map, free, rng)).toBe(false);
    expect(visits.visits.size).toBe(0);
  });
  it('dois moradores compartilham o banco sem reservar o mesmo lugar', () => {
    const visits = new BenchVisits([bench]);
    for (const id of ['a', 'b', 'c']) visits.step(makeWalker(id, bench.x, bench.y + 1, 4), 0.1, 0, map, free, rng);
    expect(visits.visits.size).toBe(2);
    expect(visits.visits.get('a')?.x).not.toBe(visits.visits.get('b')?.x);
    expect(visits.reserved(bench.x, bench.y, 'a')).toBe(false);
    expect(visits.reserved(bench.x, bench.y, 'b')).toBe(true);
  });
  it('não ocupa lugar bloqueado; abandona uma reserva obstruída', () => {
    const visits = new BenchVisits([bench]);
    const w = makeWalker('a', bench.x, bench.y + 1, 4);
    expect(visits.step(w, 0.1, 0, map, () => true, rng)).toBe(false);
    visits.step(w, 0.1, 40000, map, free, rng);
    expect(visits.visits.size).toBe(1);
    expect(visits.step(w, 0.1, 40100, map, () => true, rng)).toBe(false);
    expect(visits.visits.size).toBe(0);
  });
  it('libera reservas inacessíveis sem teletransportar o morador', () => {
    const visits = new BenchVisits([bench]);
    const w = makeWalker('a', bench.x, bench.y + 2, 4);
    visits.step(w, 0, 0, map, free, rng);
    visits.step(w, 0, 21000, map, free, rng);
    expect(visits.visits.size).toBe(0);
    expect(w.y).toBe(bench.y + 2);
  });
  it('uma conversa, chamado ou passeio pode cancelar o descanso', () => {
    const visits = new BenchVisits([bench]);
    const w = makeWalker('a', bench.x, bench.y, 4);
    visits.step(w, 0, 0, map, free, rng);
    expect(visits.seated('a', w)).toBe(true);
    visits.release('a', 1000);
    expect(visits.seated('a', w)).toBe(false);
    expect(visits.step(w, 0, 2000, map, free, rng)).toBe(false);
  });
});
