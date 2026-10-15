import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';

/**
 * Balão de fala com um emoji dentro, desenhado num canvas (uma textura por emoji, guardada para sempre: são poucos).
 * O emoji sai da fonte do próprio aparelho. Sem canvas (testes, navegador sem suporte) devolve null e o balão simplesmente
 * não aparece.
 */

export const BUBBLE_W = 96;
export const BUBBLE_H = 112;
/** Proporção altura/largura do balão. */
export const BUBBLE_ASPECT = BUBBLE_H / BUBBLE_W;

const cache = new Map<string, CanvasTexture | null>();

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function bubbleTexture(emoji: string): CanvasTexture | null {
  if (cache.has(emoji)) return cache.get(emoji) ?? null;
  let texture: CanvasTexture | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = BUBBLE_W;
    canvas.height = BUBBLE_H;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const bodyH = 86;
      // Balão: corpo arredondado com uma ponta para baixo, contorno escuro e fundo claro.
      ctx.lineJoin = 'round';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#1b1f2b';
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, 4, 4, BUBBLE_W - 8, bodyH - 4, 22);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(BUBBLE_W / 2 - 11, bodyH - 3);
      ctx.lineTo(BUBBLE_W / 2, BUBBLE_H - 4);
      ctx.lineTo(BUBBLE_W / 2 + 11, bodyH - 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Apaga o traço entre o corpo e a ponta para os dois ficarem unidos.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(BUBBLE_W / 2 - 9, bodyH - 7, 18, 7);
      ctx.font = '50px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, BUBBLE_W / 2, bodyH / 2 + 3);
      texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.minFilter = LinearFilter;
      texture.magFilter = LinearFilter;
      texture.generateMipmaps = false;
    }
  } catch {
    texture = null;
  }
  cache.set(emoji, texture);
  return texture;
}

/** Libera as texturas (ao sair da Caixa). */
export function disposeBubbleTextures(): void {
  for (const t of cache.values()) t?.dispose();
  cache.clear();
}
