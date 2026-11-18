/** Máscaras de cada quadro são reutilizadas; o brilho alfa não exige filtros por inimigo. */
const masks = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

export function drawAlphaTint(ctx: CanvasRenderingContext2D, frame: HTMLCanvasElement, x: number, y: number, w: number, h: number, mirror: boolean): void {
  let mask = masks.get(frame);
  if (!mask) {
    mask = document.createElement('canvas');
    mask.width = Math.min(96, frame.width);
    mask.height = Math.min(96, frame.height);
    const c = mask.getContext('2d');
    if (!c || !mask.width || !mask.height) return;
    c.drawImage(frame, 0, 0, mask.width, mask.height);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = '#ec3535';
    c.fillRect(0, 0, mask.width, mask.height);
    masks.set(frame, mask);
  }
  ctx.save();
  ctx.globalAlpha *= 0.24;
  if (mirror) { ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(mask, 0, 0, w, h); }
  else ctx.drawImage(mask, x, y, w, h);
  ctx.restore();
}
