/** Viewport da Torre: `zoom` maior mostra menos unidades do mapa e aproxima a câmera. */
export function fitSurvivorViewport(
  width: number,
  height: number,
  arenaWidth: number,
  arenaHeight: number,
  baseShortSide = 360,
  zoom = 1.5,
): { w: number; h: number } {
  if (![width, height, arenaWidth, arenaHeight, baseShortSide, zoom].every(Number.isFinite)
    || width <= 0 || height <= 0 || arenaWidth <= 0 || arenaHeight <= 0 || baseShortSide <= 0 || zoom <= 0) {
    return { w: 0, h: 0 };
  }
  const scale = baseShortSide / zoom / Math.min(width, height);
  return {
    w: Math.round(Math.min(arenaWidth, width * scale)),
    h: Math.round(Math.min(arenaHeight, height * scale)),
  };
}
