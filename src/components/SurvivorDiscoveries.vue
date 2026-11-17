<script setup lang="ts">
import { computed } from 'vue';
import { speciesName } from '../core/survivor-evolution';
import { TYPE_LABELS_PT } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';

const props = defineProps<{
  alphas: Record<number, { found: number; defeated: number }>;
  terastal: Partial<Record<PokemonType, number>>;
}>();
const alphaRows = computed(() => Object.entries(props.alphas).map(([dexId, count]) => ({
  dexId, name: Number(dexId) > 0 ? speciesName(Number(dexId)) || `Pokémon nº ${dexId}` : 'Pokémon desconhecido', ...count,
})));
const teraRows = computed(() => (Object.entries(props.terastal) as [PokemonType, number][])
  .filter(([, count]) => count > 0));
const total = computed(() => alphaRows.value.reduce((sum, row) => sum + row.found, 0)
  + teraRows.value.reduce((sum, [, count]) => sum + count, 0));
</script>

<template>
  <details v-if="total" class="survivor-discoveries">
    <summary>Descobertas raras · {{ total }}</summary>
    <p>Alfas surgidos e cristais coletados nesta corrida.</p>
    <ul>
      <li v-for="row in alphaRows" :key="`alpha-${row.dexId}`">
        <strong>{{ row.name }} Alfa</strong>
        <span>{{ row.found }} surgido{{ row.found === 1 ? '' : 's' }} · {{ row.defeated }} derrotado{{ row.defeated === 1 ? '' : 's' }}</span>
      </li>
      <li v-for="[type, count] in teraRows" :key="`tera-${type}`">
        <strong>Terastalização · {{ TYPE_LABELS_PT[type] }}</strong>
        <span>{{ count }} {{ count === 1 ? 'cristal coletado' : 'cristais coletados' }}</span>
      </li>
    </ul>
  </details>
</template>

<style scoped>
.survivor-discoveries { margin: 12px 0; padding: 10px 12px; border: 1px solid #8b9ba455; border-radius: 8px; text-align: left; }
summary { cursor: pointer; font-weight: 600; font-size: .9rem; }
p { margin: 8px 0; font-size: .8rem; opacity: .75; }
ul { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
li { display: grid; gap: 2px; font-size: .82rem; }
li span { opacity: .8; }
</style>
