<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import CardMarks from './CardMarks.vue';
import ElementTypeFilter from './ElementTypeFilter.vue';
import { pokemonSpriteUrl, pokemonStaticSpriteUrls } from '../ar/sprite-url';
import { currentDexId } from '../app/moveset-store';
import { getCache } from '../app/services';
import { resolveTeam, TEAM_SIZE, toggleMember } from '../app/team';
import { savedTeam, setSavedTeam } from '../app/team-store';
import type { CachedCard } from '../cache/types';
import { boxSummary } from '../core/box-summary';
import type { BoxSummary } from '../core/box-summary';
import { POKEMON_TYPES, TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import { compareStats, replaceMember, suggestTeam, teamCoverage } from '../core/team-insight';
import type { SuggestedPick, TeamInsightMember } from '../core/team-insight';
import { TYPE_GLYPHS } from '../core/type-glyphs';
import { spriteIdOf } from '../core/dex-form';
import { isShiny } from '../core/shiny';
import { digitalBoxRows } from '../app/digital-members';
import type { DigitalBoxRow } from '../app/digital-members';
import { loadVillage } from '../app/village-store';

const emit = defineEmits<{ change: [ids: string[]]; ready: [ids: string[]]; available: [count: number] }>();
const props = withDefaults(defineProps<{ max?: number; hint?: string; groupLabel?: string }>(), { max: TEAM_SIZE, hint: undefined, groupLabel: 'Vila' });

/** Equipe de luta (6 vagas): mostra cobertura de tipos, sugestão e comparação. A Caixa e a Vila, com até 40, não precisam. */
const battleMode = computed(() => props.max <= 6);

type Row = CachedCard | DigitalBoxRow;
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
const dexOf = (row: Row): number | undefined => (row.dexIds?.length ? currentDexId(row.id, spriteIdOf(row)) : undefined);

/** A ficha só depende da espécie: uma vez por espécie, mesmo com centenas de cartas na grade. */
const summaries = new Map<number, BoxSummary>();
function summaryOfDex(dex: number): BoxSummary {
  let summary = summaries.get(dex);
  if (!summary) {
    summary = boxSummary(dex);
    summaries.set(dex, summary);
  }
  return summary;
}
const summaryOf = (row: Row): BoxSummary | null => {
  const dex = dexOf(row);
  return dex === undefined ? null : summaryOfDex(dex);
};
/** Tipos da forma que aparece na tela (com a evolução da jornada), os mesmos que a luta usa. */
const typesOfRow = (row: Row): PokemonType[] => summaryOf(row)?.types.map((t) => t.type) ?? [];
const typeCounts = computed(() => {
  const counts: Partial<Record<PokemonType, number>> = {};
  for (const row of usable.value) for (const type of typesOfRow(row)) counts[type] = (counts[type] ?? 0) + 1;
  return counts;
});
const shown = computed(() => {
  const q = search.value.trim().toLowerCase();
  const wanted = typeFilter.value;
  return usable.value.filter((row) => (!onlySelected.value || team.value.ids.includes(row.id)) && (!q || `${row.name} ${row.setName}`.toLowerCase().includes(q)) && (!wanted || typesOfRow(row).includes(wanted)));
});
const missingSprite = computed(() => rows.value.length - usable.value.length);
const filtering = computed(() => onlySelected.value || search.value.trim() !== '' || typeFilter.value !== '');
const emptyMessage = computed(() => {
  const q = search.value.trim();
  const where = onlySelected.value ? ' entre os selecionados' : '';
  if (q && typeFilter.value) return `Nenhum Pokémon de ${TYPE_LABELS_PT[typeFilter.value]} com «${q}»${where}.`;
  if (q) return `Nenhum Pokémon com «${q}»${where}.`;
  if (typeFilter.value) return `Nenhum Pokémon de ${TYPE_LABELS_PT[typeFilter.value]}${where}.`;
  return 'Ninguém selecionado ainda.';
});
function clearFilters(): void {
  search.value = '';
  typeFilter.value = '';
  onlySelected.value = false;
}

/** O Pokémon cuja ficha aparece embaixo da grade: o último tocado. */
const focusedId = ref<string | null>(null);
/** Com quem a ficha compara (alguém da equipe). */
const compareId = ref<string | null>(null);
const brokenStatic = ref<string[]>([]);
const brokenAnimated = ref<string[]>([]);
/** Na grade e nas vagas vai o PNG estático; o GIF animado, bem mais pesado, só na ficha aberta. */
const staticOf = (row: Row): string | null => {
  const dex = dexOf(row);
  return dex === undefined || brokenStatic.value.includes(row.id) ? null : pokemonStaticSpriteUrls(dex, isShiny(row))[0] ?? null;
};
const animatedOf = (row: Row): string | null => {
  const dex = dexOf(row);
  return dex === undefined || brokenAnimated.value.includes(row.id) ? staticOf(row) : pokemonSpriteUrl(dex, isShiny(row));
};
function markStaticBroken(row: Row): void {
  if (!brokenStatic.value.includes(row.id)) brokenStatic.value = [...brokenStatic.value, row.id];
  void loadThumb(row);
}
function markAnimatedBroken(row: Row): void {
  if (!brokenAnimated.value.includes(row.id)) brokenAnimated.value = [...brokenAnimated.value, row.id];
}

const thumbs = ref<Record<string, string>>({});
const thumbAsked = new Set<string>();
/** A foto da carta só é lida para quem não tem sprite para mostrar: abrir a grade não custa uma leitura por carta. */
async function loadThumb(row: Row): Promise<void> {
  if ('digital' in row || row.reference.state !== 'ok' || thumbAsked.has(row.id)) return;
  thumbAsked.add(row.id);
  const blob = await (await getCache()).getAssetBlob(row, 'reference').catch(() => null);
  if (disposed || !blob) return;
  const url = URL.createObjectURL(blob);
  urls.push(url);
  thumbs.value = { ...thumbs.value, [row.id]: url };
}

const party = computed(() => Array.from({ length: props.max }, (_, index) => rows.value.find((row) => row.id === team.value.ids[index]) ?? null));
const focused = computed(() => rows.value.find((row) => row.id === focusedId.value) ?? null);
const focusedInTeam = computed(() => !!focused.value && team.value.ids.includes(focused.value.id));
const summary = computed(() => (focused.value ? summaryOf(focused.value) : null));

/** Só quem está na equipe, e não é o próprio Pokémon da ficha, serve de comparação. */
const compareOptions = computed(() => party.value.flatMap((row) => (row && row.id !== focusedId.value ? [row] : [])));
const compared = computed(() => compareOptions.value.find((row) => row.id === compareId.value) ?? null);
const comparison = computed(() => {
  const other = compared.value ? summaryOf(compared.value) : null;
  return summary.value && other ? compareStats(summary.value, other) : null;
});
const diffOf = (label: string): number => comparison.value?.rows.find((row) => row.label === label)?.diff ?? 0;
const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));
function toggleCompare(id: string): void {
  compareId.value = compareId.value === id ? null : id;
}

const asMember = (row: Row): TeamInsightMember => ({ id: row.id, name: row.name, dexId: dexOf(row) });
const coverage = computed(() => {
  if (!battleMode.value || team.value.ids.length === 0) return null;
  return teamCoverage(party.value.flatMap((row) => (row ? [asMember(row)] : [])));
});
const typeLabel = (type: PokemonType): string => TYPE_LABELS_PT[type];
const typeGlyph = (type: PokemonType): string => TYPE_GLYPHS[type];
const typeColor = (type: PokemonType): string => TYPE_COLORS[type];

/** O que a última sugestão explicou e como voltar atrás. */
const suggestion = ref<SuggestedPick[] | null>(null);
const undoTeam = ref<string[] | null>(null);
const shortForSuggestion = computed(() => (suggestion.value && suggestion.value.length < props.max ? props.max - suggestion.value.length : 0));
function forgetSuggestion(): void {
  suggestion.value = null;
  undoTeam.value = null;
}
function publish(): void {
  emit('change', resolveTeam(savedTeam.value, rows.value, props.max).ids);
}
function suggest(): void {
  const result = suggestTeam(usable.value.map(asMember), props.max);
  if (result.ids.length === 0) {
    notice.value = 'Nenhum Pokémon guardado tem dados de espécie para montar uma sugestão.';
    return;
  }
  undoTeam.value = [...savedTeam.value];
  setSavedTeam(result.ids);
  suggestion.value = result.picks;
  notice.value = '';
  compareId.value = null;
  publish();
}
function undoSuggestion(): void {
  if (undoTeam.value) setSavedTeam(undoTeam.value);
  forgetSuggestion();
  publish();
}

const infoBox = ref<HTMLElement | null>(null);
/** Com a equipe cheia, abre a comparação com quem tem o menor total: o candidato natural para sair. */
function offerSwap(): void {
  const scored = compareOptions.value.map((row) => ({ row, total: summaryOf(row)?.total ?? Number.POSITIVE_INFINITY }));
  compareId.value = [...scored].sort((a, b) => a.total - b.total)[0]?.row.id ?? null;
  void nextTick(() => infoBox.value?.scrollIntoView?.({ block: 'nearest' }));
}

function toggle(id: string): void {
  if (focusedId.value !== id) compareId.value = null;
  focusedId.value = id;
  // Parte sempre da equipe já limitada na tela: a Arena usa isso para guardar só seis sem apagar por engano antes do toque.
  const next = toggleMember(team.value.ids, id, props.max);
  if (next.full) {
    notice.value = `A equipe já tem ${props.max} Pokémon. Tire um para colocar outro.`;
    if (battleMode.value) offerSwap();
    return;
  }
  // Lista vazia significa «automática», então o último a sair traz de volta as mais recentes: melhor avisar do que surpreender.
  notice.value = next.team.length === 0 ? 'Sem ninguém escolhido, a equipe voltou a ser automática (as mais recentes).' : '';
  setSavedTeam(next.team);
  forgetSuggestion();
  publish();
}

function useAuto(): void {
  setSavedTeam([]);
  notice.value = '';
  forgetSuggestion();
  publish();
}

function swapFocusedIn(): void {
  if (!focused.value || !compared.value) return;
  setSavedTeam(replaceMember(team.value.ids, compared.value.id, focused.value.id));
  notice.value = '';
  compareId.value = null;
  forgetSuggestion();
  publish();
}

const factsLabel = (row: Row): string => {
  const facts = summaryOf(row);
  if (!facts) return 'sem dados da espécie';
  const types = facts.types.map((t) => t.label).join(' e ') || 'tipo desconhecido';
  return `${types}, golpe ${facts.main.form}`;
};

/** A Arena guarda só os escolhidos aqui: quem tinha uma equipe maior na Caixa precisa saber antes de mexer. */
const trimsBiggerTeam = computed(() => battleMode.value && savedTeam.value.length > props.max);

onMounted(async () => {
  try {
    const cache = await getCache();
    const list = await cache.list();
    if (disposed) return;
    rows.value = [...list, ...digitalBoxRows(loadVillage().digital)];
    loading.value = false;
    emit('ready', team.value.ids);
    emit('available', usable.value.length);
    for (const row of rows.value) if (dexOf(row) === undefined) void loadThumb(row);
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
      <ol class="box-party" :aria-label="`${groupLabel}: quem já foi escolhido`">
        <li v-for="(row, index) in party" :key="row?.id ?? `vaga-${index}`">
          <button v-if="row" type="button" class="box-slot filled" :class="{ focused: focusedId === row.id, missing: row.sprite.state !== 'ok' }" :aria-label="row.sprite.state === 'ok' ? `Ver a ficha de ${row.name}` : `Ver a ficha de ${row.name}: Pokémon ainda não carregado`" @click="focusedId = row.id">
            <img v-if="staticOf(row)" :src="staticOf(row)!" alt="" width="44" height="44" decoding="async" @error="markStaticBroken(row)" />
            <span v-else class="box-initials" aria-hidden="true">{{ row.name.slice(0, 2) }}</span>
            <span v-if="row.sprite.state !== 'ok'" class="box-warn" aria-hidden="true">!</span>
          </button>
          <span v-else class="box-slot" aria-hidden="true">{{ index + 1 }}</span>
        </li>
      </ol>

      <section v-if="battleMode" class="team-insight" aria-label="Cobertura de tipos da equipe">
        <div class="team-insight-actions">
          <button type="button" class="team-suggest" @click="suggest">✨ Sugerir equipe</button>
          <button v-if="undoTeam" type="button" class="team-undo" @click="undoSuggestion">Desfazer</button>
        </div>
        <ul v-if="suggestion" class="team-reasons" aria-label="Por que cada Pokémon foi sugerido">
          <li v-for="pick in suggestion" :key="pick.id"><strong>{{ pick.name }}</strong> <span>{{ pick.reason }}</span></li>
          <li v-if="shortForSuggestion > 0" class="team-reasons-short">Faltam {{ shortForSuggestion }}: não há mais Pokémon com dados para sugerir.</li>
        </ul>
        <template v-if="coverage">
          <p class="team-cover-title"><strong>Golpes fortes contra {{ coverage.covered.length }} de {{ POKEMON_TYPES.length }} tipos</strong></p>
          <ul class="team-cover" :aria-label="`Sem golpe forte contra: ${coverage.missing.map(typeLabel).join(', ') || 'nenhum tipo'}`">
            <li v-for="type in POKEMON_TYPES" :key="type" :class="{ on: coverage.covered.includes(type) }" :style="{ '--c': typeColor(type) }" :title="typeLabel(type)" aria-hidden="true">{{ typeGlyph(type) }}</li>
          </ul>
          <p v-if="coverage.threats.length" class="team-threat">⚠️ Cuidado com <template v-for="(threat, index) in coverage.threats.slice(0, 2)" :key="threat.type">{{ index ? ' e ' : '' }}<strong>{{ typeLabel(threat.type) }}</strong> ({{ threat.weak }} fracos)</template>.</p>
          <p v-else class="team-threat ok">Nenhum tipo pega dois ou mais da equipe sem resistência.</p>
          <p v-if="coverage.unknown.length" class="team-threat">Sem dados de tipo: {{ coverage.unknown.join(', ') }}.</p>
        </template>
        <p v-else class="team-threat">Escolha alguém para ver a cobertura de tipos.</p>
      </section>

      <p v-if="trimsBiggerTeam" class="hint" role="note">Sua equipe da Caixa tem {{ savedTeam.length }} Pokémon. A luta usa os {{ max }} primeiros; mudar aqui deixa a equipe só com estes {{ max }}.</p>

      <div class="selection-tabs" role="group" aria-label="Mostrar Pokémon">
        <button type="button" :aria-pressed="!onlySelected" @click="onlySelected = false">Todos · {{ usable.length }}</button>
        <button type="button" :aria-pressed="onlySelected" @click="onlySelected = true">Selecionados · {{ team.ids.length }}</button>
      </div>
      <div class="team-tools">
        <input v-model="search" type="text" placeholder="Buscar por nome ou coleção" aria-label="Buscar carta" autocomplete="off" />
        <button v-if="!team.auto" type="button" class="link team-auto" @click="useAuto">Usar as mais recentes</button>
      </div>
      <ElementTypeFilter v-model="typeFilter" :counts="typeCounts" />
      <p v-if="notice" class="message error" role="alert">{{ notice }}</p>
      <ul v-if="shown.length > 0" class="box-grid">
        <li v-for="row in shown" :key="row.id">
          <button
            type="button"
            class="box-tile"
            :class="{ picked: team.ids.includes(row.id), focused: focusedId === row.id, 'is-shiny': isShiny(row) }"
            :aria-pressed="team.ids.includes(row.id)"
            :aria-label="`${row.name}, ${row.setName}, ${factsLabel(row)}: ${team.ids.includes(row.id) ? 'na equipe, toque para tirar' : 'toque para adicionar'}`"
            @click="toggle(row.id)"
          >
            <img v-if="staticOf(row)" :src="staticOf(row)!" alt="" width="44" height="44" loading="lazy" decoding="async" @error="markStaticBroken(row)" />
            <img v-else-if="thumbs[row.id]" :src="thumbs[row.id]" alt="" width="44" height="44" loading="lazy" decoding="async" />
            <span v-else class="box-initials" aria-hidden="true">{{ row.name.slice(0, 2) }}</span>
            <span class="box-name">{{ row.name }}</span>
            <span class="box-facts" aria-hidden="true">
              <template v-if="summaryOf(row)">
                <i v-for="t in summaryOf(row)!.types" :key="t.type" class="box-glyph" :style="{ background: t.color }" :title="t.label">{{ typeGlyph(t.type) }}</i>
                <i v-if="summaryOf(row)!.types.length === 0" class="box-glyph unknown" title="Tipo desconhecido">?</i>
                <em>{{ summaryOf(row)!.main.form }}</em>
              </template>
              <em v-else>Sem dados</em>
            </span>
            <span v-if="team.ids.includes(row.id)" class="box-number" aria-hidden="true">{{ team.ids.indexOf(row.id) + 1 }}</span>
          </button>
        </li>
      </ul>
      <div v-else class="box-empty" role="status">
        <p>{{ emptyMessage }}</p>
        <button v-if="filtering" type="button" @click="clearFilters">Limpar filtros</button>
      </div>
      <section ref="infoBox" class="box-info" aria-live="polite" aria-label="Ficha do Pokémon">
        <p v-if="!focused" class="hint">Toque num Pokémon: ele entra ou sai da equipe, e a ficha dele aparece aqui.</p>
        <template v-else>
          <div class="box-info-head">
            <img v-if="animatedOf(focused)" :src="animatedOf(focused)!" :alt="focused.name" width="84" height="84" decoding="async" @error="markAnimatedBroken(focused)" />
            <div>
              <strong>{{ focused.name }}</strong>
              <CardMarks :card="focused" compact />
              <small>{{ focused.setName }}</small>
              <small>{{ focusedInTeam ? `Na posição ${team.ids.indexOf(focused.id) + 1} da equipe` : 'Fora da equipe' }}</small>
              <span v-if="summary" class="box-types">
                <b v-for="t in summary.types" :key="t.type" :style="{ background: t.color }">{{ t.label }}</b>
              </span>
            </div>
          </div>
          <template v-if="summary">
            <div v-if="battleMode && summary.stats && compareOptions.length" class="box-compare" role="group" aria-label="Comparar com alguém da equipe">
              <small>Comparar com</small>
              <div>
                <button v-for="row in compareOptions" :key="row.id" type="button" :aria-pressed="compareId === row.id" :aria-label="`Comparar com ${row.name}`" @click="toggleCompare(row.id)">
                  <img v-if="staticOf(row)" :src="staticOf(row)!" alt="" width="36" height="36" decoding="async" />
                  <span v-else aria-hidden="true">{{ row.name.slice(0, 2) }}</span>
                </button>
              </div>
            </div>
            <p v-if="compared && !comparison" class="hint">Sem os atributos de {{ compared.name }}: não dá para comparar.</p>
            <ul v-if="summary.stats" class="box-stats" :class="{ comparing: !!comparison }">
              <li v-for="stat in summary.stats" :key="stat.label">
                <span>{{ stat.label }}</span>
                <i><b :style="{ width: `${stat.pct}%` }"></b></i>
                <em>{{ stat.value }}</em>
                <em v-if="comparison" class="box-diff" :class="{ up: diffOf(stat.label) > 0, down: diffOf(stat.label) < 0 }">{{ signed(diffOf(stat.label)) }}</em>
              </li>
              <li class="box-total"><span>Total</span><em>{{ summary.total }}<small v-if="comparison" class="box-diff" :class="{ up: comparison.total > 0, down: comparison.total < 0 }"> ({{ signed(comparison.total) }} sobre {{ compared!.name }})</small></em></li>
            </ul>
            <p v-else class="hint">Sem os atributos desta espécie: na luta, ela usa números médios.</p>
            <ul class="box-attacks">
              <li :style="{ '--attack': summary.main.color }"><small>Principal</small>{{ summary.main.typeLabel }} · {{ summary.main.name }} · {{ summary.main.form }}</li>
              <li :style="{ '--attack': summary.second.color }"><small>Secundário</small>{{ summary.second.typeLabel }} · {{ summary.second.name }} · {{ summary.second.form }}</li>
            </ul>
          </template>
          <p v-else class="hint">Sem número da Pokédex: não dá para mostrar a ficha.</p>
          <div class="box-info-actions">
            <button v-if="compared && !focusedInTeam && focused.sprite.state === 'ok'" type="button" class="primary" @click="swapFocusedIn">Colocar no lugar de {{ compared.name }}</button>
            <button v-if="focusedInTeam" type="button" @click="toggle(focused.id)">Tirar da equipe</button>
            <button v-else-if="team.ids.length < max && focused.sprite.state === 'ok'" type="button" @click="toggle(focused.id)">Colocar na equipe</button>
          </div>
          <p v-if="focused.sprite.state !== 'ok'" class="hint">Este Pokémon ainda não foi carregado (abra Cartas para carregar). Ele continua na equipe até você tirar.</p>
        </template>
      </section>
      <p v-if="missingSprite > 0" class="meta">{{ missingSprite }} carta(s) sem Pokémon carregado não aparecem aqui (carregue em Cartas).</p>
    </template>
  </div>
</template>

<style scoped>
.team-picker {
  min-width: 0;
  max-width: 100%;
}

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
  grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
  gap: 6px;
  max-height: min(46vh, 340px);
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

/* Grades grandes: o navegador pula o desenho de quem está fora da área rolada. */
.box-grid > li {
  content-visibility: auto;
  contain-intrinsic-size: 70px 92px;
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

.box-facts {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  max-width: 100%;
  min-height: 15px;
  font-size: 0.62rem;
  line-height: 1;
}

.box-facts em {
  overflow: hidden;
  color: var(--muted);
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.box-glyph {
  display: grid;
  flex: none;
  place-items: center;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  font-size: 0.55rem;
  font-style: normal;
}

.box-glyph.unknown {
  background: var(--line);
}

.box-warn {
  position: absolute;
  top: -4px;
  right: -4px;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--warn);
  color: #1b1b1b;
  font-size: 0.7rem;
  font-weight: 800;
}

.box-slot.missing {
  position: relative;
  border-color: var(--warn);
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
  margin-top: 8px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  /* O pé fixo da Arena não pode cobrir a ficha quando a tela rola até ela. */
  scroll-margin-bottom: 200px;
}

.box-empty {
  display: grid;
  gap: 8px;
  justify-items: center;
  padding: 18px 10px;
  border: 1px dashed var(--line);
  border-radius: var(--radius-sm);
  text-align: center;
}

.box-empty p {
  margin: 0;
}

.team-auto {
  flex: none;
  min-height: 44px;
}

.team-insight {
  display: grid;
  gap: 6px;
  margin-top: 8px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, rgb(255 216 74 / 7%), rgb(0 0 0 / 14%));
}

.team-insight p {
  margin: 0;
}

.team-insight-actions {
  display: flex;
  gap: 8px;
}

.team-suggest {
  flex: 1;
  font-weight: 800;
}

.team-reasons {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.8rem;
}

.team-reasons span,
.team-reasons-short {
  color: var(--muted);
}

.team-cover-title {
  font-size: 0.86rem;
}

.team-cover {
  display: grid;
  grid-template-columns: repeat(9, minmax(0, 1fr));
  gap: 3px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.team-cover li {
  display: grid;
  place-items: center;
  height: 26px;
  border-radius: 6px;
  background: rgb(255 255 255 / 5%);
  font-size: 0.82rem;
  opacity: 0.32;
  filter: grayscale(1);
}

.team-cover li.on {
  background: color-mix(in srgb, var(--c) 48%, transparent);
  opacity: 1;
  filter: none;
}

.team-threat {
  color: var(--muted);
  font-size: 0.8rem;
}

.team-threat.ok {
  color: #a7ebc3;
}

.box-compare {
  display: grid;
  gap: 4px;
}

.box-compare > div {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.box-compare button {
  display: grid;
  place-items: center;
  width: 44px;
  min-height: 44px;
  padding: 0;
  border-radius: 8px;
  font-size: 0.75rem;
}

.box-compare img {
  object-fit: contain;
}

.box-info-actions {
  display: grid;
  gap: 6px;
}

.box-info-actions:empty {
  display: none;
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

.box-stats.comparing li:not(.box-total) {
  grid-template-columns: 62px 1fr 32px 40px;
}

.box-diff {
  color: var(--muted);
}

.box-diff.up {
  color: #a7ebc3;
}

.box-diff.down {
  color: #ff9d94;
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
