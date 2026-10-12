<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { formatBytes, formatDate } from '../app/format';
import { routeHref } from '../app/route';
import { getCache } from '../app/services';
import type { CachedCard, CacheStatus, SlotInfo, StorageInfo } from '../cache/types';

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
  }
}

async function prepareAll(): Promise<void> {
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

    <p v-if="loading" class="message">Carregando a lista…</p>
    <p v-else-if="rows.length === 0" class="message">
      Nenhuma carta reconhecida ainda. Vá em <a :href="routeHref('escanear')">Escanear</a> e aponte a câmera para uma carta.
    </p>

    <ul class="card-list">
      <li v-for="row in rows" :key="row.id" class="card-row">
        <img v-if="row.thumb" :src="row.thumb" :alt="`Carta ${row.name}`" width="60" height="84" />
        <div v-else class="thumb-missing" aria-hidden="true">sem imagem</div>
        <div class="card-info">
          <strong>{{ row.name }}</strong>
          <span>{{ row.setName }} · {{ row.localId }}/{{ row.setOfficial }}</span>
          <span class="badge" :class="row.status">{{ STATUS_TEXT[row.status] }}</span>
          <small>Última vez: {{ formatDate(row.lastSeenAt) }} · {{ row.scanCount }} leitura(s)</small>
          <small>{{ slotText('Imagem', row.reference) }}</small>
          <small>{{ slotText('Sprite', row.sprite) }}</small>
          <small>{{ slotText('Alvo de AR', row.target) }}</small>
          <small v-if="progressText[row.id]" role="status">Preparando {{ progressText[row.id] }}…</small>
          <div class="actions row">
            <button type="button" :disabled="busyId === row.id" @click="run(row.id, 'prepare')">Carregar</button>
            <button v-if="row.status !== 'completo'" type="button" :disabled="busyId === row.id" @click="run(row.id, 'reload')">Recarregar</button>
            <a class="button" :href="routeHref('escanear', row.id)">Ver em AR</a>
            <button type="button" :disabled="busyId === row.id" @click="removeCard(row.id)">Remover do cache</button>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>
