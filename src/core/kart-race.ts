/** Física e regras puras do Kart Racer. Distâncias em unidades de pista, tempo em segundos. */
export const KART_LAPS = 3;
export const TRACK_X_RADIUS = 64;
export const TRACK_Z_RADIUS = 38;
export const TRACK_HALF_WIDTH = 8;
const TAU = Math.PI * 2;
const KART_RADIUS = 1.5;
const ROAD_LIMIT = TRACK_HALF_WIDTH - KART_RADIUS;
const BARRIER_LIMIT = TRACK_HALF_WIDTH + 3.5 - KART_RADIUS;

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
  return {
    x: TRACK_X_RADIUS * Math.cos(angle) + 7 * Math.cos(3 * angle) + 3 * Math.cos(2 * angle),
    z: TRACK_Z_RADIUS * Math.sin(angle) + 4 * Math.sin(3 * angle) + 2 * Math.sin(2 * angle),
  };
}

export function trackTangent(angle: number): { x: number; z: number } {
  return {
    x: -TRACK_X_RADIUS * Math.sin(angle) - 21 * Math.sin(3 * angle) - 6 * Math.sin(2 * angle),
    z: TRACK_Z_RADIUS * Math.cos(angle) + 12 * Math.cos(3 * angle) + 4 * Math.cos(2 * angle),
  };
}

function nearestTrack(x: number, z: number): { angle: number; distance: number } {
  let bestAngle = 0;
  let bestDistance = Infinity;
  const samples = 64;
  for (let i = 0; i < samples; i++) {
    const angle = i * TAU / samples;
    const point = trackPoint(angle);
    const distance = (x - point.x) ** 2 + (z - point.z) ** 2;
    if (distance < bestDistance) { bestAngle = angle; bestDistance = distance; }
  }
  let left = bestAngle - TAU / samples;
  let right = bestAngle + TAU / samples;
  for (let i = 0; i < 9; i++) {
    const a = left + (right - left) / 3;
    const b = right - (right - left) / 3;
    const pa = trackPoint(a);
    const pb = trackPoint(b);
    if ((x - pa.x) ** 2 + (z - pa.z) ** 2 < (x - pb.x) ** 2 + (z - pb.z) ** 2) right = b;
    else left = a;
  }
  const angle = (left + right) / 2;
  const point = trackPoint(angle);
  return { angle: (angle + TAU) % TAU, distance: Math.hypot(x - point.x, z - point.z) };
}

export function trackAngle(x: number, z: number): number { return nearestTrack(x, z).angle; }
export function trackDistance(x: number, z: number): number { return nearestTrack(x, z).distance; }

export function createKartRace(opponents = 3): KartRaceState {
  const cars: KartCar[] = Array.from({ length: opponents + 1 }, (_, id) => {
    const angle = -0.25 * Math.floor(id / 2);
    const point = trackPoint(angle);
    const { x: tangentX, z: tangentZ } = trackTangent(angle);
    const laneOffset = id % 2 === 0 ? -2.7 : 2.7;
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
  const angle = trackAngle(car.x, car.z);
  const ahead = angle + 0.26 + Math.min(0.13, Math.max(0, car.speed) * 0.004);
  const point = trackPoint(ahead);
  const { x: tangentX, z: tangentZ } = trackTangent(ahead);
  const length = Math.hypot(tangentX, tangentZ);
  const lane = id % 2 === 0 ? -1.4 : 1.4;
  const targetX = point.x + tangentZ / length * lane;
  const targetZ = point.z - tangentX / length * lane;
  const desired = Math.atan2(targetX - car.x, targetZ - car.z);
  const turn = angleDifference(desired, car.heading);
  const offroad = trackDistance(car.x, car.z) > ROAD_LIMIT;
  return {
    throttle: offroad || Math.abs(turn) < 0.48 ? 1 : 0.72,
    // Com a câmera atrás do kart, um comando positivo vira à direita na tela.
    steer: Math.max(-1, Math.min(1, -turn * 2.1)),
    brake: !offroad && Math.abs(turn) > 0.62 && car.speed > 21,
  };
}

function advanceCar(car: KartCar, input: KartInput, dt: number, elapsed: number, laps: number): void {
  if (car.finishedAt !== null) return;
  const throttle = Math.max(-1, Math.min(1, input.throttle));
  const offroad = Math.max(0, Math.min(1, (trackDistance(car.x, car.z) - ROAD_LIMIT) / 4));
  car.speed += (throttle >= 0 ? 24 - 9 * offroad : 14) * throttle * dt;
  const drag = 3.2 + 9 * offroad + (input.brake ? 20 : 0);
  car.speed = Math.sign(car.speed) * Math.max(0, Math.abs(car.speed) - drag * dt);
  car.speed = Math.max(-10, Math.min(32 - 14 * offroad, car.speed));
  car.heading -= Math.max(-1, Math.min(1, input.steer)) * 2.35 * dt * Math.min(1, Math.abs(car.speed) / 7) * Math.sign(car.speed || 1);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  // O acostamento é transitável. Atrito e velocidade máxima no gramado dão
  // tempo para o piloto corrigir a direção, sem prender o kart na borda.
  resolveBarrier(car);
  const sector = Math.floor(trackAngle(car.x, car.z) / (Math.PI / 2));
  if (sector === (car.checkpoint + 1) % 4 && car.speed > 0.5 && trackDistance(car.x, car.z) < TRACK_HALF_WIDTH) {
    car.checkpoint = sector;
    if (sector === 0) {
      car.lap++;
      if (car.lap >= laps) car.finishedAt = elapsed;
    }
  }
}

function resolveBarrier(car: KartCar): void {
  const nearest = nearestTrack(car.x, car.z);
  if (nearest.distance <= BARRIER_LIMIT) return;
  const point = trackPoint(nearest.angle);
  const nx = (car.x - point.x) / nearest.distance;
  const nz = (car.z - point.z) / nearest.distance;
  car.x = point.x + nx * BARRIER_LIMIT;
  car.z = point.z + nz * BARRIER_LIMIT;
  const vx = Math.sin(car.heading) * car.speed;
  const vz = Math.cos(car.heading) * car.speed;
  const outwardSpeed = vx * nx + vz * nz;
  if (outwardSpeed > 0) {
    const reboundX = vx - 1.2 * outwardSpeed * nx;
    const reboundZ = vz - 1.2 * outwardSpeed * nz;
    car.heading = Math.atan2(reboundX, reboundZ);
    car.speed = Math.hypot(reboundX, reboundZ) * 0.86;
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
      if (distance >= 3) continue;
      if (distance < 0.001) { b.x += 0.001; continue; }
      const shift = (3 - distance) * 0.5;
      a.x -= dx / distance * shift;
      a.z -= dz / distance * shift;
      b.x += dx / distance * shift;
      b.z += dz / distance * shift;
      const mean = (a.speed + b.speed) / 2;
      a.speed = a.speed * 0.86 + mean * 0.14;
      b.speed = b.speed * 0.86 + mean * 0.14;
      resolveBarrier(a);
      resolveBarrier(b);
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
