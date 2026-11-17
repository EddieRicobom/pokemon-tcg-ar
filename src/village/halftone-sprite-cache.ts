/** Pontos em uma grade inclinada, com contraste maior nos tons médios. */
export function shadeHalftone(pixels: Uint8ClampedArray, width: number, height: number): void {
  for (let y = 0; y < height; y++) {
    const firstDot = (y * 3) % 5;
    for (let x = firstDot; x < width; x += 5) {
      const i = (y * width + x) * 4;
      if (!pixels[i + 3]) continue;
      const r = pixels[i]!;
      const g = pixels[i + 1]!;
      const b = pixels[i + 2]!;
      const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const shade = 1 - Math.min(0.24, (255 - luminance) / 420);
      pixels[i] = r * shade;
      pixels[i + 1] = g * shade;
      pixels[i + 2] = b * shade;
    }
  }
}

type SpriteSource = HTMLCanvasElement | HTMLImageElement;

/** Prepara cada origem uma vez, em sua resolução nativa e com o alfa intacto. */
export class HalftoneSpriteCache {
  private readonly sprites = new WeakMap<SpriteSource, HTMLCanvasElement>();

  apply(source: HTMLCanvasElement): HTMLCanvasElement;
  apply(source: SpriteSource): SpriteSource;
  apply(source: SpriteSource): SpriteSource {
    const cached = this.sprites.get(source);
    if (cached) return cached;
    const result = document.createElement('canvas');
    result.width = 'naturalWidth' in source ? source.naturalWidth : source.width;
    result.height = 'naturalHeight' in source ? source.naturalHeight : source.height;
    const ctx = result.getContext('2d');
    if (!ctx || !result.width || !result.height) return source;
    ctx.drawImage(source, 0, 0);
    const frame = ctx.getImageData(0, 0, result.width, result.height);
    shadeHalftone(frame.data, result.width, result.height);
    ctx.putImageData(frame, 0, 0);
    this.sprites.set(source, result);
    return result;
  }
}
