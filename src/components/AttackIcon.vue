<script setup lang="ts">
import { MOVE_CATEGORY_LABELS_PT } from '../core/survivor-moves';
import type { MoveCategory } from '../core/survivor-moves';

/**
 * Um ícone por forma de ataque. Cada desenho tem uma silhueta própria (traço, anel, explosão, leque, órbita, feixe, rajada,
 * salto) para ser reconhecido de relance, mesmo pequeno e sem cor. Usa `currentColor`, então herda a cor do texto.
 */
const props = withDefaults(defineProps<{ category: MoveCategory; size?: number; titled?: boolean }>(), { size: 22, titled: false });
</script>

<template>
  <svg
    class="attack-icon"
    :class="`attack-icon-${props.category}`"
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    :role="props.titled ? 'img' : undefined"
    :aria-label="props.titled ? MOVE_CATEGORY_LABELS_PT[props.category] : undefined"
    :aria-hidden="props.titled ? undefined : 'true'"
    focusable="false"
  >
    <title v-if="props.titled">{{ MOVE_CATEGORY_LABELS_PT[props.category] }}</title>
    <!-- Projétil: um tiro com rastro -->
    <template v-if="props.category === 'projetil'">
      <circle cx="18" cy="12" r="3.4" fill="currentColor" stroke="none" />
      <path d="M2.5 12h9.5M5 7.5h7M5 16.5h7" />
    </template>
    <!-- Aura: núcleo com anéis em volta -->
    <template v-else-if="props.category === 'aura'">
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="9.6" stroke-dasharray="2.2 3.2" />
    </template>
    <!-- Área: explosão com raios -->
    <template v-else-if="props.category === 'area'">
      <circle cx="12" cy="12" r="3.6" fill="currentColor" stroke="none" />
      <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M18.7 5.3l-2.8 2.8M8.1 15.9l-2.8 2.8" />
    </template>
    <!-- Cone: leque que abre à frente -->
    <template v-else-if="props.category === 'cone'">
      <path d="M3.5 12 20.5 4.2a17 17 0 0 1 0 15.6Z" fill="currentColor" fill-opacity="0.28" />
      <circle cx="3.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </template>
    <!-- Órbita: núcleo com satélites grandes sobre um único anel -->
    <template v-else-if="props.category === 'orbit'">
      <circle cx="12" cy="12" r="8.2" stroke-width="1.5" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      <circle cx="17.8" cy="6.2" r="2.8" fill="currentColor" stroke="none" />
      <circle cx="6.2" cy="17.8" r="2.8" fill="currentColor" stroke="none" />
    </template>
    <!-- Foco: feixe atravessando o anel de carga -->
    <template v-else-if="props.category === 'foco'">
      <circle cx="9" cy="12" r="6" />
      <path d="M2 12h20" stroke-width="3.6" />
      <path d="M17.5 8l4.5 4-4.5 4" />
    </template>
    <!-- Rajada: três tiros em sequência -->
    <template v-else-if="props.category === 'rapido'">
      <circle cx="7.2" cy="16.4" r="2.3" fill="currentColor" stroke="none" />
      <circle cx="13.4" cy="12" r="2.7" fill="currentColor" stroke="none" />
      <circle cx="19.8" cy="7.2" r="3" fill="currentColor" stroke="none" />
      <path d="M2 16.4h2.2M8.2 12h2.2M14.6 7.2h2.2" stroke-width="1.6" />
    </template>
    <!-- Teleporte: de onde saiu (tracejado) para onde chegou -->
    <template v-else-if="props.category === 'teleporte'">
      <circle cx="5.5" cy="15" r="3.4" stroke-dasharray="2 2.4" />
      <circle cx="18.5" cy="15" r="3.4" fill="currentColor" stroke="none" />
      <path d="M6.5 8.5Q12 2 17.5 8.5M14.8 7.2l2.9 1.4-.6 3" />
    </template>
    <!-- Trilha: faixa contínua que segue o caminho do jogador -->
    <template v-else-if="props.category === 'trilha'">
      <path d="M3 18c4-10 6 5 10-5s5 2 8-7" stroke-width="4" opacity=".32" />
      <path d="M3 18c4-10 6 5 10-5s5 2 8-7" stroke-width="1.8" />
      <circle cx="3" cy="18" r="1.5" fill="currentColor" stroke="none" />
    </template>
  </svg>
</template>

<style scoped>
.attack-icon {
  flex: none;
  vertical-align: -0.2em;
}
</style>
