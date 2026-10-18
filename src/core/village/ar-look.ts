export interface ArOrientation { alpha: number; beta: number }
export interface ArLook { x: number; y: number }

function signedAngleDelta(next: number, base: number): number {
  return ((next - base + 540) % 360) - 180;
}

/** Converte a rotação do aparelho em um deslocamento limitado da janela da Vila (em blocos). */
export function arLookFromOrientation(current: ArOrientation, origin: ArOrientation): ArLook {
  const yaw = signedAngleDelta(current.alpha, origin.alpha);
  const pitch = signedAngleDelta(current.beta, origin.beta);
  return {
    x: yaw === 0 ? 0 : Math.max(-8, Math.min(8, -yaw * 0.12)),
    y: Math.max(-5, Math.min(5, pitch * 0.08)),
  };
}
