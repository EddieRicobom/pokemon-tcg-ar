/**
 * O céu do Coliseu, sem nada de Three.js: a cor do degradê (CSS, atrás do canvas transparente), a luz que cai na cena e
 * as estrelas, conforme a hora do aparelho e o clima. É só conta com cores: não custa nada por quadro.
 */

type Rgb = readonly [number, number, number];

interface SkyKey {
  hour: number;
  top: Rgb;
  mid: Rgb;
  low: Rgb;
  ambient: Rgb;
  stars: number;
}

const KEYS: readonly SkyKey[] = [
  { hour: 0, top: [10, 14, 44], mid: [24, 34, 84], low: [52, 62, 116], ambient: [0.62, 0.68, 0.9], stars: 1 },
  { hour: 4.5, top: [14, 18, 54], mid: [36, 44, 100], low: [72, 74, 132], ambient: [0.64, 0.69, 0.9], stars: 0.9 },
  { hour: 6, top: [52, 66, 138], mid: [190, 130, 150], low: [250, 180, 120], ambient: [0.86, 0.78, 0.82], stars: 0.15 },
  { hour: 8, top: [62, 128, 216], mid: [150, 198, 240], low: [244, 224, 180], ambient: [0.98, 0.96, 0.94], stars: 0 },
  { hour: 13, top: [44, 122, 228], mid: [126, 188, 244], low: [214, 236, 252], ambient: [1, 1, 1], stars: 0 },
  { hour: 17, top: [58, 96, 182], mid: [226, 164, 116], low: [250, 196, 124], ambient: [1.03, 0.93, 0.8], stars: 0 },
  { hour: 19, top: [42, 54, 124], mid: [150, 104, 160], low: [240, 150, 104], ambient: [0.8, 0.72, 0.82], stars: 0.35 },
  { hour: 21, top: [14, 18, 56], mid: [32, 40, 96], low: [64, 66, 124], ambient: [0.64, 0.68, 0.9], stars: 0.95 },
];

export interface SkyLook {
  top: string;
  mid: string;
  low: string;
  /** Opacidade das estrelas (0 a 1). */
  stars: number;
  /** Multiplicador de luz para os sprites e o cenário. */
  ambient: readonly [number, number, number];
  /** 0 de dia, 1 de noite: acende o brilho das tochas e deixa os Pokémon com sono. */
  night: number;
}

function mixRgb(a: Rgb, b: Rgb, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Nuvem puxa a cor para o cinza; chuva e nuvem escurecem. */
function overcast(c: Rgb, cloud: number, rain: number): string {
  const luma = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  const dim = (1 - 0.12 * cloud) * (1 - 0.32 * rain);
  const part = (v: number) => Math.round((v + (luma - v) * 0.78 * cloud) * dim);
  return `rgb(${part(c[0])}, ${part(c[1])}, ${part(c[2])})`;
}

/** Como está o céu em `hour` (0 a 24, com fração), com `cloud` e `rain` de 0 a 1. */
export function skyFor(hour: number, cloud = 0, rain = 0): SkyLook {
  const h = ((Number.isFinite(hour) ? hour : 12) % 24 + 24) % 24;
  let index = KEYS.length - 1;
  while (index > 0 && KEYS[index]!.hour > h) index--;
  const from = KEYS[index]!;
  const to = KEYS[(index + 1) % KEYS.length]!;
  const span = (to.hour <= from.hour ? to.hour + 24 : to.hour) - from.hour;
  const t = span > 0 ? (h - from.hour) / span : 0;
  const clouds = Math.min(1, Math.max(0, cloud));
  const wet = Math.min(1, Math.max(0, rain));
  const stars = (from.stars + (to.stars - from.stars) * t);
  return {
    top: overcast(mixRgb(from.top, to.top, t), clouds, wet),
    mid: overcast(mixRgb(from.mid, to.mid, t), clouds, wet),
    low: overcast(mixRgb(from.low, to.low, t), clouds, wet),
    // Céu fechado esconde as estrelas, mas continua sendo noite.
    stars: stars * (1 - clouds),
    ambient: mixRgb(from.ambient, to.ambient, t),
    night: stars,
  };
}

/** A hora de `date` com a fração dos minutos. */
export function hourOf(date: Date): number {
  return date.getHours() + date.getMinutes() / 60;
}
