/**
 * O tutorial da primeira luta: duas dicas curtas (Esquiva e Especial), uma de cada vez, na hora em que servem. Não pausa a
 * luta nem cobre o campo; a tela só mostra o texto na faixa de avisos e acende o botão. Quem já usou o botão não recebe a dica.
 */

export type ArenaCoachStep = 'dodge' | 'special';

/** O que a tela conta a cada atualização. */
export interface ArenaCoachInput {
  timeMs: number;
  /** Energia do Especial de quem está em campo (0–1). */
  energy: number;
  /** Há um golpe do rival marcado na arena agora. */
  danger: boolean;
  /** A pessoa esquivou desde a última atualização. */
  dodged: boolean;
  /** A pessoa lançou o Especial desde a última atualização. */
  usedSpecial: boolean;
  /** A luta acabou. */
  over: boolean;
}

/** Sem nenhum golpe marcado, a dica da esquiva vem assim mesmo depois deste tempo de luta. */
export const COACH_DODGE_AFTER_MS = 6000;
/** Quanto cada dica fica no ar, se o botão não for usado. */
export const COACH_TIP_MS = 6500;

export const COACH_TEXT: Readonly<Record<ArenaCoachStep, string>> = {
  dodge: 'Golpe vindo? Toque em Esquiva 💨 para atravessar.',
  special: 'Barra cheia! Toque em Especial ✨ para lançar.',
};

export class ArenaCoach {
  private dodgeDone: boolean;
  private specialDone: boolean;
  private showing: ArenaCoachStep | null = null;
  private since = 0;

  /** `alreadySeen`: a pessoa já passou pela primeira luta, então nada aparece. */
  constructor(alreadySeen: boolean) {
    this.dodgeDone = alreadySeen;
    this.specialDone = alreadySeen;
  }

  /** As duas dicas já saíram (ou foram dispensadas por quem usou o botão antes). */
  get done(): boolean {
    return this.dodgeDone && this.specialDone;
  }

  /** Atualiza e devolve a dica que deve estar na tela agora. */
  update(input: ArenaCoachInput): ArenaCoachStep | null {
    if (input.dodged) this.dodgeDone = true;
    if (input.usedSpecial) this.specialDone = true;
    if (input.over) {
      this.showing = null;
      return null;
    }
    if (this.showing) {
      const answered = this.showing === 'dodge' ? this.dodgeDone : this.specialDone;
      const expired = input.timeMs - this.since >= COACH_TIP_MS;
      if (!answered && !expired) return this.showing;
      if (this.showing === 'dodge') this.dodgeDone = true;
      else this.specialDone = true;
      this.showing = null;
    }
    const next: ArenaCoachStep | null = !this.dodgeDone && (input.danger || input.timeMs >= COACH_DODGE_AFTER_MS)
      ? 'dodge'
      : !this.specialDone && input.energy >= 1 ? 'special' : null;
    if (next) {
      this.showing = next;
      this.since = input.timeMs;
    }
    return next;
  }
}
