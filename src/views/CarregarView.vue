<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import CardMarks from '../components/CardMarks.vue';
import { formatBytes, formatDate } from '../app/format';
import { routeHref } from '../app/route';
import { getCache } from '../app/services';
import { resolveTeam, TEAM_SIZE } from '../app/team';
import { savedTeam, setSavedTeam, toggleSaved } from '../app/team-store';
import type { CachedCard, CacheStatus, SlotInfo, StorageInfo } from '../cache/types';
import { isShiny } from '../core/shiny';
import { loadVillage } from '../app/village-store';
import { digitalRows } from '../core/village/digital';
import { pokemonSpriteUrl } from '../ar/sprite-url';

/** Digital Pokémon da Vila: aparecem aqui marcados como digitais e bloqueados (não vêm de carta física: sem scan nem AR). */
const digital = ref(digitalRows(loadVillage().digital));

type Row = CachedCard & { status: CacheStatus; thumb?: string };

const rows = ref<Row[]>([]);
const loading = ref(true);
const storage = ref<StorageInfo | null>(null);
const busyId = ref<string | null>(null);
const bulk = ref<{ done: number; count: number; text: string } | null>(null);
const progressText = ref<Record<string, string>>({});
const message = ref('');
const confirmingClear = ref(false);
const thumbUrls: string[] = [];

// Filtros, ordem e modo de exibição da lista.
type StatusFilter = 'todas' | CacheStatus | 'sem-pokemon';
type SortKey = 'recentes' | 'nome' | 'leituras';
const search = ref('');
const statusFilter = ref<StatusFilter>('todas');
const onlyTeam = ref(false);
const sortKey = ref<SortKey>('recentes');
const viewMode = ref<'lista' | 'grade'>('lista');
const teamNotice = ref('');

const team = computed(() => resolveTeam(savedTeam.value, rows.value));
const teamRows = computed(() => team.value.ids.map((id) => rows.value.find((row) => row.id === id)).filter((row): row is Row => row !== undefined));
const visibleRows = computed(() => {
  const q = search.value.trim().toLowerCase();
  const filtered = rows.value.filter((row) => {
    if (q && !`${row.name} ${row.setName} ${row.localId}`.toLowerCase().includes(q)) return false;
    if (statusFilter.value === 'sem-pokemon') return row.sprite.state !== 'ok';
    if (statusFilter.value !== 'todas' && row.status !== statusFilter.value) return false;
    if (onlyTeam.value && !team.value.ids.includes(row.id)) return false;
    return true;
  });
  const sorted = [...filtered];
  if (sortKey.value === 'nome') sorted.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  else if (sortKey.value === 'leituras') sorted.sort((a, b) => b.scanCount - a.scanCount);
  return sorted;
});
const filtersActive = computed(() => search.value !== '' || statusFilter.value !== 'todas' || onlyTeam.value);

function clearFilters(): void {
  search.value = '';
  statusFilter.value = 'todas';
  onlyTeam.value = false;
}

function toggleTeam(row: Row): void {
  if (row.sprite.state !== 'ok') {
    teamNotice.value = `«${row.name}» ainda não tem o Pokémon carregado. Use "Carregar" antes de colocar na equipe.`;
    return;
  }
  // Primeira escolha manual: parte da equipe automática atual.
  if (savedTeam.value.length === 0 && team.value.auto) setSavedTeam(team.value.ids);
  const full = toggleSaved(row.id);
  teamNotice.value = full ? `A equipe já tem ${TEAM_SIZE} Pokémon. Tire um para colocar outro.` : '';
}
/** Cartas que acabaram de ficar completas: recebem o efeito de "carregou" por um instante. */
const justLoaded = ref<Set<string>>(new Set());

function celebrate(ids: string[]): void {
  if (ids.length === 0) return;
  justLoaded.value = new Set([...justLoaded.value, ...ids]);
  setTimeout(() => {
    const next = new Set(justLoaded.value);
    ids.forEach((id) => next.delete(id));
    justLoaded.value = next;
  }, 2200);
}

const statusOf = (id: string) => rows.value.find((row) => row.id === id)?.status;

const STATUS_TEXT: Record<CacheStatus, string> = {
  completo: 'Completa',
  parcial: 'Parcial',
  falhou: 'Falhou',
};

const SLOT_STATE_TEXT: Record<SlotInfo['state'], string> = {
  ok: 'guardado',
  missing: 'faltando',
  unavailable: 'indisponível',
  error: 'erro',
};

function slotText(label: string, slot: SlotInfo): string {
  const size = slot.state === 'ok' && slot.bytes ? ` (${formatBytes(slot.bytes)})` : '';
  const kind = label === 'Sprite' && slot.state === 'ok' ? (slot.kind === 'gif' ? ' GIF' : ' PNG estático') : '';
  const why = slot.state !== 'ok' && slot.error ? ` — ${slot.error}` : '';
  return `${label}: ${SLOT_STATE_TEXT[slot.state]}${kind}${size}${why}`;
}

async function refresh(): Promise<void> {
  const cache = await getCache();
  const list = await cache.list();
  thumbUrls.splice(0).forEach((url) => URL.revokeObjectURL(url));
  const withThumbs: Row[] = [];
  for (const card of list) {
    const row: Row = { ...card };
    if (card.reference.state === 'ok') {
      const blob = await cache.getAssetBlob(card, 'reference').catch(() => null);
      if (blob) {
        row.thumb = URL.createObjectURL(blob);
        thumbUrls.push(row.thumb);
      }
    }
    withThumbs.push(row);
  }
  rows.value = withThumbs;
  storage.value = await cache.storageInfo();
  loading.value = false;
}

async function run(id: string, action: 'prepare' | 'reload'): Promise<void> {
  busyId.value = id;
  message.value = '';
  const before = statusOf(id);
  try {
    const cache = await getCache();
    const onProgress = (p: { step: string; index: number; total: number }) => {
      progressText.value = { ...progressText.value, [id]: `${p.step} (${p.index + 1}/${p.total})` };
    };
    await (action === 'prepare' ? cache.prepareCard(id, onProgress) : cache.reload(id, onProgress));
  } catch (error) {
    message.value = `Não consegui carregar: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    busyId.value = null;
    progressText.value = { ...progressText.value, [id]: '' };
    await refresh();
    if (before !== 'completo' && statusOf(id) === 'completo') celebrate([id]);
  }
}

async function prepareAll(): Promise<void> {
  const pending = new Set(rows.value.filter((r) => r.status !== 'completo').map((r) => r.id));
  bulk.value = { done: 0, count: rows.value.filter((r) => r.status !== 'completo').length, text: 'Começando…' };
  message.value = '';
  try {
    const cache = await getCache();
    const result = await cache.prepareAllViewed((p) => {
      bulk.value = { done: p.done, count: p.count, text: `${p.step} · ${p.cardId}` };
    });
    message.value =
      result.count === 0
        ? 'Todas as cartas já reconhecidas estão completas.'
        : `${result.completo} de ${result.count} carta(s) ficaram completas${result.falhou ? `; ${result.falhou} falharam (use "Recarregar")` : ''}.`;
  } catch (error) {
    message.value = `Não consegui carregar todas: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    bulk.value = null;
    await refresh();
    celebrate(rows.value.filter((r) => pending.has(r.id) && r.status === 'completo').map((r) => r.id));
  }
}

async function removeCard(id: string): Promise<void> {
  const cache = await getCache();
  await cache.remove(id);
  await refresh();
}

async function clearAll(): Promise<void> {
  const cache = await getCache();
  await cache.clear();
  confirmingClear.value = false;
  message.value = 'Cache limpo.';
  await refresh();
}

onMounted(() => {
  refresh().catch((error) => {
    loading.value = false;
    message.value = `Não consegui abrir o armazenamento do aparelho: ${error instanceof Error ? error.message : String(error)}`;
  });
});
onBeforeUnmount(() => thumbUrls.splice(0).forEach((url) => URL.revokeObjectURL(url)));
</script>

<template>
  <section class="card" aria-labelledby="load-title">
    <h2 id="load-title">Cartas guardadas</h2>
    <p class="note">
      Aqui ficam as cartas que o app já reconheceu neste aparelho (as mais recentes primeiro). Elas são guardadas no
      navegador; o app nunca baixa o catálogo inteiro. Câmeras e quadros não são guardados.
    </p>

    <p class="meta" role="status">
      <template v-if="storage">
        {{ storage.cards }} carta(s) · {{ storage.assets }} arquivo(s) · {{ formatBytes(storage.assetBytes) }} guardados
        <template v-if="storage.usage !== undefined"> · navegador usa {{ formatBytes(storage.usage) }} de {{ formatBytes(storage.quota) }}</template>
        · armazenamento persistente:
        {{ storage.persisted === undefined ? 'não informado' : storage.persisted ? 'sim' : 'não (o navegador pode apagar se faltar espaço)' }}
      </template>
      <template v-else>Lendo o armazenamento…</template>
    </p>

    <div class="actions row">
      <button type="button" class="primary" :disabled="bulk !== null || rows.length === 0" @click="prepareAll">
        Carregar todas as vistas
      </button>
      <button v-if="!confirmingClear" type="button" :disabled="rows.length === 0" @click="confirmingClear = true">Limpar cache</button>
      <template v-else>
        <span class="message error">Apagar todas as cartas guardadas?</span>
        <button type="button" class="danger" @click="clearAll">Sim, limpar</button>
        <button type="button" @click="confirmingClear = false">Cancelar</button>
      </template>
    </div>

    <p v-if="bulk" class="message" role="status">Carregando {{ bulk.done }}/{{ bulk.count }} — {{ bulk.text }}</p>
    <p v-if="message" class="message" role="status">{{ message }}</p>

    <div v-if="teamRows.length > 0" class="team-strip" role="group" aria-label="Equipe da caixa">
      <strong>Equipe da caixa ({{ teamRows.length }}/{{ TEAM_SIZE }})<small v-if="team.auto"> · automática</small></strong>
      <ul>
        <li v-for="row in teamRows" :key="row.id">
          <img v-if="row.thumb" :src="row.thumb" :alt="row.name" width="40" height="56" />
          <span>{{ row.name }}</span>
          <CardMarks :card="row" compact />
        </li>
      </ul>
    </div>
    <p v-if="teamNotice" class="message error" role="alert">{{ teamNotice }}</p>

    <div v-if="rows.length > 0" class="filter-bar" role="search">
      <input v-model="search" type="text" placeholder="Buscar por nome, coleção ou número" aria-label="Buscar nas cartas guardadas" autocomplete="off" />
      <div class="chips" role="group" aria-label="Filtrar por situação">
        <button v-for="option in ([['todas', 'Todas'], ['completo', 'Completas'], ['parcial', 'Parciais'], ['falhou', 'Com falha'], ['sem-pokemon', 'Sem Pokémon']] as const)" :key="option[0]" type="button" :class="{ active: statusFilter === option[0] }" :aria-pressed="statusFilter === option[0]" @click="statusFilter = option[0]">
          {{ option[1] }}
        </button>
        <button type="button" :class="{ active: onlyTeam }" :aria-pressed="onlyTeam" @click="onlyTeam = !onlyTeam">Só a equipe</button>
      </div>
      <div class="filter-row">
        <label>Ordem
          <select v-model="sortKey">
            <option value="recentes">Mais recentes</option>
            <option value="nome">Nome (A–Z)</option>
            <option value="leituras">Mais lidas</option>
          </select>
        </label>
        <div class="chips" role="group" aria-label="Modo de exibição">
          <button type="button" :class="{ active: viewMode === 'lista' }" :aria-pressed="viewMode === 'lista'" @click="viewMode = 'lista'">Lista</button>
          <button type="button" :class="{ active: viewMode === 'grade' }" :aria-pressed="viewMode === 'grade'" @click="viewMode = 'grade'">Grade</button>
        </div>
      </div>
      <p class="meta" role="status">
        Mostrando {{ visibleRows.length }} de {{ rows.length }}.
        <button v-if="filtersActive" type="button" class="link" @click="clearFilters">Limpar filtros</button>
      </p>
    </div>

    <p v-if="loading" class="message">Carregando a lista…</p>
    <p v-else-if="rows.length === 0" class="message">
      Nenhuma carta reconhecida ainda. Vá em <a :href="routeHref('escanear')">Escanear</a> e aponte a câmera para uma carta.
    </p>

    <ul v-if="viewMode === 'grade'" class="card-grid">
      <li v-for="row in visibleRows" :key="row.id">
        <button type="button" class="grid-card" :class="{ picked: team.ids.includes(row.id), 'is-shiny': isShiny(row) }" :aria-pressed="team.ids.includes(row.id)" :aria-label="`${row.name}: ${team.ids.includes(row.id) ? 'tirar da' : 'colocar na'} equipe`" @click="toggleTeam(row)">
          <img v-if="row.thumb" :src="row.thumb" :alt="`Carta ${row.name}`" width="90" height="126" />
          <div v-else class="thumb-missing" aria-hidden="true">sem imagem</div>
          <strong>{{ row.name }}</strong>
          <CardMarks :card="row" />
          <span class="badge" :class="row.status">{{ STATUS_TEXT[row.status] }}</span>
          <span v-if="team.ids.includes(row.id)" class="team-slot" aria-hidden="true">{{ team.ids.indexOf(row.id) + 1 }}</span>
        </button>
      </li>
    </ul>

    <ul v-else class="card-list">
      <li v-for="row in visibleRows" :key="row.id" class="card-row" :class="{ loading: busyId === row.id, 'just-loaded': justLoaded.has(row.id), 'is-shiny': isShiny(row) }">
        <div class="thumb-wrap">
          <img v-if="row.thumb" :src="row.thumb" :alt="`Carta ${row.name}`" width="60" height="84" />
          <div v-else class="thumb-missing" aria-hidden="true">sem imagem</div>
          <span v-if="justLoaded.has(row.id)" class="thumb-check" aria-hidden="true">✓</span>
        </div>
        <div class="card-info">
          <strong>{{ row.name }} <CardMarks :card="row" /></strong>
          <span>{{ row.setName }} · {{ row.localId }}/{{ row.setOfficial }}</span>
          <span class="badge" :class="row.status">{{ STATUS_TEXT[row.status] }}</span>
          <span v-if="justLoaded.has(row.id)" class="sr-only" role="status">Carta carregada.</span>
          <small>Última vez: {{ formatDate(row.lastSeenAt) }} · {{ row.scanCount }} leitura(s)</small>
          <small>{{ slotText('Imagem', row.reference) }}</small>
          <small>{{ slotText('Sprite', row.sprite) }}</small>
          <small>{{ slotText('Alvo de AR', row.target) }}</small>
          <small v-if="progressText[row.id]" role="status">Preparando {{ progressText[row.id] }}…</small>
          <div class="actions row">
            <button type="button" :disabled="busyId === row.id" @click="run(row.id, 'prepare')">Carregar</button>
            <button v-if="row.status !== 'completo'" type="button" :disabled="busyId === row.id" @click="run(row.id, 'reload')">Recarregar</button>
            <a class="button" :href="routeHref('escanear', row.id)">Ver em AR</a>
            <button type="button" :class="{ active: team.ids.includes(row.id) }" :aria-pressed="team.ids.includes(row.id)" @click="toggleTeam(row)">
              {{ team.ids.includes(row.id) ? 'Na equipe ✓' : 'Pôr na equipe' }}
            </button>
            <button type="button" :disabled="busyId === row.id" @click="removeCard(row.id)">Remover do cache</button>
          </div>
        </div>
      </li>
    </ul>

    <section v-if="digital.length > 0" class="digital-list" aria-labelledby="digital-title">
      <h3 id="digital-title">Digital Pokémon <small>· moram na Vila</small></h3>
      <p class="note">
        Vêm do presente inicial e da Fonte, não de uma carta física: moram na Vila e jogam na Torre, mas não podem ser
        escaneados nem vistos em AR.
      </p>
      <ul class="card-list">
        <li v-for="d in digital" :key="d.instanceId" class="card-row digital-row">
          <div class="thumb-wrap">
            <img :src="pokemonSpriteUrl(d.dexId)" :alt="d.name" width="60" height="60" loading="lazy" @error="($event.target as HTMLImageElement).style.visibility = 'hidden'" />
          </div>
          <div class="card-info">
            <strong>{{ d.name }} <span class="badge digital" title="Digital: sem scan e sem AR">🔒 Digital</span></strong>
            <span>Pokédex nº {{ d.dexId }} · {{ d.origin }}{{ d.stage > 0 ? ` · evoluiu ${d.stage}×` : '' }}</span>
            <small>Desde {{ d.since }} · carta de origem {{ d.originCardId }}</small>
            <small>Bloqueado para scan e AR (não é uma carta física).</small>
          </div>
        </li>
      </ul>
    </section>
  </section>
</template>
