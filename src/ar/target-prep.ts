/**
 * Preparo da imagem de referência antes de compilar o alvo (ideia do Momentoos).
 *
 * O compilador do MindAR converte para cinza com (R+G+B)/3, mas o carregador de quadros da câmera usa luminância
 * (0,299 R + 0,587 G + 0,114 B). Em carta colorida (vermelho e amarelo vivos, azul escuro) os dois cinzas diferem
 * bastante, então os pontos de interesse do alvo não coincidem com os que a câmera enxerga. Aqui o alvo já vai em
 * cinza de luminância, o mesmo critério do quadro da câmera.
 */

/** Substitui R, G e B pela luminância (in-place). O alfa não muda. */
export function toLumaGray(rgba: Uint8ClampedArray): void {
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const y = 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = y; // Uint8ClampedArray arredonda
  }
}

/** Retângulo em pixels (arredondado, dentro da imagem) de um recorte dado em frações [x0, y0, x1, y1]. */
export function cropRect(width: number, height: number, box: readonly [number, number, number, number]): { x: number; y: number; w: number; h: number } {
  const x = Math.max(0, Math.round(box[0] * width));
  const y = Math.max(0, Math.round(box[1] * height));
  const w = Math.max(1, Math.min(width, Math.round(box[2] * width)) - x);
  const h = Math.max(1, Math.min(height, Math.round(box[3] * height)) - y);
  return { x, y, w, h };
}

/**
 * Converte a referência em cinza de luminância, recortada em `crop` (a ilustração: é nela que o rastreador se apoia).
 * Sem canvas o recorte não é possível e a função falha: um alvo da carta inteira daria um tracking deslocado em silêncio.
 */
export async function prepareReference(reference: Blob, crop?: readonly [number, number, number, number]): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(reference);
  try {
    const rect = crop ? cropRect(bitmap.width, bitmap.height, crop) : { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(rect.w, rect.h) : null;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx) {
      if (crop) throw new Error('Este navegador não consegue preparar o alvo de rastreamento (sem OffscreenCanvas).');
      return bitmap;
    }
    ctx.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    const data = ctx.getImageData(0, 0, rect.w, rect.h);
    toLumaGray(data.data);
    ctx.putImageData(data, 0, 0);
    const prepared = await createImageBitmap(canvas);
    bitmap.close();
    return prepared;
  } catch (error) {
    if (crop) {
      bitmap.close();
      throw error;
    }
    return bitmap;
  }
}
