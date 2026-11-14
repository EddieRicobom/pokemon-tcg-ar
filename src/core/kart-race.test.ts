import { describe, expect, it } from 'vitest';
import { createKartRace, kartPosition, stepKartRace, TRACK_HALF_WIDTH, trackDistance, trackPoint } from './kart-race';

const idle = { throttle: 0, steer: 0, brake: false };

describe('Kart Racer', () => {
  it('acelera, freia e respeita o limite da pista', () => {
    const race = createKartRace(0);
    const player = race.cars[0]!;
    for (let i = 0; i < 10; i++) stepKartRace(race, { throttle: 1, steer: 0, brake: false }, 0.05);
    expect(player.speed).toBeGreaterThan(8);
    const before = player.speed;
    stepKartRace(race, { ...idle, brake: true }, 0.05);
    expect(player.speed).toBeLessThan(before);
    for (let i = 0; i < 80; i++) stepKartRace(race, { throttle: 1, steer: 0, brake: false }, 0.05);
    expect(trackDistance(player.x, player.z)).toBeLessThanOrEqual(TRACK_HALF_WIDTH);
  });

  it('a segunda fila larga atrás da linha e não ganha volta de graça', () => {
    const race = createKartRace(3);
    expect(kartPosition(race, 0)).toBeLessThan(kartPosition(race, 2));
    for (let i = 0; i < 10; i++) stepKartRace(race, idle, 0.05);
    expect(race.cars[2]!.lap).toBe(0);
  });

  it('só contabiliza volta ao atravessar os quatro setores em ordem', () => {
    const race = createKartRace(0);
    const car = race.cars[0]!;
    car.speed = 5;
    for (const sector of [1, 2, 3, 0]) {
      const angle = sector * Math.PI / 2 + 0.08;
      const point = trackPoint(angle);
      car.x = point.x;
      car.z = point.z;
      car.heading = Math.atan2(-64 * Math.sin(angle), 38 * Math.cos(angle));
      stepKartRace(race, idle, 0.01);
    }
    expect(car.lap).toBe(1);
    expect(car.finishedAt).toBeNull();
    for (const sector of [1, 2, 3, 0, 1, 2, 3, 0]) {
      const angle = sector * Math.PI / 2 + 0.08;
      const point = trackPoint(angle);
      car.x = point.x;
      car.z = point.z;
      car.speed = 5;
      car.heading = Math.atan2(-64 * Math.sin(angle), 38 * Math.cos(angle));
      stepKartRace(race, idle, 0.01);
    }
    expect(car.lap).toBe(3);
    expect(car.finishedAt).not.toBeNull();
  });
});
