import { TYPE_COLORS } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import { TYPE_GLYPHS } from '../core/type-glyphs';

let crystalCanvas: HTMLCanvasElement | null = null;

/** Brilho recortado pelo próprio quadro do Pokémon; reutiliza um único canvas para não alocar por quadro. */
export function drawTerastal(
  ctx: CanvasRenderingContext2D, frame: HTMLCanvasElement, x: number, y: number, w: number, h: number,
  mirror: boolean, headX: number, headY: number, type: PokemonType, now: number, detailed: boolean, scale: number,
): void {
  const color = TYPE_COLORS[type];
  if (detailed) {
    crystalCanvas ??= document.createElement('canvas');
    // A resolução fixa limita o trabalho mesmo em sprites de origem grandes.
    if (crystalCanvas.width !== 96 || crystalCanvas.height !== 96) {
      crystalCanvas.width = 96;
      crystalCanvas.height = 96;
    }
    const c = crystalCanvas.getContext('2d');
    if (c) {
      c.clearRect(0, 0, 96, 96);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      c.drawImage(frame, 0, 0, 96, 96);
      c.globalCompositeOperation = 'source-atop';
      c.globalAlpha = 0.38;
      c.fillStyle = color;
      c.fillRect(0, 0, 96, 96);
      // Facetas diagonais variam suavemente, sem filtros ou sombras de GPU.
      c.globalAlpha = 0.22 + 0.08 * Math.sin(now / 360);
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(5, 0); c.lineTo(39, 0); c.lineTo(96, 70); c.lineTo(96, 96); c.closePath();
      c.fill();
      c.globalAlpha = 0.4;
      c.strokeStyle = '#ffffff';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(4, 20); c.lineTo(47, 55); c.lineTo(74, 8);
      c.moveTo(47, 55); c.lineTo(66, 96);
      c.stroke();
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      ctx.save();
      if (mirror) { ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(crystalCanvas, 0, 0, w, h); }
      else ctx.drawImage(crystalCanvas, x, y, w, h);
      ctx.restore();
    }
  }
  // O emblema continua legível mesmo com efeitos leves ou movimento reduzido.
  ctx.save();
  ctx.translate(headX, headY);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.lineTo(11, -15);
  ctx.lineTo(0, -4);
  ctx.lineTo(-11, -15);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(TYPE_GLYPHS[type], 0, -14);
  ctx.restore();
}
