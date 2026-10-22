/** Resultado de um desejo pago na Fonte da praça. */
export interface FountainWish {
  coinsAfter: number;
  wishesAfter: number;
  /** A cena lendária só é liberada pelo terceiro desejo pago do save. */
  showHoOhCutscene: boolean;
}

/** Resolve o custo e o gatilho da cutscene sem interface ou efeitos colaterais. */
export function wishAtFountain(coins: number, wishes: number): FountainWish | null {
  if (!Number.isInteger(coins) || coins < 1) return null;
  const wishesAfter = Math.max(0, Math.floor(wishes)) + 1;
  return { coinsAfter: coins - 1, wishesAfter, showHoOhCutscene: wishesAfter === 3 };
}
