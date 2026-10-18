<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import CardMarks from './CardMarks.vue';
import { getCache } from '../app/services';
import { resolveTeam, TEAM_SIZE } from '../app/team';
import { savedTeam, setSavedTeam, toggleSaved } from '../app/team-store';
import type { CachedCard } from '../cache/types';
import { isShiny } from '../core/shiny';

const emit = defineEmits<{ change: [ids: string[]] }>();

type Row = CachedCard & { thumb?: string };
const rows = ref<Row[]>([]);
const loading = ref(true);
const search = ref('');
const notice = ref('');
const loadError = ref('');
const urls: string[] = [];

const usable = computed(() => rows.value.filter((row) => row.sprite.state === 'ok'));
const team = computed(() => resolveTeam(savedTeam.value, rows.value));
const shown = computed(() => {
  const q = search.value.trim().toLowerCase();
  return usable.value.filter((row) => !q || `${row.name} ${row.setName}`.toLowerCase().includes(q));
});
const missingSprite = computed(() => rows.value.length - usable.value.length);

function toggle(id: string): void {
  // Primeira escolha manual: parte da turma automática atual para não "sumir" com os outros.
  if (savedTeam.value.length === 0 && team.value.auto) setSavedTeam(team.value.ids);
  const full = toggleSaved(id);
  notice.value = full ? `A turma já tem ${TEAM_SIZE} Pokémon. Tire um para colocar outro.` : '';
  emit('change', resolveTeam(savedTeam.value, rows.value).ids);
}

function useAuto(): void {
  setSavedTeam([]);
  notice.value = '';
  emit('change', resolveTeam([], rows.value).ids);
}

onMounted(async () => {
  try {
    const cache = await getCache();
    const list = await cache.list();
    const out: Row[] = [];
    for (const card of list) {
      const row: Row = { ...card };
      if (card.reference.state === 'ok') {
        const blob = await cache.getAssetBlob(card, 'reference').catch(() => null);
        if (blob) {
          row.thumb = URL.createObjectURL(blob);
          urls.push(row.thumb);
        }
      }
      out.push(row);
    }
    rows.value = out;
  } catch (error) {
    loadError.value = `Não consegui abrir as cartas guardadas: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    loading.value = false;
  }
});
onBeforeUnmount(() => urls.splice(0).forEach((url) => URL.revokeObjectURL(url)));
</script>

<template>
  <div class="team-picker">
    <p class="hint">Toque para adicionar ou tirar da turma. A turma passeia na Caixa AR; em Equipe de batalha você decide quem luta. Tirar daqui mantém o Pokémon na coleção.</p>
    <p class="meta" role="status">
      Turma: {{ team.ids.length }}/{{ TEAM_SIZE }}
      <template v-if="team.auto && team.ids.length > 0"> (automática: as mais recentes)</template>
    </p>
    <p v-if="loading" class="message">Lendo as cartas guardadas…</p>
    <p v-else-if="loadError" class="message error" role="alert">{{ loadError }}</p>
    <p v-else-if="usable.length === 0" class="message">Nenhuma carta guardada com Pokémon ainda. Escaneie uma carta primeiro.</p>
    <template v-else>
      <div class="team-tools">
        <input v-model="search" type="text" placeholder="Buscar por nome ou coleção" aria-label="Buscar carta" autocomplete="off" />
        <button v-if="!team.auto" type="button" class="link" @click="useAuto">Usar as mais recentes</button>
      </div>
      <ul class="team-grid">
        <li v-for="row in shown" :key="row.id">
          <button type="button" class="team-card" :class="{ picked: team.ids.includes(row.id), 'is-shiny': isShiny(row) }" :aria-pressed="team.ids.includes(row.id)" @click="toggle(row.id)">
            <img v-if="row.thumb" :src="row.thumb" alt="" width="48" height="67" />
            <span v-else class="team-noimg" aria-hidden="true"></span>
            <span class="team-name">{{ row.name }}</span>
            <CardMarks :card="row" compact />
            <small>{{ row.setName }}</small>
            <small>{{ team.ids.includes(row.id) ? '✓ Na turma · tocar para tirar' : '+ Adicionar à turma' }}</small>
            <span v-if="team.ids.includes(row.id)" class="team-slot" aria-hidden="true">{{ team.ids.indexOf(row.id) + 1 }}</span>
          </button>
        </li>
      </ul>
      <p v-if="shown.length === 0" class="message">Nenhuma carta com esse nome.</p>
      <p v-if="missingSprite > 0" class="meta">{{ missingSprite }} carta(s) sem Pokémon carregado não aparecem aqui (carregue em Cartas).</p>
    </template>
    <p v-if="notice" class="message error" role="alert">{{ notice }}</p>
  </div>
</template>
