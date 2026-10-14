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

/** Converte a referência em cinza de luminância; devolve a própria imagem se o navegador não puder desenhar. */
export async function prepareReference(reference: Blob): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(reference);
  try {
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bitmap.width, bitmap.height) : null;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx) return bitmap;
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    toLumaGray(data.data);
    ctx.putImageData(data, 0, 0);
    const prepared = await createImageBitmap(canvas);
    bitmap.close();
    return prepared;
  } catch {
    return bitmap;
  }
}
