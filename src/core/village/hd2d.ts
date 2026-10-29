/** Parâmetros leves de profundidade de campo para a Vila em estilo 2D-HD. */
export interface Hd2dDepthStyle {
  blurPx: number;
  opacity: number;
  brightness: number;
}

/** Quanto o eixo do chão encolhe no modo 2D-HD (câmera mais inclinada). */
export const HD2D_GROUND_TILT = 0.68;

/** Conversão entre o eixo do mapa e o chão projetado na tela. */
export function hd2dGroundProjection(y: number, tilt = HD2D_GROUND_TILT): { screenY: number; mapY: number } {
  const safeTilt = Number.isFinite(tilt) && tilt > 0 ? tilt : HD2D_GROUND_TILT;
  return { screenY: y * safeTilt, mapY: y / safeTilt };
}

/**
 * Cada objeto recebe o acabamento a partir da sua própria linha de apoio,
 * não a partir de um filtro aplicado ao mapa inteiro.
 */
export function hd2dDepthStyle(objectDepth: number, focusDepth: number): Hd2dDepthStyle {
  const distance = Math.abs(objectDepth - focusDepth);
  // Faixa central ampla: portas, placas e o personagem continuam legíveis.
  const beyondFocus = Math.max(0, distance - 3.5);
  return {
    blurPx: Math.min(1, beyondFocus * 0.13),
    opacity: Math.max(0.78, 1 - beyondFocus * 0.018),
    brightness: Math.max(0.86, 1 - beyondFocus * 0.014),
  };
}
