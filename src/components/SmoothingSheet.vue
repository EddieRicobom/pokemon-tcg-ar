<script setup lang="ts">
import { resetVisual, visual } from '../app/visual-settings';
import { SMOOTHING_HINTS_PT, SMOOTHING_LABELS_PT, SMOOTHING_MODES } from '../core/pixel-upscale';

defineEmits<{ close: [] }>();
</script>

<template>
  <div class="stage-sheet" role="dialog" aria-label="Suavização dos pixels" @pointerdown.stop @pointerup.stop @click.stop>
    <header>
      <strong>Suavização dos pixels</strong>
      <button type="button" class="link" @click="resetVisual">Restaurar</button>
      <button type="button" class="link" @click="$emit('close')">Fechar</button>
    </header>
    <section>
      <h4>Qualidade do GIF</h4>
      <div class="chips" role="group" aria-label="Suavização dos pixels">
        <button v-for="mode in SMOOTHING_MODES" :key="mode" type="button" :class="{ active: visual.smoothing === mode }" :aria-pressed="visual.smoothing === mode" @click="visual.smoothing = mode">
          {{ SMOOTHING_LABELS_PT[mode] }}
        </button>
      </div>
      <p class="hint">{{ SMOOTHING_HINTS_PT[visual.smoothing] }}</p>
    </section>
  </div>
</template>
