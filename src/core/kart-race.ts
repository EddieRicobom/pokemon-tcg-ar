/** Física e regras puras do Kart Racer. Distâncias em unidades de pista, tempo em segundos. */
import { TYPE_LABELS_PT, type PokemonType } from './pokemon-data';
import { KART_ITEMS, rollKartItem, type KartItemId } from './kart-items';
import { typesOfDex } from './species-filter';
import type { BaseStats } from './survivor-moves';
import { statsOfDex } from './survivor-stats';
export const KART_LAPS = 3;
export const TRACK_X_RADIUS = 64;
export const TRACK_Z_RADIUS = 38;
export const TRACK_HALF_WIDTH = 8;
const TAU = Math.PI * 2;
const KART_RADIUS = 1.5;
const ROAD_LIMIT = TRACK_HALF_WIDTH - KART_RADIUS;
const BARRIER_LIMIT = TRACK_HALF_WIDTH + 3.5 - KART_RADIUS;
/** Uma caixa de item por ângulo; voltam nove segundos depois de alguém pegar. */
export const KART_ITEM_BOX_ANGLES = [0.08, 0.26, 0.44, 0.62, 0.8, 0.96] as const;
const ITEM_BOX_RADIUS = 3.6;
const ITEM_BOX_RESPAWN = 9;
const SHELL_HIT_RADIUS = 2.5;
const BANANA_HIT_RADIUS = 2.1;
const OIL_HIT_RADIUS = 3.1;

export interface KartInput { throttle: number; steer: number; brake: boolean }
export type KartAbilityKind = 'boost' | 'pulse' | 'shield';
export interface KartAbility { kind: KartAbilityKind; label: string; description: string; cooldown: number }
export type KartBodyId = 'leve' | 'equilibrado' | 'pesado' | 'aero';
export type KartWheelsId = 'asfalto' | 'misto' | 'tracao';
export interface KartPerformance {
  acceleration: number;
  topSpeed: number;
  handling: number;
  roadGrip: number;
  offroadGrip: number;
  braking: number;
}
export interface KartProfile {
  dexId: number;
  types: readonly PokemonType[];
  stats: BaseStats;
  body: { id: KartBodyId; label: string };
  wheels: { id: KartWheelsId; label: string };
  performance: KartPerformance;
}
export interface KartCar {
  id: number;
  /** Null quando faltam tipos ou stats reais para o Pokémon. */
  profile: KartProfile | null;
  ability: KartAbility | null;
  abilityReadyAt: number;
  boostUntil: number;
  slowUntil: number;
  shieldUntil: number;
  /** Item na mão (um por vez). */
  item: KartItemId | null;
  /** Derrapagem causada por casca/concha/raio: sem controle até este instante. */
  spinUntil: number;
  /** Quando o NPC pode usar o item que pegou (o jogador usa na hora). */
  itemReadyAt: number;
  /** Acertos causados em outros karts (placar de itens). */
  hits: number;
  /** Carga da derrapagem (freio + curva em velocidade); soltar vira mini-turbo. */
  driftCharge: number;
  x: number;
  z: number;
  heading: number;
  speed: number;
  lap: number;
  checkpoint: number;
  finishedAt: number | null;
}

export interface KartItemBox {
  id: number;
  angle: number;
  x: number;
  z: number;
  /** Só volta a dar item depois deste instante. */
  readyAt: number;
}

export interface KartHazard {
  id: number;
  kind: 'banana' | 'oil';
  owner: number;
  x: number;
  z: number;
  until: number;
}

export interface KartProjectile {
  id: number;
  kind: 'shell';
  owner: number;
  /** Id do alvo; -1 voa reto. */
  target: number;
  x: number;
  z: number;
  angle: number;
  speed: number;
  until: number;
}

export type KartItemEventKind = 'pickup' | 'use' | 'hit' | 'blocked';
export interface KartItemEvent {
  seq: number;
  kind: KartItemEventKind;
  /** Quem pegou/usou ou quem causou o acerto. */
  car: number;
  item: KartItemId;
  /** Quem levou o acerto (quando houver). */
  target?: number;
}

export interface KartRaceOptions {
  /** Liga itens, caixas e ataques. Padrão: desligado (os testes e as corridas antigas continuam iguais). */
  items?: boolean;
  /** Semente do sorteio de itens; a mesma semente repete a corrida. */
  seed?: number;
  /** Contagem antes da largada, em segundos. `elapsed` só começa depois dela. */
  countdown?: number;
}

export interface KartRaceState {
  cars: KartCar[];
  elapsed: number;
  laps: number;
  rivalId: number | null;
  itemsEnabled: boolean;
  boxes: KartItemBox[];
  hazards: KartHazard[];
  projectiles: KartProjectile[];
  itemEvents: KartItemEvent[];
  lastItemEvent: KartItemEvent | null;
  itemEventSeq: number;
  itemSeed: number;
  nextItemId: number;
  /** Segundos restantes da contagem; 0 = corrida andando. */
  countdown: number;
}

export const KART_CUP_ROUNDS = [
  { title: 'Abertura da Copa', opponents: [7, 158, 255], accent: '#71cda9' },
  { title: 'Disputa dos treinadores', opponents: [8, 159, 256], accent: '#e8bf68' },
  { title: 'Duelo com o rival Blue', opponents: [9, 160, 257], accent: '#76a9eb' },
] as const;
export const KART_CUP_TRAINERS = [
  { id: 'player', name: 'Você', portrait: '' },
  { id: 'blue', name: 'Blue', portrait: 'blue' },
  { id: 'silver', name: 'Silver', portrait: 'silver' },
  { id: 'may', name: 'May', portrait: 'may' },
] as const;
export const KART_CUP_POINTS = [10, 6, 3, 1] as const;

const BODY_LABELS: Record<KartBodyId, string> = {
  leve: 'Leve', equilibrado: 'Equilibrado', pesado: 'Pesado', aero: 'Aerodinâmico',
};
const WHEEL_LABELS: Record<KartWheelsId, string> = {
  asfalto: 'Asfalto', misto: 'Mistas', tracao: 'Tração',
};
const NEUTRAL_PERFORMANCE: KartPerformance = {
  acceleration: 24, topSpeed: 32, handling: 2.35, roadGrip: 1, offroadGrip: 1, braking: 20,
};
const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));

export function kartAbilityOfTypes(types: readonly PokemonType[]): KartAbility | null {
  const type = types[0];
  if (!type) return null;
  const name = TYPE_LABELS_PT[type];
  if (['electric', 'fire', 'flying', 'dragon', 'fighting', 'normal'].includes(type)) {
    return { kind: 'boost', label: `Impulso ${name}`, description: 'Acelera por 1,6 s. Curvas e pulsos ainda exigem controle.', cooldown: 10 };
  }
  if (['water', 'ice', 'psychic', 'ghost', 'poison', 'dark'].includes(type)) {
    return { kind: 'pulse', label: `Pulso ${name}`, description: 'Desacelera rivais à frente por 1,2 s; distância e escudo protegem.', cooldown: 11 };
  }
  return { kind: 'shield', label: `Escudo ${name}`, description: 'Protege de pulsos e colisões por 2 s.', cooldown: 12 };
}

/** As peças vêm dos tipos; os ajustes finos vêm dos seis stats base reais. */
export function kartProfileOfDex(dexId: number): KartProfile | null {
  const types = typesOfDex(dexId);
  const stats = statsOfDex(dexId);
  if (!types.length || !stats) return null;
  const bodyId: KartBodyId = types.some((type) => type === 'rock' || type === 'steel' || type === 'ground') ? 'pesado'
    : types.some((type) => type === 'flying' || type === 'dragon' || type === 'psychic' || type === 'ghost') ? 'aero'
      : types.some((type) => type === 'electric' || type === 'bug') ? 'leve' : 'equilibrado';
  const wheelsId: KartWheelsId = types.some((type) => type === 'ground' || type === 'rock' || type === 'steel') ? 'tracao'
    : types.some((type) => type === 'water' || type === 'grass' || type === 'ice' || type === 'poison') ? 'misto' : 'asfalto';
  const pace = clamp((stats.speed - 80) / 100, -1, 1);
  const power = clamp(((stats.attack + stats.spAttack) / 2 - 85) / 110, -1, 1);
  const bulk = clamp(((stats.hp + stats.defense + stats.spDefense) / 3 - 85) / 120, -1, 1);
  const body = {
    leve: { acceleration: 1.5, topSpeed: 0.1, handling: 0.12 },
    equilibrado: { acceleration: 0, topSpeed: 0, handling: 0 },
    pesado: { acceleration: -1.3, topSpeed: 0.7, handling: -0.12 },
    aero: { acceleration: -0.3, topSpeed: 1.3, handling: -0.025 },
  }[bodyId];
  const wheels = {
    asfalto: { roadGrip: 1.04, offroadGrip: 0.91, braking: 0 },
    misto: { roadGrip: 1, offroadGrip: 1.12, braking: 0.5 },
    tracao: { roadGrip: 0.97, offroadGrip: 1.22, braking: 1.5 },
  }[wheelsId];
  return {
    dexId, types, stats,
    body: { id: bodyId, label: BODY_LABELS[bodyId] },
    wheels: { id: wheelsId, label: WHEEL_LABELS[wheelsId] },
    performance: {
      acceleration: clamp(24 + 1.5 * power + body.acceleration, 20.5, 27.5),
      topSpeed: clamp(32 + 1.5 * pace + body.topSpeed, 29, 35),
      handling: clamp(2.35 + 0.13 * pace - 0.04 * bulk + body.handling, 2.05, 2.65),
      roadGrip: wheels.roadGrip,
      offroadGrip: wheels.offroadGrip,
      braking: clamp(20 + 1.3 * bulk + wheels.braking, 18, 23),
    },
  };
}

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

export function createKartRace(opponents = 3, dexIds: readonly number[] = [], rivalId: number | null = null, options: KartRaceOptions = {}): KartRaceState {
  const itemsEnabled = options.items === true;
  const cars: KartCar[] = Array.from({ length: opponents + 1 }, (_, id) => {
    const angle = -0.25 * Math.floor(id / 2);
    const point = trackPoint(angle);
    const { x: tangentX, z: tangentZ } = trackTangent(angle);
    const laneOffset = id % 2 === 0 ? -2.7 : 2.7;
    const tangentLength = Math.hypot(tangentX, tangentZ);
    const profile = dexIds[id] === undefined ? null : kartProfileOfDex(dexIds[id]!);
    return {
      id,
      profile,
      ability: profile ? kartAbilityOfTypes(profile.types) : null,
      abilityReadyAt: 3,
      boostUntil: 0,
      slowUntil: 0,
      shieldUntil: 0,
      item: null,
      spinUntil: 0,
      itemReadyAt: 0,
      hits: 0,
      driftCharge: 0,
      x: point.x + tangentZ / tangentLength * laneOffset,
      z: point.z - tangentX / tangentLength * laneOffset,
      heading: Math.atan2(tangentX, tangentZ),
      speed: 0,
      lap: 0,
      checkpoint: 0,
      finishedAt: null,
    };
  });
  return {
    cars,
    elapsed: 0,
    laps: KART_LAPS,
    rivalId,
    itemsEnabled,
    boxes: itemsEnabled ? KART_ITEM_BOX_ANGLES.map((angle, index) => {
      const point = trackPoint(angle);
      return { id: index + 1, angle, x: point.x, z: point.z, readyAt: 0 };
    }) : [],
    hazards: [],
    projectiles: [],
    itemEvents: [],
    lastItemEvent: null,
    itemEventSeq: 0,
    itemSeed: (options.seed ?? 1) >>> 0,
    nextItemId: 100,
    countdown: Math.max(0, options.countdown ?? 0),
  };
}

/** Gira a semente e devolve um número em [0, 1). Repetível entre corridas com a mesma semente. */
function nextItemRandom(state: KartRaceState): number {
  state.itemSeed = (Math.imul(state.itemSeed, 1664525) + 1013904223) >>> 0;
  return state.itemSeed / 4294967296;
}

function pushItemEvent(state: KartRaceState, kind: KartItemEventKind, car: number, item: KartItemId, target?: number): void {
  const event: KartItemEvent = { seq: ++state.itemEventSeq, kind, car, item, ...(target === undefined ? {} : { target }) };
  state.lastItemEvent = event;
  state.itemEvents.push(event);
  if (state.itemEvents.length > 24) state.itemEvents.splice(0, state.itemEvents.length - 24);
}

/** Quem está imediatamente à frente (posição menor = mais à frente). */
function targetAhead(state: KartRaceState, car: KartCar): KartCar | null {
  const mine = kartPosition(state, car.id);
  let best: KartCar | null = null;
  let bestPlace = -Infinity;
  for (const other of state.cars) {
    if (other.id === car.id || other.finishedAt !== null) continue;
    const place = kartPosition(state, other.id);
    if (place < mine && place > bestPlace) {
      best = other;
      bestPlace = place;
    }
  }
  return best;
}

function applyItemHit(state: KartRaceState, target: KartCar, source: number, kind: 'banana' | 'oil' | 'shell' | 'bolt'): void {
  const item = kind;
  if (target.shieldUntil > state.elapsed) {
    pushItemEvent(state, 'blocked', source, item, target.id);
    return;
  }
  if (kind !== 'oil') {
    target.spinUntil = Math.max(target.spinUntil, state.elapsed + (kind === 'bolt' ? 1.2 : 1.05));
    target.speed *= 0.35;
  }
  const slow = kind === 'bolt' ? KART_ITEMS.bolt.duration : kind === 'oil' ? 1.9 : 1.5;
  target.slowUntil = Math.max(target.slowUntil, state.elapsed + slow);
  const attacker = state.cars[source];
  if (attacker && attacker.id !== target.id) attacker.hits++;
  pushItemEvent(state, 'hit', source, item, target.id);
}

/**
 * Usa o item na mão. O jogador chama pelo botão; o NPC usa sozinho depois de um atraso.
 * Devolve false se não havia item, se o kart está rodando ou se a corrida já terminou.
 */
export function useKartItem(state: KartRaceState, id: number): boolean {
  const car = state.cars[id];
  if (!car || !state.itemsEnabled || !car.item || car.finishedAt !== null || car.spinUntil > state.elapsed) return false;
  const item = car.item;
  car.item = null;
  car.itemReadyAt = Number.POSITIVE_INFINITY;
  pushItemEvent(state, 'use', id, item);
  if (item === 'turbo') {
    car.boostUntil = Math.max(car.boostUntil, state.elapsed + KART_ITEMS.turbo.duration);
    car.speed = Math.min(car.speed + 4, (car.profile?.performance.topSpeed ?? 32) + 7);
  } else if (item === 'shield') {
    car.shieldUntil = Math.max(car.shieldUntil, state.elapsed + KART_ITEMS.shield.duration);
  } else if (item === 'comet') {
    car.boostUntil = Math.max(car.boostUntil, state.elapsed + KART_ITEMS.comet.duration);
    car.shieldUntil = Math.max(car.shieldUntil, state.elapsed + 1.3);
    car.speed = Math.min(car.speed + 6, (car.profile?.performance.topSpeed ?? 32) + 8);
  } else if (item === 'banana' || item === 'oil') {
    state.hazards.push({
      id: state.nextItemId++, kind: item, owner: id,
      x: car.x - Math.sin(car.heading) * 3.4,
      z: car.z - Math.cos(car.heading) * 3.4,
      until: state.elapsed + KART_ITEMS[item].duration,
    });
  } else if (item === 'shell') {
    const target = targetAhead(state, car);
    state.projectiles.push({
      id: state.nextItemId++, kind: 'shell', owner: id, target: target?.id ?? -1,
      x: car.x + Math.sin(car.heading) * 2.2,
      z: car.z + Math.cos(car.heading) * 2.2,
      angle: target ? Math.atan2(target.x - car.x, target.z - car.z) : car.heading,
      speed: 30,
      until: state.elapsed + KART_ITEMS.shell.duration,
    });
  } else if (item === 'bolt') {
    const mine = kartPosition(state, id);
    for (const other of state.cars) {
      if (other.id === id || other.finishedAt !== null) continue;
      if (kartPosition(state, other.id) < mine) applyItemHit(state, other, id, 'bolt');
    }
  }
  return true;
}

function updateItemBoxes(state: KartRaceState): void {
  for (const box of state.boxes) {
    if (box.readyAt > state.elapsed) continue;
    let pick: KartCar | null = null;
    let pickDistance = ITEM_BOX_RADIUS;
    for (const car of state.cars) {
      if (car.finishedAt !== null || car.item) continue;
      const distance = Math.hypot(car.x - box.x, car.z - box.z);
      if (distance <= pickDistance) {
        pick = car;
        pickDistance = distance;
      }
    }
    if (!pick) continue;
    const position = kartPosition(state, pick.id);
    pick.item = rollKartItem(() => nextItemRandom(state), position, state.cars.length);
    pick.itemReadyAt = state.elapsed + (pick.id === 0 ? 0 : 1.6 + nextItemRandom(state) * 2.6);
    box.readyAt = state.elapsed + ITEM_BOX_RESPAWN;
    pushItemEvent(state, 'pickup', pick.id, pick.item);
  }
}

function maybeUseNpcItem(state: KartRaceState, car: KartCar): void {
  if (car.id === 0 || !car.item || car.finishedAt !== null || car.spinUntil > state.elapsed) return;
  if (state.elapsed < 5 || state.elapsed < car.itemReadyAt) return;
  useKartItem(state, car.id);
}

function updateProjectiles(state: KartRaceState, dt: number): void {
  for (let index = state.projectiles.length - 1; index >= 0; index--) {
    const shot = state.projectiles[index]!;
    const target = shot.target >= 0 ? state.cars[shot.target] : null;
    if (target && target.finishedAt === null) shot.angle = Math.atan2(target.x - shot.x, target.z - shot.z);
    shot.x += Math.sin(shot.angle) * shot.speed * dt;
    shot.z += Math.cos(shot.angle) * shot.speed * dt;
    let hit: KartCar | null = null;
    for (const car of state.cars) {
      if (car.id === shot.owner || car.finishedAt !== null) continue;
      if (Math.hypot(car.x - shot.x, car.z - shot.z) <= SHELL_HIT_RADIUS) {
        hit = car;
        break;
      }
    }
    if (hit) {
      applyItemHit(state, hit, shot.owner, 'shell');
      state.projectiles.splice(index, 1);
      continue;
    }
    if (state.elapsed > shot.until) state.projectiles.splice(index, 1);
  }
}

function updateHazards(state: KartRaceState): void {
  for (let index = state.hazards.length - 1; index >= 0; index--) {
    const hazard = state.hazards[index]!;
    if (state.elapsed > hazard.until) {
      state.hazards.splice(index, 1);
      continue;
    }
    const radius = hazard.kind === 'oil' ? OIL_HIT_RADIUS : BANANA_HIT_RADIUS;
    let hit: KartCar | null = null;
    for (const car of state.cars) {
      if (car.id === hazard.owner || car.finishedAt !== null) continue;
      if (Math.hypot(car.x - hazard.x, car.z - hazard.z) <= radius) {
        hit = car;
        break;
      }
    }
    if (hit) {
      applyItemHit(state, hit, hazard.owner, hazard.kind);
      state.hazards.splice(index, 1);
    }
  }
}

export function activateKartAbility(state: KartRaceState, id: number): boolean {
  const car = state.cars[id];
  if (!car || !car.ability || car.finishedAt !== null || state.elapsed < car.abilityReadyAt) return false;
  car.abilityReadyAt = state.elapsed + car.ability.cooldown;
  if (car.ability.kind === 'boost') {
    car.boostUntil = state.elapsed + 1.6;
    car.speed = Math.min(car.speed + 5, (car.profile?.performance.topSpeed ?? 32) + 7);
  } else if (car.ability.kind === 'shield') {
    car.shieldUntil = state.elapsed + 2;
  } else {
    for (const other of state.cars) {
      if (other.id === id || other.finishedAt !== null || other.shieldUntil > state.elapsed) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      if (Math.hypot(dx, dz) <= 15 && dx * Math.sin(car.heading) + dz * Math.cos(car.heading) > 0) {
        other.slowUntil = Math.max(other.slowUntil, state.elapsed + 1.2);
      }
    }
  }
  return true;
}

export function kartCupScores(scores: readonly number[], order: readonly number[]): number[] {
  const next = [...scores];
  for (let place = 0; place < order.length; place++) {
    const id = order[place]!;
    next[id] = (next[id] ?? 0) + (KART_CUP_POINTS[place] ?? 0);
  }
  return next;
}

function angleDifference(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

export function opponentInput(car: KartCar, id: number, rival = false): KartInput {
  const angle = trackAngle(car.x, car.z);
  const ahead = angle + (rival ? 0.29 : 0.26) + Math.min(0.13, Math.max(0, car.speed) * 0.004);
  const point = trackPoint(ahead);
  const { x: tangentX, z: tangentZ } = trackTangent(ahead);
  const length = Math.hypot(tangentX, tangentZ);
  const lane = rival ? 0.15 : id % 2 === 0 ? -1.4 : 1.4;
  const targetX = point.x + tangentZ / length * lane;
  const targetZ = point.z - tangentX / length * lane;
  const desired = Math.atan2(targetX - car.x, targetZ - car.z);
  const turn = angleDifference(desired, car.heading);
  const offroad = trackDistance(car.x, car.z) > ROAD_LIMIT;
  return {
    throttle: offroad || Math.abs(turn) < 0.48 ? 1 : 0.72,
    // Com a câmera atrás do kart, um comando positivo vira à direita na tela.
    steer: Math.max(-1, Math.min(1, -turn * 2.1)),
    brake: !offroad && Math.abs(turn) > (rival ? 0.72 : 0.62) && car.speed > (rival ? 23 : 21),
  };
}

function advanceCar(car: KartCar, input: KartInput, dt: number, elapsed: number, laps: number): void {
  if (car.finishedAt !== null) return;
  const performance = car.profile?.performance ?? NEUTRAL_PERFORMANCE;
  const spinning = car.spinUntil > elapsed;
  const throttle = spinning ? 0 : Math.max(-1, Math.min(1, input.throttle));
  const offroad = Math.max(0, Math.min(1, (trackDistance(car.x, car.z) - ROAD_LIMIT) / 4));
  const boosted = car.boostUntil > elapsed;
  const slowed = car.slowUntil > elapsed && car.shieldUntil <= elapsed;
  // Derrapagem: freio + curva em velocidade carrega um mini-turbo; soltar o freio libera.
  const drifting = !spinning && input.brake && Math.abs(input.steer) > 0.25 && car.speed > 12;
  if (drifting) {
    car.driftCharge = Math.min(1, car.driftCharge + dt * 0.9);
  } else {
    if (!spinning && !input.brake && car.driftCharge > 0.05) {
      car.boostUntil = Math.max(car.boostUntil, elapsed + 0.3 + car.driftCharge * 0.9);
      car.speed = Math.min(car.speed + 1.5 + car.driftCharge * 2, (performance.topSpeed + 7));
    }
    car.driftCharge = Math.max(0, car.driftCharge - dt * 1.6);
  }
  car.speed += (throttle >= 0 ? (performance.acceleration - 9 * offroad / performance.offroadGrip) * (boosted ? 1.55 : 1) : 14) * throttle * dt;
  const drag = 3.2 + 9 * offroad / performance.offroadGrip + (input.brake && !drifting ? performance.braking : 0) + (slowed ? 3 : 0) + (spinning ? 9 : 0);
  car.speed = Math.sign(car.speed) * Math.max(0, Math.abs(car.speed) - drag * dt);
  car.speed = Math.max(-10, Math.min((performance.topSpeed + (boosted ? 7 : 0) - 14 * offroad / performance.offroadGrip) * (slowed ? 0.68 : 1), car.speed));
  const grip = offroad > 0 ? performance.offroadGrip : performance.roadGrip;
  const steer = spinning ? 0 : Math.max(-1, Math.min(1, input.steer));
  car.heading -= steer * performance.handling * (drifting ? 1.12 : 1) * grip * dt * Math.min(1, Math.abs(car.speed) / 7) * Math.sign(car.speed || 1);
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
  if (state.countdown > 0) {
    state.countdown = Math.max(0, state.countdown - dt);
    return;
  }
  state.elapsed += dt;
  if (state.itemsEnabled) updateItemBoxes(state);
  state.cars.forEach((car, id) => {
    if (id > 0 && state.elapsed > 4 && car.ability && state.elapsed >= car.abilityReadyAt) {
      const player = state.cars[0]!;
      const nearPlayer = Math.hypot(player.x - car.x, player.z - car.z) < 17;
      if (car.ability.kind === 'boost' && car.speed > 12 || car.ability.kind === 'pulse' && nearPlayer || car.ability.kind === 'shield' && nearPlayer) {
        activateKartAbility(state, id);
      }
    }
    if (id > 0) maybeUseNpcItem(state, car);
    advanceCar(car, id === 0 ? input : opponentInput(car, id, id === state.rivalId), dt, state.elapsed, state.laps);
  });
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
      a.speed = a.shieldUntil > state.elapsed ? a.speed : a.speed * 0.86 + mean * 0.14;
      b.speed = b.shieldUntil > state.elapsed ? b.speed : b.speed * 0.86 + mean * 0.14;
      resolveBarrier(a);
      resolveBarrier(b);
    }
  }
  if (state.itemsEnabled) {
    updateProjectiles(state, dt);
    updateHazards(state);
  }
}

export function kartPlacementOrder(state: KartRaceState): number[] {
  return state.cars.map((car) => car.id).sort((a, b) => kartPosition(state, a) - kartPosition(state, b));
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
