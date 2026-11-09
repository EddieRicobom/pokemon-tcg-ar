/** Máscara de alfa preparada uma vez para cada quadro visível da animação. */
export class PokemonShadowCache {
  private readonly masks = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

  draw(ctx: CanvasRenderingContext2D, frame: HTMLCanvasElement, rect: { x: number; y: number; w: number; h: number },
    cx: number, groundY: number, mirrored: boolean, groundTilt: number, alpha: number): void {
    const pad = 3;
    const padX = pad * rect.w / frame.width;
    const padY = pad * rect.h / frame.height;
    const x = rect.x - padX;
    const y = rect.y - padY;
    const w = rect.w + padX * 2;
    const h = rect.h + padY * 2;
    // Projeta a altura do sprite na diagonal do chão, tomando os pés como origem.
    const skewX = -0.68;
    const squashY = -0.38 * groundTilt;
    const left = cx + (mirrored ? -x - w : x) + skewX * (y + h);
    const top = groundY + squashY * (y + h);
    if (left >= ctx.canvas.width || left + w - skewX * h <= 0 || top >= ctx.canvas.height || top - squashY * h <= 0) return;

    let mask = this.masks.get(frame);
    if (!mask) {
      mask = document.createElement('canvas');
      mask.width = frame.width + pad * 2;
      mask.height = frame.height + pad * 2;
      const g = mask.getContext('2d');
      if (!g) return;
      // O sprite fica fora do canvas; só sua sombra suavizada entra na máscara.
      g.shadowColor = '#080c1c';
      g.shadowBlur = 2;
      g.shadowOffsetX = mask.width;
      g.drawImage(frame, pad - mask.width, pad);
      g.shadowColor = 'transparent';
      g.globalCompositeOperation = 'source-in';
      const fill = g.createLinearGradient(0, pad, 0, pad + frame.height);
      fill.addColorStop(0, 'rgba(8,12,28,0.5)');
      fill.addColorStop(1, 'rgb(8,12,28)');
      g.fillStyle = fill;
      g.fillRect(0, 0, mask.width, mask.height);
      this.masks.set(frame, mask);
    }

    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.transform(mirrored ? -1 : 1, 0, skewX, squashY, cx, groundY);
    ctx.drawImage(mask, x, y, w, h);
    ctx.restore();
  }
}
