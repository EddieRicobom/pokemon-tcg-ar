import type { Rng } from './battle';

/**
 * Clima da Caixa, sem nada de Three.js: um ciclo sol → nublado → chuva/neve → nublado → sol, com transições suaves.
 * O estado diz quanto há de nuvem, chuva e neve agora e quanto o chão já acumulou (poças e neve no chão), que sobem e
 * descem devagar (a poça seca no sol, a neve derrete com chuva e sol).
 */

export type WeatherKind = 'sol' | 'nublado' | 'chuva' | 'neve';
export const WEATHER_KINDS: readonly WeatherKind[] = ['sol', 'nublado', 'chuva', 'neve'];
export const WEATHER_LABELS_PT: Record<WeatherKind, string> = { sol: 'Sol', nublado: 'Nublado', chuva: 'Chuva', neve: 'Neve' };
export const WEATHER_EMOJI: Record<WeatherKind, string> = { sol: '☀️', nublado: '☁️', chuva: '🌧️', neve: '❄️' };

/** Escolha do jogador: desligado, o ciclo automático ou um clima fixo. */
export type WeatherMode = 'off' | 'ciclo' | WeatherKind;
export const WEATHER_MODES: readonly WeatherMode[] = ['off', 'ciclo', 'sol', 'nublado', 'chuva', 'neve'];
export const WEATHER_MODE_LABELS_PT: Record<WeatherMode, string> = { off: 'Desligado', ciclo: 'Ciclo', ...WEATHER_LABELS_PT };

export function normalizeWeatherMode(value: unknown): WeatherMode {
  return typeof value === 'string' && (WEATHER_MODES as readonly string[]).includes(value) ? (value as WeatherMode) : 'ciclo';
}

interface Targets {
  cloud: number;
  rain: number;
  snow: number;
}

const TARGETS: Record<WeatherKind, Targets> = {
  sol: { cloud: 0.15, rain: 0, snow: 0 },
  nublado: { cloud: 0.75, rain: 0, snow: 0 },
  chuva: { cloud: 1, rain: 1, snow: 0 },
  neve: { cloud: 0.85, rain: 0, snow: 1 },
};

/** Quanto dura cada clima no ciclo (segundos, mínimo e máximo). */
export const DURATION_S: Record<WeatherKind, [number, number]> = { sol: [50, 110], nublado: [30, 70], chuva: [40, 90], neve: [40, 90] };

export interface WeatherState {
  kind: WeatherKind;
  /** Segundos que faltam para mudar (no ciclo). */
  left: number;
  /** 0 a 1, suavizados em direção ao clima atual. */
  cloud: number;
  rain: number;
  snow: number;
  /** 0 a 1: o quanto o chão está molhado (as poças crescem nas partes baixas primeiro). */
  wet: number;
  /** 0 a 1: neve acumulada no chão. */
  snowCover: number;
  /** Vento (m/s) no chão: empurra as sombras das nuvens, a chuva e a neve. */
  windX: number;
  windZ: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const between = (rng: Rng, [lo, hi]: [number, number]) => lo + rng() * (hi - lo);

export function createWeather(rng: Rng, kind: WeatherKind = 'sol'): WeatherState {
  const t = TARGETS[kind];
  const angle = rng() * Math.PI * 2;
  return { kind, left: between(rng, DURATION_S[kind]), cloud: t.cloud, rain: t.rain, snow: t.snow, wet: kind === 'chuva' ? 0.6 : 0, snowCover: kind === 'neve' ? 0.6 : 0, windX: Math.cos(angle) * 0.25, windZ: Math.sin(angle) * 0.25 };
}

/** Próximo clima do ciclo: depois do sol vem nuvem; nuvem vira chuva, neve ou volta ao sol; chuva e neve voltam à nuvem. */
export function nextKind(current: WeatherKind, rng: Rng): WeatherKind {
  const r = rng();
  switch (current) {
    case 'sol':
      return r < 0.8 ? 'nublado' : 'sol';
    case 'nublado':
      return r < 0.45 ? 'chuva' : r < 0.7 ? 'neve' : 'sol';
    default:
      return 'nublado';
  }
}

/** Taxas por segundo. */
const EASE = 0.12;
const WET_RISE = 0.04;
const WET_DRY = 0.012;
const SNOW_RISE = 0.03;
const SNOW_MELT = 0.02;

/**
 * Avança `dt` segundos. Com `fixed` o clima não muda sozinho (o jogador escolheu um); sem ele, o ciclo segue.
 * Muda o estado e devolve o mesmo objeto.
 */
export function stepWeather(state: WeatherState, dt: number, rng: Rng, fixed: WeatherKind | null = null): WeatherState {
  const step = Math.max(0, Math.min(1, dt));
  if (fixed) {
    state.kind = fixed;
  } else {
    state.left -= step;
    if (state.left <= 0) {
      state.kind = nextKind(state.kind, rng);
      state.left = between(rng, DURATION_S[state.kind]);
      // O vento muda um pouco a cada clima.
      const angle = Math.atan2(state.windZ, state.windX) + (rng() - 0.5) * 1.2;
      const speed = state.kind === 'chuva' ? 0.45 : state.kind === 'neve' ? 0.2 : 0.25;
      state.windX = Math.cos(angle) * speed;
      state.windZ = Math.sin(angle) * speed;
    }
  }
  const t = TARGETS[state.kind];
  const k = 1 - Math.exp(-EASE * step);
  state.cloud += (t.cloud - state.cloud) * k;
  state.rain += (t.rain - state.rain) * k;
  state.snow += (t.snow - state.snow) * k;
  // Poças: enchem com a chuva; secam devagar, mais rápido no sol (nuvens poucas). Neve no chão: acumula e derrete.
  state.wet = clamp01(state.wet + (state.rain * WET_RISE - (1 - state.rain) * WET_DRY * (1.4 - state.cloud)) * step);
  const melt = SNOW_MELT * (state.rain * 2 + (state.kind === 'sol' ? 1.5 : state.kind === 'neve' ? 0 : 0.4));
  state.snowCover = clamp01(state.snowCover + (state.snow * SNOW_RISE - melt) * step);
  return state;
}

/** Cor (multiplicador RGB) da luz do clima: nublado acinzenta, chuva escurece e azula, neve clareia e esfria. */
export function weatherTint(state: Pick<WeatherState, 'cloud' | 'rain' | 'snow'>): [number, number, number] {
  const gray = 1 - 0.18 * state.cloud;
  const rain = 1 - 0.18 * state.rain;
  const r = gray * rain * (1 - 0.04 * state.snow);
  const g = gray * rain * (1 + 0.0 * state.snow);
  const b = gray * (1 - 0.05 * state.rain) * (1 + 0.06 * state.snow);
  return [r, g, b];
}

/** Ruído de valor suave e repetível (0 a 1) em (x, y), com período `period` (para a textura emendar sem costura). */
export function tileNoise(x: number, y: number, period: number, seed: number): number {
  const hash = (ix: number, iy: number) => {
    const px = ((ix % period) + period) % period;
    const py = ((iy % period) + period) % period;
    let h = (px * 374761393 + py * 668265263 + seed * 2246822519) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * sx;
  const b = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * sx;
  return a + (b - a) * sy;
}

/** Nuvens: duas oitavas de ruído, e só o que passa do limiar vira sombra (nuvens com borda macia). Valor 0 a 1. */
export function cloudShadow(u: number, v: number, seed = 7): number {
  const n = 0.65 * tileNoise(u * 4, v * 4, 4, seed) + 0.35 * tileNoise(u * 8, v * 8, 8, seed + 1);
  return clamp01((n - 0.48) / 0.18);
}

/**
 * Mapa das poças: profundidade relativa (0 = mais alto, 1 = mais baixo) de cada ponto, com um pouco de ruído para a
 * borda não ser redonda. `wet` decide até onde a água chega: as baixadas enchem primeiro. Devolve 0 a 1 (opacidade).
 */
export function puddleAt(depth: number, noise: number, wet: number): number {
  if (wet <= 0.02) return 0;
  const level = depth * 0.75 + noise * 0.35;
  // Mesmo encharcado, só as partes mais baixas viram poça (cerca de um quarto do chão), nunca um lago.
  const edge = 1.08 - wet * 0.38;
  return clamp01((level - edge) / 0.06);
}

/** Neve no chão em um ponto (0 a 1): cobre aos poucos, com falhas que somem quando acumula bastante. */
export function snowAt(noise: number, cover: number): number {
  if (cover <= 0.01) return 0;
  return clamp01((cover * 1.3 - (1 - noise) * 0.55) / 0.25) * Math.min(1, cover * 2.2);
}
