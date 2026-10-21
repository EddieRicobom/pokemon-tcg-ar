<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { DecodedGif } from '../core/gif';
import { frameIndexAt } from '../core/gif';
import { contentBounds } from '../village/local-sprite';
import type { LegendStory } from '../core/village/legendary-stories';
import { LEGEND_PLACES } from '../core/village/legendary-stories';
import type { LegendaryDef } from '../core/village/legendary';
import { requestGameFrame, cancelGameFrame } from '../app/frame-scheduler';

const props = defineProps<{ story: LegendStory; definition: LegendaryDef; gif: DecodedGif | null; loading: boolean; replay: boolean; effects: boolean; maxFps: number }>();
const emit = defineEmits<{ finish: [] }>();
const step = ref(0), canvas = ref<HTMLCanvasElement | null>(null), root = ref<HTMLElement | null>(null);
const chapter = computed(() => props.story.chapters[step.value]!);
const spriteBounds = computed(() => props.gif && contentBounds(props.gif));
const palette = computed(() => ({ frost: '#b8eaff', storm: '#ffd65e', flame: '#ff9c67', mind: '#f4a4ea', forest: '#a2e1a1', ocean: '#80d4ed', rainbow: '#ffe19c', stone: '#dfbd8d', cosmos: '#bec0ff', shadow: '#d3a3ea', prism: '#a1f3e6', guardian: '#e8d4a0' })[props.story.theme]);
const reduce = ref(false);
const animate = computed(() => props.effects && !reduce.value);
let frame = 0, started = 0, lastIndex = -1;
const media = matchMedia('(prefers-reduced-motion: reduce)');
function syncMotion(): void { reduce.value = media.matches; restart(); }
function draw(time: number): void {
  frame = 0;
  const gif = props.gif, el = canvas.value;
  const bounds = spriteBounds.value;
  if (!gif || !el || !bounds || document.hidden) return;
  const x = Math.round(bounds.left * gif.width), y = Math.round(bounds.top * gif.height);
  const width = Math.max(1, Math.round((bounds.right - bounds.left) * gif.width)), height = Math.max(1, Math.round((bounds.bottom - bounds.top) * gif.height));
  if (el.width !== width || el.height !== height) { el.width = width; el.height = height; lastIndex = -1; }
  if (!started) started = time;
  const index = frameIndexAt(gif, animate.value ? time - started : 0);
  const image = gif.frames[index];
  if (image && index !== lastIndex) {
    el.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(image.rgba), gif.width, gif.height), -x, -y);
    lastIndex = index;
  }
  if (animate.value && gif.frames.length > 1) frame = requestGameFrame(draw, () => props.maxFps > 0 ? Math.min(30, props.maxFps) : 30);
}
function restart(): void {
  if (frame) cancelGameFrame(frame);
  frame = 0; started = 0; lastIndex = -1;
  void nextTick(() => { if (root.value) draw(performance.now()); });
}
function advance(): void { if (step.value + 1 < props.story.chapters.length) step.value++; else emit('finish'); }
function keys(event: KeyboardEvent): void {
  if (event.key === 'Escape' || event.key.toLowerCase() === 'x') { event.preventDefault(); emit('finish'); }
  else if (event.key.startsWith('Arrow') || event.key === 'Tab') {
    event.preventDefault();
    const buttons = [...(root.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(index + (event.shiftKey || event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? buttons.length - 1 : 1)) % buttons.length]?.focus();
  }
}
watch(() => props.gif, restart);
watch(() => props.effects, restart);
watch(step, () => { const panel = root.value?.querySelector('.legend-script'); if (panel) panel.scrollTop = 0; });
onMounted(() => { syncMotion(); media.addEventListener('change', syncMotion); document.addEventListener('visibilitychange', restart); root.value?.querySelector<HTMLButtonElement>('.legend-next')?.focus(); });
onBeforeUnmount(() => { if (frame) cancelGameFrame(frame); media.removeEventListener('change', syncMotion); document.removeEventListener('visibilitychange', restart); });
defineExpose({ advance });
</script>

<template>
  <section ref="root" class="legend-cutscene" :class="[{ still: !animate }, `theme-${story.theme}`, `phase-${step}`, `land-${LEGEND_PLACES[story.place].landscape}`]" :style="{ '--legend-accent': palette }" role="dialog" aria-modal="true" aria-labelledby="legend-title" @keydown.stop="keys">
    <div class="legend-stage" aria-hidden="true">
      <div class="legend-orb"></div><div class="legend-horizon"></div>
      <div class="legend-rays"><i v-for="n in 8" :key="n" :style="{ '--n': n }"></i></div>
      <div class="legend-ring ring-one"></div><div class="legend-ring ring-two"></div>
      <div class="legend-landscape"><i v-for="n in 7" :key="n" :style="{ '--n': n }"></i></div>
      <div class="legend-visitor"><canvas v-show="gif" ref="canvas"></canvas></div>
      <div class="legend-particles"><i v-for="n in 14" :key="n" :style="{ '--n': n }"></i></div>
      <span class="legend-place">{{ LEGEND_PLACES[story.place].name }}</span>
    </div>
    <article class="legend-story">
      <div class="legend-script" aria-live="polite">
        <small>{{ replay ? 'LEMBRANÇA · SEM NOVO BÔNUS' : 'ENCONTRO NA VILA' }} · {{ story.region }} · {{ step + 1 }}/{{ story.chapters.length }}</small>
        <h2 id="legend-title">{{ chapter.title }}</h2>
        <p class="legend-name">{{ story.name }} · {{ story.mythical ? 'Mítico' : 'Lendário' }}</p>
        <p>{{ chapter.text }}</p>
        <p v-if="loading" class="hint" role="status">Carregando sprite de {{ story.name }}…</p>
        <p v-else-if="!gif" class="hint">O sprite de {{ story.name }} está indisponível. O relato continua disponível.</p>
        <div v-if="step === story.chapters.length - 1" class="legend-impact"><p>{{ definition.boon }}</p><p>{{ definition.consequence }}</p><small v-if="replay">Esta revisão não reativa efeitos nem entrega itens.</small></div>
      </div>
      <div class="legend-pages" aria-label="Progresso da cena"><span v-for="(_, index) in story.chapters" :key="index" :class="{ passed: index <= step }"></span></div>
      <div class="legend-actions"><button type="button" @click="emit('finish')">{{ replay ? 'Fechar lembrança' : 'Pular cena' }}</button><button class="primary legend-next" type="button" @click="advance">{{ step + 1 < story.chapters.length ? 'Continuar' : 'Voltar à Vila' }}</button></div>
    </article>
  </section>
</template>

<style scoped>
.legend-cutscene { position: absolute; inset: 0; z-index: 35; display: grid; grid-template-rows: minmax(110px,1fr) auto; overflow: hidden; color: #f6f4ff; background: #0e1426; }
.legend-stage { position: relative; min-height: 0; overflow: hidden; isolation: isolate; background: radial-gradient(ellipse at 50% 80%,color-mix(in srgb,var(--legend-accent) 30%,#18223b),#10182d 75%); }
.legend-orb { position: absolute; width: min(60vw,330px); aspect-ratio: 1; top: 9%; left: 50%; transform: translateX(-50%); border-radius: 50%; background: radial-gradient(circle,var(--legend-accent),transparent 70%); opacity: .24; }
.legend-horizon { position: absolute; inset: 65% -20% -30%; border-radius: 50%; border-top: 2px solid var(--legend-accent); background: #14253a; opacity: .8; }
.land-water .legend-horizon { background: repeating-linear-gradient(0deg,#172f48 0 12px,#254b60 13px 15px); }
.legend-landscape { position: absolute; inset: 68% -3% 0; display: flex; justify-content: space-around; align-items: end; }
.legend-landscape i { width: 11%; height: calc(40% + var(--n) * 7%); background: #141d31; border-top: 3px solid #34485a; clip-path: polygon(0 20%,50% 0,100% 20%,100% 100%,0 100%); }
.land-forest .legend-landscape i { border: 0; background: #183a34; clip-path: polygon(50% 0,100% 80%,60% 80%,60% 100%,40% 100%,40% 80%,0 80%); }
.land-stone .legend-landscape i { background: #33303c; clip-path: polygon(10% 35%,45% 0,85% 20%,100% 100%,0 100%); }
.land-water .legend-landscape { opacity: .5; inset-block-start: 84%; }
.legend-visitor { position: absolute; inset: 6% 7% 14%; display: grid; place-items: center; animation: legend-enter 1.2s ease-out both; }
.legend-visitor canvas { max-width: 100%; max-height: 100%; width: min(78vw,520px); height: min(45vh,410px); object-fit: contain; image-rendering: pixelated; animation: legend-hover 6s ease-in-out infinite alternate; }
.theme-guardian .legend-visitor canvas,.theme-stone .legend-visitor canvas { animation: none; }
.theme-ocean .legend-visitor canvas { animation: legend-surface 7s ease-in-out infinite alternate; }
.theme-flame .legend-visitor canvas,.theme-rainbow .legend-visitor canvas,.theme-storm .legend-visitor canvas { animation: legend-soar 9s ease-in-out infinite alternate; }
.theme-shadow .legend-visitor canvas { animation: legend-veil 6s ease-in-out infinite alternate; }
.theme-prism .legend-ring { border-radius: 25%; transform: translate(-50%,-50%) rotate(45deg); }
.theme-rainbow .legend-ring { border-color: #ffca87 #a9edab #a9c5ff #e1aaff; }
.theme-frost .legend-particles i { border-radius: 0; transform: rotate(45deg); }
.theme-flame .legend-particles i { border-radius: 50% 50% 0; background: #ffbd7c; }
.theme-storm .legend-rays i { width: 2px; background: var(--legend-accent); }
.theme-shadow .legend-orb { background: #281635; border: 2px solid var(--legend-accent); opacity: .8; }
.theme-cosmos .legend-stage { background-color: #13112c; }
.legend-ring { position: absolute; left: 50%; top: 50%; width: min(65vw,370px); aspect-ratio: 1; border: 2px solid var(--legend-accent); border-radius: 50%; transform: translate(-50%,-50%); opacity: .2; transition: transform 1s,opacity 1s; }
.ring-two { width: min(90vw,510px); border-style: dashed; opacity: .12; }
.phase-2 .legend-ring { transform: translate(-50%,-50%) scale(1.2); opacity: .55; }
.phase-3 .legend-visitor { opacity: .65; }
.legend-particles,.legend-rays { position: absolute; inset: 0; pointer-events: none; }
.legend-particles i { position: absolute; left: calc(var(--n) * 7%); top: calc(10% + var(--n) * 5%); width: 4px; height: 4px; background: var(--legend-accent); border-radius: 50%; opacity: .65; animation: legend-drift 5s ease-in-out infinite alternate; animation-delay: calc(var(--n) * -.4s); }
.phase-0 .legend-visitor { opacity: .12; }.phase-1 .legend-visitor { opacity: .5; }
.legend-rays i { position: absolute; width: 1px; height: 48%; background: var(--legend-accent); left: 50%; top: 0; transform-origin: 50% 100%; transform: rotate(calc(var(--n) * 45deg)); opacity: .13; }
.legend-place { position: absolute; left: 12px; bottom: 10px; padding: 5px 10px; background: #111b2de6; border: 1px solid #ffffff30; border-radius: 8px; font-size: .75rem; }
.legend-story { display: flex; flex-direction: column; min-height: 0; max-height: 53vh; padding: 16px max(16px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left)); border-top: 1px solid var(--legend-accent); background: #11192b; }
.legend-script { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.legend-script small { color: var(--legend-accent); font-size: .72rem; }
.legend-script h2 { margin: 8px 0; font-size: clamp(1.15rem,4.5vw,1.65rem); }
.legend-script p { line-height: 1.5; margin: 10px 0; }
.legend-name { color: var(--legend-accent); font-size: .85rem; }
.legend-impact { padding: 10px; border: 1px solid #ffffff30; border-radius: 8px; font-size: .85rem; }
.legend-pages { display: flex; gap: 6px; padding-block: 10px; flex-shrink: 0; }
.legend-pages span { width: 28px; height: 3px; background: #424a62; }.legend-pages .passed { background: var(--legend-accent); }
.legend-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; flex-shrink: 0; }.legend-actions button { min-height: 44px; }
.still * { animation: none !important; transition: none !important; }.still .legend-particles,.still .legend-rays { display: none; }
@keyframes legend-enter { from { transform: translateY(18px) scale(.85); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes legend-hover { from { transform: translateY(-5px); } to { transform: translateY(5px); } }
@keyframes legend-drift { from { translate: 0 -10px; } to { translate: 4px 12px; } }
@keyframes legend-surface { from { transform: translateY(14px) scale(.92); } to { transform: translateY(-6px) scale(1.04); } }
@keyframes legend-soar { from { transform: translate(-8%,6%) rotate(-4deg); } to { transform: translate(8%,-5%) rotate(3deg); } }
@keyframes legend-veil { from { opacity: .5; transform: scale(.96); } to { opacity: 1; transform: scale(1.03); } }
@media (orientation: landscape) and (max-height: 600px) { .legend-cutscene { grid-template-columns: 1fr 1.15fr; grid-template-rows: minmax(0,1fr); }.legend-story { max-height: none; border-top: 0; border-left: 1px solid var(--legend-accent); padding-top: 10px; }.legend-visitor canvas { height: 70vh; width: 36vw; }.legend-script h2 { font-size: 1.1rem; }.legend-script p { margin: 6px 0; }.legend-actions { gap: 6px; }.legend-actions button { padding-inline: 10px; font-size: .8rem; } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>
