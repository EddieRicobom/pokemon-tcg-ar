/**
 * Luz cinematográfica da Torre: quanto a cena escurece e brilha conforme a corrida avança. Lógica pura; o desenho fica em
 * `village/survivor-cinema-art.ts`. Aos 20 minutos de progresso a intensidade chega ao máximo e a noite vira vermelho-sangue.
 * Os limites por quadro (`glows`, `shadows`, `embers`) seguram o custo: nada aqui cresce com o número de inimigos.
 */

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

const FINALE_MS = 20 * 60_000;
const LEVEL_CAP = 40;

export interface CinemaInput {
  /** Tempo de corrida já na escala normal (`survivorProgressMs`). */
  progressMs: number;
  level: number;
  /** Chefão, treinador ou lendário em campo: a cena pesa um pouco mais. */
  bossOnField: boolean;
}

/** Intensidade de 0 a 1: o tempo manda, o nível ajuda. */
export function cinemaPower({ progressMs, level, bossOnField }: CinemaInput): number {
  const time = clamp01(progressMs / FINALE_MS);
  const growth = clamp01((level - 1) / LEVEL_CAP);
  return clamp01(0.72 * time + 0.28 * growth + (bossOnField ? 0.08 : 0));
}

export interface Crater {
  x: number;
  y: number;
  r: number;
  bornMs: number;
}

/** No máximo tantas crateras ao mesmo tempo; a mais antiga dá lugar à nova. */
export const MAX_CRATERS = 120;

/** Marca o chão para o resto da corrida: o tamanho cresce com a força da corrida, e a lista nunca passa do teto. */
export function addCrater(list: Crater[], x: number, y: number, blastRadius: number, power: number, nowMs: number): void {
  if (list.length >= MAX_CRATERS) list.shift();
  list.push({ x, y, r: Math.min(90, blastRadius * (0.45 + 0.45 * clamp01(power))), bornMs: nowMs });
}

export interface CinemaLook {
  /** Opacidade da escuridão nas bordas. */
  dark: number;
  /** Raio (unidades) da área clara em volta do Pokémon. */
  lightRadius: number;
  /** Cor da noite: azul no começo, vermelho-sangue no fim. */
  tint: readonly [number, number, number];
  /** Brilhos desenhados por quadro. */
  glows: number;
  /** Sombras projetadas por quadro e comprimento delas. */
  shadows: number;
  shadowLength: number;
  /** Raios de luz em volta do Pokémon (0 = sem raios) e a força deles. */
  rays: number;
  rayAlpha: number;
  /** Fagulhas subindo pela tela. */
  embers: number;
  /** A reta final: a escuridão pulsa. */
  finale: boolean;
}

const NIGHT: readonly [number, number, number] = [8, 14, 42];
const BLOOD: readonly [number, number, number] = [46, 4, 14];

/** O visual para esta intensidade. `lite` corta os limites quando o aparelho está sofrendo. */
export function cinemaLook(power: number, lite: boolean): CinemaLook {
  const p = clamp01(power);
  const budget = lite ? 0.5 : 1;
  const blood = clamp01((p - 0.5) / 0.5);
  return {
    dark: 0.12 + 0.3 * p,
    lightRadius: 230 - 50 * p,
    tint: [
      Math.round(NIGHT[0] + (BLOOD[0] - NIGHT[0]) * blood),
      Math.round(NIGHT[1] + (BLOOD[1] - NIGHT[1]) * blood),
      Math.round(NIGHT[2] + (BLOOD[2] - NIGHT[2]) * blood),
    ],
    glows: Math.round((10 + 26 * p) * budget),
    shadows: Math.round((12 + 28 * p) * budget),
    shadowLength: 6 + 14 * p,
    rays: p < 0.85 ? 0 : lite ? 2 : 4,
    rayAlpha: p < 0.85 ? 0 : 0.06,
    embers: Math.round(30 * clamp01((p - 0.2) / 0.8) * budget),
    finale: p >= 0.92,
  };
}
