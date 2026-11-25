import { describe, expect, it } from 'vitest';
import { createKartRace, stepKartRace, trackPoint, trackTangent, useKartItem, type KartRaceState } from './kart-race';

const idle = { throttle: 0, steer: 0, brake: false };

/** Sem habilidades e sem caixas no caminho: isola o item em teste. */
function quiet(race: KartRaceState): KartRaceState {
  for (const car of race.cars) car.abilityReadyAt = Number.POSITIVE_INFINITY;
  for (const box of race.boxes) box.readyAt = Number.POSITIVE_INFINITY;
  return race;
}

function place(race: KartRaceState, id: number, angle: number): void {
  const car = race.cars[id]!;
  const point = trackPoint(angle);
  const tangent = trackTangent(angle);
  car.x = point.x;
  car.z = point.z;
  car.heading = Math.atan2(tangent.x, tangent.z);
  car.speed = 0;
  car.lap = 0;
  car.checkpoint = 0;
  car.finishedAt = null;
  car.spinUntil = 0;
  car.slowUntil = 0;
  car.shieldUntil = 0;
}

describe('Kart: itens e ataques', () => {
  it('itens ficam desligados por padrão e ligados só com a opção', () => {
    expect(createKartRace(3, [25, 7, 6, 95]).itemsEnabled).toBe(false);
    expect(createKartRace(3, [25, 7, 6, 95]).boxes).toEqual([]);
    const race = createKartRace(3, [25, 7, 6, 95], null, { items: true });
    expect(race.itemsEnabled).toBe(true);
    expect(race.boxes).toHaveLength(6);
    expect(race.cars.every((car) => car.item === null)).toBe(true);
  });

  it('a contagem segura o relógio e os karts até o zero', () => {
    const race = createKartRace(1, [25, 7], null, { items: true, countdown: 2 });
    for (let i = 0; i < 20; i++) stepKartRace(race, { ...idle, throttle: 1 }, 0.05);
    expect(race.countdown).toBeCloseTo(1, 5);
    expect(race.elapsed).toBe(0);
    expect(race.cars[0]!.speed).toBe(0);
    for (let i = 0; i < 21; i++) stepKartRace(race, { ...idle, throttle: 1 }, 0.05);
    expect(race.countdown).toBe(0);
    stepKartRace(race, { ...idle, throttle: 1 }, 0.05);
    expect(race.elapsed).toBeGreaterThan(0);
    expect(race.cars[0]!.speed).toBeGreaterThan(0);
  });

  it('a caixa entrega um item, fica indisponível e volta depois', () => {
    const race = quiet(createKartRace(1, [25, 7], null, { items: true, seed: 42 }));
    const box = race.boxes[0]!;
    box.readyAt = 0;
    const car = race.cars[0]!;
    car.x = box.x;
    car.z = box.z;
    stepKartRace(race, idle, 0.02);
    expect(car.item).not.toBeNull();
    expect(race.lastItemEvent).toMatchObject({ kind: 'pickup', car: 0 });
    expect(race.itemEvents.some((event) => event.kind === 'pickup')).toBe(true);
    expect(box.readyAt).toBeGreaterThan(race.elapsed);
    expect(car.itemReadyAt).toBe(race.elapsed);
    const grabbed = car.item;
    stepKartRace(race, idle, 0.02);
    expect(car.item).toBe(grabbed);
  });

  it('a mesma semente sorteia os mesmos itens', () => {
    const once = (): (string | null)[] => {
      const race = quiet(createKartRace(3, [25, 7, 6, 95], null, { items: true, seed: 99 }));
      race.elapsed = 1;
      for (const box of race.boxes) box.readyAt = 0;
      for (let i = 0; i < race.cars.length; i++) {
        const car = race.cars[i]!;
        car.x = race.boxes[i]!.x;
        car.z = race.boxes[i]!.z;
      }
      stepKartRace(race, idle, 0.02);
      return race.cars.map((car) => car.item);
    };
    expect(once()).toEqual(once());
  });

  it('o NPC usa o próprio item depois do atraso', () => {
    const race = quiet(createKartRace(1, [25, 7], null, { items: true }));
    const rival = race.cars[1]!;
    rival.item = 'turbo';
    rival.itemReadyAt = 0;
    race.elapsed = 5;
    stepKartRace(race, idle, 0.05);
    expect(rival.item).toBeNull();
    expect(rival.boostUntil).toBeGreaterThan(race.elapsed);
    expect(race.itemEvents.some((event) => event.kind === 'use' && event.car === 1)).toBe(true);
  });

  it('concha persegue e faz o rival à frente rodar, contando o acerto', () => {
    const race = quiet(createKartRace(1, [25, 7], null, { items: true }));
    race.elapsed = 10;
    place(race, 0, 0.1);
    place(race, 1, 0.22);
    const [player, rival] = race.cars as [NonNullable<KartRaceState['cars'][0]>, NonNullable<KartRaceState['cars'][0]>];
    player.item = 'shell';
    expect(useKartItem(race, 0)).toBe(true);
    expect(player.item).toBeNull();
    expect(race.projectiles).toHaveLength(1);
    expect(race.projectiles[0]!.target).toBe(1);
    for (let i = 0; i < 120 && race.projectiles.length > 0; i++) stepKartRace(race, idle, 0.05);
    expect(race.projectiles).toHaveLength(0);
    expect(rival.spinUntil).toBeGreaterThan(race.elapsed);
    expect(player.hits).toBe(1);
    expect(race.itemEvents.some((event) => event.kind === 'hit' && event.target === 1)).toBe(true);
  });

  it('escudo bloqueia a concha sem contar acerto nem giro', () => {
    const race = quiet(createKartRace(1, [25, 7], null, { items: true }));
    race.elapsed = 10;
    place(race, 0, 0.1);
    place(race, 1, 0.22);
    race.cars[1]!.shieldUntil = race.elapsed + 5;
    race.cars[0]!.item = 'shell';
    useKartItem(race, 0);
    for (let i = 0; i < 120 && race.projectiles.length > 0; i++) stepKartRace(race, idle, 0.05);
    expect(race.cars[1]!.spinUntil).toBe(0);
    expect(race.cars[0]!.hits).toBe(0);
    expect(race.itemEvents.some((event) => event.kind === 'blocked' && event.target === 1)).toBe(true);
  });

  it('casca e óleo atingem quem passa por cima, mas não o dono', () => {
    for (const kind of ['banana', 'oil'] as const) {
      const race = quiet(createKartRace(1, [25, 7], null, { items: true }));
      race.elapsed = 10;
      place(race, 0, 0.1);
      place(race, 1, 0.04);
      race.cars[0]!.item = kind;
      expect(useKartItem(race, 0)).toBe(true);
      const hazard = race.hazards[0]!;
      expect(hazard.kind).toBe(kind);
      // O dono passa por cima e não sofre nada.
      race.cars[0]!.x = hazard.x;
      race.cars[0]!.z = hazard.z;
      stepKartRace(race, idle, 0.02);
      expect(race.cars[0]!.spinUntil).toBe(0);
      // O rival passa e sofre.
      race.cars[1]!.x = hazard.x;
      race.cars[1]!.z = hazard.z;
      stepKartRace(race, idle, 0.02);
      expect(race.cars[1]!.slowUntil).toBeGreaterThan(race.elapsed);
      expect(race.hazards).toHaveLength(0);
      expect(race.cars[0]!.hits).toBe(1);
    }
  });

  it('raio atinge só quem está à frente; escudo bloqueia individualmente', () => {
    const race = quiet(createKartRace(2, [25, 7, 6], null, { items: true }));
    race.elapsed = 10;
    place(race, 0, 0.05);
    place(race, 1, 0.14);
    place(race, 2, 0.24);
    race.cars[2]!.shieldUntil = race.elapsed + 5;
    race.cars[0]!.item = 'bolt';
    expect(useKartItem(race, 0)).toBe(true);
    expect(race.cars[1]!.slowUntil).toBeGreaterThan(race.elapsed);
    expect(race.cars[1]!.spinUntil).toBeGreaterThan(race.elapsed);
    expect(race.cars[2]!.slowUntil).toBe(0);
    expect(race.cars[2]!.spinUntil).toBe(0);
    expect(race.cars[0]!.hits).toBe(1);
  });

  it('turbo e cometa aceleram, e o cometa também protege por um instante', () => {
    for (const item of ['turbo', 'comet'] as const) {
      const race = quiet(createKartRace(0, [25], null, { items: true }));
      race.elapsed = 10;
      const car = race.cars[0]!;
      car.item = item;
      car.speed = 10;
      expect(useKartItem(race, 0)).toBe(true);
      expect(car.boostUntil).toBeGreaterThan(race.elapsed);
      expect(car.speed).toBeGreaterThan(10);
      if (item === 'comet') expect(car.shieldUntil).toBeGreaterThan(race.elapsed);
    }
  });

  it('quem está rodando não acelera nem usa item até o giro acabar', () => {
    const race = quiet(createKartRace(0, [25], null, { items: true }));
    race.elapsed = 10;
    const car = race.cars[0]!;
    car.speed = 20;
    car.spinUntil = race.elapsed + 1;
    car.item = 'turbo';
    expect(useKartItem(race, 0)).toBe(false);
    stepKartRace(race, { ...idle, throttle: 1 }, 0.05);
    expect(car.speed).toBeLessThan(20);
    expect(car.item).toBe('turbo');
  });

  it('sem item, sem corrida e fora da contagem a função recusa sem quebrar', () => {
    const race = quiet(createKartRace(0, [25], null, { items: true }));
    expect(useKartItem(race, 0)).toBe(false);
    expect(useKartItem(race, 9)).toBe(false);
    const frozen = quiet(createKartRace(0, [25], null, { items: true, countdown: 2 }));
    frozen.cars[0]!.item = 'turbo';
    frozen.countdown = 1;
    stepKartRace(frozen, idle, 0.05);
    expect(frozen.cars[0]!.item).toBe('turbo');
  });
});
