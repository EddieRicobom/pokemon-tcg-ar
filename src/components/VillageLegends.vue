<script setup lang="ts">
import { computed, ref } from 'vue';
import { LEGEND_STORIES, LEGEND_PLACES } from '../core/village/legendary-stories';
import type { LegendaryState } from '../core/village/legendary';
import { investigationPlace, legendStep } from '../core/village/legendary-investigation';
const props = defineProps<{ state: LegendaryState; regions: ReadonlySet<string> }>();
defineEmits<{ replay: [id: string]; travel: [id: string] }>();
const region = ref('Todas'), filter = ref('Todas');
/** Só as regiões cuja Liga foi vencida aparecem; encontros já vividos (saves antigos) continuam no Caderno. */
const stories = computed(() => LEGEND_STORIES.filter((entry) => props.regions.has(entry.region) || !!props.state.seen[entry.id]));
const regionNames = computed(() => [...new Set(stories.value.map((entry) => entry.region))]);
const entries = computed(() => stories.value.filter((entry) => (region.value === 'Todas' || entry.region === region.value) && (filter.value === 'Todas' || (filter.value === 'Vividas') === !!props.state.seen[entry.id])));
const seenCount = computed(() => stories.value.filter((entry) => props.state.seen[entry.id]).length);
const clue = (id: string) => investigationPlace(id, legendStep(props.state, id));
</script>
<template>
  <section class="village-legends" aria-label="Caderno de Lendas">
    <p v-if="!stories.length">Os lendários de cada região só aparecem depois de conquistar as 8 insígnias dela e vencer o campeão da Liga. Quando isso acontecer, as pistas daquela região ficam abertas na Vila.</p>
    <template v-else>
      <p>{{ seenCount }}/{{ stories.length }} encontros registrados nas regiões liberadas. As pistas de todos os lendários liberados ficam abertas ao mesmo tempo: ande pela Vila e use <strong>Investigar pista</strong> ou A quando estiver perto de uma.</p>
      <p class="hint">Encontros da Vila, sem captura automática. Rever uma lembrança não entrega itens nem renova efeitos. A história principal continua livre.</p>
      <div class="legend-filters"><label>Região <select v-model="region"><option>Todas</option><option v-for="item in regionNames" :key="item">{{ item }}</option></select></label><label>Encontros <select v-model="filter"><option>Todas</option><option>Vividas</option><option>Por descobrir</option></select></label></div>
      <div class="legend-cards"><article v-for="entry in entries" :key="entry.id" class="card"><small>{{ entry.region }} · {{ entry.mythical ? 'Mítico' : 'Lendário' }}</small><h4>{{ entry.name }}</h4><p>{{ entry.title }}</p><p class="hint">{{ LEGEND_PLACES[entry.place].name }}</p><p v-if="state.seen[entry.id]" class="hint">Registrado em {{ new Date(state.seen[entry.id]!).toLocaleDateString('pt-BR') }}</p><button v-if="state.seen[entry.id]" type="button" @click="$emit('replay', entry.id)">Rever {{ entry.name }}</button><template v-else><p class="hint">Pista {{ legendStep(state, entry.id) + 1 }}/2 · {{ clue(entry.id)?.name }}</p><p v-if="legendStep(state, entry.id) === 1" class="hint">“{{ entry.clue }}”</p><p v-else class="hint">Procure o primeiro sinal neste local e use Investigar pista.</p><button type="button" @click="$emit('travel', entry.id)">Ir até a pista</button></template></article></div>
      <p v-if="!entries.length">Nenhum encontro neste filtro.</p>
    </template>
  </section>
</template>
<style scoped>
.legend-filters { display: flex; flex-wrap: wrap; gap: 12px; margin-block: 14px; }.legend-filters label { display: grid; gap: 5px; }.legend-filters select { min-height: 44px; }
.legend-cards { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,220px),1fr)); gap: 12px; }.legend-cards article { min-width: 0; padding: 14px; }.legend-cards h4 { margin: 6px 0; }.legend-cards p { overflow-wrap: anywhere; }.legend-cards button { min-height: 44px; white-space: normal; }.legend-current { padding: 14px; }
</style>
