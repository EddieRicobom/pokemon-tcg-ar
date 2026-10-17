<script setup lang="ts">
/**
 * A Vila na aba própria (antes morava dentro da Caixa, atrás do botão "Modo vida"). A Vila em si continua sendo o
 * `VillageView` de sempre, em tela cheia; aqui só se decide para onde ir quando ela fecha.
 */
import { routeHref } from '../app/route';
import VillageView from '../components/VillageView.vue';

const props = defineProps<{ back: string }>();

function onClose(then?: 'pvp' | 'batalha' | 'caixa'): void {
  if (then === 'pvp') window.location.hash = routeHref('caixa', undefined, ['pvp']);
  else if (then === 'batalha') window.location.hash = routeHref('caixa', undefined, ['batalha']);
  else if (then === 'caixa') window.location.hash = routeHref('caixa');
  else window.location.hash = props.back && !props.back.startsWith('#/vila') ? props.back : routeHref('escanear');
}
</script>

<template>
  <VillageView @close="onClose" />
</template>
