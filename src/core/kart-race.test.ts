import { describe, expect, it } from 'vitest';
import { activateKartAbility, createKartRace, kartAbilityOfTypes, kartCupScores, kartPosition, kartProfileOfDex, KART_CUP_ROUNDS, stepKartRace, TRACK_HALF_WIDTH, trackDistance, trackPoint } from './kart-race';

const idle = { throttle: 0, steer: 0, brake: false };

describe('Kart Racer', () => {
  it('liga habilidades aos tipos reais e respeita recarga curta', () => {
    expect(kartAbilityOfTypes(kartProfileOfDex(25)!.types)?.kind).toBe('boost');
    expect(kartAbilityOfTypes(kartProfileOfDex(7)!.types)?.kind).toBe('pulse');
    expect(kartAbilityOfTypes(kartProfileOfDex(95)!.types)?.kind).toBe('shield');
    expect(kartAbilityOfTypes([])).toBeNull();
    const race = createKartRace(0, [25]);
    expect(activateKartAbility(race, 0)).toBe(false);
    race.elapsed = 3;
    expect(activateKartAbility(race, 0)).toBe(true);
    expect(race.cars[0]!.boostUntil).toBeGreaterThan(race.elapsed);
    expect(activateKartAbility(race, 0)).toBe(false);
    race.elapsed = race.cars[0]!.abilityReadyAt;
    expect(activateKartAbility(race, 0)).toBe(true);
  });

  it('pulso atinge apenas rivais próximos à frente e escudo bloqueia', () => {
    const race = createKartRace(3, [7, 25, 25, 95]);
    const [water, front, back, shield] = race.cars;
    race.elapsed = 3;
    water!.x = 0; water!.z = 0; water!.heading = 0;
    front!.x = 0; front!.z = 10;
    back!.x = 0; back!.z = -8;
    shield!.x = 1; shield!.z = 8;
    expect(activateKartAbility(race, 3)).toBe(true);
    expect(activateKartAbility(race, 0)).toBe(true);
    expect(front!.slowUntil).toBeGreaterThan(race.elapsed);
    expect(back!.slowUntil).toBe(0);
    expect(shield!.slowUntil).toBe(0);
    race.elapsed += 1.3;
    expect(front!.slowUntil).toBeLessThan(race.elapsed);
    expect(shield!.shieldUntil).toBeGreaterThan(race.elapsed);
  });

  it('copa acumula pontos em três etapas e reserva Blue para o duelo final', () => {
    expect(KART_CUP_ROUNDS.map((round) => round.opponents[0])).toEqual([7, 8, 9]);
    let scores = [0, 0, 0, 0];
    scores = kartCupScores(scores, [0, 1, 2, 3]);
    scores = kartCupScores(scores, [1, 0, 3, 2]);
    expect(scores).toEqual([16, 16, 4, 4]);
    expect(createKartRace(3, [25, 9, 160, 257], 1).rivalId).toBe(1);
  });
  it('deriva carroceria e rodas dos tipos reais, inclusive o segundo tipo', () => {
    const charmander = kartProfileOfDex(4)!;
    const charizard = kartProfileOfDex(6)!;
    const onix = kartProfileOfDex(95)!;
    expect(charmander.types).toEqual(['fire']);
    expect(charmander.body.id).toBe('equilibrado');
    expect(charizard.types).toEqual(['fire', 'flying']);
    expect(charizard.body.id).toBe('aero');
    expect(charizard.performance.topSpeed).toBeGreaterThan(charmander.performance.topSpeed);
    expect(onix.wheels.id).toBe('tracao');
    expect(onix.performance.offroadGrip).toBeGreaterThan(charizard.performance.offroadGrip);
  });

  it('usa stats base reais para diferenciar desempenho e movimento', () => {
    const pikachu = kartProfileOfDex(25)!;
    const raichu = kartProfileOfDex(26)!;
    expect(pikachu.stats.speed).toBe(90);
    expect(raichu.stats.speed).toBe(110);
    expect(raichu.performance.topSpeed).toBeGreaterThan(pikachu.performance.topSpeed);
    const slow = createKartRace(0, [25]);
    const fast = createKartRace(0, [26]);
    for (let i = 0; i < 35; i++) {
      stepKartRace(slow, { throttle: 1, steer: 0, brake: false }, 0.05);
      stepKartRace(fast, { throttle: 1, steer: 0, brake: false }, 0.05);
    }
    expect(fast.cars[0]!.speed).toBeGreaterThan(slow.cars[0]!.speed);
  });

  it('aplica direção e aderência distintas das peças durante a corrida', () => {
    const light = createKartRace(0, [25]);
    const heavy = createKartRace(0, [95]);
    for (const race of [light, heavy]) race.cars[0]!.speed = 20;
    stepKartRace(light, { throttle: 0, steer: 1, brake: false }, 0.05);
    stepKartRace(heavy, { throttle: 0, steer: 1, brake: false }, 0.05);
    expect(light.cars[0]!.heading).toBeLessThan(heavy.cars[0]!.heading);

    const asphalt = createKartRace(0, [6]);
    const traction = createKartRace(0, [95]);
    const point = trackPoint(0);
    for (const race of [asphalt, traction]) {
      race.cars[0]!.x = point.x + TRACK_HALF_WIDTH + 0.5;
      race.cars[0]!.z = point.z;
      race.cars[0]!.heading = 0;
      race.cars[0]!.speed = 20;
      stepKartRace(race, idle, 0.05);
    }
    expect(traction.cars[0]!.speed).toBeGreaterThan(asphalt.cars[0]!.speed);
  });

  it('sinaliza dados ausentes sem atribuir tipo ou stats ao Pokémon', () => {
    expect(kartProfileOfDex(99999)).toBeNull();
    expect(kartProfileOfDex(0)).toBeNull();
    const race = createKartRace(1, [99999, 25]);
    expect(race.cars[0]!.profile).toBeNull();
    expect(race.cars[1]!.profile?.dexId).toBe(25);
    stepKartRace(race, { throttle: 1, steer: 0, brake: false }, 0.05);
    expect(race.cars[0]!.speed).toBeGreaterThan(0);
  });

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
    const race = createKartRace(3, [25, 6, 95, 7]);
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
