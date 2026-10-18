import { SURVIVOR_REGIONS, survivorRegionAt } from '../core/survivor-regions';

/** Só dois mapas em cache, sem partículas ou alocação de milhares de tiles a cada quadro. */
export function createSurvivorLandscape(width: number, height: number) {
  const layers = new Map<number, HTMLCanvasElement>();
  function layer(index: number): HTMLCanvasElement {
    const cached = layers.get(index);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const r = SURVIVOR_REGIONS[index]!;
    ctx.fillStyle = r.ground;
    ctx.fillRect(0, 0, width, height);
    // Mesmas posições em todas as regiões: a paisagem se transforma sem deslocar referências.
    for (let y = 0; y < height; y += 16) {
      for (let x = 0; x < width; x += 16) {
        const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        ctx.fillStyle = h % 3 === 0 ? '#ffffff09' : '#00000008';
        ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = r.accent;
        ctx.globalAlpha = 0.22;
        ctx.fillRect(x + h % 11, y + (h >>> 4) % 12, 2, 3);
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = r.path;
    // Uma trilha sinuosa e uma transversal deixam a arena legível em qualquer viewport.
    for (let y = 0; y < height; y += 8) {
      const center = width * 0.5 + Math.sin(y / 95) * 100;
      ctx.fillRect(Math.round(center / 8) * 8 - 24, y, 48, 8);
    }
    ctx.fillRect(0, height / 2 - 16, width, 32);
    // Enfeites nas bordas: a área central de combate permanece desimpedida visualmente.
    for (let i = 0; i < 24; i++) {
      const x = i % 2 === 0 ? 22 + (i * 47) % 100 : width - 120 + (i * 31) % 90;
      const y = 24 + (i * 83) % (height - 64);
      ctx.fillStyle = '#243b3330';
      ctx.fillRect(x - 2, y + 10, 24, 8);
      ctx.fillStyle = r.accent;
      if (r.detail === 'tree') {
        ctx.fillStyle = '#76624a';
        ctx.fillRect(x + 8, y + 8, 5, 12);
        ctx.fillStyle = r.accent;
        ctx.fillRect(x, y - 7, 22, 18);
        ctx.fillRect(x + 5, y - 14, 12, 9);
      } else if (r.detail === 'pool') {
        ctx.fillStyle = r.path;
        ctx.fillRect(x - 4, y - 4, 34, 24);
        ctx.fillStyle = r.accent;
        ctx.fillRect(x, y, 26, 16);
        ctx.fillStyle = '#a3d3cd';
        ctx.fillRect(x + 4, y + 4, 13, 2);
      } else if (r.detail === 'rock') {
        ctx.fillRect(x, y, 22, 15);
        ctx.fillStyle = '#ffffff35';
        ctx.fillRect(x + 3, y + 2, 12, 3);
      } else {
        for (let f = 0; f < 5; f++) {
          ctx.fillStyle = f % 2 ? '#e5c2cc' : r.accent;
          ctx.fillRect(x + f * 5, y + f % 3 * 5, 3, 3);
        }
      }
    }
    layers.set(index, canvas);
    return canvas;
  }
  return (ctx: CanvasRenderingContext2D, elapsedMs: number): void => {
    const { current, next, blend } = survivorRegionAt(elapsedMs);
    for (const key of layers.keys()) if (key !== current && key !== next) layers.delete(key);
    ctx.save();
    ctx.drawImage(layer(current), 0, 0);
    if (blend > 0) {
      ctx.globalAlpha = blend;
      ctx.drawImage(layer(next), 0, 0);
    }
    ctx.restore();
  };
}
