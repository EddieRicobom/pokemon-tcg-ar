<script setup lang="ts">
import { computed, ref } from 'vue';
import { LEGEND_STORIES, LEGEND_PLACES } from '../core/village/legendary-stories';
import type { LegendaryState } from '../core/village/legendary';
import { investigationPlace } from '../core/village/legendary-investigation';
const props = defineProps<{ state: LegendaryState }>();
defineEmits<{ investigate: [id: string]; replay: [id: string]; travel: [] }>();
const region = ref('Todas'), filter = ref('Todas');
const regions = ['Todas', ...new Set(LEGEND_STORIES.map((entry) => entry.region))];
const entries = computed(() => LEGEND_STORIES.filter((entry) => (region.value === 'Todas' || entry.region === region.value) && (filter.value === 'Todas' || (filter.value === 'Vividas') === !!props.state.seen[entry.id])));
const task = computed(() => props.state.investigation);
const taskName = computed(() => LEGEND_STORIES.find((entry) => entry.id === task.value?.id)?.name);
const place = computed(() => task.value && investigationPlace(task.value.id, task.value.step));
</script>
<template>
  <section class="village-legends" aria-label="Caderno de Lendas">
    <p>{{ Object.keys(state.seen).length }}/{{ LEGEND_STORIES.length }} encontros registrados. Cada investigação começa com uma pista e termina no cenário do visitante. Chegue ao local e use <strong>Investigar pista</strong> ou A.</p>
    <p class="hint">Encontros da Vila, sem captura automática. As visitas raras continuam possíveis ao entrar. Rever uma lembrança não entrega itens nem renova efeitos. A história principal continua livre.</p>
    <article v-if="task && place" class="card legend-current"><h4>Investigando {{ taskName }} · pista {{ task.step + 1 }}/2</h4><p>Vá até {{ place.name }} e investigue a pista no local.</p><button type="button" @click="$emit('travel')">Seguir pista atual</button></article>
    <div class="legend-filters"><label>Região <select v-model="region"><option v-for="item in regions" :key="item">{{ item }}</option></select></label><label>Encontros <select v-model="filter"><option>Todas</option><option>Vividas</option><option>Por descobrir</option></select></label></div>
    <div class="legend-cards"><article v-for="entry in entries" :key="entry.id" class="card"><small>{{ entry.region }} · {{ entry.mythical ? 'Mítico' : 'Lendário' }}</small><h4>{{ entry.name }}</h4><p>{{ entry.title }}</p><p class="hint">{{ LEGEND_PLACES[entry.place].name }}</p><p v-if="state.seen[entry.id]" class="hint">Registrado em {{ new Date(state.seen[entry.id]!).toLocaleDateString('pt-BR') }}</p><button v-if="state.seen[entry.id]" type="button" @click="$emit('replay', entry.id)">Rever {{ entry.name }}</button><button v-else type="button" :disabled="!!state.active" @click="$emit('investigate', entry.id)">{{ task?.id === entry.id ? 'Continuar' : 'Investigar' }} {{ entry.name }}</button></article></div>
    <p v-if="!entries.length">Nenhum encontro neste filtro.</p>
  </section>
</template>
<style scoped>
.legend-filters { display: flex; flex-wrap: wrap; gap: 12px; margin-block: 14px; }.legend-filters label { display: grid; gap: 5px; }.legend-filters select { min-height: 44px; }
.legend-cards { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,220px),1fr)); gap: 12px; }.legend-cards article { min-width: 0; padding: 14px; }.legend-cards h4 { margin: 6px 0; }.legend-cards p { overflow-wrap: anywhere; }.legend-cards button { min-height: 44px; white-space: normal; }.legend-current { padding: 14px; }
</style>
