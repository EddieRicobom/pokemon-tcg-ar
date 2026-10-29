/** Quatro poses curtas que dão leitura física a um golpe sem criar simulações por personagem. */
export type CombatMotionPhase = 'idle' | 'windup' | 'impact' | 'follow-through' | 'settle';

export interface CombatMotion {
  phase: CombatMotionPhase;
  scaleX: number;
  scaleY: number;
  /** Deslocamento normalizado na direção do golpe: negativo prepara, positivo descarrega. */
  lunge: number;
  rotation: number;
}

const IDLE: CombatMotion = { phase: 'idle', scaleX: 1, scaleY: 1, lunge: 0, rotation: 0 };

/**
 * Leitura visual de um ataque. É deliberadamente só matemática: cada modo pode aplicá-la ao seu canvas/DOM/Three
 * sem acumular objetos, partículas ou timers extras.
 */
export function combatMotion(elapsedMs: number): CombatMotion {
  if (elapsedMs < 0 || elapsedMs >= 430) return IDLE;
  if (elapsedMs < 90) {
    const t = elapsedMs / 90;
    return { phase: 'windup', scaleX: 1 - t * 0.1, scaleY: 1 + t * 0.06, lunge: -t * 0.18, rotation: -t * 0.08 };
  }
  if (elapsedMs < 145) return { phase: 'impact', scaleX: 1.13, scaleY: 0.88, lunge: 0.28, rotation: 0.12 };
  if (elapsedMs < 275) {
    const t = (elapsedMs - 145) / 130;
    return { phase: 'follow-through', scaleX: 1.1 - t * 0.05, scaleY: 0.92 + t * 0.04, lunge: 0.28 - t * 0.12, rotation: 0.12 * (1 - t) };
  }
  const t = (elapsedMs - 275) / 155;
  return { phase: 'settle', scaleX: 1.05 - t * 0.05, scaleY: 0.96 + t * 0.04, lunge: 0.16 * (1 - t), rotation: 0 };
}
