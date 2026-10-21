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
