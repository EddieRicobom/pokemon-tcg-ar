import { metallicTint } from '../core/metallic';
import { speciesTiles } from '../core/size-scale';
import type { DecodedGif } from '../core/gif';
import type { SurvivorSpriteDirection } from '../core/survivor-sprite-direction';
import { contentBounds } from './local-sprite';
import type { ContentBounds } from './local-sprite';

export interface Sprite {
  frames: HTMLCanvasElement[];
  delays: number[];
  durationMs: number;
  w: number;
  h: number;
  /** Caixa dos pixels opacos (frações do quadro): os pés ficam no ponto do chão, sem a margem da folha. */
  bounds: ContentBounds;
  /** Fator que leva o desenho ao tamanho pela altura real da espécie (1 = tamanho da folha, sem dado de altura). */
  fit: number;
}

/** Folhas locais têm quatro poses reais; fontes externas continuam com uma só, sem inventar direções. */
export type SpriteAsset = Sprite | Partial<Record<SurvivorSpriteDirection, Sprite>>;

/** Pixels de altura na Torre para 1 bloco de altura real (`core/size-scale.ts`); Pikachu ≈ 19 px, Snorlax ≈ 37 px. */
export const SURVIVOR_TILE_PX = 22;

export function toSprite(gif: DecodedGif, dexId?: number, metallic = false): Sprite {
  const frames = gif.frames.map((f) => {
    const c = document.createElement('canvas');
    c.width = gif.width;
    c.height = gif.height;
    const fctx = c.getContext('2d')!;
    const img = fctx.createImageData(gif.width, gif.height);
    img.data.set(metallic ? metallicTint(f.rgba) : f.rgba);
    fctx.putImageData(img, 0, 0);
    return c;
  });
  const bounds = contentBounds(gif);
  const contentPx = Math.max(1, (bounds.bottom - bounds.top) * gif.height);
  const tiles = speciesTiles(dexId);
  const fit = tiles === undefined ? 1 : (tiles * SURVIVOR_TILE_PX) / contentPx;
  return { frames, delays: gif.frames.map((f) => f.delayMs), durationMs: gif.durationMs, w: gif.width, h: gif.height, bounds, fit };
}

export function frameIndex(sprite: Sprite, timeMs: number): number {
  if (sprite.frames.length <= 1 || sprite.durationMs <= 0) return 0;
  let remaining = ((timeMs % sprite.durationMs) + sprite.durationMs) % sprite.durationMs;
  for (let i = 0; i < sprite.delays.length; i++) {
    remaining -= sprite.delays[i] ?? 0;
    if (remaining < 0) return i;
  }
  return sprite.frames.length - 1;
}

export function firstSpriteFrame(asset: SpriteAsset | null | undefined): HTMLCanvasElement | null {
  if (!asset) return null;
  const sprite = 'frames' in asset ? asset : (asset.down ?? asset.right ?? asset.left ?? asset.up ?? null);
  return sprite?.frames[0] ?? null;
}

