<script setup lang="ts">
import { CAMERA_FILTERS, resetVisual, visual } from '../app/visual-settings';
import { OUTLINE_LABELS_PT, OUTLINES, TONE_LABELS_PT, TONES } from '../core/sprite-look';

defineEmits<{ close: [] }>();
</script>

<template>
  <div class="stage-sheet" role="dialog" aria-label="Filtros" @pointerdown.stop @pointerup.stop @click.stop>
    <header>
      <strong>Filtros</strong>
      <button type="button" class="link" @click="resetVisual">Restaurar</button>
      <button type="button" class="link" @click="$emit('close')">Fechar</button>
    </header>
    <section>
      <h4>Imagem da câmera</h4>
      <div class="chips" role="group" aria-label="Filtro da câmera">
        <button v-for="filter in CAMERA_FILTERS" :key="filter.id" type="button" :class="{ active: visual.camera === filter.id }" :aria-pressed="visual.camera === filter.id" @click="visual.camera = filter.id">
          {{ filter.label }}
        </button>
      </div>
    </section>
    <section>
      <h4>Cor do Pokémon</h4>
      <div class="chips" role="group" aria-label="Cor do Pokémon">
        <button v-for="tone in TONES" :key="tone" type="button" :class="{ active: visual.tone === tone }" :aria-pressed="visual.tone === tone" @click="visual.tone = tone">
          {{ TONE_LABELS_PT[tone] }}
        </button>
      </div>
    </section>
    <section>
      <h4>Contorno do Pokémon</h4>
      <div class="chips" role="group" aria-label="Contorno do Pokémon">
        <button v-for="outline in OUTLINES" :key="outline" type="button" :class="{ active: visual.outline === outline }" :aria-pressed="visual.outline === outline" @click="visual.outline = outline">
          {{ OUTLINE_LABELS_PT[outline] }}
        </button>
      </div>
    </section>
  </div>
</template>
