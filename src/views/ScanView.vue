<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { clampLayout, DEFAULT_LAYOUT, LAYOUT_LIMITS } from '../ar/anchor';
import { GestureTracker, isTap } from '../ar/gestures';
import { PANEL_PAGE_LABELS_PT, PANEL_PAGES } from '../ar/panel-state';
import type { PanelMode } from '../ar/panel-state';
import type { SpriteLayout } from '../ar/anchor';
import type { RunningAr } from '../ar/start-ar';
import type { ArState } from '../ar/session';
import type { SpriteLoadState } from '../ar/sprite-loader';
import { prepareArAssets } from '../app/ar-prepare';
import { arStepList, arStatusText } from '../app/ar-stages';
import type { ArStage } from '../app/ar-stages';
import { ScanController } from '../app/scan-controller';
import type { LastAttempt, ScanState } from '../app/scan-controller';
import { fetchSprite, getArtIndex, loadBattle, getCache, getCatalog, getPipeline, getTcgdex, onOcrProgress, setArtSearch, setCaptureDebug } from '../app/services';
import type { ManualMatch } from '../recognition/catalog-index';
import { recordFromTcgdex } from '../recognition/pipeline';
import { lastAttempt } from '../app/diagnostics';
import { routeHref } from '../app/route';
import { CameraError, startRearCamera, stopCamera } from '../core/camera';
import { frameFromVideo } from '../recognition/browser-image';
import type { RgbaImage } from '../recognition/types';

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
const arStage = ref<ArStage>('idle');
const arDetail = ref('');
const arError = ref('');
const arFailedAt = ref<ArStage>('preparing');
const pendingArCardId = ref<string | null>(null);
let arRun = 0;
let lastReadyCard: unknown = null;
const showLayout = ref(false);
const panelMode = ref<PanelMode>('auto');
/** Modo "ajustar com os dedos": arrastar move o Pokémon (e o painel); pinça muda o tamanho. */
const adjusting = ref(false);
const moveNotice = ref('');
const arActive = ref(false);

// Diagnóstico do scan: mostra o que o app está vendo (onde achou a carta, o que o OCR recebeu e leu).
const DEBUG_KEY = 'tcg-ar-scan-debug-v1';
function readDebugOption(): boolean {
  try {
    return localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}
const debugOn = ref(readDebugOption());
const photoAttempt = ref<LastAttempt | null>(null);
const photoBusy = ref(false);
const photoMessage = ref('');
const indexStatus = ref('');
const shownAttempt = computed(() => photoAttempt.value ?? scan.value.last ?? null);
const debugCanvasEl = ref<HTMLCanvasElement | null>(null);
const debugRectUrl = ref('');
const debugStripUrl = ref('');
setCaptureDebug(debugOn.value);

function applyDebugOption(): void {
  setCaptureDebug(debugOn.value);
  if (debugOn.value) void refreshIndexStatus();
  try {
    localStorage.setItem(DEBUG_KEY, debugOn.value ? '1' : '0');
  } catch {
    // Só não lembra da escolha na próxima vez.
  }
  refreshDebug();
}

function imageUrl(image?: RgbaImage): string {
  if (!image) return '';
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return canvas.toDataURL('image/png');
}

/** Desenha o quadrilátero achado sobre o vídeo (que está em "cover" dentro do visor). */
function refreshDebug(): void {
  const last = shownAttempt.value ?? undefined;
  debugRectUrl.value = debugOn.value ? imageUrl(last?.view?.rectified) : '';
  debugStripUrl.value = debugOn.value ? imageUrl(last?.view?.strip) : '';
  const canvas = debugCanvasEl.value;
  const stage = stageEl.value;
  if (!canvas || !stage) return;
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, w, h);
  const view = last?.view;
  if (!debugOn.value || !last?.quad || !view) return;
  const scale = Math.max(w / view.frame.width, h / view.frame.height);
  const ox = (w - view.frame.width * scale) / 2;
  const oy = (h - view.frame.height * scale) / 2;
  context.lineWidth = 3;
  context.strokeStyle = last.reused ? '#ffd166' : '#5fd38d';
  context.beginPath();
  last.quad.forEach((p, i) => {
    const x = ox + p.x * scale;
    const y = oy + p.y * scale;
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
  context.stroke();
}
watch(shownAttempt, refreshDebug);

/** Testa o reconhecimento com uma foto escolhida pelo usuário. A imagem é lida no próprio aparelho: não é enviada a lugar nenhum. */
async function testPhoto(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  photoBusy.value = true;
  photoMessage.value = 'Lendo a foto (só neste aparelho)…';
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas 2D indisponível.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const pipeline = await getPipeline();
    setCaptureDebug(true);
    const result = await pipeline.recognize({ width, height, data });
    photoAttempt.value = {
      status: result.status, message: result.message, confidence: result.confidence, metrics: result.metrics,
      ocrBottom: result.ocrText?.bottom, ocrName: result.ocrText?.name, cardName: result.card?.name, quad: result.quad, view: result.view,
    };
    photoMessage.value = result.card ? `Resultado: ${result.card.name} (${result.card.setName} ${result.card.localId}).` : '';
  } catch (error) {
    photoMessage.value = `Não consegui processar a foto: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    setCaptureDebug(debugOn.value);
    photoBusy.value = false;
  }
}
function clearPhoto(): void {
  photoAttempt.value = null;
  photoMessage.value = '';
}
async function refreshIndexStatus(): Promise<void> {
  const catalog = await getCatalog();
  const art = artOn.value ? await getArtIndex() : null;
  indexStatus.value = `Catálogo: ${catalog ? 'disponível' : 'INDISPONÍVEL (sem rede ou não publicado)'} · Índice de ilustrações: ${
    !artOn.value ? 'desligado' : art ? `${art.size} cartas` : 'INDISPONÍVEL (ainda não publicado ou sem rede)'
  }`;
}

// Busca manual: plano B quando a leitura automática não acha a carta.
const manualOpen = ref(false);
const manualName = ref('');
const manualNumber = ref('');
const manualResults = ref<ManualMatch[]>([]);
const manualMessage = ref('');
async function searchManual(): Promise<void> {
  manualMessage.value = '';
  const catalog = await getCatalog();
  if (!catalog) {
    manualResults.value = [];
    manualMessage.value = 'O índice de cartas não está disponível agora. Tente de novo com conexão.';
    return;
  }
  const digits = manualNumber.value.replace(/\D/g, '');
  manualResults.value = catalog.search(manualName.value, digits ? Number.parseInt(digits, 10) : undefined);
  if (manualResults.value.length === 0) manualMessage.value = 'Nenhuma carta encontrada. Confira o nome (em inglês) ou o número.';
}
async function pickManual(id: string): Promise<void> {
  manualResults.value = [];
  await (await ensureController()).chooseManual(id);
}

// Busca pela ilustração (opcional, experimental): sugere candidatas pela aparência da arte.
const ART_KEY = 'tcg-ar-art-search-v1';
function readArtOption(): boolean {
  try {
    // Ligada por padrão: é o caminho de reserva quando o número não pôde ser lido. Só desliga se o usuário pediu.
    return localStorage.getItem(ART_KEY) !== '0';
  } catch {
    return true;
  }
}
const artOn = ref(readArtOption());
const artStatus = ref('');
async function applyArtOption(): Promise<void> {
  setArtSearch(artOn.value);
  try {
    localStorage.setItem(ART_KEY, artOn.value ? '1' : '0');
  } catch {
    // Só não lembra da escolha na próxima vez.
  }
  if (!artOn.value) {
    artStatus.value = '';
    return;
  }
  artStatus.value = 'Carregando o índice de ilustrações…';
  const index = await getArtIndex();
  artStatus.value = index
    ? `Índice de ilustrações ativo: ${index.size} cartas (gerado em ${index.generatedAt.slice(0, 10)}).`
    : 'O índice de ilustrações ainda não foi publicado: a opção não faz efeito por enquanto.';
}
setArtSearch(artOn.value);
if (debugOn.value) void refreshIndexStatus();

// v2: novo padrão (Pokémon um pouco acima do centro da carta e painel logo à frente dos pés).
const LAYOUT_KEY = 'tcg-ar-layout-v2';
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
    loadCardRecord: async (id) => {
      const card = await getTcgdex().getCard(id);
      return card ? recordFromTcgdex(card) : null;
    },
    onState: (state) => {
      scan.value = state;
      if (state.last) lastAttempt.value = state.last;
      // Depois de várias leituras sem sucesso, abre a busca manual: o caminho seguro não deve ficar escondido.
      if (state.phase === 'scanning' && state.frames >= 4 && state.last && state.last.status !== 'identified') manualOpen.value = true;
      if (state.phase === 'ready' && state.card && state.card !== lastReadyCard) {
        lastReadyCard = state.card;
        void startArFor(state.card.id);
      }
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
  const waiting = props.cardId ?? pendingArCardId.value;
  if (waiting) {
    void startArFor(waiting);
  } else {
    await beginScan();
  }
}

async function beginScan(): Promise<void> {
  dismissAr();
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
  pendingArCardId.value = cardId;
  arError.value = '';
  if (!cameraOn.value || !videoEl.value || !canvasEl.value || !stageEl.value) {
    // Carta escolhida, mas sem câmera: fica esperando (o botão "Abrir câmera" continua daqui).
    stopAr();
    arStage.value = 'selected';
    return;
  }
  const run = ++arRun;
  stopAr();
  // Recria o elemento <canvas> para garantir contexto WebGL novo sem contaminação anterior
  arCanvasKey.value++;
  await nextTick();
  spriteState.value = null;
  arStage.value = 'preparing';
  arDetail.value = 'Preparando os dados e a imagem de referência…';
  let assets;
  try {
    assets = await prepareArAssets(await getCache(), cardId, (stage, detail) => {
      if (run !== arRun) return;
      arStage.value = stage === 'alvo' ? 'compiling' : 'preparing';
      arDetail.value = detail;
    });
  } catch (error) {
    if (run === arRun) failAr(error instanceof Error ? error.message : String(error));
    return;
  }
  if (run !== arRun || disposed) return;
  // Pequena pausa para a GPU móvel e o GC liberarem buffers do TensorFlow.js Compiler antes do Three.js subir
  await new Promise((resolve) => setTimeout(resolve, 150));
  if (run !== arRun || disposed || !videoEl.value || !canvasEl.value || !stageEl.value) return;
  arStage.value = 'engine';
  arDetail.value = 'Iniciando o motor de rastreamento…';
  try {
    const { startAr } = await import('../ar/start-ar');
    const started = await startAr({
      video: videoEl.value,
      canvas: canvasEl.value,
      container: stageEl.value,
      target: assets.target,
      dexId: assets.card.dexIds[0],
      cachedSprite: assets.cachedSprite,
      fetchSprite: (dexId) => fetchSprite(dexId),
      battle: {
        name: assets.card.name,
        load: (onPart) => loadBattle(assets.card.id, assets.card.dexIds[0], onPart),
      },
      onState: (state) => {
        if (run !== arRun) return;
        arState.value = state;
        if (state.phase === 'searching' || state.phase === 'tracking' || state.phase === 'lost') arStage.value = state.phase;
        else if (state.phase === 'error') failAr(state.message ?? 'O rastreamento falhou.');
      },
      onSprite: (state) => {
        if (run === arRun) spriteState.value = state;
      },
    });
    if (run !== arRun || disposed) {
      started.stop();
      return;
    }
    ar = started;
    panelMode.value = 'auto';
    ar.session.setLayout(clampLayout(layout));
    arActive.value = true;
    if (arStage.value === 'engine') arStage.value = 'searching';
  } catch (error) {
    if (run === arRun) failAr(`O motor de rastreamento não iniciou: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Todo erro do AR termina aqui: estado final coerente, mensagem visível e ações de recuperação. */
function failAr(message: string): void {
  arError.value = message;
  if (arStage.value !== 'error' && arStage.value !== 'idle') arFailedAt.value = arStage.value;
  arStage.value = 'error';
  arDetail.value = '';
}

async function recompileAr(): Promise<void> {
  const id = pendingArCardId.value;
  if (!id) return;
  arError.value = '';
  try {
    await (await getCache()).reload(id);
  } catch (error) {
    failAr(`Não consegui recarregar a carta: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  await startArFor(id);
}

function dismissAr(): void {
  arRun++;
  lastReadyCard = null;
  stopAr();
  pendingArCardId.value = null;
  arStage.value = 'idle';
  arError.value = '';
}

const arSteps = computed(() => arStepList(arStage.value, spriteState.value?.kind, Boolean(pendingArCardId.value), arFailedAt.value));
const arHudText = computed(() => arStatusText(arStage.value, arDetail.value, spriteState.value?.kind));

function stopAr(): void {
  ar?.stop();
  ar = null;
  arActive.value = false;
  arState.value = { phase: 'idle', foundCount: 0 };
}

async function scanAnother(): Promise<void> {
  dismissAr();
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
  arRun++;
  stopAr();
  stopCamera(videoEl.value, stream);
  stream = null;
  cameraOn.value = false;
  arStage.value = pendingArCardId.value ? 'selected' : 'idle';
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

const gestures = new GestureTracker();

/** Ponto da tela → coordenadas normalizadas (−1..1, y para cima) do contêiner do AR. */
function ndcOf(clientX: number, clientY: number): { x: number; y: number } | null {
  const rect = stageEl.value?.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return null;
  return { x: ((clientX - rect.left) / rect.width) * 2 - 1, y: -(((clientY - rect.top) / rect.height) * 2 - 1) };
}

function toggleAdjusting(): void {
  adjusting.value = !adjusting.value;
  gestures.reset();
}

function onGestureDown(event: PointerEvent): void {
  (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  gestures.down(event.pointerId, event.clientX, event.clientY);
}

function onGestureMove(event: PointerEvent): void {
  const delta = gestures.move(event.pointerId, event.clientX, event.clientY);
  if (!delta || !ar) return;
  // Arrastar: o ponto do chão da carta que estava sob o dedo continua sob o dedo (vale para a perspectiva).
  const from = ndcOf(delta.from.x, delta.from.y);
  const to = ndcOf(delta.to.x, delta.to.y);
  const a = from ? ar.session.pointOnCardPlane(from.x, from.y) : null;
  const b = to ? ar.session.pointOnCardPlane(to.x, to.y) : null;
  if (a && b) {
    layout.offsetX += b.x - a.x;
    layout.offsetY += b.y - a.y;
  }
  if (delta.scale !== 1) layout.heightRatio *= delta.scale;
}

function onGestureUp(event: PointerEvent): void {
  gestures.up(event.pointerId);
}

// Toque no painel de status (fora do modo de ajuste): troca de página ou "usa" um ataque/golpe.
let tapDown: { x: number; y: number; at: number } | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

function onStageDown(event: PointerEvent): void {
  tapDown = adjusting.value ? null : { x: event.clientX, y: event.clientY, at: performance.now() };
}

function onStageUp(event: PointerEvent): void {
  const down = tapDown;
  tapDown = null;
  if (!down || adjusting.value || !ar) return;
  if (!isTap(down, { x: event.clientX, y: event.clientY, at: performance.now() })) return;
  const n = ndcOf(event.clientX, event.clientY);
  const picked = n ? ar.session.pickPanel(n.x, n.y) : null;
  if (!picked?.hit) return;
  if (picked.hit.kind === 'page') {
    setPanelMode(picked.hit.page);
    return;
  }
  setPanelMode(picked.page); // para de alternar sozinho enquanto o jogador está usando a página
  ar.panel?.press(picked.page, picked.hit.index, performance.now());
  // Usar golpes/ataques ainda não existe: o app diz isso em vez de fingir um efeito.
  moveNotice.value = `«${picked.hit.name}»: usar ${picked.hit.source === 'card' ? 'ataques da carta' : 'golpes'} ainda não está implementado.`;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (moveNotice.value = ''), 4000);
}

function setPanelMode(mode: PanelMode): void {
  panelMode.value = mode;
  ar?.panel?.setMode(mode);
}

function resetLayout(): void {
  Object.assign(layout, DEFAULT_LAYOUT);
  saveLayout();
}

watch(layout, saveLayout);
// Saiu do AR (outra carta, câmera fechada): o modo de ajuste não fica ligado sozinho.
watch(arActive, (active) => {
  if (!active) {
    adjusting.value = false;
    gestures.reset();
  }
});

if (props.cardId) {
  void ensureController().then((c) => c.loadCached(props.cardId as string));
}

onBeforeUnmount(() => {
  disposed = true;
  arRun++;
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

    <div ref="stageEl" class="viewport" :class="{ adjusting }" @pointerdown="onStageDown" @pointerup="onStageUp">
      <video ref="videoEl" class="feed" playsinline muted></video>
      <canvas :key="arCanvasKey" ref="canvasEl" class="overlay" aria-label="Camada de realidade aumentada"></canvas>
      <canvas ref="debugCanvasEl" class="overlay debug-quad" aria-hidden="true"></canvas>
      <p v-if="!cameraOn" class="placeholder">{{ cameraBusy ? 'Abrindo a câmera…' : 'Câmera desligada' }}</p>
      <div
        v-if="adjusting"
        class="gesture-layer"
        aria-label="Área de ajuste: arraste para mover o Pokémon e use pinça para mudar o tamanho"
        @pointerdown.prevent="onGestureDown"
        @pointermove.prevent="onGestureMove"
        @pointerup="onGestureUp"
        @pointercancel="onGestureUp"
      ></div>
      <p v-if="showScanInfo" class="hud" role="status">{{ scan.message }}</p>
      <p v-else-if="arHudText" class="hud" role="status">{{ arHudText }}</p>
    </div>

    <div class="actions">
      <button v-if="!cameraOn" type="button" class="primary" :disabled="cameraBusy" @click="openCamera">Abrir câmera</button>
      <template v-else>
        <button type="button" @click="scanAnother">{{ cardId ? 'Escanear outra carta' : 'Escanear de novo' }}</button>
        <button type="button" @click="closeCamera">Fechar câmera</button>
      </template>
    </div>

    <label v-if="!cardId" class="art-option">
      <input v-model="artOn" type="checkbox" @change="applyArtOption" />
      Usar a busca pela ilustração quando o número não for lido
    </label>
    <p v-if="artStatus" class="meta" role="status">{{ artStatus }}</p>

    <label v-if="!cardId" class="art-option">
      <input v-model="debugOn" type="checkbox" @change="applyDebugOption" />
      Mostrar o que o app está vendo (diagnóstico)
    </label>
    <div v-if="(debugOn || photoAttempt) && !cardId" class="debug-panel" role="status">
      <template v-if="shownAttempt">
        <p><strong>{{ shownAttempt.status }}</strong>{{ shownAttempt.reused ? ' (repetindo a leitura anterior)' : '' }} — {{ shownAttempt.message }}</p>
        <p class="meta">
          Tempos: detecção {{ shownAttempt.metrics.detectMs }} ms · OCR {{ shownAttempt.metrics.ocrMs }} ms · candidatas
          {{ shownAttempt.metrics.candidatesMs }} ms · total {{ shownAttempt.metrics.totalMs }} ms
        </p>
        <p class="meta">
          Candidatas: {{ shownAttempt.metrics.candidates }}{{ shownAttempt.metrics.artCandidates ? ` (${shownAttempt.metrics.artCandidates} pela ilustração)` : '' }}
          · origem: {{ shownAttempt.metrics.source }} · carta girada 180°: {{ shownAttempt.metrics.rotated180 ? 'sim' : 'não' }}
          · requisições: {{ shownAttempt.metrics.requests }}
        </p>
        <p v-if="shownAttempt.view?.detect" class="meta">
          Carta achada: {{ Math.round(shownAttempt.view.detect.areaFraction * 100) }}% do quadro · proporção
          {{ shownAttempt.view.detect.aspect.toFixed(2) }} · preenchimento {{ Math.round(shownAttempt.view.detect.fillRatio * 100) }}%
          · quadro {{ shownAttempt.view.frame.width }}×{{ shownAttempt.view.frame.height }}
        </p>
        <ul v-if="shownAttempt.view?.detectReasons.length" class="meta">
          <li v-for="reason in shownAttempt.view.detectReasons" :key="reason">{{ reason }}</li>
        </ul>
        <div class="debug-images">
          <figure v-if="debugRectUrl">
            <img :src="debugRectUrl" alt="Carta endireitada" />
            <figcaption>Carta endireitada</figcaption>
          </figure>
          <figure v-if="debugStripUrl">
            <img :src="debugStripUrl" alt="Faixa de baixo como o OCR a recebe" />
            <figcaption>Faixa de baixo (entrada do OCR)</figcaption>
          </figure>
        </div>
        <p v-if="shownAttempt.ocrBottom !== undefined" class="meta">
          OCR da faixa de baixo: <code class="mono">{{ shownAttempt.ocrBottom.replace(/\s+/g, ' ').slice(0, 120) || '(vazio)' }}</code>
        </p>
        <p v-if="shownAttempt.ocrName" class="meta">OCR do nome: <code class="mono">{{ shownAttempt.ocrName.replace(/\s+/g, ' ').slice(0, 80) }}</code></p>
      </template>
      <p v-else class="meta">Abra a câmera e aponte para a carta: aqui aparece o que o app enxerga a cada quadro.</p>
      <p v-if="indexStatus" class="meta">{{ indexStatus }}</p>
      <button v-if="photoAttempt" type="button" @click="clearPhoto">Voltar à câmera</button>
    </div>

    <div v-if="!cardId" class="photo-test">
      <label class="meta">Testar com uma foto do aparelho (processada só aqui, nada é enviado):
        <input type="file" accept="image/*" :disabled="photoBusy" @change="testPhoto" />
      </label>
      <p v-if="photoMessage" class="message" role="status">{{ photoMessage }}</p>
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
    <div v-if="arStage !== 'idle'" class="ar-panel" role="status" aria-live="polite">
      <ol class="ar-steps">
        <li v-for="step in arSteps" :key="step.key" :class="step.state">{{ step.label }}</li>
      </ol>
      <p v-if="arStage === 'selected'" class="message">Carta escolhida. Abra a câmera para ver o Pokémon sobre ela.</p>
      <p v-if="arDetail && (arStage === 'preparing' || arStage === 'compiling' || arStage === 'engine')" class="message">{{ arDetail }}</p>
      <template v-if="arStage === 'error'">
        <p class="message error" role="alert">{{ arError }}</p>
        <div class="actions">
          <button type="button" class="primary" @click="startArFor(pendingArCardId as string)">Tentar de novo</button>
          <button type="button" @click="recompileAr">Recompilar o alvo da carta</button>
          <button type="button" @click="dismissAr">Escolher outra carta</button>
        </div>
      </template>
    </div>

    <div v-if="scan.card && scan.phase === 'ready'" class="result" role="status">
      <h3>{{ scan.card.name }}</h3>
      <p>
        {{ scan.card.setName }} · nº {{ scan.card.localId }}/{{ scan.card.setOfficial }} ·
        <code>{{ scan.card.id }}</code>
        <template v-if="scan.card.dexIds[0]"> · Pokédex nº {{ scan.card.dexIds[0] }}</template>
      </p>
      <p class="origin">
        {{ scan.origin === 'escolha' ? 'Escolhida por você entre as candidatas.' : scan.origin === 'manual' ? 'Escolhida por você na busca manual (não foi reconhecida pela câmera).' : scan.origin === 'cache' ? 'Aberta do cache do aparelho.' : 'Reconhecida automaticamente.' }}
      </p>
      <p v-if="spriteText" class="message" :class="{ error: spriteState?.kind === 'error' }">{{ spriteText }}</p>
      <button v-if="spriteState?.kind === 'error'" type="button" @click="retrySprite">Tentar baixar o GIF de novo</button>
    </div>

    <p v-if="scan.last && scan.phase === 'scanning'" class="meta">
      Quadros analisados: {{ scan.frames }} · última leitura: {{ scan.last.metrics.totalMs }} ms
    </p>

    <details v-if="!cardId" class="layout manual" :open="manualOpen" @toggle="manualOpen = ($event.target as HTMLDetailsElement).open">
      <summary>Não está lendo? Buscar a carta à mão</summary>
      <label>Nome da carta (em inglês, ex.: Pikachu)
        <input v-model="manualName" type="text" autocomplete="off" @keyup.enter="searchManual" />
      </label>
      <label>Número da carta (opcional, ex.: 58)
        <input v-model="manualNumber" type="text" inputmode="numeric" autocomplete="off" @keyup.enter="searchManual" />
      </label>
      <button type="button" class="primary" @click="searchManual">Buscar</button>
      <p v-if="manualMessage" class="message">{{ manualMessage }}</p>
      <button v-for="match in manualResults" :key="match.id" type="button" @click="pickManual(match.id)">
        {{ match.name }} · {{ match.setName }} {{ match.localId }}/{{ match.setOfficial }}
      </button>
    </details>

    <div v-if="arActive" class="adjust-bar">
      <button type="button" :class="{ active: adjusting }" :aria-pressed="adjusting" @click="toggleAdjusting">
        {{ adjusting ? 'Concluir ajuste' : 'Ajustar com os dedos' }}
      </button>
      <p v-if="adjusting" class="meta">Arraste para mover o Pokémon e o painel. Use pinça com dois dedos para mudar o tamanho. O ajuste fica salvo.</p>
      <p v-else-if="layout.showStats" class="meta">Toque num ataque ou golpe do painel para usá-lo (ainda não implementado).</p>
    </div>
    <p v-if="moveNotice" class="message" role="status">{{ moveNotice }}</p>
    <div v-if="arActive && layout.showStats" class="panel-modes" role="group" aria-label="Página do painel de status">
      <button type="button" :class="{ active: panelMode === 'auto' }" :aria-pressed="panelMode === 'auto'" @click="setPanelMode('auto')">Auto</button>
      <button v-for="page in PANEL_PAGES" :key="page" type="button" :class="{ active: panelMode === page }" :aria-pressed="panelMode === page" @click="setPanelMode(page)">
        {{ PANEL_PAGE_LABELS_PT[page] }}
      </button>
    </div>
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
      <label class="art-option">
        <input v-model="layout.showStats" type="checkbox" />
        <span>Mostrar o painel de status no chão</span>
      </label>
      <label class="art-option">
        <input v-model="layout.smooth" type="checkbox" />
        <span>Suavizar o Pokémon (menos pixelado)</span>
      </label>
      <button type="button" @click="resetLayout">Restaurar padrão</button>
    </details>
  </section>
</template>
