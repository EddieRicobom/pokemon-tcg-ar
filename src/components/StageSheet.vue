<script setup lang="ts">
/**
 * Conteúdo que fica na página com a câmera desligada e vira uma folha SOBRE a câmera quando ela liga.
 * Assim a mesma marcação serve aos dois casos e nada obriga a rolar a página para ver o que acontece.
 * `host` é o elemento (`.stage-dock`) dentro do visor para onde a folha é levada.
 */
import { computed, ref } from 'vue';
import { useDialogFocus } from '../composables/useDialogFocus';

const props = defineProps<{ docked: boolean; host: HTMLElement | null; open: boolean; title: string }>();
defineEmits<{ close: [] }>();

const teleported = computed(() => props.docked && props.host !== null);
const dialogEl = ref<HTMLElement | null>(null);
useDialogFocus(dialogEl);
</script>

<template>
  <Teleport :to="host ?? 'body'" :disabled="!teleported">
    <div v-if="!docked" class="inline-sheet"><slot /></div>
    <div v-else-if="open" ref="dialogEl" class="stage-sheet" role="dialog" tabindex="-1" :aria-label="title" @keydown.esc.stop.prevent="$emit('close')" @pointerdown.stop @pointerup.stop @click.stop>
      <header>
        <strong>{{ title }}</strong>
        <button type="button" class="link" @click="$emit('close')">Fechar</button>
      </header>
      <slot />
    </div>
  </Teleport>
</template>
