import type { PixelBuf } from '../box/ground-art';

/**
 * Reduz a paleta do treinador para aproximá-la dos sprites da Vila.
 * É um filtro de pixels executado uma vez por quadro recortado, sem shader nem trabalho por frame.
 */
export function harmonizePlayerSprite(buf: PixelBuf): PixelBuf {
  const data = new Uint8Array(buf.data);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const luminance = (r * 3 + g * 4 + b) / 8;
    const quantize = (value: number): number => Math.max(0, Math.min(255, Math.round(value / 24) * 24));
    // Mistura discreta com a luminância para evitar cores fluorescentes isoladas na paleta.
    data[i] = quantize(r * 0.9 + luminance * 0.1);
    data[i + 1] = quantize(g * 0.9 + luminance * 0.1);
    data[i + 2] = quantize(b * 0.9 + luminance * 0.1);
  }
  return { ...buf, data };
}

/** Aplica o mesmo filtro aos atlas PNG e aos fallbacks carregados como imagem. */
export function harmonizePlayerCanvas(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement | null {
  if (width <= 0 || height <= 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(source, 0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    const filtered = harmonizePlayerSprite({ w: width, h: height, data: new Uint8Array(image.data) });
    ctx.putImageData(new ImageData(new Uint8ClampedArray(filtered.data), width, height), 0, 0);
    return canvas;
  } catch {
    return null;
  }
}
