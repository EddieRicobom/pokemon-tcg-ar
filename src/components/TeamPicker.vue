<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import CardMarks from './CardMarks.vue';
import ElementTypeFilter from './ElementTypeFilter.vue';
import { pokemonSpriteUrl } from '../ar/sprite-url';
import { currentDexId } from '../app/moveset-store';
import { getCache } from '../app/services';
import { resolveTeam, TEAM_SIZE, toggleMember } from '../app/team';
import { savedTeam, setSavedTeam } from '../app/team-store';
import type { CachedCard } from '../cache/types';
import { boxSummary } from '../core/box-summary';
import type { PokemonType } from '../core/pokemon-data';
import { cardMatchesSpecies } from '../core/species-filter';
import { spriteIdOf } from '../core/dex-form';
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
/** Filtro rápido por tipo elemental: só esconde da grade, a equipe não muda. */
const typeFilter = ref<PokemonType | ''>('');
const notice = ref('');
const loadError = ref('');
const urls: string[] = [];
let disposed = false;

const usable = computed(() => rows.value.filter((row) => row.sprite.state === 'ok'));
const team = computed(() => resolveTeam(savedTeam.value, rows.value, props.max));
const shown = computed(() => {
  const q = search.value.trim().toLowerCase();
  return usable.value.filter((row) => (!onlySelected.value || team.value.ids.includes(row.id)) && (!q || `${row.name} ${row.setName}`.toLowerCase().includes(q)) && cardMatchesSpecies(row, { type: typeFilter.value || undefined }));
});
const missingSprite = computed(() => rows.value.length - usable.value.length);

/** O Pokémon cuja ficha aparece embaixo da grade: o último tocado. */
const focusedId = ref<string | null>(null);
const brokenSprites = ref<string[]>([]);
const dexOf = (row: Row): number | undefined => (row.dexIds?.length ? currentDexId(row.id, spriteIdOf(row)) : undefined);
const spriteOf = (row: Row): string | null => {
  const dex = dexOf(row);
  return dex === undefined || brokenSprites.value.includes(row.id) ? null : pokemonSpriteUrl(dex, isShiny(row));
};
const markBroken = (id: string): void => {
  if (!brokenSprites.value.includes(id)) brokenSprites.value = [...brokenSprites.value, id];
};
const party = computed(() => Array.from({ length: props.max }, (_, index) => usable.value.find((row) => row.id === team.value.ids[index]) ?? null));
const focused = computed(() => usable.value.find((row) => row.id === focusedId.value) ?? null);
const summary = computed(() => {
  const dex = focused.value ? dexOf(focused.value) : undefined;
  return dex === undefined ? null : boxSummary(dex);
});

function toggle(id: string): void {
  focusedId.value = id;
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
      <ElementTypeFilter v-model="typeFilter" />
      <p v-if="typeFilter && shown.length === 0" class="hint" role="status">Nenhum Pokémon desse tipo{{ onlySelected ? ' na equipe' : '' }}. Toque em «Todos» para ver os outros.</p>
      <ol class="box-party" :aria-label="`${groupLabel}: quem já foi escolhido`">
        <li v-for="(row, index) in party" :key="row?.id ?? `vaga-${index}`">
          <button v-if="row" type="button" class="box-slot filled" :class="{ focused: focusedId === row.id }" :aria-label="`Ver a ficha de ${row.name}`" @click="focusedId = row.id">
            <img v-if="spriteOf(row)" :src="spriteOf(row)!" alt="" @error="markBroken(row.id)" />
            <span v-else class="box-initials" aria-hidden="true">{{ row.name.slice(0, 2) }}</span>
          </button>
          <span v-else class="box-slot" aria-hidden="true">{{ index + 1 }}</span>
        </li>
      </ol>
      <ul class="box-grid">
        <li v-for="row in shown" :key="row.id">
          <button
            type="button"
            class="box-tile"
            :class="{ picked: team.ids.includes(row.id), focused: focusedId === row.id, 'is-shiny': isShiny(row) }"
            :aria-pressed="team.ids.includes(row.id)"
            :aria-label="`${row.name}, ${row.setName}: ${team.ids.includes(row.id) ? 'na equipe, toque para tirar' : 'toque para adicionar'}`"
            @click="toggle(row.id)"
          >
            <img v-if="spriteOf(row)" :src="spriteOf(row)!" alt="" loading="lazy" @error="markBroken(row.id)" />
            <img v-else-if="row.thumb" :src="row.thumb" alt="" loading="lazy" />
            <span v-else class="box-initials" aria-hidden="true">{{ row.name.slice(0, 2) }}</span>
            <span class="box-name">{{ row.name }}</span>
            <span v-if="team.ids.includes(row.id)" class="box-number" aria-hidden="true">{{ team.ids.indexOf(row.id) + 1 }}</span>
          </button>
        </li>
      </ul>
      <section class="box-info" aria-live="polite" aria-label="Ficha do Pokémon">
        <p v-if="!focused" class="hint">Toque num Pokémon: ele entra ou sai da equipe, e a ficha dele aparece aqui.</p>
        <template v-else>
          <div class="box-info-head">
            <img v-if="spriteOf(focused)" :src="spriteOf(focused)!" :alt="focused.name" />
            <div>
              <strong>{{ focused.name }}</strong>
              <CardMarks :card="focused" compact />
              <small>{{ focused.setName }}</small>
              <small>{{ team.ids.includes(focused.id) ? `Na posição ${team.ids.indexOf(focused.id) + 1} da equipe` : 'Fora da equipe' }}</small>
              <span v-if="summary" class="box-types">
                <b v-for="t in summary.types" :key="t.type" :style="{ background: t.color }">{{ t.label }}</b>
              </span>
            </div>
          </div>
          <template v-if="summary">
            <ul v-if="summary.stats" class="box-stats">
              <li v-for="stat in summary.stats" :key="stat.label">
                <span>{{ stat.label }}</span>
                <i><b :style="{ width: `${stat.pct}%` }"></b></i>
                <em>{{ stat.value }}</em>
              </li>
              <li class="box-total"><span>Total</span><em>{{ summary.total }}</em></li>
            </ul>
            <p v-else class="hint">Sem os atributos desta espécie: na luta, ela usa números médios.</p>
            <ul class="box-attacks">
              <li :style="{ '--attack': summary.main.color }"><small>Principal</small>{{ summary.main.typeLabel }} · {{ summary.main.name }} · {{ summary.main.form }}</li>
              <li :style="{ '--attack': summary.second.color }"><small>Secundário</small>{{ summary.second.typeLabel }} · {{ summary.second.name }} · {{ summary.second.form }}</li>
            </ul>
          </template>
          <p v-else class="hint">Sem número da Pokédex: não dá para mostrar a ficha.</p>
        </template>
      </section>
      <p v-if="shown.length === 0" class="message">Nenhuma carta com esse nome.</p>
      <p v-if="missingSprite > 0" class="meta">{{ missingSprite }} carta(s) sem Pokémon carregado não aparecem aqui (carregue em Cartas).</p>
    </template>
    <p v-if="notice" class="message error" role="alert">{{ notice }}</p>
  </div>
</template>

<style scoped>
.box-party {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
  margin: 0;
  padding: 6px;
  list-style: none;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.18);
}

.box-slot {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 1;
  min-height: 0;
  padding: 0;
  border: 1px dashed var(--line);
  border-radius: 8px;
  background: transparent;
  font-size: 0.75rem;
  opacity: 0.8;
}

.box-slot.filled {
  border-style: solid;
  opacity: 1;
}

.box-slot.focused,
.box-tile.focused {
  outline: 2px solid #ffd166;
  outline-offset: 1px;
}

.box-slot img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.box-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(62px, 1fr));
  gap: 6px;
  max-height: 300px;
  margin: 0;
  padding: 6px;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.18);
}

.box-tile {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 2px;
  width: 100%;
  min-height: 0;
  padding: 4px 2px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
}

.box-tile.picked {
  border-color: #4f8ce0;
  background: rgba(79, 140, 224, 0.22);
}

.box-tile.is-shiny .box-name {
  color: #ffd166;
}

.box-tile img {
  width: 44px;
  height: 44px;
  object-fit: contain;
}

.box-initials {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  font-weight: 800;
}

.box-name {
  max-width: 100%;
  overflow: hidden;
  font-size: 0.66rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.box-number {
  position: absolute;
  top: 2px;
  right: 2px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #4f8ce0;
  color: #fff;
  font-size: 0.68rem;
  font-weight: 800;
}

.box-info {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}

.box-info-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.box-info-head img {
  width: 84px;
  height: 84px;
  flex: none;
  object-fit: contain;
}

.box-info-head div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.box-types {
  display: flex;
  gap: 4px;
}

.box-types b {
  padding: 1px 8px;
  border-radius: 999px;
  color: #fff;
  font-size: 0.72rem;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.5);
}

.box-stats,
.box-attacks {
  display: grid;
  gap: 3px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.box-stats li {
  display: grid;
  grid-template-columns: 62px 1fr 32px;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
}

.box-stats i {
  height: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.12);
}

.box-stats i b {
  display: block;
  height: 100%;
  background: #6fbf52;
}

.box-stats em {
  font-style: normal;
  font-weight: 700;
  text-align: right;
}

.box-stats .box-total {
  grid-template-columns: 1fr auto;
}

.box-attacks {
  gap: 4px;
  font-size: 0.8rem;
}

.box-attacks li {
  display: grid;
  padding: 3px 8px;
  border-left: 3px solid var(--attack);
}

.box-attacks small {
  font-size: 0.68rem;
  opacity: 0.8;
}
</style>
