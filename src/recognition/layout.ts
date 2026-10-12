import type { FractionBox } from './types';

/**
 * Regiões da carta retificada (630×880), como frações. Valores do pokeum (MIT), exceto
 * NAME_BOX, que é nosso: faixa superior onde fica o nome em todas as eras de layout.
 */
export const ARTWORK_BOX: FractionBox = [0.06, 0.1, 0.94, 0.56];
/** Faixa inferior: número de coleção (direita nos layouts antigos, esquerda nos modernos) e código do set. */
export const BOTTOM_STRIP_BOX: FractionBox = [0, 0.9, 1, 1];
export const NAME_BOX: FractionBox = [0.05, 0.02, 0.8, 0.105];

/** Metades da faixa inferior para a segunda tentativa de leitura (modernas: número à esquerda; antigas: à direita). */
export const BOTTOM_LEFT_BOX: FractionBox = [0, 0.92, 0.5, 1];
export const BOTTOM_RIGHT_BOX: FractionBox = [0.5, 0.92, 1, 1];
/** Largura (px) da carta inteira equivalente na leitura da faixa inferior: 2× o tamanho retificado padrão. */
export const BOTTOM_OCR_FULL_WIDTH = 1260;
/** Largura equivalente da carta inteira ao ler o nome (letras grandes: 1,5× basta). */
export const NAME_OCR_FULL_WIDTH = 945;
