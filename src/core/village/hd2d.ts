/** Parâmetros leves de profundidade de campo para a Vila em estilo 2D-HD. */
export interface Hd2dDepthStyle {
  blurPx: number;
  opacity: number;
  brightness: number;
}

/**
 * Quanto o eixo do chão encolhe no modo 2D-HD (câmera quase deitada).
 * Prédios e personagens não usam esta escala: só a base onde se apoiam.
 */
export const HD2D_GROUND_TILT = 0.28;

/** Pixel art continua nítida sem renderizar quatro vezes mais pixels em telas Retina. */
export const HD2D_MAX_DPR = 1.25;
/** Em automático, o 2D-HD mantém a resposta da Vila no ritmo de 60 Hz. */
export const HD2D_AUTO_FPS = 60;

/** A Vila normal preserva até 2×; o acabamento 2D-HD prioriza fluidez no celular. */
export function hd2dPixelRatio(devicePixelRatio: number, enabled: boolean): number {
  const safeDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(enabled ? HD2D_MAX_DPR : 2, safeDpr);
}

/** O Modo Rotom desliga o 2D-HD antes deste ponto; com ele ativo, automático é 60 FPS. */
export function hd2dFrameRate(configuredFps: number, enabled: boolean): number {
  return enabled && (!Number.isFinite(configuredFps) || configuredFps <= 0) ? HD2D_AUTO_FPS : configuredFps;
}

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

/** Desfoque de canvas só compensa quando ele será realmente perceptível. */
export function hd2dNeedsCanvasFilter(style: Hd2dDepthStyle): boolean {
  return style.blurPx >= 0.5;
}
