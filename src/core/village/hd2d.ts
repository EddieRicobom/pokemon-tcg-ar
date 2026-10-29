/** Parâmetros leves de profundidade para a Vila em estilo 2D-HD. */
export interface Hd2dDepthStyle {
  opacity: number;
}

export interface Hd2dBounds { x: number; y: number; w: number; h: number }

/** Só fachadas à frente que cruzam a silhueta do treinador devem ficar transparentes. */
export function hd2dOccludes(bounds: Hd2dBounds, player: Hd2dBounds, baseY: number): boolean {
  return baseY > player.y + player.h && bounds.x < player.x + player.w
    && bounds.x + bounds.w > player.x && bounds.y < player.y + player.h
    && bounds.y + bounds.h > player.y;
}

/** A pilha inteira cobre no máximo 32% do treinador, mesmo com várias fachadas. */
export function hd2dOcclusionOpacity(layers: number): number {
  return layers > 0 ? 1 - 0.68 ** (1 / layers) : 1;
}

/**
 * Quanto o eixo do chão encolhe no modo 2D-HD (câmera quase deitada).
 * Prédios e personagens não usam esta escala: só a base onde se apoiam.
 */
export const HD2D_GROUND_TILT = 0.28;

/** Pixel art continua nítida sem renderizar quatro vezes mais pixels em telas Retina. */
export const HD2D_MAX_DPR = 1;
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
    opacity: Math.max(0.78, 1 - beyondFocus * 0.018),
  };
}
