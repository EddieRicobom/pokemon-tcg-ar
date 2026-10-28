/**
 * Cura dos suportes inimigos (`cura`) dividida entre os curadores em volta do alvo. Antes, cada curador curava 8% da
 * vida máxima de até 3 aliados a cada 5,2 s, sem limite por alvo: um grupo de curadores se curava em cadeia e ficava
 * imortal. Agora, quanto mais curadores alcançam o mesmo alvo, menor a parcela de cada um, e o total que um alvo recebe
 * por ciclo não passa do que um único curador daria.
 */

export const SUPPORT_HEAL_FRACTION = 0.08;
/** Raio (px) em que um curador alcança um alvo. */
export const SUPPORT_HEAL_RADIUS = 110;

/** Quantos curadores vivos alcançam o alvo (inclui o próprio curador, se ele estiver no raio). */
export function healersReaching(target: { x: number; y: number }, healers: readonly { x: number; y: number }[]): number {
  let n = 0;
  for (const h of healers) if (Math.hypot(h.x - target.x, h.y - target.y) <= SUPPORT_HEAL_RADIUS) n++;
  return n;
}

/** Quanto cada curador cura de um alvo, dado quantos curadores o alcançam. Nunca zero: pelo menos 1 de vida. */
export function healShare(maxHp: number, healersOnTarget: number): number {
  const count = Math.max(1, healersOnTarget);
  return Math.max(1, Math.round((maxHp * SUPPORT_HEAL_FRACTION) / count));
}
