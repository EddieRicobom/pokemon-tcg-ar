/** Indica se um quadro pode ser processado sem alterar a cadência de relógio do navegador. */
export function isFrameDue(nowMs: number, lastFrameMs: number, maxFps: number): boolean {
  if (!Number.isFinite(maxFps) || maxFps <= 0) return true;
  return nowMs - lastFrameMs >= 1000 / maxFps - 0.5;
}
