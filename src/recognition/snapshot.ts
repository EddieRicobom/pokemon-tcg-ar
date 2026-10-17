import { compareFeatures, computeFeatures } from './hash';
import type { CardFeatures } from './hash';
import { rectify } from './homography';
import { CARD_HEIGHT_PX, CARD_WIDTH_PX } from './types';
import type { Quad, RgbaImage } from './types';

/**
 * Foto temporária do scan (ideia do dono): quando a primeira leitura boa sai (número e, se precisou, nome), o quadro
 * fica guardado na memória e a confirmação deixa de rodar o OCR de novo — basta ver, quadro a quadro, que a câmera
 * continua mostrando a MESMA carta (comparação visual barata, a mesma usada contra as referências do catálogo). A
 * confirmação continua sendo no tempo (a carta precisa seguir lá); só deixa de custar uma passada de OCR por quadro.
 */

/** Semelhança visual mínima (0–1) para dizer "é a mesma carta da foto". */
export const SAME_CARD_SIMILARITY = 0.8;

function rotate180(quad: Quad): Quad {
  return [quad[2], quad[3], quad[0], quad[1]];
}

/** Características da carta endireitada num quadro (mesmo tamanho e critério da leitura). */
export function cardFingerprint(frame: RgbaImage, quad: Quad): CardFeatures | null {
  const rectified = rectify(frame, quad, CARD_WIDTH_PX, CARD_HEIGHT_PX);
  return rectified ? computeFeatures(rectified) : null;
}

/**
 * Quanto a carta neste quadro se parece com a da foto (0–1). Confere as duas orientações: a foto guarda a carta
 * já na orientação lida (pode ter sido de cabeça para baixo), e o contorno detectado agora vem sempre "de pé".
 */
export function sameCardScore(photo: CardFeatures, frame: RgbaImage, quad: Quad): number {
  let best = 0;
  for (const q of [quad, rotate180(quad)]) {
    const now = cardFingerprint(frame, q);
    if (now) best = Math.max(best, compareFeatures(photo, now).combined);
  }
  return best;
}
