/** Passeio de cada Pokémon dentro da caixa (puro: o sorteio vem de fora, então é testável). */
export interface WanderState {
  /** Posição no chão, relativa ao centro da caixa (metros). */
  x: number;
  z: number;
  /** Destino atual. */
  tx: number;
  tz: number;
  /** Velocidade de caminhada (m/s) deste Pokémon. */
  speed: number;
  /** Tempo restante parado (ms). */
  pauseMs: number;
  /** Velocidade atual (m/s); 0 quando parado. */
  vx: number;
  vz: number;
  /** Fase do pulinho de caminhada. */
  hopPhase: number;
}

export type Rng = () => number;

const MARGIN = 0.9;

function between(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}

export function createWander(half: number, rng: Rng): WanderState {
  const limit = half * MARGIN;
  return {
    x: between(rng, -limit, limit),
    z: between(rng, -limit, limit),
    tx: 0,
    tz: 0,
    speed: between(rng, 0.12, 0.3),
    pauseMs: between(rng, 0, 1500),
    vx: 0,
    vz: 0,
    hopPhase: between(rng, 0, Math.PI * 2),
  };
}

/** Avança `dtMs` de tempo: anda até o destino, para um pouco, sorteia outro. Nunca sai da caixa. */
export function stepWander(state: WanderState, dtMs: number, half: number, rng: Rng): WanderState {
  const limit = half * MARGIN;
  const dt = Math.min(Math.max(dtMs, 0), 200) / 1000;
  if (state.pauseMs > 0) {
    state.pauseMs = Math.max(0, state.pauseMs - dt * 1000);
    state.vx = 0;
    state.vz = 0;
    if (state.pauseMs === 0) {
      state.tx = between(rng, -limit, limit);
      state.tz = between(rng, -limit, limit);
    }
  } else {
    const dx = state.tx - state.x;
    const dz = state.tz - state.z;
    const distance = Math.hypot(dx, dz);
    const step = state.speed * dt;
    if (distance <= Math.max(step, 0.03)) {
      state.x = state.tx;
      state.z = state.tz;
      state.vx = 0;
      state.vz = 0;
      state.pauseMs = between(rng, 800, 4000);
    } else {
      state.vx = (dx / distance) * state.speed;
      state.vz = (dz / distance) * state.speed;
      state.x += (dx / distance) * step;
      state.z += (dz / distance) * step;
      state.hopPhase += dt * 9;
    }
  }
  state.x = Math.min(limit, Math.max(-limit, state.x));
  state.z = Math.min(limit, Math.max(-limit, state.z));
  return state;
}

/** Afasta os que estão perto demais um do outro (empurra metade da sobreposição para cada lado). */
export function separate(states: WanderState[], minDistance: number, half: number): void {
  const limit = half * MARGIN;
  const minSq = minDistance * minDistance;
  const clamp = (v: number) => Math.min(limit, Math.max(-limit, v));
  for (let i = 0; i < states.length; i++) {
    const a = states[i]!;
    for (let j = i + 1; j < states.length; j++) {
      const b = states[j]!;
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      const distSq = dx * dx + dz * dz;
      // Roda a cada quadro para cada par: a maioria sai aqui, sem raiz quadrada.
      if (distSq >= minSq) continue;
      let distance = Math.sqrt(distSq);
      if (distance < 1e-6) {
        dx = 1;
        dz = 0;
        distance = 1;
      }
      const push = (minDistance - distance) / 2;
      const nx = dx / distance;
      const nz = dz / distance;
      a.x = clamp(a.x - nx * push);
      a.z = clamp(a.z - nz * push);
      b.x = clamp(b.x + nx * push);
      b.z = clamp(b.z + nz * push);
    }
  }
}

/** Anda em linha reta até (tx, tz) a `speed` m/s, sem passar do ponto. Devolve true ao chegar. */
export function stepToward(state: WanderState, tx: number, tz: number, dtMs: number, speed: number): boolean {
  const dt = Math.min(Math.max(dtMs, 0), 200) / 1000;
  const dx = tx - state.x;
  const dz = tz - state.z;
  const distance = Math.hypot(dx, dz);
  const step = speed * dt;
  if (distance <= Math.max(step, 0.01)) {
    state.x = tx;
    state.z = tz;
    state.vx = 0;
    state.vz = 0;
    return true;
  }
  state.vx = (dx / distance) * speed;
  state.vz = (dz / distance) * speed;
  state.x += (dx / distance) * step;
  state.z += (dz / distance) * step;
  state.hopPhase += dt * 9;
  return false;
}
