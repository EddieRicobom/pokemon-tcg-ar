import type { DecodedGif, GifFrame } from '../core/gif';
import type { RgbaImage } from '../recognition/types';
import { frameDurationsMs, sheetSize } from './local-sprite-meta';
import type { DirectionRow, LocalSpriteAnim } from './local-sprite-meta';

/**
 * Recorta uma direção (linha) de uma folha de sprite local em quadros RGBA independentes, no mesmo formato
 * que um GIF decodificado (`core/gif.ts`): cada quadro já é a imagem inteira do Pokémon naquela pose, pronta
 * para desenhar. Função pura: não toca em canvas nem rede, então é testável sem navegador.
 */
export function sliceDirectionFrames(sheet: RgbaImage, anim: LocalSpriteAnim, direction: DirectionRow): DecodedGif {
  const expected = sheetSize(anim);
  if (sheet.width !== expected.width || sheet.height !== expected.height) {
    throw new Error(
      `Folha de sprite local em tamanho inesperado: esperava ${expected.width}×${expected.height}, veio ${sheet.width}×${sheet.height}.`,
    );
  }
  if (direction < 0 || direction >= anim.r) {
    throw new Error(`Direção ${direction} fora do intervalo (0–${anim.r - 1}) desta animação.`);
  }
  const { w, h, n } = anim;
  const durations = frameDurationsMs(anim);
  const rowY = direction * h;
  const frames: GifFrame[] = [];
  for (let i = 0; i < n; i++) {
    const colX = i * w;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      const srcStart = ((rowY + y) * sheet.width + colX) * 4;
      const dstStart = y * w * 4;
      rgba.set(sheet.data.subarray(srcStart, srcStart + w * 4), dstStart);
    }
    frames.push({ rgba, delayMs: durations[i] ?? Math.max(1, Math.round(1000 / 60)) });
  }
  const durationMs = durations.reduce((sum, ms) => sum + ms, 0);
  return { width: w, height: h, frames, durationMs: Math.max(1, durationMs) };
}
