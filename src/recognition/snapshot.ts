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

/** Diagnóstico opcional de uma confirmação (usado pelos testes; não altera o resultado). */
export interface SameCardDiagnostics {
  /** Quantas orientações foram de fato retificadas: 1 no caminho rápido, 2 no caminho completo. */
  orientations: number;
}

function orientationScore(photo: CardFeatures, frame: RgbaImage, quad: Quad): number {
  const now = cardFingerprint(frame, quad);
  return now ? compareFeatures(photo, now).combined : 0;
}

/**
 * Quanto a carta neste quadro se parece com a da foto (0–1). Confere as duas orientações: a foto guarda a carta
 * já na orientação lida (pode ter sido de cabeça para baixo), e o contorno detectado agora vem sempre "de pé".
 *
 * Caminho rápido: a orientação normal é avaliada primeiro e, se já alcança `SAME_CARD_SIMILARITY`, o quadro girado
 * nem é retificado. A decisão de quem chama não muda: o único consumidor (ScanController) decide pelo limiar e usa o
 * número apenas para exibir a porcentagem. Acima do limiar o desfecho é "mesma carta" com ou sem a segunda
 * orientação (numa carta de pé, o girado ficaria bem abaixo); abaixo dele as duas orientações continuam sendo
 * avaliadas e o máximo é devolvido como antes.
 */
export function sameCardScore(
  photo: CardFeatures,
  frame: RgbaImage,
  quad: Quad,
  diagnostics?: SameCardDiagnostics,
): number {
  const upright = orientationScore(photo, frame, quad);
  if (upright >= SAME_CARD_SIMILARITY) {
    if (diagnostics) diagnostics.orientations = 1;
    return upright;
  }
  // Só aqui vale pagar a segunda retificação; `rotate180` aloca apenas neste caminho.
  const flipped = orientationScore(photo, frame, rotate180(quad));
  if (diagnostics) diagnostics.orientations = 2;
  return Math.max(upright, flipped);
}
