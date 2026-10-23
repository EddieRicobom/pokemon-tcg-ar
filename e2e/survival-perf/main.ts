/**
 * Harness de desempenho da Torre de Sobrevivência: monta o componente real e injeta inimigos e orbes na arena para
 * medir o custo do desenho com muitos elementos na tela. Só dev (o Vite expõe o estado do `<script setup>`).
 * Uso pelo `e2e/survival-perf.mjs`, que controla a quantidade pela query string.
 */
import { createApp, h } from 'vue';
import MinigameSobrevivencia from '../../src/components/MinigameSobrevivencia.vue';

const params = new URLSearchParams(location.search);
const EXTRA_ENEMIES = Number(params.get('enemies') ?? 0);
const EXTRA_ORBS = Number(params.get('orbs') ?? 0);
const ARENA_W = 2880;
const ARENA_H = 1920;

const app = createApp({ render: () => h(MinigameSobrevivencia) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vm = app.mount(document.getElementById('app')!) as any;
// O wrapper só renderiza o componente: o estado do `<script setup>` fica na instância filha (`subTree.component`).
const setup = (vm.$.subTree.component as { setupState: Record<string, unknown> }).setupState as { state: { value?: unknown } | null };

type Live = {
  enemies: Record<string, unknown>[];
  orbs: Record<string, unknown>[];
  player: Record<string, unknown>;
};

function live(): Live | null {
  const s = setup.state as unknown as Live | null;
  return s && s.enemies && s.enemies.length > 0 ? s : null;
}

const stats = { frames: 0, gaps: [] as number[] };
let lastRaf = performance.now();
const watch = (t: number) => { stats.gaps.push(t - lastRaf); lastRaf = t; requestAnimationFrame(watch); };
requestAnimationFrame(watch);

const injected = { done: false };
const timer = setInterval(() => {
  const s = live();
  if (!s || injected.done) return;
  injected.done = true;
  // Mantém o jogador vivo para a medição durar; os inimigos extras têm vida alta e não morrem.
  s.player.hp = 1e9;
  s.player.maxHp = 1e9;
  const template = s.enemies[0]!;
  for (let i = 0; i < EXTRA_ENEMIES; i++) {
    s.enemies.push({ ...template, id: 900_000 + i, x: 60 + ((i * 97) % (ARENA_W - 120)), y: 60 + ((i * 53) % (ARENA_H - 120)), hp: 1e9, maxHp: 1e9, hitFlashMs: 0, grade: 'comum', boss: false, trainerId: undefined });
  }
  for (let i = 0; i < EXTRA_ORBS; i++) {
    s.orbs.push({ id: 800_000 + i, x: 40 + ((i * 131) % (ARENA_W - 80)), y: 40 + ((i * 71) % (ARENA_H - 80)), value: 1 });
  }
  clearInterval(timer);
}, 100);

(window as unknown as { survivalPerf: unknown }).survivalPerf = {
  ready: () => injected.done,
  debug: () => { const x = setup.state as unknown as Record<string, unknown> | null; return JSON.stringify({ keys: Object.keys(setup).slice(0, 40), stateType: typeof x, enemies: (x as { enemies?: unknown[] } | null)?.enemies?.length ?? null, hasStateKey: 'state' in setup }); },
  snapshot: () => {
    const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? +(s[Math.min(s.length - 1, Math.floor(s.length * p))]!).toFixed(2) : 0; };
    const s = live();
    const out = {
      gapMedian: q(stats.gaps, 0.5),
      gapP99: q(stats.gaps, 0.99),
      longFrames: stats.gaps.filter((g) => g > 33).length,
      gaps: stats.gaps.length,
      enemies: s?.enemies.length ?? 0,
      orbs: s?.orbs.length ?? 0,
    };
    stats.gaps.length = 0;
    return out;
  },
};
