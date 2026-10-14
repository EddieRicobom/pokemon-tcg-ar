/**
 * Sombra suave no chão da carta, sob o Pokémon (matemática pura; a textura e os planos ficam em `card-sprite.ts`).
 *
 * A sombra é uma elipse com borda borrada (queda gaussiana) no plano da carta, centrada na projeção do sprite no chão.
 * Um brilho fino e claro em volta dela pulsa devagar. Ambos saem com `SpriteLayout.showShadow = false`.
 */

import { clampLayout } from './anchor';
import type { SpriteLayout } from './anchor';

/** Opacidade da sombra com o Pokémon encostado na carta; some aos poucos quando ele sobe. */
export const SHADOW_OPACITY = 0.7;
/** Altura (larguras de carta) a partir da qual a sombra já está bem fraca. */
const FADE_LIFT = 0.6;

/** Transparência da sombra em (u, v) ∈ [−1, 1]²: máxima no centro, ~0 na borda (blur leve). */
export function groundShadowAlpha(u: number, v: number): number {
  const r2 = u * u + v * v;
  if (r2 >= 1) return 0;
  // Gaussiana cortada com um desconto para chegar exatamente a 0 em r = 1 (sem borda dura).
  const edge = Math.exp(-3.4);
  return Math.max(0, (Math.exp(-3.4 * r2) - edge) / (1 - edge));
}

/** Anel fino e borrado perto da borda (r ≈ 0,8), para o brilho em volta da sombra. */
export function groundGlowAlpha(u: number, v: number): number {
  const r = Math.hypot(u, v);
  if (r >= 1) return 0;
  const d = (r - 0.78) / 0.13;
  return Math.exp(-d * d) * (1 - r * r * 0.2);
}

export interface GroundShadowSize {
  /** Largura (eixo do sprite) e profundidade (para onde ele olha), em larguras de carta. */
  width: number;
  depth: number;
  opacity: number;
}

/**
 * Tamanho da sombra: acompanha a largura do sprite e a faixa de chão que o sprite inclinado cobre (a "pegada"),
 * mais uma folga para o blur aparecer dos lados.
 */
export function groundShadowSize(layout: SpriteLayout, spriteAspect: number): GroundShadowSize {
  const l = clampLayout(layout);
  const aspect = Number.isFinite(spriteAspect) && spriteAspect > 0 ? spriteAspect : 1;
  const spriteWidth = l.heightRatio * aspect;
  const width = Math.max(0.2, Math.min(1.6, spriteWidth * 0.95));
  const footprint = l.heightRatio * Math.sin(((l.tiltDeg ?? 0) * Math.PI) / 180);
  const depth = Math.max(0.12, footprint + width * 0.4);
  const fade = 1 - 0.6 * Math.min(1, l.lift / FADE_LIFT);
  return { width, depth, opacity: SHADOW_OPACITY * fade };
}
