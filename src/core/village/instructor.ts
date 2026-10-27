/**
 * Rotina do Instrutor do Dojô: de tempos em tempos ele caminha até a porta do Dojô, treina ali por
 * alguns segundos e depois volta à vida normal da Vila (descansa mais do que treina: ele é um morador comum, com casa, passeios e conversas). Só a máquina de estados; o caminhar fica no `village-game.ts`.
 */

export type InstructorPhase = 'rest' | 'walk' | 'train';
export interface InstructorShift {
  phase: InstructorPhase;
  /** Quando a fase atual termina (ms). */
  until: number;
  nextBubbleAt: number;
}

export const INSTRUCTOR_REST_MS = 75_000;
export const INSTRUCTOR_TRAIN_MS = 20_000;
/** Se não chegar ao Dojô neste tempo (caminho bloqueado), desiste e descansa. */
export const INSTRUCTOR_WALK_TIMEOUT_MS = 60_000;
export const INSTRUCTOR_BUBBLE_EVERY_MS = 2_200;

export const emptyInstructorShift = (): InstructorShift => ({ phase: 'rest', until: 0, nextBubbleAt: 0 });

export interface InstructorStep {
  /** 'free' = segue a rotina comum; 'walk' = vai até a porta; 'train' = fica parado treinando. */
  action: 'free' | 'walk' | 'train';
  bubble: '🥋' | '💥' | null;
}

/**
 * Avança a rotina. `spotOpen` diz se há onde treinar (a Torre ainda pode estar bloqueada pelo nível) e `arrived` se ele
 * já está parado à porta. Muta `shift`.
 */
export function stepInstructorShift(shift: InstructorShift, now: number, spotOpen: boolean, arrived: boolean): InstructorStep {
  if (!spotOpen) {
    shift.phase = 'rest';
    shift.until = now + INSTRUCTOR_REST_MS;
    return { action: 'free', bubble: null };
  }
  if (shift.phase === 'rest') {
    if (now < shift.until) return { action: 'free', bubble: null };
    shift.phase = 'walk';
    shift.until = now + INSTRUCTOR_WALK_TIMEOUT_MS;
  }
  if (shift.phase === 'walk') {
    if (arrived) {
      shift.phase = 'train';
      shift.until = now + INSTRUCTOR_TRAIN_MS;
      shift.nextBubbleAt = now;
    } else if (now >= shift.until) {
      shift.phase = 'rest';
      shift.until = now + INSTRUCTOR_REST_MS;
      return { action: 'free', bubble: null };
    } else return { action: 'walk', bubble: null };
  }
  if (now >= shift.until) {
    shift.phase = 'rest';
    shift.until = now + INSTRUCTOR_REST_MS;
    return { action: 'free', bubble: null };
  }
  let bubble: InstructorStep['bubble'] = null;
  if (now >= shift.nextBubbleAt) {
    bubble = Math.floor((shift.until - now) / INSTRUCTOR_BUBBLE_EVERY_MS) % 2 === 0 ? '🥋' : '💥';
    shift.nextBubbleAt = now + INSTRUCTOR_BUBBLE_EVERY_MS;
  }
  return { action: 'train', bubble };
}
