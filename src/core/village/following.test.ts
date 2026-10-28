import { describe, expect, it } from 'vitest';
import { advance, makeWalker, moving, stepVillager, syncFollowerSpeed, tryStep, WALK_SPEED } from './actors';
import { generateVillage } from './map';
import { isWalkable, reachableFrom } from './map';
import { pathStep } from './pathing';
import { GUIDED_DESTINATIONS, guidedWalkArrived } from './guided-walk';
import { WEST } from './west';

describe('velocidade do passeio guiado', () => {
  it('acompanha a velocidade atual e restaura a caminhada livre ao terminar', () => {
    const leader = makeWalker('player', WEST + 15, 38, WALK_SPEED.player);
    const mon = makeWalker('mon', WEST + 13, 38, WALK_SPEED.resident);
    syncFollowerSpeed(mon, leader, true);
    expect(mon.speed).toBe(leader.speed);
    leader.speed = 4;
    syncFollowerSpeed(mon, leader, true);
    expect(mon.speed).toBe(4);
    syncFollowerSpeed(mon, leader, false);
    expect(mon.speed).toBe(WALK_SPEED.resident);
  });

  it('mantém o ritmo em um passeio longo sem teleporte e sem ocupar o treinador', () => {
    const map = generateVillage(42), leader = makeWalker('player', WEST + 15, 38, WALK_SPEED.player);
    const mon = makeWalker('mon', WEST + 13, 38, WALK_SPEED.resident);
    let maxDistance = 0;
    for (let tick = 0; tick < 2400; tick++) {
      advance(leader, 1 / 120);
      if (!moving(leader) && leader.x < WEST + 86) tryStep(leader, 'right', map, () => false);
      syncFollowerSpeed(mon, leader, true);
      stepVillager(mon, 1 / 120, map, (x, y) => x === leader.x && y === leader.y || x === leader.tx && y === leader.ty, () => .5, leader);
      maxDistance = Math.max(maxDistance, Math.abs(mon.x - leader.x) + Math.abs(mon.y - leader.y));
      expect(mon.x === leader.x && mon.y === leader.y).toBe(false);
    }
    expect(leader.steps).toBeGreaterThan(60);
    expect(mon.steps).toBeGreaterThan(60);
    expect(maxDistance).toBeLessThanOrEqual(3);
  });

  it('só registra o passeio quando o companheiro também chegou e parou', () => {
    const player = makeWalker('player', WEST + 81, 17, WALK_SPEED.player);
    const mon = makeWalker('mon', WEST + 45, 41, WALK_SPEED.resident);
    const destination = GUIDED_DESTINATIONS[1]!;
    expect(guidedWalkArrived(player, mon, destination)).toBe(false);
    Object.assign(mon, { x: WEST + 80, y: 17, t: .7 });
    expect(guidedWalkArrived(player, mon, destination)).toBe(false);
    mon.t = 1;
    expect(guidedWalkArrived(player, mon, destination)).toBe(true);
    expect(guidedWalkArrived(player, undefined, destination)).toBe(false);
  });

  it.each([1, 7, 42, 99, 20261014])('semente %i: todos os destinos guiados têm um trajeto completo até a chegada', (seed) => {
    const map = generateVillage(seed), reached = reachableFrom(map, map.spawn.x, map.spawn.y);
    for (const destination of GUIDED_DESTINATIONS) {
      const walker = makeWalker('player', map.spawn.x, map.spawn.y, WALK_SPEED.player);
      let steps = 0;
      while (Math.abs(walker.x - destination.x) + Math.abs(walker.y - destination.y) > 1 && steps < 300) {
        const direction = pathStep(map, walker, destination, () => false);
        expect(direction, `${seed}: ${destination.place}`).not.toBeNull();
        if (!direction) break;
        expect(tryStep(walker, direction, map, () => false)).toBe(true);
        advance(walker, 1);
        steps++;
      }
      expect(steps, destination.place).toBeLessThan(300);
      expect(isWalkable(map, walker.x, walker.y)).toBe(true);
      expect(reached[walker.y * map.w + walker.x]).toBe(1);
      expect(Math.abs(walker.x - destination.x) + Math.abs(walker.y - destination.y), destination.place).toBeLessThanOrEqual(1);
    }
  });
});
