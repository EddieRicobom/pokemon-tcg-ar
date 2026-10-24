/** Direção da folha local usada para a animação de caminhada da Torre. */
export type SurvivorSpriteDirection = 'up' | 'right' | 'down' | 'left';

/**
 * Escolhe a pose cardinal pelo movimento predominante. Empates diagonais ficam na
 * horizontal para combinar com o `facing` histórico da Torre.
 */
export function survivorSpriteDirection(dx: number, dy: number, fallback: SurvivorSpriteDirection = 'down'): SurvivorSpriteDirection {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001)) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

/** Última frente do jogador quando está parado, preservando a direção do ataque. */
export function survivorSpriteDirectionFromAngle(angle: number | undefined, facing: -1 | 1): SurvivorSpriteDirection {
  if (angle === undefined || !Number.isFinite(angle)) return facing < 0 ? 'left' : 'right';
  return survivorSpriteDirection(Math.cos(angle), Math.sin(angle), facing < 0 ? 'left' : 'right');
}
