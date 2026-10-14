<script setup lang="ts">
import { resetVisual, visual } from '../app/visual-settings';
import { SMOOTHING_HINTS_PT, SMOOTHING_LABELS_PT, SMOOTHING_MODES } from '../core/pixel-upscale';

defineProps<{ battle?: boolean }>();
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
    <section v-if="battle">
      <h4>Luz dos golpes</h4>
      <div class="chips" role="group" aria-label="Luz dos golpes">
        <button type="button" :class="{ active: visual.lighting }" :aria-pressed="visual.lighting" @click="visual.lighting = true">Ligada</button>
        <button type="button" :class="{ active: !visual.lighting }" :aria-pressed="!visual.lighting" @click="visual.lighting = false">Desligada</button>
      </div>
      <p class="hint">
        {{ visual.lighting ? 'Os golpes iluminam os Pokémon, o chão e o ambiente da câmera, e o ambiente real tinge os Pokémon um pouco.' : 'Sem luz dos golpes: mais leve para celulares fracos.' }}
      </p>
    </section>
    <section v-if="battle">
      <h4>Som da batalha</h4>
      <div class="chips" role="group" aria-label="Som da batalha">
        <button type="button" :class="{ active: visual.sound }" :aria-pressed="visual.sound" @click="visual.sound = true">Ligado</button>
        <button type="button" :class="{ active: !visual.sound }" :aria-pressed="!visual.sound" @click="visual.sound = false">Desligado</button>
      </div>
      <p class="hint">
        {{ visual.sound ? 'Golpes, impactos, defesas, nocautes e uma fanfarra para o vencedor. Se não ouvir nada, confira o volume e o modo silencioso do celular.' : 'Batalha sem som.' }}
      </p>
    </section>
  </div>
</template>
