/** Copa de Kart em andamento, guardada no aparelho para retomar de onde parou. */

export interface KartCupProgress {
  /** Próxima etapa (1 ou 2); 0 significa que a Copa acabou de começar. */
  round: number;
  scores: number[];
  lastOrder: number[];
}

const KEY = 'tcg-ar-kart-cup-v1';

function validScores(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 4 && value.every((n) => Number.isFinite(n));
}

export function readKartCup(): KartCupProgress | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<KartCupProgress> | null;
    if (!raw) return null;
    const round = Number(raw.round);
    if (!Number.isInteger(round) || round < 0 || round > 2) return null;
    const scores = raw.scores;
    const lastOrder = raw.lastOrder;
    if (!validScores(scores) || !Array.isArray(lastOrder)) return null;
    return { round, scores: scores.map((n) => Math.max(0, Math.floor(n))), lastOrder: lastOrder.filter((n) => Number.isInteger(n)) };
  } catch {
    return null;
  }
}

export function saveKartCup(progress: KartCupProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // Só não permite retomar.
  }
}

export function clearKartCup(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nada a limpar.
  }
}
