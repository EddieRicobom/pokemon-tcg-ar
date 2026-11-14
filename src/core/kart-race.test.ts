import { describe, expect, it } from 'vitest';
import { createKartRace, kartPosition, stepKartRace, TRACK_HALF_WIDTH, trackDistance, trackPoint } from './kart-race';

const idle = { throttle: 0, steer: 0, brake: false };

describe('Kart Racer', () => {
  it('acelera, freia e pode voltar à pista após cruzar o acostamento', () => {
    const race = createKartRace(0);
    const player = race.cars[0]!;
    for (let i = 0; i < 10; i++) stepKartRace(race, { throttle: 1, steer: 0, brake: false }, 0.05);
    expect(player.speed).toBeGreaterThan(8);
    const before = player.speed;
    stepKartRace(race, { ...idle, brake: true }, 0.05);
    expect(player.speed).toBeLessThan(before);
    for (let i = 0; i < 80; i++) stepKartRace(race, { throttle: 1, steer: 0, brake: false }, 0.05);
    expect(trackDistance(player.x, player.z)).toBeGreaterThan(TRACK_HALF_WIDTH);
    expect(player.speed).toBeGreaterThan(3);
    for (let i = 0; i < 120 && trackDistance(player.x, player.z) >= TRACK_HALF_WIDTH; i++) {
      const point = trackPoint(0);
      const desired = Math.atan2(point.x - player.x, point.z - player.z);
      const turn = Math.atan2(Math.sin(desired - player.heading), Math.cos(desired - player.heading));
      stepKartRace(race, { throttle: 1, steer: Math.max(-1, Math.min(1, -turn * 2)), brake: false }, 0.05);
    }
    expect(trackDistance(player.x, player.z)).toBeLessThan(TRACK_HALF_WIDTH);
  });

  it('direita e esquerda correspondem ao lado visto pela câmera atrás do kart', () => {
    const right = createKartRace(0);
    const left = createKartRace(0);
    for (let i = 0; i < 12; i++) {
      stepKartRace(right, { throttle: 1, steer: 1, brake: false }, 0.05);
      stepKartRace(left, { throttle: 1, steer: -1, brake: false }, 0.05);
    }
    // Na largada o kart aponta para +Z; o lado direito da câmera é -X.
    expect(right.cars[0]!.x).toBeLessThan(left.cars[0]!.x);
  });

  it('oponentes completam as voltas sem ficar presos fora da pista', () => {
    const race = createKartRace(3);
    for (let i = 0; i < 14000 && race.cars.slice(1).some((car) => car.finishedAt === null); i++) {
      stepKartRace(race, idle, 0.05);
    }
    expect(race.cars.slice(1).every((car) => car.finishedAt !== null)).toBe(true);
    expect(race.cars.slice(1).every((car) => trackDistance(car.x, car.z) < TRACK_HALF_WIDTH + 4)).toBe(true);
  });

  it('colisão com a mureta mantém o kart dentro do circuito e permite sair dela', () => {
    const race = createKartRace(0);
    const car = race.cars[0]!;
    const point = trackPoint(0);
    car.x = point.x + TRACK_HALF_WIDTH + 2;
    car.z = point.z;
    car.heading = Math.PI / 2;
    car.speed = 25;
    stepKartRace(race, { throttle: 1, steer: 0, brake: false }, 0.05);
    expect(trackDistance(car.x, car.z)).toBeLessThan(TRACK_HALF_WIDTH + 3.5);
    expect(car.speed).toBeGreaterThan(2);
    const distanceAfterImpact = trackDistance(car.x, car.z);
    for (let i = 0; i < 30; i++) stepKartRace(race, { throttle: 1, steer: 0, brake: false }, 0.05);
    expect(trackDistance(car.x, car.z)).toBeLessThan(distanceAfterImpact);
  });

  it('separa karts que colidem sem atravessar a mureta', () => {
    const race = createKartRace(1);
    const [player, rival] = race.cars;
    const point = trackPoint(0);
    player!.x = rival!.x = point.x + TRACK_HALF_WIDTH + 1;
    player!.z = rival!.z = point.z;
    player!.speed = rival!.speed = 0;
    for (let i = 0; i < 3; i++) stepKartRace(race, idle, 0.05);
    expect(Math.hypot(player!.x - rival!.x, player!.z - rival!.z)).toBeGreaterThanOrEqual(2.99);
    expect(trackDistance(player!.x, player!.z)).toBeLessThan(TRACK_HALF_WIDTH + 3.5);
    expect(trackDistance(rival!.x, rival!.z)).toBeLessThan(TRACK_HALF_WIDTH + 3.5);
  });

  it('mede progresso e largura corretamente ao longo das curvas da pista', () => {
    for (let i = 0; i < 32; i++) {
      const angle = i * Math.PI / 16;
      const point = trackPoint(angle);
      expect(trackDistance(point.x, point.z)).toBeLessThan(0.05);
    }
  });

  it('a segunda fila larga atrás da linha e não ganha volta de graça', () => {
    const race = createKartRace(3);
    for (let i = 0; i < race.cars.length; i++) for (let j = i + 1; j < race.cars.length; j++) {
      const a = race.cars[i]!;
      const b = race.cars[j]!;
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(5);
    }
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
