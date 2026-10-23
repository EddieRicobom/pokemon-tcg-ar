<script setup lang="ts">
/**
 * A Vila na aba própria (antes morava dentro da Caixa, atrás do botão "Modo vida"). A Vila em si continua sendo o
 * `VillageView` de sempre, em tela cheia; aqui só se decide para onde ir quando ela fecha.
 */
import { routeHref, vilaExitHref } from '../app/route';
import type { VilaExit } from '../app/route';
import VillageView from '../components/VillageView.vue';

const props = defineProps<{ back: string }>();

function onClose(then?: VilaExit): void {
  if (then) window.location.hash = vilaExitHref(then);
  else window.location.hash = props.back && !props.back.startsWith('#/vila') ? props.back : routeHref('escanear');
}
</script>

<template>
  <VillageView @close="onClose" />
</template>
