/** Parâmetros leves de profundidade de campo para a Vila em estilo 2D-HD. */
export interface Hd2dDepthStyle {
  blurPx: number;
  opacity: number;
  brightness: number;
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
