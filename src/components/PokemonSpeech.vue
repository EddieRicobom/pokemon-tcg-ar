<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { speech } from '../app/speech-store';

/** Caixa de texto de fala (estilo dos jogos): o texto aparece letra a letra; um toque completa, outro fecha. */
const shown = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;
const text = computed(() => speech.value?.text ?? '');
const done = computed(() => shown.value >= text.value.length);

function stop(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

watch(
  () => speech.value,
  (value) => {
    stop();
    shown.value = 0;
    if (!value) return;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      shown.value = value.text.length;
      return;
    }
    timer = setInterval(() => {
      shown.value++;
      if (shown.value >= value.text.length) stop();
    }, 38);
  },
);

function tap(): void {
  if (!done.value) {
    stop();
    shown.value = text.value.length;
    return;
  }
  speech.value = null;
}

onBeforeUnmount(stop);
</script>

<template>
  <div v-if="speech" class="speech" role="dialog" :aria-label="`${speech.name} diz`" @click="tap">
    <img v-if="speech.sprite" :src="speech.sprite" alt="" class="speech-sprite" />
    <div class="speech-box">
      <strong>{{ speech.name }}</strong>
      <p>{{ text.slice(0, shown) }}<span class="speech-rest" aria-hidden="true">{{ text.slice(shown) }}</span></p>
      <span class="speech-next" aria-hidden="true">{{ done ? '▼' : '' }}</span>
      <span class="sr-only">{{ text }}</span>
    </div>
  </div>
</template>
