<script setup lang="ts">
/**
 * Conteúdo que fica na página com a câmera desligada e vira uma folha SOBRE a câmera quando ela liga.
 * Assim a mesma marcação serve aos dois casos e nada obriga a rolar a página para ver o que acontece.
 * `host` é o elemento (`.stage-dock`) dentro do visor para onde a folha é levada.
 */
import { computed } from 'vue';

const props = defineProps<{ docked: boolean; host: HTMLElement | null; open: boolean; title: string }>();
defineEmits<{ close: [] }>();

const teleported = computed(() => props.docked && props.host !== null);
</script>

<template>
  <Teleport :to="host ?? 'body'" :disabled="!teleported">
    <div v-if="!docked" class="inline-sheet"><slot /></div>
    <div v-else-if="open" class="stage-sheet" role="dialog" :aria-label="title" @pointerdown.stop @pointerup.stop @click.stop>
      <header>
        <strong>{{ title }}</strong>
        <button type="button" class="link" @click="$emit('close')">Fechar</button>
      </header>
      <slot />
    </div>
  </Teleport>
</template>
