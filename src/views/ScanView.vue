<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { clampLayout, DEFAULT_LAYOUT, LAYOUT_LIMITS } from '../ar/anchor';
import type { SpriteLayout } from '../ar/anchor';
import type { RunningAr } from '../ar/start-ar';
import type { ArState } from '../ar/session';
import type { SpriteLoadState } from '../ar/sprite-loader';
import type { SpriteSource } from '../ar/sprite-source';
import { ScanController } from '../app/scan-controller';
import type { ScanState } from '../app/scan-controller';
import { fetchSprite, getCache, getPipeline, onOcrProgress } from '../app/services';
import { lastAttempt } from '../app/diagnostics';
import { routeHref } from '../app/route';
import { CameraError, startRearCamera, stopCamera } from '../core/camera';
import { frameFromVideo } from '../recognition/browser-image';

const props = defineProps<{ cardId?: string }>();

const videoEl = ref<HTMLVideoElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const stageEl = ref<HTMLElement | null>(null);
const arCanvasKey = ref(0);

const cameraOn = ref(false);
const cameraBusy = ref(false);
const cameraMessage = ref('');
const loadingEngine = ref('');
const scan = ref<ScanState>({ phase: 'idle', message: '', frames: 0 });
const arState = ref<ArState>({ phase: 'idle', foundCount: 0 });
const spriteState = ref<SpriteLoadState | null>(null);
const arMessage = ref('');
const showLayout = ref(false);
const arActive = ref(false);

const LAYOUT_KEY = 'tcg-ar-layout-v1';
function readLayout(): SpriteLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) return clampLayout({ ...DEFAULT_LAYOUT, ...(JSON.parse(raw) as Partial<SpriteLayout>) });
  } catch {
    // Sem armazenamento local (modo privado): usa o padrão.
  }
  return { ...DEFAULT_LAYOUT };
}
const layout = reactive<SpriteLayout>(readLayout());

let stream: MediaStream | null = null;
let controller: ScanController | null = null;
let ar: RunningAr | null = null;
let disposed = false;

const phaseText = computed(() => {
  switch (arState.value.phase) {
    case 'starting':
      return 'Preparando o rastreamento…';
    case 'searching':
      return 'Aponte a câmera para a carta (a mesma impressão que foi reconhecida).';
    case 'tracking':
      return 'Carta rastreada.';
    case 'lost':
      return 'Perdi a carta. Aponte de novo para ela.';
    case 'error':
      return arState.value.message ?? 'O rastreamento falhou.';
    default:
      return '';
  }
});

const spriteText = computed(() => {
  const s = spriteState.value;
  if (!s) return '';
  switch (s.kind) {
    case 'loading':
      return 'Baixando o GIF do Pokémon…';
    case 'animated':
      return `GIF animado em uso (${s.frames} quadros).`;
    case 'static':
      return `Sem GIF para este Pokémon: mostrando a imagem ESTÁTICA de reserva (${s.reason}).`;
    case 'placeholder':
      return `Marcador no lugar do Pokémon: ${s.reason}`;
    case 'error':
      return s.message;
  }
  return '';
});

async function ensureController(): Promise<ScanController> {
  if (controller) return controller;
  const cache = await getCache();
  controller = new ScanController({
    grabFrame: () => (videoEl.value ? frameFromVideo(videoEl.value) : null),
    recognize: async (frame) => (await getPipeline()).recognize(frame),
    cache,
    onState: (state) => {
      scan.value = state;
      if (state.last) lastAttempt.value = state.last;
      if (state.phase === 'ready' && state.card) void startArFor(state.card.id);
    },
  });
  return controller;
}

async function openCamera(): Promise<void> {
  const video = videoEl.value;
  if (!video) return;
  cameraBusy.value = true;
  cameraMessage.value = '';
  try {
    stream = await startRearCamera(video);
    cameraOn.value = true;
  } catch (error) {
    cameraMessage.value = error instanceof CameraError ? error.message : 'Não foi possível abrir a câmera.';
    return;
  } finally {
    cameraBusy.value = false;
  }
  if (props.cardId) {
    void startArFor(props.cardId);
  } else {
    await beginScan();
  }
}

async function beginScan(): Promise<void> {
  stopAr();
  loadingEngine.value = 'Carregando o leitor de texto (na primeira vez baixa ≈ 7 MB e fica guardado)…';
  onOcrProgress((status, progress) => {
    loadingEngine.value = `Leitor de texto: ${status} ${Math.round(progress * 100)}%`;
  });
  try {
    await getPipeline();
  } catch (error) {
    loadingEngine.value = '';
    scan.value = { phase: 'error', frames: 0, message: `Não consegui carregar o leitor de texto: ${error instanceof Error ? error.message : String(error)}` };
    return;
  } finally {
    onOcrProgress(null);
  }
  loadingEngine.value = '';
  if (disposed) return;
  (await ensureController()).start();
}

async function startArFor(cardId: string): Promise<void> {
  if (!cameraOn.value || !videoEl.value || !canvasEl.value || !stageEl.value) {
    arMessage.value = props.cardId ? 'Abra a câmera para ver a carta em AR.' : '';
    return;
  }
  stopAr();
  // Recria o elemento <canvas> para garantir contexto WebGL novo sem contaminação anterior
  arCanvasKey.value++;
  await nextTick();
  arMessage.value = '';
  spriteState.value = null;
  const cache = await getCache();
  let card = await cache.get(cardId);
  if (!card) {
    arMessage.value = 'Essa carta não está mais guardada neste aparelho.';
    return;
  }
  if (card.target.state !== 'ok') {
    // O alvo de AR é compilado no aparelho; se ainda não está pronto, prepara agora.
    scan.value = { ...scan.value, phase: 'preparing', message: 'Compilando o alvo de rastreamento da carta…' };
    card = (await cache.prepareCard(cardId)).card;
    // Pequena pausa para a GPU móvel e o GC liberarem buffers do TensorFlow.js Compiler antes do Three.js subir
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  const targetBlob = await cache.getAssetBlob(card, 'target');
  if (!targetBlob) {
    arMessage.value = `Não foi possível preparar o alvo de rastreamento desta carta${card.target.error ? `: ${card.target.error}` : ''}. Use "Recarregar" na tela Carregar.`;
    return;
  }
  const spriteBlob = card.sprite.state === 'ok' && card.sprite.key ? await cache.getAssetBlob(card, 'sprite') : null;
  const cachedSprite: SpriteSource | null =
    spriteBlob && card.sprite.key ? { kind: card.sprite.kind ?? 'gif', url: card.sprite.key, blob: spriteBlob } : null;
  try {
    const { startAr } = await import('../ar/start-ar');
    if (disposed || !videoEl.value || !canvasEl.value || !stageEl.value) return;
    ar = await startAr({
      video: videoEl.value,
      canvas: canvasEl.value,
      container: stageEl.value,
      target: await targetBlob.arrayBuffer(),
      dexId: card.dexIds[0],
      cachedSprite,
      fetchSprite: (dexId) => fetchSprite(dexId),
      onState: (state) => (arState.value = state),
      onSprite: (state) => (spriteState.value = state),
    });
    ar.session.setLayout(clampLayout(layout));
    arActive.value = true;
    scan.value = { ...scan.value, phase: 'ready', message: `${card.name} · ${card.setName} ${card.localId}`, card };
  } catch (error) {
    arMessage.value = `O AR não pôde ser iniciado: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function stopAr(): void {
  ar?.stop();
  ar = null;
  arActive.value = false;
  arState.value = { phase: 'idle', foundCount: 0 };
}

async function scanAnother(): Promise<void> {
  stopAr();
  scan.value = { phase: 'scanning', frames: 0, message: 'Procurando a carta…' };
  if (props.cardId) {
    window.location.hash = routeHref('escanear');
    return;
  }
  (await ensureController()).start();
}

async function retrySprite(): Promise<void> {
  await ar?.reloadSprite();
}

function closeCamera(): void {
  controller?.stop();
  stopAr();
  stopCamera(videoEl.value, stream);
  stream = null;
  cameraOn.value = false;
  scan.value = { phase: 'idle', message: '', frames: 0 };
}

function saveLayout(): void {
  const next = clampLayout(layout);
  Object.assign(layout, next);
  ar?.session.setLayout(next);
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
  } catch {
    // Só não lembra do ajuste na próxima vez.
  }
}

function resetLayout(): void {
  Object.assign(layout, DEFAULT_LAYOUT);
  saveLayout();
}

watch(layout, saveLayout);

if (props.cardId) {
  void ensureController().then((c) => c.loadCached(props.cardId as string));
}

onBeforeUnmount(() => {
  disposed = true;
  controller?.stop();
  stopAr();
  stopCamera(videoEl.value, stream);
});

function onLayoutToggle(event: Event): void {
  showLayout.value = (event.target as HTMLDetailsElement).open;
}

const showScanInfo = computed(() => scan.value.phase === 'scanning' && cameraOn.value);
const confidencePct = (value: number) => `${Math.round(value * 100)}%`;
</script>

<template>
  <section class="card" aria-labelledby="scan-title">
    <h2 id="scan-title">{{ cardId ? 'Carta guardada' : 'Escanear carta' }}</h2>
    <p v-if="!cardId" class="note">
      Aponte a câmera para a carta inteira, sobre um fundo liso, com boa luz e sem reflexo na parte de baixo (onde
      fica o número). O app lê o número da carta, consulta o TCGdex só para as candidatas e confirma pela imagem.
    </p>
    <p v-else class="note">Abra a câmera e aponte para a mesma carta física para ver o Pokémon sobre ela.</p>

    <div ref="stageEl" class="viewport">
      <video ref="videoEl" class="feed" playsinline muted></video>
      <canvas :key="arCanvasKey" ref="canvasEl" class="overlay" aria-label="Camada de realidade aumentada"></canvas>
      <p v-if="!cameraOn" class="placeholder">{{ cameraBusy ? 'Abrindo a câmera…' : 'Câmera desligada' }}</p>
      <p v-if="showScanInfo" class="hud" role="status">{{ scan.message }}</p>
      <p v-else-if="arState.phase !== 'idle'" class="hud" role="status">{{ phaseText }}</p>
    </div>

    <div class="actions">
      <button v-if="!cameraOn" type="button" class="primary" :disabled="cameraBusy" @click="openCamera">Abrir câmera</button>
      <template v-else>
        <button type="button" @click="scanAnother">{{ cardId ? 'Escanear outra carta' : 'Escanear de novo' }}</button>
        <button type="button" @click="closeCamera">Fechar câmera</button>
      </template>
    </div>

    <p v-if="cameraMessage" class="message error" role="alert">{{ cameraMessage }}</p>
    <p v-if="loadingEngine" class="message" role="status">{{ loadingEngine }}</p>

    <div v-if="scan.phase === 'choosing' && scan.choices" class="choices" role="group" aria-label="Qual impressão é esta?">
      <p class="message">{{ scan.message }}</p>
      <button v-for="choice in scan.choices" :key="choice.card.id" type="button" @click="controller?.choose(choice.card.id)">
        {{ choice.card.name }} · {{ choice.card.setName }} {{ choice.card.localId }}/{{ choice.card.setOfficial }}
        <small>({{ confidencePct(choice.confidence) }})</small>
      </button>
      <button type="button" class="primary" @click="controller?.start()">Tentar de novo</button>
    </div>

    <p v-if="scan.phase === 'preparing'" class="message" role="status">{{ scan.message }}</p>
    <p v-if="scan.phase === 'error'" class="message error" role="alert">{{ scan.message }}</p>
    <p v-if="arMessage" class="message error" role="alert">{{ arMessage }}</p>

    <div v-if="scan.card && scan.phase === 'ready'" class="result" role="status">
      <h3>{{ scan.card.name }}</h3>
      <p>
        {{ scan.card.setName }} · nº {{ scan.card.localId }}/{{ scan.card.setOfficial }} ·
        <code>{{ scan.card.id }}</code>
        <template v-if="scan.card.dexIds[0]"> · Pokédex nº {{ scan.card.dexIds[0] }}</template>
      </p>
      <p class="origin">
        {{ scan.origin === 'escolha' ? 'Escolhida por você entre as candidatas.' : scan.origin === 'cache' ? 'Aberta do cache do aparelho.' : 'Reconhecida automaticamente.' }}
      </p>
      <p v-if="spriteText" class="message" :class="{ error: spriteState?.kind === 'error' }">{{ spriteText }}</p>
      <button v-if="spriteState?.kind === 'error'" type="button" @click="retrySprite">Tentar baixar o GIF de novo</button>
    </div>

    <p v-if="scan.last && scan.phase === 'scanning'" class="meta">
      Quadros analisados: {{ scan.frames }} · última leitura: {{ scan.last.metrics.totalMs }} ms
    </p>

    <details v-if="arActive" class="layout" :open="showLayout" @toggle="onLayoutToggle">
      <summary>Ajustar posição e tamanho do Pokémon</summary>
      <label>Altura ({{ layout.heightRatio.toFixed(2) }} larguras da carta)
        <input v-model.number="layout.heightRatio" type="range" :min="LAYOUT_LIMITS.heightRatio.min" :max="LAYOUT_LIMITS.heightRatio.max" step="0.05" />
      </label>
      <label>Deslocamento lateral ({{ layout.offsetX.toFixed(2) }})
        <input v-model.number="layout.offsetX" type="range" :min="LAYOUT_LIMITS.offset.min" :max="LAYOUT_LIMITS.offset.max" step="0.05" />
      </label>
      <label>Deslocamento vertical ({{ layout.offsetY.toFixed(2) }})
        <input v-model.number="layout.offsetY" type="range" :min="LAYOUT_LIMITS.offset.min" :max="LAYOUT_LIMITS.offset.max" step="0.05" />
      </label>
      <label>Altura acima da carta ({{ layout.lift.toFixed(2) }})
        <input v-model.number="layout.lift" type="range" :min="LAYOUT_LIMITS.lift.min" :max="LAYOUT_LIMITS.lift.max" step="0.05" />
      </label>
      <label>Giro ({{ Math.round(layout.yawDeg) }}°)
        <input v-model.number="layout.yawDeg" type="range" :min="LAYOUT_LIMITS.yawDeg.min" :max="LAYOUT_LIMITS.yawDeg.max" step="5" />
      </label>
      <label>Ponto de apoio
        <select v-model="layout.anchor">
          <option value="base">Pés (em pé sobre a carta)</option>
          <option value="center">Centro</option>
        </select>
      </label>
      <button type="button" @click="resetLayout">Restaurar padrão</button>
    </details>
  </section>
</template>
