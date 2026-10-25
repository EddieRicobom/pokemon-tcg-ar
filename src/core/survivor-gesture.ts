/**
 * Gesto de toque usado pelo BONK. Mantê-lo fora do componente permite testar a
 * diferença entre um toque curto e o arrasto que controla o analógico.
 */
export const BONK_DOUBLE_TAP_INTERVAL_MS = 400;
export const BONK_TAP_MAX_DURATION_MS = 260;
export const BONK_TAP_MAX_MOVEMENT_PX = 18;
export const BONK_DOUBLE_TAP_MAX_DISTANCE_PX = 72;

export interface SurvivorPointerSample {
  x: number;
  y: number;
  at: number;
}

/** Um toque curto não pode disputar o gesto com o arrasto do analógico. */
export function isBonkTap(start: SurvivorPointerSample, end: SurvivorPointerSample): boolean {
  return end.at >= start.at
    && end.at - start.at <= BONK_TAP_MAX_DURATION_MS
    && Math.hypot(end.x - start.x, end.y - start.y) <= BONK_TAP_MAX_MOVEMENT_PX;
}

/** Duas batidas próximas no tempo e no mesmo ponto aproximado contam como pulo. */
export function isBonkDoubleTap(previous: SurvivorPointerSample | null, next: SurvivorPointerSample): boolean {
  return previous !== null
    && next.at >= previous.at
    && next.at - previous.at <= BONK_DOUBLE_TAP_INTERVAL_MS
    && Math.hypot(next.x - previous.x, next.y - previous.y) <= BONK_DOUBLE_TAP_MAX_DISTANCE_PX;
}
