<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { badgePolish, polishOf, rubPolish, savePolishNow } from '../app/badge-polish-store';
import { league } from '../app/league-store';
import { loadChunk } from '../app/stale-build';
import { visual } from '../app/visual-settings';
import { polishLabel } from '../core/badge-polish';
import { badgeDesign } from '../core/badges';
import type { RunningBadgeCase } from '../box/badge-case';

/** Maleta 3D de insígnias, em tela cheia por cima do Treinador. O Three.js só carrega aqui (import dinâmico). */
const emit = defineEmits<{ close: [] }>();

const canvas = ref<HTMLCanvasElement | null>(null);
const state = ref<'loading' | 'ready' | 'error'>('loading');
const isOpen = ref(true);
const focus = ref<number | null>(null);
let running: RunningBadgeCase | null = null;

const won = computed(() => league.value.badges);
const focused = computed(() => {
  if (focus.value === null) return null;
  const d = badgeDesign(focus.value);
  if (!d) return null;
  // Lê o estado para a etiqueta acompanhar o polimento.
  void badgePolish.value;
  const level = polishOf(d.order);
  return { name: d.name, metal: d.metal.name, label: polishLabel(level), pct: Math.round(level * 100) };
});

async function start(): Promise<void> {
  if (!canvas.value) return;
  try {
    const { startBadgeCase } = await loadChunk(() => import('../box/badge-case'));
    if (!canvas.value) return;
    running = await startBadgeCase({
      canvas: canvas.value,
      won: won.value,
      polish: (order) => polishOf(order),
      onRub: (order, distance) => rubPolish(order, distance),
      onFocus: (order) => (focus.value = order),
      fx: visual.caseFx,
      sound: visual.sound,
    });
    state.value = 'ready';
  } catch (error) {
    console.error('Maleta 3D', error);
    state.value = 'error';
  }
}

function toggleLid(): void {
  running?.toggle();
  isOpen.value = running?.isOpen ?? false;
}

/** A maleta também abre com um toque nela: confere a tampa depois que o toque foi tratado. */
function syncLid(): void {
  setTimeout(() => (isOpen.value = running?.isOpen ?? isOpen.value), 0);
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}

const onResize = () => running?.resize();

watch(() => visual.caseFx, (on) => running?.setFx(on));
watch(() => visual.sound, (on) => running?.setSound(on));

onMounted(() => {
  document.body.classList.add('no-scroll');
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  void start();
});

onBeforeUnmount(() => {
  document.body.classList.remove('no-scroll');
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', onResize);
  running?.stop();
  running = null;
  savePolishNow();
});
</script>

<template>
  <div class="badge-case-3d" role="dialog" aria-modal="true" aria-labelledby="case-title">
    <header class="bc-head">
      <h2 id="case-title">Maleta de insígnias <small>{{ won.length }} de 8</small></h2>
      <button type="button" class="bc-close" aria-label="Fechar a maleta" @click="emit('close')">✕</button>
    </header>
    <div class="bc-stage">
      <canvas ref="canvas" class="bc-canvas" @pointerup="syncLid" aria-label="Maleta 3D com as insígnias conquistadas. Arraste para girar; esfregue uma insígnia para polir."></canvas>
      <p v-if="state === 'loading'" class="bc-msg">Abrindo a maleta…</p>
      <p v-else-if="state === 'error'" class="bc-msg">Não deu para mostrar a maleta 3D neste aparelho (o navegador não liberou o WebGL). As insígnias continuam na Liga.</p>
      <p v-if="focused" class="bc-focus" aria-live="polite">
        <strong>{{ focused.name }}</strong> · {{ focused.metal }} · {{ focused.label }} ({{ focused.pct }}%)
      </p>
    </div>
    <p class="bc-hint">
      <template v-if="won.length === 0">Nenhuma insígnia ainda: vença o primeiro Ginásio para ocupar um encaixe.</template>
      <template v-else>Arraste para girar · esfregue uma insígnia para polir · gire rápido ou chacoalhe para ouvir as insígnias baterem.</template>
    </p>
    <div class="bc-actions">
      <button type="button" :disabled="state !== 'ready'" @click="toggleLid">{{ isOpen ? 'Fechar a tampa' : 'Abrir a tampa' }}</button>
      <button type="button" :disabled="state !== 'ready'" @click="running?.shake()">Chacoalhar</button>
      <button type="button" :disabled="state !== 'ready'" @click="running?.recenter()">Centralizar</button>
      <label class="bc-fx"><input v-model="visual.caseFx" type="checkbox" /> Reflexos e faíscas</label>
    </div>
  </div>
</template>
