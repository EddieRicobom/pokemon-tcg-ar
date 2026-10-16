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

/** Caixa (0 a 1 da largura/altura) dos pixels não transparentes de um GIF. */
export interface ContentBounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Onde está o bicho de verdade dentro do quadro, ignorando a margem transparente da folha (comum nos pacotes
 * de sprite: o quadro tem espaço de sobra em cima para o salto da animação de "parado", por exemplo). Varre
 * todos os quadros (não só o primeiro) para a caixa não mudar enquanto a animação toca — sem isso, os pés
 * "flutuariam" sobre o chão (margem embaixo não contada) e o tamanho pareceria inconsistente entre espécies
 * (cada folha com uma margem diferente). Função pura: só olha o alfa dos pixels, não inventa nada.
 */
export function contentBounds(gif: Pick<DecodedGif, 'width' | 'height' | 'frames'>): ContentBounds {
  let top = gif.height;
  let bottom = -1;
  let left = gif.width;
  let right = -1;
  for (const f of gif.frames) {
    for (let y = 0; y < gif.height; y++) {
      for (let x = 0; x < gif.width; x++) {
        if ((f.rgba[(y * gif.width + x) * 4 + 3] ?? 0) > 0) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
  }
  if (bottom < 0 || gif.width === 0 || gif.height === 0) return { top: 0, bottom: 1, left: 0, right: 1 };
  return { top: top / gif.height, bottom: (bottom + 1) / gif.height, left: left / gif.width, right: (right + 1) / gif.width };
}
