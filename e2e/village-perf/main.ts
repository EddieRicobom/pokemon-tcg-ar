/**
 * Harness de desempenho da Vila: instancia o `VillageGame` real com moradores sintéticos (sem cartas, sem AR) e
 * mede, em janelas de 2 s, o tempo de `update` e de `draw` no navegador. Uso: `npm run dev` não é necessário; ver
 * `e2e/village-perf.mjs`, que sobe o Vite e coleta o perfil do Chromium.
 */
import { generateVillage } from '../../src/core/village/map';
import { emptyVillage } from '../../src/core/village/life';
import { VillageGame } from '../../src/village/village-game';
import type { VillageMon } from '../../src/village/village-game';
import type { DecodedGif } from '../../src/core/gif';

const params = new URLSearchParams(location.search);
const N = Number(params.get('n') ?? 30);
const SEED = 20261014;
const map = generateVillage(SEED);
const state = emptyVillage(SEED, map.spawn);
state.house = 3;

/** Um GIF de dois quadros com um corpo colorido: o custo de desenho é o de um sprite de verdade (tamanho parecido). */
function gif(hue: number): DecodedGif {
  const w = 40;
  const h = 48;
  const frame = (shift: number) => {
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const body = (x - w / 2) ** 2 / 180 + (y - h / 2) ** 2 / 500 < 1;
      if (!body) continue;
      rgba[i] = (hue * 37 + shift * 60) % 255;
      rgba[i + 1] = 120 + (x * 3) % 100;
      rgba[i + 2] = 200 - (y * 2) % 120;
      rgba[i + 3] = 255;
    }
    return rgba;
  };
  return { width: w, height: h, frames: [{ rgba: frame(0), delayMs: 180 }, { rgba: frame(1), delayMs: 180 }], durationMs: 360 };
}

const mons: VillageMon[] = Array.from({ length: N }, (_, i) => ({ id: `m${i}`, name: `Pokémon ${i}`, shiny: false, gif: gif(i), dexId: 1 + (i % 150) }));
const canvas = document.getElementById('c') as HTMLCanvasElement;
const game = new VillageGame(canvas, map, state, mons, 'trainer-1', null, null, null, Math.random);
game.resize(390, 844);
game.setTown(5, new Map(mons.slice(0, 8).map((m, i) => [m.id, i])));

const stats = { update: [] as number[], draw: [] as number[], frames: 0 };
/** Intervalo real entre quadros do navegador (inclui raster e coleta de lixo, que o JS não vê). */
const frameGaps: number[] = [];
let lastRaf = performance.now();
const watchFrames = (t: number) => { frameGaps.push(t - lastRaf); lastRaf = t; requestAnimationFrame(watchFrames); };
requestAnimationFrame(watchFrames);
const g = game as unknown as { update: (dt: number, now: number) => void; draw: (now: number) => void };
const update = g.update.bind(game);
const draw = g.draw.bind(game);
g.update = (dt, now) => { const t = performance.now(); update(dt, now); stats.update.push(performance.now() - t); };
g.draw = (now) => { const t = performance.now(); draw(now); stats.draw.push(performance.now() - t); stats.frames++; };
game.start();
(window as unknown as { villagePerf: unknown }).villagePerf = {
  snapshot: () => {
    const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? +(s[Math.min(s.length - 1, Math.floor(s.length * p))]!).toFixed(2) : 0; };
    const out = { frames: stats.frames, updateMedian: q(stats.update, 0.5), updateP95: q(stats.update, 0.95), drawMedian: q(stats.draw, 0.5), drawP95: q(stats.draw, 0.95), drawMax: q(stats.draw, 1), gapMedian: q(frameGaps, 0.5), gapP99: q(frameGaps, 0.99), longFrames: frameGaps.filter((g) => g > 33).length, gaps: frameGaps.length };
    stats.update.length = 0; stats.draw.length = 0; stats.frames = 0; frameGaps.length = 0;
    return out;
  },
};
