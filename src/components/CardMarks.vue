<script setup lang="ts">
import { computed } from 'vue';
import { isMega } from '../core/mega';
import { isShiny } from '../core/shiny';

/** Selos de uma carta guardada: Shiny (estrela dourada) e Mega (escaneada como Mega). */
const props = withDefaults(
  defineProps<{
    card: { name: string; localId: string; setOfficial: number; shiny?: boolean; mega?: boolean };
    /** Só os símbolos, sem o texto (para cantos apertados). */
    compact?: boolean;
  }>(),
  { compact: false },
);

const shiny = computed(() => isShiny(props.card));
const mega = computed(() => isMega(props.card));
</script>

<template>
  <span v-if="shiny || mega" class="card-marks">
    <span v-if="shiny" class="card-mark shiny" title="Pokémon shiny" role="img" aria-label="Shiny">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 1.5l2.5 8 8 2.5-8 2.5-2.5 8-2.5-8-8-2.5 8-2.5z" /></svg>
      <template v-if="!compact">Shiny</template>
    </span>
    <span v-if="mega" class="card-mark mega" title="Escaneada como carta Mega" role="img" aria-label="Mega">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3.2a6.8 6.8 0 1 1 0 13.6 6.8 6.8 0 0 1 0-13.6zm0 3.1a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4z" /></svg>
      <template v-if="!compact">MEGA</template>
    </span>
  </span>
</template>
