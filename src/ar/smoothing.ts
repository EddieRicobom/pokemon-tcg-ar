/**
 * Suavização adaptativa da pose: parada, filtra o tremor do rastreador (constante de tempo longa); em movimento
 * (o alvo está longe da pose desenhada), responde rápido para não ficar para trás. É a mesma ideia do filtro
 * "One Euro", escrita sobre o erro atual em vez da velocidade estimada.
 */
export const TAU_SLOW_MS = 100;
export const TAU_FAST_MS = 25;
/** Erro (em larguras de carta + 0,5 × radianos) a partir do qual vale a constante rápida. */
export const FAST_ERROR = 0.12;

export function adaptiveTauMs(errorCardWidths: number, angleRad: number): number {
  const e = Math.max(0, errorCardWidths) + 0.5 * Math.max(0, angleRad);
  const t = Math.min(1, e / FAST_ERROR);
  return TAU_SLOW_MS + (TAU_FAST_MS - TAU_SLOW_MS) * t;
}

/** Fator de aproximação (0..1) de um quadro de `dtMs` para a constante de tempo `tauMs`. */
export function smoothingAlpha(dtMs: number, tauMs: number): number {
  return 1 - Math.exp(-Math.max(0, dtMs) / Math.max(1, tauMs));
}
