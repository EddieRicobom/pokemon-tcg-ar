import type { FractionBox } from './types';

/**
 * Regiões da carta retificada (630×880), como frações. Valores do pokeum (MIT), exceto
 * NAME_BOX, que é nosso: faixa superior onde fica o nome em todas as eras de layout.
 */
export const ARTWORK_BOX: FractionBox = [0.06, 0.1, 0.94, 0.56];
/** Faixa inferior: número de coleção (direita nos layouts antigos, esquerda nos modernos) e código do set. */
export const BOTTOM_STRIP_BOX: FractionBox = [0, 0.9, 1, 1];
export const NAME_BOX: FractionBox = [0.05, 0.02, 0.8, 0.105];
