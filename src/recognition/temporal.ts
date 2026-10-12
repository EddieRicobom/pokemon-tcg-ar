import type { RecognitionResult } from './pipeline';

/**
 * Agregação temporal: a câmera produz vários quadros por segundo, então só confirmamos uma carta
 * quando ela aparece de forma repetida. Evita trocar de carta por um quadro ruim (reflexo, borrão).
 * Ideia do pokeum (MIT); os números abaixo são nossos e simples de explicar.
 */
export interface TemporalOptions {
  /** Quadros recentes considerados. */
  window?: number;
  /** Votos mínimos da mesma carta dentro da janela. */
  minVotes?: number;
  /** Confiança que dispensa esperar por mais quadros. */
  instantConfidence?: number;
}

export interface TemporalState {
  confirmedId: string | null;
  candidateId: string | null;
  votes: number;
  framesSeen: number;
}

export class TemporalAggregator {
  private readonly window: number;
  private readonly minVotes: number;
  private readonly instantConfidence: number;
  private history: (string | null)[] = [];

  constructor(options: TemporalOptions = {}) {
    this.window = options.window ?? 6;
    this.minVotes = options.minVotes ?? 2;
    this.instantConfidence = options.instantConfidence ?? 0.88;
  }

  /** Registra um quadro. Devolve o id confirmado (ou null enquanto não há votos suficientes). */
  push(result: RecognitionResult): TemporalState {
    const id = result.status === 'identified' && result.card ? result.card.id : null;
    this.history.push(id);
    if (this.history.length > this.window) this.history.shift();

    const counts = new Map<string, number>();
    for (const entry of this.history) if (entry) counts.set(entry, (counts.get(entry) ?? 0) + 1);
    let candidateId: string | null = null;
    let votes = 0;
    for (const [key, count] of counts) {
      if (count > votes) {
        votes = count;
        candidateId = key;
      }
    }
    const instant = id !== null && result.confidence >= this.instantConfidence && result.margin >= 0.2;
    const confirmed = candidateId !== null && (votes >= this.minVotes || (instant && candidateId === id));
    return { confirmedId: confirmed ? candidateId : null, candidateId, votes, framesSeen: this.history.length };
  }

  reset(): void {
    this.history = [];
  }
}
