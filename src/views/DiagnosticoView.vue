<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { formatBytes } from '../app/format';
import { lastAttempt } from '../app/diagnostics';
import { getCache, getCatalog, getTcgdex } from '../app/services';
import CameraStage from '../components/CameraStage.vue';
import StatusPanel from '../components/StatusPanel.vue';
import { detectCapabilities } from '../core/capabilities';
import type { StorageInfo } from '../cache/types';

const capabilities = detectCapabilities();
const catalogText = ref('Ainda não carregado (é carregado ao escanear).');
const storage = ref<StorageInfo | null>(null);
const tcgdexStats = ref({ requests: 0, bytes: 0, failures: 0 });

onMounted(async () => {
  tcgdexStats.value = { ...getTcgdex().stats };
  try {
    storage.value = await (await getCache()).storageInfo();
  } catch {
    storage.value = null;
  }
  const catalog = await getCatalog();
  catalogText.value = catalog
    ? 'Índice do catálogo carregado (só ids, nomes e contagens; não é o catálogo inteiro).'
    : 'Índice do catálogo indisponível: o app usa a busca do TCGdex por número (mais lenta).';
});
</script>

<template>
  <StatusPanel :capabilities="capabilities" />

  <section class="card" aria-labelledby="diag-title">
    <h2 id="diag-title">Reconhecimento</h2>
    <ul class="status-list">
      <li><span>Índice do catálogo</span><strong>{{ catalogText }}</strong></li>
      <li><span>Requisições ao TCGdex nesta sessão</span><strong>{{ tcgdexStats.requests }} ({{ formatBytes(tcgdexStats.bytes) }}, {{ tcgdexStats.failures }} falha(s))</strong></li>
      <li v-if="storage"><span>Cartas guardadas</span><strong>{{ storage.cards }} · {{ formatBytes(storage.assetBytes) }}</strong></li>
    </ul>
    <template v-if="lastAttempt">
      <h2>Última leitura</h2>
      <ul class="status-list">
        <li><span>Resultado</span><strong>{{ lastAttempt.status }}{{ lastAttempt.cardName ? ` · ${lastAttempt.cardName}` : '' }}</strong></li>
        <li><span>Confiança</span><strong>{{ Math.round(lastAttempt.confidence * 100) }}%</strong></li>
        <li><span>Tempo total / detecção / OCR / candidatas</span><strong>{{ lastAttempt.metrics.totalMs }} / {{ lastAttempt.metrics.detectMs }} / {{ lastAttempt.metrics.ocrMs }} / {{ lastAttempt.metrics.candidatesMs }} ms</strong></li>
        <li><span>Requisições / dados baixados</span><strong>{{ lastAttempt.metrics.requests }} / {{ formatBytes(lastAttempt.metrics.downloadedBytes) }}</strong></li>
        <li><span>Candidatas · origem</span><strong>{{ lastAttempt.metrics.candidates }} · {{ lastAttempt.metrics.source }}</strong></li>
        <li v-if="lastAttempt.ocrBottom"><span>Texto lido (faixa inferior)</span><strong class="mono">{{ lastAttempt.ocrBottom.replace(/\s+/g, ' ').slice(0, 80) }}</strong></li>
      </ul>
    </template>
    <p v-else class="note">Nenhuma leitura nesta sessão.</p>
  </section>

  <CameraStage />
</template>
