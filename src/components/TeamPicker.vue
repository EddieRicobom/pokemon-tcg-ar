<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import CardMarks from './CardMarks.vue';
import { getCache } from '../app/services';
import { resolveTeam, TEAM_SIZE, toggleMember } from '../app/team';
import { savedTeam, setSavedTeam } from '../app/team-store';
import type { CachedCard } from '../cache/types';
import { isShiny } from '../core/shiny';
import { digitalBoxRows } from '../app/digital-members';
import type { DigitalBoxRow } from '../app/digital-members';
import { loadVillage } from '../app/village-store';

const emit = defineEmits<{ change: [ids: string[]]; ready: [ids: string[]] }>();
const props = withDefaults(defineProps<{ max?: number; hint?: string; groupLabel?: string }>(), { max: TEAM_SIZE, hint: undefined, groupLabel: 'Vila' });

type Row = (CachedCard | DigitalBoxRow) & { thumb?: string };
const rows = ref<Row[]>([]);
const loading = ref(true);
const search = ref('');
const onlySelected = ref(false);
const notice = ref('');
const loadError = ref('');
const urls: string[] = [];
let disposed = false;

const usable = computed(() => rows.value.filter((row) => row.sprite.state === 'ok'));
const team = computed(() => resolveTeam(savedTeam.value, rows.value, props.max));
const shown = computed(() => {
  const q = search.value.trim().toLowerCase();
  return usable.value.filter((row) => (!onlySelected.value || team.value.ids.includes(row.id)) && (!q || `${row.name} ${row.setName}`.toLowerCase().includes(q)));
});
const missingSprite = computed(() => rows.value.length - usable.value.length);

function toggle(id: string): void {
  // Parte sempre da equipe já limitada na tela: a Arena usa isso para guardar só seis sem apagar por engano antes do toque.
  const next = toggleMember(team.value.ids, id, props.max);
  notice.value = next.full ? `A equipe já tem ${props.max} Pokémon. Tire um para colocar outro.` : '';
  if (!next.full) setSavedTeam(next.team);
  emit('change', resolveTeam(savedTeam.value, rows.value, props.max).ids);
}

function useAuto(): void {
  setSavedTeam([]);
  notice.value = '';
  emit('change', resolveTeam([], rows.value, props.max).ids);
}

onMounted(async () => {
  try {
    const cache = await getCache();
    const list = await cache.list();
    if (disposed) return;
    const out: Row[] = [];
    for (const card of [...list, ...digitalBoxRows(loadVillage().digital)]) {
      const row: Row = { ...card };
      if (!('digital' in card) && card.reference.state === 'ok') {
        const blob = await cache.getAssetBlob(card, 'reference').catch(() => null);
        if (disposed) return;
        if (blob) {
          row.thumb = URL.createObjectURL(blob);
          urls.push(row.thumb);
        }
      }
      out.push(row);
    }
    rows.value = out;
    emit('ready', team.value.ids);
  } catch (error) {
    if (disposed) return;
    loadError.value = `Não consegui abrir as cartas guardadas: ${error instanceof Error ? error.message : String(error)}`;
    emit('ready', []);
  } finally {
    loading.value = false;
  }
});
onBeforeUnmount(() => { disposed = true; urls.splice(0).forEach((url) => URL.revokeObjectURL(url)); });
</script>

<template>
  <div class="team-picker">
    <p class="hint">{{ hint ?? 'Escolha quem mora na Vila. Os moradores também podem lutar na Arena; tirar daqui mantém o Pokémon na coleção.' }}</p>
    <p class="meta" role="status">
      {{ groupLabel }}: {{ team.ids.length }}/{{ max }}
      <template v-if="team.auto && team.ids.length > 0"> (automática: as mais recentes)</template>
    </p>
    <p v-if="loading" class="message">Lendo as cartas guardadas…</p>
    <p v-else-if="loadError" class="message error" role="alert">{{ loadError }}</p>
    <p v-else-if="usable.length === 0" class="message">Nenhuma carta guardada com Pokémon ainda. Escaneie uma carta primeiro.</p>
    <template v-else>
      <div class="selection-tabs" role="group" aria-label="Mostrar Pokémon">
        <button type="button" :aria-pressed="!onlySelected" @click="onlySelected = false">Todos · {{ usable.length }}</button>
        <button type="button" :aria-pressed="onlySelected" @click="onlySelected = true">Selecionados · {{ team.ids.length }}</button>
      </div>
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
            <small>{{ team.ids.includes(row.id) ? `✓ Na ${groupLabel} · tirar` : `+ Adicionar à ${groupLabel}` }}</small>
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
