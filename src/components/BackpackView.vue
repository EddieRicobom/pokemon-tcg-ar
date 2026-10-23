<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { loadChunk } from '../app/stale-build';
import { effectiveVisual, visual } from '../app/visual-settings';
import { describeItem, planBackpack } from '../core/backpack-layout';
import type { BackpackItem, RunningBackpack } from '../box/backpack';

const props = defineProps<{ items: readonly BackpackItem[] }>();
const emit = defineEmits<{ close: [] }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const state = ref<'loading' | 'ready' | 'error'>('loading');
const selectedId = ref<string | null>(null);
let running: RunningBackpack | null = null;

const plan = computed(() => planBackpack(props.items));
const selectedLabel = computed(() => {
  const item = plan.value.shown.find((entry) => entry.id === selectedId.value);
  return item ? describeItem(item) : null;
});

async function start(): Promise<void> {
  if (!canvas.value) return;
  try {
    const { startBackpack } = await loadChunk(() => import('../box/backpack'));
    if (!canvas.value) return;
    running = await startBackpack({
      canvas: canvas.value,
      items: props.items,
      fx: effectiveVisual.value.metallic,
      sound: visual.sound,
      onSelect: (id) => { selectedId.value = id; },
    });
    state.value = 'ready';
  } catch (error) {
    console.error('Mochila 3D', error);
    state.value = 'error';
  }
}

const onResize = () => running?.resize();
watch(() => effectiveVisual.value.metallic, (on) => running?.setFx(on));
watch(() => visual.sound, (on) => running?.setSound(on));

onMounted(() => {
  document.body.classList.add('no-scroll');
  window.addEventListener('resize', onResize);
  void start();
});

onBeforeUnmount(() => {
  document.body.classList.remove('no-scroll');
  window.removeEventListener('resize', onResize);
  running?.stop();
  running = null;
});
</script>

<template>
  <div class="backpack-3d" role="dialog" aria-modal="true" aria-labelledby="backpack-title">
    <header class="bc-head">
      <h2 id="backpack-title">Mochila 3D <small>{{ props.items.length }} tipos de item</small></h2>
      <button type="button" class="bc-close" aria-label="Fechar a mochila" @click="emit('close')">✕</button>
    </header>
    <div class="bc-stage backpack-stage">
      <canvas ref="canvas" class="bc-canvas" aria-label="Mochila aberta em 3D, com os itens dentro do compartimento. Arraste para girar, toque num item para ver o nome e chacoalhe para vê-los bater. A lista abaixo traz os mesmos itens em texto."></canvas>
      <p v-if="state === 'loading'" class="bc-msg">Abrindo a mochila…</p>
      <p v-else-if="state === 'error'" class="bc-msg">Não deu para mostrar a mochila 3D neste aparelho. Os itens continuam disponíveis na mochila comum.</p>
      <p v-else-if="!props.items.length" class="bc-msg">A mochila está vazia.</p>
    </div>
    <p class="bc-selected" aria-live="polite">{{ selectedLabel ?? 'Toque num item para ver o nome e a quantidade.' }}</p>
    <ul v-if="plan.shown.length" class="bc-items" aria-label="Itens da mochila">
      <li v-for="item in plan.shown" :key="item.id">
        <button type="button" :class="{ on: item.id === selectedId }" :aria-pressed="item.id === selectedId" :disabled="state !== 'ready'" @click="running?.focusItem(item.id)">
          {{ item.name }} <b>×{{ item.qty }}</b>
        </button>
      </li>
    </ul>
    <p v-if="plan.hidden" class="bc-note">+{{ plan.hidden }} tipos de item não cabem na mochila 3D. Veja todos na lista da mochila.</p>
    <p class="bc-hint">Arraste para girar a mochila. Incline o celular ou toque em “Chacoalhar” para ver os itens quicarem e bater entre si, com o som do tecido e de cada contato.</p>
    <div class="bc-actions">
      <button type="button" :disabled="state !== 'ready'" @click="running?.shake()">Chacoalhar</button>
      <button type="button" :disabled="state !== 'ready'" @click="running?.calibrate()">Calibrar giroscópio</button>
      <button type="button" :disabled="state !== 'ready'" @click="running?.recenter()">Centralizar</button>
      <label class="bc-fx"><input v-model="visual.metallic" type="checkbox" /> Brilho e balanço suave</label>
    </div>
  </div>
</template>
