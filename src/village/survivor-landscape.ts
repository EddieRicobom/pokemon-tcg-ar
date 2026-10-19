import { SURVIVOR_BIOMES } from '../core/survivor-biomes';
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

/** Marca as áreas com efeito mecânico para que nenhum perigo fique invisível ao jogador. */
export function drawSurvivorBiomeOverlay(ctx: CanvasRenderingContext2D, elapsedMs: number): void {
  const { current, next, blend } = survivorRegionAt(elapsedMs);
  const active = SURVIVOR_BIOMES.find((biome) => biome.regionIndex === current);
  const upcoming = blend > 0 ? SURVIVOR_BIOMES.find((biome) => biome.regionIndex === next) : undefined;
  const draw = (biome: typeof active, alpha: number): void => {
    if (!biome || alpha <= 0) return;
    for (const zone of biome.zones) {
      const color = zone.kind === 'folhagem' ? '#245d3a'
        : zone.kind === 'poça' ? '#2e8db8'
          : zone.kind === 'neve' ? '#d9f3ff'
            : zone.kind === 'vento' ? '#b5a85f'
              : zone.kind === 'pedra' ? '#706b62'
                : zone.kind === 'flores' ? '#9c688f'
                  : zone.kind === 'areia' ? '#c6a85c'
                    : zone.kind === 'ruínas' ? '#5d6670'
                      : '#667d48';
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
      ctx.strokeStyle = zone.kind === 'neve' || zone.kind === 'areia' ? '#ffffffcc' : '#ffffff88';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(zone.x + 2, zone.y + 2, zone.width - 4, zone.height - 4);
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffffdd';
      ctx.font = '600 13px sans-serif';
      const icon = zone.kind === 'folhagem' ? '🌿'
        : zone.kind === 'poça' ? '💧'
          : zone.kind === 'neve' ? '❄️'
            : zone.kind === 'vento' ? '🍂'
              : zone.kind === 'pedra' ? '🪨'
                : zone.kind === 'flores' ? '🌸'
                  : zone.kind === 'areia' ? '🏖️'
                    : zone.kind === 'ruínas' ? '🏛️'
                      : '🫒';
      ctx.fillText(icon, zone.x + 9, zone.y + 21);
      ctx.fillText(zone.label, zone.x + 31, zone.y + 20);
      ctx.restore();
    }
  };
  draw(active, 0.18);
  draw(upcoming, blend * 0.18);
}
