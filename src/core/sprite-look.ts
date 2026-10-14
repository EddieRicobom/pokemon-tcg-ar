/**
 * Filtros de aparência do sprite do Pokémon (feitos na CPU, uma vez por quadro, depois da ampliação):
 * tom de cor e contorno. Funções puras sobre RGBA; a transparência continua binária (alphaTest na GPU).
 */

export type SpriteTone = 'normal' | 'vivid' | 'soft' | 'mono' | 'sepia';
export type SpriteOutline = 'none' | 'dark' | 'white' | 'gold';

export interface SpriteLook {
  tone: SpriteTone;
  outline: SpriteOutline;
}

export const DEFAULT_LOOK: SpriteLook = { tone: 'normal', outline: 'none' };

export const TONES: SpriteTone[] = ['normal', 'vivid', 'soft', 'mono', 'sepia'];
export const OUTLINES: SpriteOutline[] = ['none', 'dark', 'white', 'gold'];

export const TONE_LABELS_PT: Record<SpriteTone, string> = {
  normal: 'Normal',
  vivid: 'Vívido',
  soft: 'Suave',
  mono: 'P&B',
  sepia: 'Sépia',
};

export const OUTLINE_LABELS_PT: Record<SpriteOutline, string> = {
  none: 'Sem contorno',
  dark: 'Escuro',
  white: 'Branco',
  gold: 'Dourado',
};

export function normalizeLook(look: Partial<SpriteLook> | undefined): SpriteLook {
  return {
    tone: TONES.includes(look?.tone as SpriteTone) ? (look?.tone as SpriteTone) : 'normal',
    outline: OUTLINES.includes(look?.outline as SpriteOutline) ? (look?.outline as SpriteOutline) : 'none',
  };
}

export const isDefaultLook = (look: SpriteLook): boolean => look.tone === 'normal' && look.outline === 'none';
export const lookKey = (look: SpriteLook): string => `${look.tone}/${look.outline}`;

const OUTLINE_RGB: Record<Exclude<SpriteOutline, 'none'>, [number, number, number]> = {
  dark: [20, 20, 32],
  white: [255, 255, 255],
  gold: [255, 203, 5],
};

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

function toneChannels(tone: SpriteTone, r: number, g: number, b: number): [number, number, number] {
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  switch (tone) {
    case 'vivid': {
      const s = 1.4;
      return [clamp255((luma + (r - luma) * s - 128) * 1.1 + 128), clamp255((luma + (g - luma) * s - 128) * 1.1 + 128), clamp255((luma + (b - luma) * s - 128) * 1.1 + 128)];
    }
    case 'soft': {
      const s = 0.75;
      return [clamp255(luma + (r - luma) * s + 14), clamp255(luma + (g - luma) * s + 14), clamp255(luma + (b - luma) * s + 14)];
    }
    case 'mono':
      return [luma, luma, luma];
    case 'sepia':
      return [clamp255(luma * 1.07 + 24), clamp255(luma * 0.92 + 10), clamp255(luma * 0.68)];
    default:
      return [r, g, b];
  }
}

/** Aplica o tom de cor nos pixels (só nos que têm alfa). Devolve uma cópia. */
export function applyTone(rgba: Uint8ClampedArray, tone: SpriteTone): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  if (tone === 'normal') return out;
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    const [r, g, b] = toneChannels(tone, out[i]!, out[i + 1]!, out[i + 2]!);
    out[i] = Math.round(r);
    out[i + 1] = Math.round(g);
    out[i + 2] = Math.round(b);
  }
  return out;
}

/** Contorno de `thickness` pixels ao redor da silhueta (pixels transparentes vizinhos de opacos viram opacos). Altera `data`. */
export function applyOutline(data: Uint8ClampedArray, width: number, height: number, outline: Exclude<SpriteOutline, 'none'>, thickness: number): void {
  const [r, g, b] = OUTLINE_RGB[outline];
  let solid = new Uint8Array(width * height);
  for (let i = 0; i < solid.length; i++) solid[i] = data[i * 4 + 3]! !== 0 ? 1 : 0;
  for (let pass = 0; pass < Math.max(1, thickness); pass++) {
    const next = new Uint8Array(solid);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (solid[index]) continue;
        const touches =
          (x > 0 && solid[index - 1]) || (x < width - 1 && solid[index + 1]) || (y > 0 && solid[index - width]) || (y < height - 1 && solid[index + width]);
        if (!touches) continue;
        next[index] = 1;
        data[index * 4] = r;
        data[index * 4 + 1] = g;
        data[index * 4 + 2] = b;
        data[index * 4 + 3] = 255;
      }
    }
    solid = next;
  }
}

/**
 * Aplica o visual a um quadro já ampliado. O contorno precisa de uma borda transparente: o sprite é copiado
 * para uma tela maior em `pad` pixels por lado; por isso a função devolve também o novo tamanho.
 */
export function applyLook(rgba: Uint8ClampedArray, width: number, height: number, look: SpriteLook, thickness = 2): { data: Uint8ClampedArray; width: number; height: number } {
  const toned = applyTone(rgba, look.tone);
  if (look.outline === 'none') return { data: toned, width, height };
  const pad = Math.max(1, thickness);
  const w = width + pad * 2;
  const h = height + pad * 2;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < height; y++) {
    data.set(toned.subarray(y * width * 4, (y + 1) * width * 4), ((y + pad) * w + pad) * 4);
  }
  applyOutline(data, w, h, look.outline, pad);
  return { data, width: w, height: h };
}
