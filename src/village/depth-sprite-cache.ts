/** Acabamento preparado por sprite, nunca no canvas da cena por quadro. */
export class DepthSpriteCache {
  private readonly sprites = new WeakMap<HTMLCanvasElement, Map<number, HTMLCanvasElement>>();

  draw(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, w: number, h: number, band: number): void {
    if (band === 0) { ctx.drawImage(img, x, y, w, h); return; }
    let variants = this.sprites.get(img);
    if (!variants) { variants = new Map(); this.sprites.set(img, variants); }
    let prepared = variants.get(band);
    // Margem transparente impede cortar a borda do desfoque. A imagem fica
    // na resolução nativa da pixel art, não na resolução da tela inteira.
    const pad = 2;
    if (!prepared) {
      prepared = document.createElement('canvas');
      prepared.width = img.width + pad * 2;
      prepared.height = img.height + pad * 2;
      const g = prepared.getContext('2d')!;
      g.filter = `blur(${band === 1 ? 0.22 : 0.4}px) brightness(${band === 1 ? 0.94 : 0.86})`;
      g.drawImage(img, pad, pad);
      variants.set(band, prepared);
    }
    const px = w / img.width;
    const py = h / img.height;
    ctx.drawImage(prepared, x - pad * px, y - pad * py, w + pad * 2 * px, h + pad * 2 * py);
  }
}
