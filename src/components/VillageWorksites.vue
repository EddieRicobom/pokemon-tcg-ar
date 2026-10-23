<script setup lang="ts">
import { computed } from 'vue';
import type { VillageState } from '../core/village/life';
import { FISH_PER_DAY } from '../core/village/life';
import { farmTaskProgress, WORK_NAMES } from '../core/village/farm';
import type { FarmTask } from '../core/village/farm';
import { WORK_SITES } from '../core/village/town-layout';
import type { WorksiteId } from '../core/village/town-layout';
import { dayKey } from '../core/trainer';
import { PROFESSIONS, professionActive } from '../core/village/professions';

const props = defineProps<{ state: VillageState; population?: number; cafeAvailable?: boolean; nameOf: (id: string) => string; tasks?: readonly FarmTask[]; now?: number }>();
defineEmits<{ visit: [id: WorksiteId]; seeds: [] }>();
const castsLeft = computed(() => props.state.fishing.day === dayKey(new Date()) ? Math.max(0, FISH_PER_DAY - props.state.fishing.casts) : FISH_PER_DAY);
const activeTasks = computed(() => (props.tasks ?? []).map((task) => ({ task, progress: farmTaskProgress(task, props.now ?? Date.now()) })));
</script>

<template>
  <section class="worksites" aria-label="Trabalhos dos moradores">
    <h4>Profissões e população</h4>
    <ul class="profession-unlocks">
      <li v-for="job in PROFESSIONS" :key="job.id"><span>{{ job.icon }} {{ job.name }}</span><strong>{{ job.id === 'cafe' && cafeAvailable === false ? 'Café abre no nível 3 de Treinador' : professionActive(job.id, population ?? 0) ? 'Ativa' : `Precisa de ${job.min} moradores (${population ?? 0}/${job.min})` }}</strong></li>
    </ul>
    <p class="hint">Tarefas e entregas concluídas rendem salário pessoal, limitado a 80 moedas por morador por dia. Cada um usa sua carteira para móveis, reformas e pedidos de 12 moedas no Café. Não há salário só por deixar o tempo passar.</p>
    <p v-if="state.cafeWaiterId && cafeAvailable !== false && professionActive('cafe', population ?? 0)">☕ {{ nameOf(state.cafeWaiterId) }} atende as mesas. ✉️ {{ state.mailCarrierId ? nameOf(state.mailCarrierId) : 'O carteiro' }} faz as entregas. Os dois também conversam, passeiam e descansam.</p>
    <details><summary>Carteiras dos moradores</summary><ul class="profession-unlocks"><li v-for="(wallet, id) in state.residentEconomy" :key="id"><span>{{ nameOf(String(id)) }}</span><strong>{{ wallet.coins }} moedas · ganhou {{ wallet.earned }} · gastou {{ wallet.spent }}</strong></li></ul></details>
    <p>Moradores livres escolhem entre fazenda, mineração, madeira e pesca conforme aptidões, interesses e energia. Eles caminham até o recurso e trabalham por cerca de 30 segundos antes de concluir; até cinco podem trabalhar ao mesmo tempo.</p>
    <p class="hint">Os itens entram na sua mochila. Descanso, passeios e vida social continuam fazendo parte da rotina. Dormir, acompanhar você ou estar em uma expedição impede receber trabalho. Menus interrompem as tarefas; o app fechado não gera produção destes postos.</p>
    <section v-if="activeTasks.length" class="worksite-active" aria-labelledby="active-work-title">
      <h4 id="active-work-title">Moradores trabalhando agora</h4>
      <ul>
        <li v-for="entry in activeTasks" :key="entry.task.residentId">
          <span><strong>{{ nameOf(entry.task.residentId) }}</strong> · {{ WORK_NAMES[entry.task.kind] }}</span>
          <span class="worksite-progress-label">{{ entry.progress.phase === 'caminho' ? 'A caminho do posto' : `Trabalhando · ${entry.progress.percent}%` }}</span>
          <progress v-if="entry.progress.phase === 'trabalho'" :value="entry.progress.percent" max="100">{{ entry.progress.percent }}%</progress>
        </li>
      </ul>
    </section>
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
.profession-unlocks { display: grid; gap: 8px; padding: 0; list-style: none; }
.profession-unlocks li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; padding: 9px; border-bottom: 1px solid var(--ui-border); font-size: .85rem; }
.worksite-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 12px; }
.worksite-grid article { min-width: 0; padding: 14px; }
.worksite-grid h4 { margin: 0 0 6px; }
.worksite-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.worksite-actions button { white-space: normal; min-height: 44px; }
.work-history { list-style: none; padding: 0; }
.work-history li { display: grid; gap: 6px; padding: 12px 0; border-bottom: 1px solid var(--ui-border); overflow-wrap: anywhere; }
.worksite-active { margin: 18px 0; padding: 12px; border: 1px solid var(--ui-border); border-radius: 12px; background: color-mix(in srgb, var(--ui-panel) 78%, #6bdcff 22%); }
.worksite-active h4 { margin: 0 0 8px; }
.worksite-active ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.worksite-active li { display: grid; gap: 4px; }
.worksite-progress-label { color: var(--ui-muted); font-size: .9em; }
.worksite-active progress { width: 100%; accent-color: #5ac8fa; }
</style>
