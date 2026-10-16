<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { formatBytes } from '../app/format';
import { lastAttempt } from '../app/diagnostics';
import { scanMetrics } from '../app/scan-metrics';
import { SCAN_STAGE_LABELS_PT } from '../recognition/stage-clock';
import { fetchSprite, getCache, getCatalog, getTcgdex } from '../app/services';
import { recordEvent } from '../app/trainer-store';
import CameraStage from '../components/CameraStage.vue';
import StatusPanel from '../components/StatusPanel.vue';
import { detectCapabilities } from '../core/capabilities';
import type { StorageInfo } from '../cache/types';

const capabilities = detectCapabilities();

/** Mediana e p90 de cada etapa do scan nesta sessão (só números; some ao fechar o app). */
const stageSummary = computed(() => {
  void scanMetrics.version;
  return scanMetrics.log.summary().map((row) => ({ ...row, label: SCAN_STAGE_LABELS_PT[row.stage] }));
});
function clearScanMetrics(): void {
  scanMetrics.log.clear();
  scanMetrics.version++;
}
const catalogText = ref('Ainda não carregado (é carregado ao escanear).');
const storage = ref<StorageInfo | null>(null);
const tcgdexStats = ref({ requests: 0, bytes: 0, failures: 0 });

/** Menu de Depuração: busca de verdade o sprite de um número de Pokédex (sem precisar escanear nada). */
const debugDex = ref('');
const debugBusy = ref(false);
const debugStatus = ref('');
const debugImgUrl = ref<string | null>(null);

function clearDebugImg(): void {
  if (debugImgUrl.value) URL.revokeObjectURL(debugImgUrl.value);
  debugImgUrl.value = null;
}

async function debugSearchSprite(): Promise<void> {
  const id = Math.trunc(Number(debugDex.value));
  if (!Number.isFinite(id) || id <= 0) {
    debugStatus.value = 'Número de Pokédex inválido.';
    return;
  }
  debugBusy.value = true;
  debugStatus.value = 'Buscando…';
  clearDebugImg();
  try {
    const sprite = await fetchSprite(id);
    if (!sprite) {
      debugStatus.value = `Sem sprite pra esse número (${id}) na fonte (PokeAPI/sprites).`;
      return;
    }
    debugImgUrl.value = URL.createObjectURL(sprite.blob);
    debugStatus.value = `Sprite do dex ${id} encontrado (${sprite.kind}).`;
    // Cheat de depuração: só pra testar coisas que pedem nível alto (como a Torre de Sobrevivência) sem
    // precisar escanear ou batalhar de verdade. +1000 XP não é escaneamento, batalha nem minigame de verdade.
    if (id === 666) {
      recordEvent({ type: 'debug', xp: 1000, label: 'Depuração: sprite do dex 666' });
    }
  } catch {
    debugStatus.value = 'Falha ao buscar o sprite.';
  } finally {
    debugBusy.value = false;
  }
}

onBeforeUnmount(clearDebugImg);

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
        <li><span>Candidatas · origem</span><strong>{{ lastAttempt.metrics.candidates }}{{ lastAttempt.metrics.catalogMatches !== undefined ? ` de ${lastAttempt.metrics.catalogMatches} no catálogo` : '' }} · {{ lastAttempt.metrics.source }}</strong></li>
        <li v-if="lastAttempt.ocrBottom"><span>Texto lido (faixa inferior)</span><strong class="mono">{{ lastAttempt.ocrBottom.replace(/\s+/g, ' ').slice(0, 80) }}</strong></li>
      </ul>
    </template>
    <p v-else class="note">Nenhuma leitura nesta sessão.</p>

    <h2>Tempo de cada etapa (esta sessão)</h2>
    <template v-if="stageSummary.length">
      <p class="note">
        {{ scanMetrics.log.reads }} leitura(s) com OCR e {{ scanMetrics.log.gated }} quadro(s) só de detecção (carta ausente ou mexendo).
        Medido neste aparelho; o que não rodou não aparece.
      </p>
      <table class="stage-table">
        <thead>
          <tr><th scope="col">Etapa</th><td>mediana</td><td>p90</td><td>última</td><td>n</td></tr>
        </thead>
        <tbody>
          <tr v-for="row in stageSummary" :key="row.stage">
            <th scope="row">{{ row.label }}</th>
            <td>{{ row.median }} ms</td>
            <td>{{ row.p90 }} ms</td>
            <td>{{ row.last }} ms</td>
            <td>{{ row.count }}</td>
          </tr>
        </tbody>
      </table>
      <button type="button" @click="clearScanMetrics">Zerar a medição</button>
    </template>
    <p v-else class="note">Escaneie uma carta: aqui aparecem os tempos medidos de cada etapa (captura, detecção, estabilização, OCR, catálogo, comparação, confirmação e início do AR).</p>
  </section>

  <section class="card" aria-labelledby="diag-debug-title">
    <h2 id="diag-debug-title">Depuração</h2>
    <p class="note">Busca de verdade o sprite (GIF ou PNG) de um número de Pokédex na fonte usada pela AR e pela Vila — útil pra testar sem esperar o reconhecimento.</p>
    <div class="debug-sprite-row">
      <input v-model="debugDex" type="number" min="1" inputmode="numeric" placeholder="Número da Pokédex" :disabled="debugBusy" @keyup.enter="debugSearchSprite" />
      <button type="button" class="primary" :disabled="debugBusy" @click="debugSearchSprite">Buscar sprite</button>
    </div>
    <p v-if="debugStatus" class="note">{{ debugStatus }}</p>
    <img v-if="debugImgUrl" :src="debugImgUrl" alt="Sprite buscado pela depuração" class="debug-sprite-preview" />
  </section>

  <CameraStage />
</template>
