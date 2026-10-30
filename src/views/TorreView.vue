<script setup lang="ts">
import { routeHref } from '../app/route';
import VillageView from '../components/VillageView.vue';

/** A Torre é uma rota autônoma, mas reutiliza o registro de recompensas reais da Vila sem montar o mapa dela. */
function leaveTower(): void {
  window.location.hash = routeHref('vila');
}
</script>

<template>
  <VillageView tower-only @close="leaveTower" />
</template>
