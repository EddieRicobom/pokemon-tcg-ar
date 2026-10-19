<script setup lang="ts">
import { computed } from 'vue';
import { ITEMS } from '../core/village/catalog';
import type { VillageState } from '../core/village/life';
import { transferFarmSeeds } from '../core/village/farm';

const props = defineProps<{ state: VillageState; nameOf: (id: string) => string }>();
const emit = defineEmits<{ change: [] }>();
const seeds = computed(() => ITEMS.filter((item) => item.kind === 'seed' && ((props.state.inventory[item.id] ?? 0) > 0 || (props.state.farm.seeds[item.id] ?? 0) > 0)));
function transfer(seed: string, amount: number, deposit: boolean): void {
  if (transferFarmSeeds(props.state, seed, amount, deposit)) emit('change');
}
</script>

<template>
  <section aria-label="Sementes e trabalho da fazenda">
    <p>Deixe sementes aqui para os moradores plantarem nos canteiros da fazenda. A colheita e as sementes recuperadas vão para sua mochila.</p>
    <p class="hint">Enquanto você passeia pela Vila, moradores livres podem escolher cuidar da horta conforme suas aptidões, interesses e energia. Eles caminham até o canteiro e trabalham antes de concluir. Quem está dormindo, acompanhando você ou em uma expedição não recebe tarefas.</p>
    <p class="hint">Sair da Vila ou abrir um menu interrompe tarefas sem consumir sementes. O crescimento segue as regras da horta; não há trabalho da caixa com o aplicativo fechado.</p>
    <p v-if="!seeds.length">Não há sementes na mochila nem na caixa. Você pode comprar sementes na loja.</p>
    <ul class="seed-list">
      <li v-for="seed in seeds" :key="seed.id">
        <strong>{{ seed.name }}</strong>
        <span>Mochila: {{ state.inventory[seed.id] ?? 0 }} · Caixa: {{ state.farm.seeds[seed.id] ?? 0 }}</span>
        <div class="seed-actions">
          <button type="button" :disabled="!(state.inventory[seed.id] ?? 0) || (state.farm.seeds[seed.id] ?? 0) >= 999" @click="transfer(seed.id, 1, true)">Depositar 1</button>
          <button type="button" :disabled="!(state.inventory[seed.id] ?? 0) || (state.farm.seeds[seed.id] ?? 0) >= 999" @click="transfer(seed.id, 999, true)">Depositar todas</button>
          <button type="button" :disabled="!(state.farm.seeds[seed.id] ?? 0) || (state.inventory[seed.id] ?? 0) >= 999" @click="transfer(seed.id, 1, false)">Retirar 1</button>
          <button type="button" :disabled="!(state.farm.seeds[seed.id] ?? 0) || (state.inventory[seed.id] ?? 0) >= 999" @click="transfer(seed.id, 999, false)">Retirar todas</button>
        </div>
      </li>
    </ul>
    <details v-if="state.farm.history.length">
      <summary>Trabalhos concluídos · {{ state.farm.history.length }} registros recentes</summary>
      <ul class="seed-list"><li v-for="(entry, index) in state.farm.history.slice().reverse()" :key="index"><strong>{{ nameOf(entry.residentId) }}</strong><span>{{ entry.message }}</span></li></ul>
    </details>
  </section>
</template>

<style scoped>
.seed-list { list-style: none; padding: 0; }
.seed-list li { display: grid; gap: 8px; margin: 12px 0; padding: 12px; border: 1px solid #667086; border-radius: 12px; }
.seed-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.seed-actions button { min-width: 0; white-space: normal; }
</style>
