/** Resultado de um desejo pago na Fonte da praça. */
export interface FountainWish {
  coinsAfter: number;
  /** A cena lendária só é liberada pelo primeiro desejo pago do save. */
  showHoOhCutscene: boolean;
}

/** Resolve o custo e o gatilho da cutscene sem interface ou efeitos colaterais. */
export function wishAtFountain(coins: number, hoOhWishSeen: boolean): FountainWish | null {
  if (!Number.isInteger(coins) || coins < 1) return null;
  return { coinsAfter: coins - 1, showHoOhCutscene: !hoOhWishSeen };
}
