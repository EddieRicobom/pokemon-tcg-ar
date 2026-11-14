/** Física e regras puras do Kart Racer. Distâncias em unidades de pista, tempo em segundos. */
export const KART_LAPS = 3;
export const TRACK_X_RADIUS = 64;
export const TRACK_Z_RADIUS = 38;
export const TRACK_HALF_WIDTH = 8;
const TAU = Math.PI * 2;
const KART_RADIUS = 1.5;

export interface KartInput { throttle: number; steer: number; brake: boolean }
export interface KartCar {
  id: number;
  x: number;
  z: number;
  heading: number;
  speed: number;
  lap: number;
  checkpoint: number;
  finishedAt: number | null;
}
export interface KartRaceState { cars: KartCar[]; elapsed: number; laps: number }

export function trackPoint(angle: number): { x: number; z: number } {
  return { x: TRACK_X_RADIUS * Math.cos(angle), z: TRACK_Z_RADIUS * Math.sin(angle) };
}

export function trackAngle(x: number, z: number): number {
  const angle = Math.atan2(z / TRACK_Z_RADIUS, x / TRACK_X_RADIUS);
  return angle < 0 ? angle + TAU : angle;
}

export function trackDistance(x: number, z: number): number {
  const point = trackPoint(trackAngle(x, z));
  return Math.hypot(x - point.x, z - point.z);
}

export function createKartRace(opponents = 3): KartRaceState {
  const cars: KartCar[] = Array.from({ length: opponents + 1 }, (_, id) => {
    const angle = -0.085 * Math.floor(id / 2);
    const point = trackPoint(angle);
    const tangentX = -TRACK_X_RADIUS * Math.sin(angle);
    const tangentZ = TRACK_Z_RADIUS * Math.cos(angle);
    const laneOffset = id % 2 === 0 ? -2.1 : 2.1;
    const tangentLength = Math.hypot(tangentX, tangentZ);
    return {
      id,
      x: point.x + tangentZ / tangentLength * laneOffset,
      z: point.z - tangentX / tangentLength * laneOffset,
      heading: Math.atan2(tangentX, tangentZ),
      speed: 0,
      lap: 0,
      checkpoint: 0,
      finishedAt: null,
    };
  });
  return { cars, elapsed: 0, laps: KART_LAPS };
}

function angleDifference(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

export function opponentInput(car: KartCar, id: number): KartInput {
  const ahead = trackAngle(car.x, car.z) + 0.12;
  const point = trackPoint(ahead);
  const lane = id % 2 === 0 ? -1.6 : 1.6;
  const center = trackPoint(ahead + lane / 45);
  const desired = Math.atan2(center.x - car.x, center.z - car.z);
  const turn = angleDifference(desired, car.heading);
  const bend = Math.abs(turn);
  return { throttle: bend > 1.1 ? 0.45 : 0.82, steer: Math.max(-1, Math.min(1, turn * 2.4)), brake: bend > 1.4 || Math.hypot(point.x - car.x, point.z - car.z) > 25 };
}

function advanceCar(car: KartCar, input: KartInput, dt: number, elapsed: number, laps: number): void {
  if (car.finishedAt !== null) return;
  const throttle = Math.max(-1, Math.min(1, input.throttle));
  car.speed += (throttle >= 0 ? 25 : 14) * throttle * dt;
  const drag = input.brake ? 15 : 4.2;
  car.speed = Math.sign(car.speed) * Math.max(0, Math.abs(car.speed) - drag * dt);
  car.speed = Math.max(-9, Math.min(27, car.speed));
  car.heading += Math.max(-1, Math.min(1, input.steer)) * 2.25 * dt * Math.min(1, Math.abs(car.speed) / 8) * Math.sign(car.speed || 1);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  const point = trackPoint(trackAngle(car.x, car.z));
  const dx = car.x - point.x;
  const dz = car.z - point.z;
  const distance = Math.hypot(dx, dz);
  const limit = TRACK_HALF_WIDTH - KART_RADIUS;
  if (distance > limit) {
    car.x = point.x + dx / distance * limit;
    car.z = point.z + dz / distance * limit;
    car.speed *= 0.46;
  }
  const sector = Math.floor(trackAngle(car.x, car.z) / (Math.PI / 2));
  if (sector === (car.checkpoint + 1) % 4 && car.speed > 0.5) {
    car.checkpoint = sector;
    if (sector === 0) {
      car.lap++;
      if (car.lap >= laps) car.finishedAt = elapsed;
    }
  }
}

export function stepKartRace(state: KartRaceState, input: KartInput, deltaSeconds: number): void {
  const dt = Math.max(0, Math.min(0.05, deltaSeconds));
  if (dt === 0) return;
  state.elapsed += dt;
  state.cars.forEach((car, id) => advanceCar(car, id === 0 ? input : opponentInput(car, id), dt, state.elapsed, state.laps));
  for (let i = 0; i < state.cars.length; i++) {
    for (let j = i + 1; j < state.cars.length; j++) {
      const a = state.cars[i]!;
      const b = state.cars[j]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= 3 || distance < 0.001) continue;
      const shift = (3 - distance) * 0.5;
      a.x -= dx / distance * shift;
      a.z -= dz / distance * shift;
      b.x += dx / distance * shift;
      b.z += dz / distance * shift;
      const mean = (a.speed + b.speed) / 2;
      a.speed = (a.speed + mean) / 2;
      b.speed = (b.speed + mean) / 2;
    }
  }
}

export function kartPosition(state: KartRaceState, id: number): number {
  const progress = (car: KartCar): number => {
    const angle = trackAngle(car.x, car.z);
    // A segunda fila larga pouco antes da linha; isso ainda é progresso negativo.
    const startingBehind = car.lap === 0 && car.checkpoint === 0 && angle > Math.PI * 1.5;
    return car.lap * TAU + angle - (startingBehind ? TAU : 0);
  };
  const sorted = [...state.cars].sort((a, b) => {
    if (a.finishedAt !== null || b.finishedAt !== null) {
      if (a.finishedAt === null) return 1;
      if (b.finishedAt === null) return -1;
      return a.finishedAt - b.finishedAt;
    }
    return progress(b) - progress(a);
  });
  return sorted.findIndex((car) => car.id === id) + 1;
}
