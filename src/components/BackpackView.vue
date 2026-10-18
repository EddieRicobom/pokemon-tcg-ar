<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { loadChunk } from '../app/stale-build';
import { visual } from '../app/visual-settings';
import type { BackpackItem, RunningBackpack } from '../box/backpack';

const props = defineProps<{ items: readonly BackpackItem[] }>();
const emit = defineEmits<{ close: [] }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const state = ref<'loading' | 'ready' | 'error'>('loading');
let running: RunningBackpack | null = null;

async function start(): Promise<void> {
  if (!canvas.value) return;
  try {
    const { startBackpack } = await loadChunk(() => import('../box/backpack'));
    if (!canvas.value) return;
    running = await startBackpack({ canvas: canvas.value, items: props.items, fx: visual.metallic, sound: visual.sound });
    state.value = 'ready';
  } catch (error) {
    console.error('Mochila 3D', error);
    state.value = 'error';
  }
}

const onResize = () => running?.resize();
watch(() => visual.metallic, (on) => running?.setFx(on));
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
      <canvas ref="canvas" class="bc-canvas" aria-label="Mochila 3D com os itens coletados. Balance o celular para ouvir os itens se encostando."></canvas>
      <p v-if="state === 'loading'" class="bc-msg">Abrindo a mochila…</p>
      <p v-else-if="state === 'error'" class="bc-msg">Não deu para mostrar a mochila 3D neste aparelho. Os itens continuam disponíveis na mochila comum.</p>
    </div>
    <p class="bc-hint">Uma mochila de aventura aberta, com bolso frontal, alças e itens à mostra. Incline o celular ou toque em “Chacoalhar” para ouvir o tecido e os pequenos toques dos itens.</p>
    <div class="bc-actions">
      <button type="button" :disabled="state !== 'ready'" @click="running?.shake()">Chacoalhar</button>
        <button type="button" :disabled="state !== 'ready'" @click="running?.calibrate()">Calibrar giroscópio</button>
        <button type="button" :disabled="state !== 'ready'" @click="running?.recenter()">Centralizar</button>
      <label class="bc-fx"><input v-model="visual.metallic" type="checkbox" /> Brilho e balanço suave</label>
    </div>
  </div>
</template>
