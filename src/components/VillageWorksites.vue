<script setup lang="ts">
import { computed } from 'vue';
import type { VillageState } from '../core/village/life';
import { FISH_PER_DAY } from '../core/village/life';
import { WORK_NAMES } from '../core/village/farm';
import { WORK_SITES } from '../core/village/town-layout';
import type { WorksiteId } from '../core/village/town-layout';
import { dayKey } from '../core/trainer';

const props = defineProps<{ state: VillageState; nameOf: (id: string) => string }>();
defineEmits<{ visit: [id: WorksiteId]; seeds: [] }>();
const castsLeft = computed(() => props.state.fishing.day === dayKey(new Date()) ? Math.max(0, FISH_PER_DAY - props.state.fishing.casts) : FISH_PER_DAY);
</script>

<template>
  <section class="worksites" aria-label="Trabalhos dos moradores">
    <p>Moradores livres escolhem entre fazenda, mineração, madeira e pesca conforme aptidões, interesses e energia. Eles caminham até o recurso e trabalham por 10 segundos antes de concluir; até três trabalham ao mesmo tempo.</p>
    <p class="hint">Os itens entram na sua mochila. Descanso, passeios e vida social continuam fazendo parte da rotina. Dormir, acompanhar você ou estar em uma expedição impede receber trabalho. Menus interrompem as tarefas; o app fechado não gera produção destes postos.</p>
    <div class="worksite-grid">
      <article v-for="site in WORK_SITES" :key="site.id" class="card">
        <h4>{{ site.icon }} {{ site.name }}</h4>
        <small>{{ site.location }}</small>
        <p>{{ site.description }}</p>
        <p v-if="site.id === 'fishing'" role="status">{{ castsLeft }} lançamentos disponíveis hoje.</p>
        <div class="worksite-actions">
          <button type="button" @click="$emit('visit', site.id)">Caminhar até {{ site.name }}</button>
          <button v-if="site.id === 'farm'" type="button" @click="$emit('seeds')">Caixa de sementes</button>
        </div>
      </article>
    </div>
    <h4>Trabalhos concluídos</h4>
    <p v-if="!state.farm.history.length" class="hint">Nenhum trabalho registrado ainda. Passeie pela Vila para dar tempo aos moradores de escolher e concluir uma atividade.</p>
    <ol v-else class="work-history">
      <li v-for="(entry, index) in state.farm.history.slice().reverse()" :key="`${entry.at}:${entry.residentId}:${index}`">
        <strong>{{ nameOf(entry.residentId) }} · {{ entry.kind ? WORK_NAMES[entry.kind] : 'Trabalho na Vila' }}</strong>
        <span>{{ entry.message }}</span>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.worksite-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 12px; }
.worksite-grid article { min-width: 0; padding: 14px; }
.worksite-grid h4 { margin: 0 0 6px; }
.worksite-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.worksite-actions button { white-space: normal; min-height: 44px; }
.work-history { list-style: none; padding: 0; }
.work-history li { display: grid; gap: 6px; padding: 12px 0; border-bottom: 1px solid var(--ui-border); overflow-wrap: anywhere; }
</style>
