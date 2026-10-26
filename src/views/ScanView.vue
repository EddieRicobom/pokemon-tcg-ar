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
import { arLoadHint, arLoadingMode, arStageTitle, arStepList, arStatusText, elapsedSeconds } from '../app/ar-stages';
import CardArtwork from '../components/CardArtwork.vue';
import CardMarks from '../components/CardMarks.vue';
import ArLoading from '../components/ArLoading.vue';
import type { ArStage } from '../app/ar-stages';
import { ScanController } from '../app/scan-controller';
import type { LastAttempt, ScanState } from '../app/scan-controller';
import { fetchSprite, getArtIndex, loadBattle, getCache, getCatalog, getPipeline, getTcgdex, onOcrProgress, setArtSearch, setCaptureDebug } from '../app/services';
import type { ManualMatch } from '../recognition/catalog-index';
import { recordFromTcgdex } from '../recognition/pipeline';
import { detectCard } from '../recognition/detect-card';
import { frameQuality } from '../recognition/stability';
import { sameCardScore } from '../recognition/snapshot';
import { SCAN_STAGE_LABELS_PT, SCAN_STAGES } from '../recognition/stage-clock';
import type { Quad } from '../recognition/types';
import { recordScanMetrics } from '../app/scan-metrics';
import { scanSteps, stabilityText } from '../app/scan-steps';
import { lastAttempt } from '../app/diagnostics';
import { routeHref } from '../app/route';
import { useFullscreen } from '../app/fullscreen';
import { effectiveVisual } from '../app/visual-settings';
import { LATENCY_RANGE, sensorSettings } from '../app/sensor-settings';
import { requestOrientationPermission } from '../core/orientation-permission';
import SmoothingSheet from '../components/SmoothingSheet.vue';
import StageButton from '../components/StageButton.vue';
import StageSheet from '../components/StageSheet.vue';
import { CameraError, startCamera, stopCamera } from '../core/camera';
import type { CameraFacingMode } from '../core/camera';
import { frameFromVideo } from '../recognition/browser-image';
import type { RgbaImage } from '../recognition/types';
import { loadChunk } from '../app/stale-build';
import { loseCanvasContext } from '../ar/context-release';
import { formDexId, spriteIdOf } from '../core/dex-form';
import { TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import { typesOfDex } from '../core/species-filter';
import { isShiny } from '../core/shiny';
import { maybeGalladeSpeaks } from '../app/speech-store';
import { companionCard } from '../app/card-evolution-store';
import { includeMember } from '../app/team';
import { savedTeam, setSavedTeam } from '../app/team-store';
import { loadVillage } from '../app/village-store';
import { digitalCandidates } from '../app/digital-members';

const props = defineProps<{ cardId?: string }>();
const teamAction = ref<'idle' | 'loading' | 'added' | 'already' | 'full' | 'unavailable' | 'error'>('idle');

const videoEl = ref<HTMLVideoElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const stageEl = ref<HTMLElement | null>(null);
const arCanvasKey = ref(0);
const dockEl = ref<HTMLElement | null>(null);
/** Folha aberta sobre a câmera (uma por vez). */
type SheetName = 'smooth' | 'adjust' | 'tools' | 'manual';
const sheet = ref<SheetName | null>(null);
function toggleSheet(name: SheetName): void {
  sheet.value = sheet.value === name ? null : name;
  if (sheet.value === 'manual') manualHint.value = false;
}

const cameraOn = ref(false);
const cameraBusy = ref(false);
const cameraFacing = ref<CameraFacingMode>('environment');
/** Com a câmera ligada o visor cobre a janela inteira e tudo que importa aparece sobre a imagem: sem rolar a página. */
const immersive = computed(() => cameraOn.value || cameraBusy.value);
const { fullscreen, pseudo, toggle: toggleFullscreen, exit: exitFullscreen } = useFullscreen(stageEl, immersive);
const cameraMessage = ref('');
const loadingEngine = ref('');
const scan = ref<ScanState>({ phase: 'idle', message: '', frames: 0 });
watch(() => scan.value.card?.id, () => { teamAction.value = 'idle'; });
const arState = ref<ArState>({ phase: 'idle', foundCount: 0 });
const spriteState = ref<SpriteLoadState | null>(null);
const arStage = ref<ArStage>('idle');
const arDetail = ref('');
const arError = ref('');
const arFailedAt = ref<ArStage>('preparing');
const pendingArCardId = ref<string | null>(null);
let arRun = 0;
let lastReadyCard: unknown = null;
const panelMode = ref<PanelMode>('auto');
/** Modo "ajustar com os dedos": arrastar move o Pokémon (e o painel); pinça muda o tamanho. */
const adjusting = ref(false);
const moveNotice = ref('');
const arActive = ref(false);
const evolvedCaption = ref('');
const foilIntensity = ref(65);
const hudVisible = ref(true);
let hudHideTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleHudHide(): void {
  if (hudHideTimer) clearTimeout(hudHideTimer);
  hudHideTimer = undefined;
  if (!arActive.value || sheet.value || adjusting.value) return;
  hudHideTimer = setTimeout(() => { hudVisible.value = false; }, 3000);
}
function wakeHud(): void {
  hudVisible.value = true;
  scheduleHudHide();
}

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
const debugSideUrls = ref<string[]>([]);
const debugNameUrl = ref('');
// Desenhar contorno, cantos e áreas lidas sobre a câmera (pode desligar e manter só o painel).
const OVERLAY_KEY = 'tcg-ar-scan-overlay-v1';
function readOverlayOption(): boolean {
  try {
    return localStorage.getItem(OVERLAY_KEY) !== '0';
  } catch {
    return true;
  }
}
const overlayOn = ref(readOverlayOption());
function applyOverlayOption(): void {
  try {
    localStorage.setItem(OVERLAY_KEY, overlayOn.value ? '1' : '0');
  } catch {
    // Só não lembra da escolha na próxima vez.
  }
  refreshDebug();
}
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

/**
 * Desenha sobre o vídeo (que está em "cover" dentro do visor) o que o pipeline usou de verdade: contorno da carta,
 * os 4 cantos (1 = canto de cima à esquerda da carta lida), a faixa do número (azul; metades, se lidas) e a do nome
 * (roxo). As áreas vêm do próprio pipeline (mesma homografia dos recortes enviados ao OCR), não de um desenho à parte.
 */
function refreshDebug(): void {
  const last = shownAttempt.value ?? undefined;
  const view = last?.view;
  debugRectUrl.value = debugOn.value ? imageUrl(view?.rectified) : '';
  debugStripUrl.value = debugOn.value ? imageUrl(view?.strip) : '';
  debugSideUrls.value = debugOn.value ? (view?.sides ?? []).map((side) => imageUrl(side)) : [];
  debugNameUrl.value = debugOn.value ? imageUrl(view?.nameCrop) : '';
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
  const size = view?.frame ?? last?.frameSize;
  if (!debugOn.value || !overlayOn.value || !last?.quad || !size) return;
  const scale = Math.max(w / size.width, h / size.height);
  const ox = (w - size.width * scale) / 2;
  const oy = (h - size.height * scale) / 2;
  const toScreen = (p: { x: number; y: number }) => ({ x: ox + p.x * scale, y: oy + p.y * scale });
  const poly = (quad: Quad, color: string, width: number, dash: number[] = []) => {
    context.setLineDash(dash);
    context.lineWidth = width;
    context.strokeStyle = color;
    context.beginPath();
    quad.forEach((p, i) => {
      const s2 = toScreen(p);
      if (i === 0) context.moveTo(s2.x, s2.y);
      else context.lineTo(s2.x, s2.y);
    });
    context.closePath();
    context.stroke();
    context.setLineDash([]);
  };
  poly(last.quad, last.reused ? '#ffd166' : last.gated ? '#9fb3c8' : '#5fd38d', 3, last.gated ? [8, 6] : []);
  context.font = 'bold 13px system-ui, sans-serif';
  last.quad.forEach((p, i) => {
    const s2 = toScreen(p);
    context.fillStyle = '#5fd38d';
    context.beginPath();
    context.arc(s2.x, s2.y, 9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#0b1220';
    context.fillText(String(i + 1), s2.x - 4, s2.y + 5);
  });
  for (const region of view?.regions?.number ?? []) poly(region, '#4cc9f0', 2);
  if (view?.regions?.name) poly(view.regions.name, '#c77dff', 2);
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
      frameSize: { width, height },
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
const manualHint = ref(false);
const manualName = ref('');
const manualNumber = ref('');
const manualResults = ref<ManualMatch[]>([]);
const manualTotal = ref(0);
const MANUAL_PAGE = 30;
const manualLimit = ref(MANUAL_PAGE);
const manualMessage = ref('');
/** Busca à mão. `more` mostra a próxima página: todos os resultados podem ser vistos, inclusive o último. */
async function searchManual(more = false): Promise<void> {
  manualMessage.value = '';
  manualLimit.value = more ? manualLimit.value + MANUAL_PAGE : MANUAL_PAGE;
  const catalog = await getCatalog();
  if (!catalog) {
    manualResults.value = [];
    manualTotal.value = 0;
    manualMessage.value = 'O índice de cartas não está disponível agora. Tente de novo com conexão.';
    return;
  }
  const digits = manualNumber.value.replace(/\D/g, '');
  const page = catalog.searchPage(manualName.value, digits ? Number.parseInt(digits, 10) : undefined, manualLimit.value);
  manualResults.value = page.matches;
  manualTotal.value = page.total;
  if (page.total === 0) manualMessage.value = 'Nenhuma carta encontrada. Confira o nome (em inglês) ou o número.';
}
/** Leu um número que bate em mais cartas do que as baixadas: abre a busca à mão já com esse número. */
function searchReadNumber(value: number): void {
  manualName.value = '';
  manualNumber.value = String(value);
  sheet.value = 'manual';
  manualOpen.value = true;
  void searchManual();
}
async function pickManual(id: string): Promise<void> {
  // Esconde a lista e o contador ("Mostrando 0 de 243" ficava na tela depois de escolher).
  manualResults.value = [];
  manualTotal.value = 0;
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

// v3: novo padrão (Pokémon no centro da ilustração, inclinado 30° para trás, com sombra no chão).
const LAYOUT_KEY = 'tcg-ar-layout-v3';
function readLayout(): SpriteLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) return clampLayout({ ...DEFAULT_LAYOUT, ...(JSON.parse(raw) as Partial<SpriteLayout>) });
  } catch {
    // Sem armazenamento local (modo privado): usa o padrão.
  }
  return { ...DEFAULT_LAYOUT };
}
const layout = reactive<SpriteLayout>({ ...readLayout(), smoothing: effectiveVisual.value.smoothing, showShadow: effectiveVisual.value.shadow });
// A suavização dos pixels vem da escolha compartilhada (também usada em Várias e na Caixa).
watch(() => effectiveVisual.value.smoothing, (smoothing) => {
  layout.smoothing = smoothing;
});
watch(() => effectiveVisual.value.shadow, (shadow) => {
  layout.showShadow = shadow;
});

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

let lastCountedRead: LastAttempt | null = null;
let failedReads = 0;
async function ensureController(): Promise<ScanController> {
  if (controller) return controller;
  const cache = await getCache();
  controller = new ScanController({
    grabFrame: () => (videoEl.value ? frameFromVideo(videoEl.value) : null),
    recognize: async (frame, options) => (await getPipeline()).recognize(frame, options),
    // Detecção leve em todo quadro; o pipeline (OCR) só roda com a carta parada (ver ScanController).
    locate: (frame) => {
      const detection = detectCard(frame);
      return { detection, quality: detection ? frameQuality(frame, detection.quad) : undefined };
    },
    onAttempt: (attempt) => recordScanMetrics(attempt.metrics.stages, attempt.gated ? 'gated' : 'read'),
    // Foto temporária: depois da primeira leitura boa, confirma comparando quadros (sem repetir o OCR).
    sameCard: sameCardScore,
    cache,
    loadCardRecord: async (id) => {
      const card = await getTcgdex().getCard(id);
      return card ? recordFromTcgdex(card) : null;
    },
    onState: (state) => {
      scan.value = state;
      // Quadros só de detecção (carta ausente/mexendo) não contam como leitura.
      if (state.last && !state.last.gated && state.last !== lastCountedRead) {
        lastCountedRead = state.last;
        lastAttempt.value = state.last;
        failedReads = state.last.status === 'identified' ? 0 : failedReads + 1;
      }
      if (state.phase !== 'scanning') failedReads = 0;
      // Depois de várias leituras de verdade sem sucesso, abre a busca manual: o caminho seguro não fica escondido.
      if (state.phase === 'scanning' && failedReads >= 3) {
        manualOpen.value = true;
        manualHint.value = true;
      }
      if (state.phase === 'ready' && state.card && state.card !== lastReadyCard) {
        lastReadyCard = state.card;
        if (state.timeline?.confirmMs !== undefined) {
          const t = state.prepareTimings ?? {};
          recordScanMetrics({
            confirm: state.timeline.confirmMs, prepReference: t.reference, prepFeatures: t.features, prepSprite: t.sprite,
            prepTargetImage: t.targetImage, prepTargetCompile: t.targetCompile,
          }, 'event');
        }
        void startArFor(state.card.id);
      }
    },
  });
  return controller;
}

async function openCamera(): Promise<void> {
  // iOS: a permissão dos sensores precisa ser pedida direto do toque, antes de qualquer espera.
  void requestOrientationPermission();
  const video = videoEl.value;
  if (!video) return;
  cameraBusy.value = true;
  cameraMessage.value = '';
  try {
    stream = await startCamera(video, cameraFacing.value);
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

async function switchCamera(): Promise<void> {
  const video = videoEl.value;
  if (!video || cameraBusy.value) return;
  const card = pendingArCardId.value;
  const restartScan = !card && scan.value.phase === 'scanning';
  cameraBusy.value = true;
  controller?.stop();
  arRun++;
  stopAr();
  stopCamera(video, stream);
  stream = null;
  cameraOn.value = false;
  const nextFacing: CameraFacingMode = cameraFacing.value === 'environment' ? 'user' : 'environment';
  try {
    stream = await startCamera(video, nextFacing);
    cameraFacing.value = nextFacing;
    cameraOn.value = true;
  } catch (error) {
    cameraMessage.value = error instanceof CameraError ? error.message : 'Não foi possível trocar a câmera.';
    scan.value = { phase: 'error', frames: 0, message: cameraMessage.value };
    return;
  } finally {
    cameraBusy.value = false;
  }
  if (card) await startArFor(card);
  else if (restartScan) {
    scan.value = { phase: 'scanning', frames: 0, message: 'Procurando a carta…' };
    (await ensureController()).start();
  }
}

async function startArFor(cardId: string): Promise<void> {
  evolvedCaption.value = '';
  pendingArCardId.value = cardId;
  arError.value = '';
  if (!cameraOn.value || !videoEl.value || !canvasEl.value || !stageEl.value) {
    // Carta escolhida, mas sem câmera: fica esperando (o botão "Abrir câmera" continua daqui).
    stopAr();
    arStage.value = 'selected';
    return;
  }
  const run = ++arRun;
  const arStartedAt = performance.now();
  stopAr();
  // Recria o elemento <canvas> para garantir contexto WebGL novo sem contaminação anterior — e devolve o contexto do
  // canvas velho ao navegador na hora (senão cada carta deixava um contexto vivo; ver ar/context-release.ts).
  loseCanvasContext(canvasEl.value);
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
    const { startAr } = await loadChunk(() => import('../ar/start-ar'));
    const companion = companionCard(assets.card);
    const evolved = companion !== assets.card;
    evolvedCaption.value = evolved ? `${companion.name} · evoluiu da sua carta de ${assets.card.name}` : '';
    const started = await startAr({
      video: videoEl.value,
      canvas: canvasEl.value,
      container: stageEl.value,
      target: assets.target,
      dexId: spriteIdOf(companion),
      shiny: isShiny(assets.card),
      evolved,
      evolutionFx: () => effectiveVisual.value.evolutionFx && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      cachedSprite: evolved ? null : assets.cachedSprite,
      fetchSprite: (dexId, shiny) => fetchSprite(dexId, undefined, { shiny }),
      battle: {
        name: companion.name,
        load: (onPart) => loadBattle(assets.card.id, spriteIdOf(companion), onPart),
      },
      onState: (state) => {
        if (run !== arRun) return;
        arState.value = state;
        if (state.phase === 'searching' || state.phase === 'tracking' || state.phase === 'lost') arStage.value = state.phase;
        if (state.phase === 'tracking') maybeGalladeSpeaks({ name: companion.name, shiny: isShiny(assets.card) });
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
    // Do pedido do AR até o motor rodando (dados, alvo, motor): entra nas métricas do Diagnóstico.
    recordScanMetrics({ arInit: Math.round(performance.now() - arStartedAt) }, 'event');
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
  if (props.cardId) {
    window.location.hash = routeHref('escanear');
    return;
  }
  if (!cameraOn.value) {
    await openCamera();
    return;
  }
  scan.value = { phase: 'scanning', frames: 0, message: 'Procurando a carta…' };
  (await ensureController()).start();
}

async function includeScannedCard(): Promise<void> {
  const card = scan.value.card;
  if (!card) return;
  teamAction.value = 'loading';
  try {
    const cards = await (await getCache()).list();
    const candidates = [...cards, ...digitalCandidates(loadVillage().digital)];
    const result = includeMember(savedTeam.value, candidates, card.id);
    if (result.kind === 'added') setSavedTeam(result.ids);
    teamAction.value = result.kind;
  } catch {
    teamAction.value = 'error';
  }
}

/** A conclusão do scan leva diretamente ao próximo passo natural de uma coleção: conhecer a Vila. */
async function takeScannedCardToVillage(): Promise<void> {
  await includeScannedCard();
  if (teamAction.value === 'added' || teamAction.value === 'already') {
    window.location.hash = routeHref('vila');
  }
}

async function retrySprite(): Promise<void> {
  await ar?.reloadSprite();
}

function closeCamera(): void {
  const completedScan = scan.value.phase === 'ready' ? scan.value : null;
  void exitFullscreen();
  sheet.value = null;
  controller?.stop();
  arRun++;
  stopAr();
  stopCamera(videoEl.value, stream);
  stream = null;
  cameraOn.value = false;
  arStage.value = pendingArCardId.value ? 'selected' : 'idle';
  scan.value = completedScan ?? { phase: 'idle', message: '', frames: 0 };
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
  Object.assign(layout, DEFAULT_LAYOUT, { smoothing: effectiveVisual.value.smoothing, showShadow: effectiveVisual.value.shadow });
  saveLayout();
}

function resetRotation(): void {
  layout.yawDeg = DEFAULT_LAYOUT.yawDeg;
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
watch([arActive, sheet, adjusting], () => {
  hudVisible.value = true;
  scheduleHudHide();
});

if (props.cardId) {
  void ensureController().then((c) => c.loadCached(props.cardId as string));
}

onBeforeUnmount(() => {
  if (hudHideTimer) clearTimeout(hudHideTimer);
  disposed = true;
  arRun++;
  controller?.stop();
  stopAr();
  stopCamera(videoEl.value, stream);
});

type Tone = 'busy' | 'ok' | 'warn' | 'error';
interface Notice {
  text: string;
  sub?: string;
  tone: Tone;
}

/** O aviso principal sobre a câmera: o que o app está fazendo agora. */
const mainNotice = computed<Notice | null>(() => {
  if (!cameraOn.value) return null;
  const s = scan.value;
  if (loadingEngine.value) return { text: loadingEngine.value, tone: 'busy' };
  if (arStage.value === 'error') return { text: arError.value || 'O rastreamento falhou.', tone: 'error' };
  if (arStage.value === 'tracking') {
    const tone: Tone = spriteState.value?.kind === 'error' || spriteState.value?.kind === 'placeholder' ? 'warn' : 'ok';
    return { text: arHudText.value, tone };
  }
  if (arStage.value === 'lost') return { text: arHudText.value, tone: 'warn' };
  if (arStage.value !== 'idle' && arStage.value !== 'selected' && arHudText.value) return { text: arHudText.value, tone: 'busy' };
  if (s.phase === 'error') return { text: s.message, tone: 'error' };
  if (s.phase === 'choosing') return { text: s.message, tone: 'warn' };
  if (s.phase === 'scanning' || s.phase === 'preparing') {
    const sub = s.last && s.phase === 'scanning' ? `${s.frames} quadros analisados · última leitura ${s.last.metrics.totalMs} ms` : undefined;
    return { text: s.message, sub, tone: 'busy' };
  }
  return null;
});

/** Relógio da animação de carregamento: segundos desde que a etapa atual começou (só corre enquanto a animação aparece). */
const loadingMode = computed(() => (cameraOn.value ? arLoadingMode(arStage.value) : null));
const stageStartedAt = ref(Date.now());
const clockNow = ref(Date.now());
let clockTimer: ReturnType<typeof setInterval> | null = null;
watch(arStage, () => {
  stageStartedAt.value = Date.now();
  clockNow.value = stageStartedAt.value;
});
watch(
  loadingMode,
  (mode) => {
    if (mode && !clockTimer) clockTimer = setInterval(() => (clockNow.value = Date.now()), 500);
    else if (!mode && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer);
});

const LOADING_LABEL: Record<string, string> = {
  preparing: 'Dados e imagem da carta',
  compiling: 'Alvo de rastreamento',
  engine: 'Motor de rastreamento',
};
const loadingView = computed(() => {
  const mode = loadingMode.value;
  if (!mode) return null;
  const seconds = elapsedSeconds(stageStartedAt.value, clockNow.value);
  return {
    mode,
    title: arStageTitle(arStage.value),
    hint: arLoadHint(arStage.value, seconds),
    seconds,
    steps: arSteps.value.filter((step) => step.key in LOADING_LABEL).map((step) => ({ ...step, label: LOADING_LABEL[step.key] ?? step.label })),
  };
});

/** Etapas do AR enquanto o app prepara tudo (depois disso o aviso principal basta). */
const stepsNotice = computed(() => {
  if (!cameraOn.value || !['preparing', 'compiling', 'engine'].includes(arStage.value)) return null;
  const steps = arSteps.value;
  const index = Math.max(0, steps.findIndex((step) => step.state === 'active'));
  return { label: steps[index]?.label ?? '', position: index + 1, total: steps.length, steps };
});

const ORIGIN_TEXT: Record<string, string> = {
  escolha: 'escolhida por você entre as candidatas',
  manual: 'escolhida por você na busca manual',
  cache: 'aberta do cache do aparelho',
};
const resultNotice = computed(() => {
  const card = scan.value.card;
  if (!cameraOn.value || !card || scan.value.phase !== 'ready') return null;
  return {
    name: card.name,
    setName: card.setName,
    number: `${card.localId}/${card.setOfficial}`,
    rarity: card.rarity?.trim() || 'Raridade não informada',
    dex: card.dexIds[0] ? `Pokédex ${card.dexIds[0]}` : '',
    origin: ORIGIN_TEXT[scan.value.origin ?? ''] ?? 'reconhecida automaticamente',
  };
});

const focusedTypes = computed(() => {
  const card = scan.value.card;
  const dexId = card?.dexIds[0];
  return card && dexId !== undefined ? typesOfDex(formDexId(dexId, card.name)) : [];
});
const elementAccent = computed(() => TYPE_COLORS[focusedTypes.value[0] ?? 'normal']);
const viewportStyle = computed<Record<string, string>>(() => ({ '--element-accent': elementAccent.value, '--foil-intensity': String(foilIntensity.value / 100) }));
const gyroStatus = computed(() => !sensorSettings.gyro ? 'Sensor desligado' : arState.value.gyro ? 'Sensor ativo' : 'Aguardando movimento');

const spriteNotice = computed(() => {
  const kind = spriteState.value?.kind;
  return cameraOn.value && (kind === 'static' || kind === 'placeholder' || kind === 'error') ? spriteText.value : '';
});

const trackerText = computed(() => {
  if (!arActive.value) return '';
  const rate = arState.value.trackerHz ? `${arState.value.trackerHz} leituras/s` : 'medindo…';
  const gyro = !sensorSettings.gyro ? 'giroscópio desligado' : arState.value.gyro ? 'giroscópio ativo' : 'sem giroscópio';
  return `${rate} · ${gyro}`;
});

const adjustNotice = computed(() => (adjusting.value ? 'Arraste para mover o Pokémon e use a pinça para mudar o tamanho. Toque em Concluir para salvar.' : ''));
/** Depois de várias leituras sem sucesso, o botão "Buscar" chama a atenção: o caminho manual não fica escondido. */
const manualAttention = computed(() => manualHint.value && sheet.value !== 'manual' && scan.value.phase === 'scanning' && !props.cardId);
const confidencePct = (value: number) => `${Math.round(value * 100)}%`;

/** Miniatura da foto temporária (o quadro da leitura boa): desenhada só na memória do navegador, nada é enviado. */
const photoCanvasEl = ref<HTMLCanvasElement | null>(null);
watch(
  () => scan.value.photo?.frame,
  async (frame) => {
    await nextTick();
    const canvas = photoCanvasEl.value;
    if (!frame || !canvas) return;
    const scale = 120 / Math.max(frame.width, frame.height);
    canvas.width = Math.max(1, Math.round(frame.width * scale));
    canvas.height = Math.max(1, Math.round(frame.height * scale));
    const full = document.createElement('canvas');
    full.width = frame.width;
    full.height = frame.height;
    full.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height), 0, 0);
    canvas.getContext('2d')?.drawImage(full, 0, 0, canvas.width, canvas.height);
  },
);

// -- Progresso da leitura: as 8 etapas reais (ver `app/scan-steps.ts`), tempo decorrido, cancelar e reiniciar.
const scanStepList = computed(() => scanSteps(scan.value));
const scanStepsNotice = computed(() => {
  if (!cameraOn.value || props.cardId || (scan.value.phase !== 'scanning' && scan.value.phase !== 'preparing')) return null;
  if (arStage.value !== 'idle' && arStage.value !== 'selected') return null;
  const steps = scanStepList.value;
  const index = steps.findIndex((step) => step.state === 'active' || step.state === 'failed');
  const current = steps[Math.max(0, index)]!;
  const startedAt = scan.value.timeline?.startedAt;
  const seconds = startedAt !== undefined ? Math.max(0, Math.round((scanClock.value - startedAt) / 1000)) : null;
  return { steps, current, position: Math.max(0, index) + 1, seconds, stability: stabilityText(scan.value), quality: scan.value.qualityHint ?? null };
});
// Relógio do tempo decorrido (só anda enquanto lê).
const scanClock = ref(performance.now());
let scanClockTimer: ReturnType<typeof setInterval> | null = null;
watch(
  // Anda enquanto lê E enquanto guarda a carta (etapa 7): parado ali, o tempo mostrado mentiria.
  () => (scan.value.phase === 'scanning' || scan.value.phase === 'preparing') && cameraOn.value,
  (on) => {
    if (on && !scanClockTimer) scanClockTimer = setInterval(() => (scanClock.value = performance.now()), 500);
    else if (!on && scanClockTimer) {
      clearInterval(scanClockTimer);
      scanClockTimer = null;
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (scanClockTimer) clearInterval(scanClockTimer);
});
function cancelScan(): void {
  controller?.cancel();
}
async function restartScan(): Promise<void> {
  (await ensureController()).start();
}

/** O número lido bate em mais cartas do que as comparadas (ex.: número sem total). */
const moreMatches = computed(() => {
  const last = shownAttempt.value;
  const total = last?.metrics.catalogMatches ?? 0;
  const value = Number.parseInt((last?.ocrBottom ?? '').match(/\d+/)?.[0] ?? '', 10);
  if (!last || total <= last.metrics.candidates || !Number.isFinite(value)) return null;
  return { total, compared: last.metrics.candidates, value };
});
const stageRows = computed(() => {
  const m = shownAttempt.value?.metrics;
  if (!m) return [];
  return SCAN_STAGES.filter((stage) => m.stages[stage] !== undefined || m.skipped[stage]).map((stage) => ({
    stage,
    label: SCAN_STAGE_LABELS_PT[stage],
    ms: m.stages[stage],
    skipped: m.skipped[stage],
  }));
});
const VERDICT_PT = { aceita: 'aceita', duvida: 'em dúvida', rejeitada: 'rejeitada' } as const;
</script>

<template>
  <section class="card" aria-labelledby="scan-title">
    <h2 id="scan-title">{{ cardId ? 'Carta guardada' : 'Escanear carta' }}</h2>
    <p v-if="!cardId" class="note">
      Mostre a carta inteira, com boa luz e sem reflexo na parte de baixo, onde fica o número.
    </p>
    <p v-else class="note">Abra a câmera e aponte para a mesma carta física para ver o Pokémon sobre ela.</p>
    <aside v-if="!cardId && !cameraOn && !cameraBusy" class="scan-first-run" aria-label="Como começar">
      <strong>Como funciona</strong>
      <span>1. Abra a câmera. 2. Aponte para uma carta física. 3. Se a leitura falhar, use <b>Buscar a carta à mão</b> abaixo.</span>
      <a :href="routeHref('vila')">Sem carta agora? Comece pela Vila com um companheiro digital.</a>
    </aside>

    <div
      ref="stageEl"
      class="viewport"
      :class="{ adjusting, tracking: arState?.phase === 'tracking', 'pseudo-full': pseudo, immersive, 'hud-hidden': arActive && !hudVisible }"
      :style="viewportStyle"
      @pointerdown.capture="wakeHud"
      @pointermove.capture="wakeHud"
      @pointerdown="onStageDown"
      @pointerup="onStageUp"
    >
      <video ref="videoEl" class="feed" playsinline muted></video>
      <canvas :key="arCanvasKey" ref="canvasEl" class="overlay" aria-label="Camada de realidade aumentada"></canvas>
      <canvas ref="debugCanvasEl" class="overlay debug-quad" aria-hidden="true"></canvas>
      <p v-if="!cameraOn && !cameraBusy" class="placeholder">Câmera desligada</p>
      <div
        v-if="adjusting"
        class="gesture-layer"
        aria-label="Área de ajuste: arraste para mover o Pokémon e use pinça para mudar o tamanho"
        @pointerdown.prevent="onGestureDown"
        @pointermove.prevent="onGestureMove"
        @pointerup="onGestureUp"
        @pointercancel="onGestureUp"
      ></div>

      <ArLoading v-if="loadingView" v-bind="loadingView" />

      <div v-if="immersive" class="stage-head" role="status" aria-live="polite">
        <p v-if="evolvedCaption && arState.phase === 'tracking' && (spriteState?.kind === 'animated' || spriteState?.kind === 'static')" class="pill ok">
          <span class="pill-text">✦ Chamado do vínculo<small class="pill-sub">{{ evolvedCaption }}</small></span>
        </p>
        <p v-if="cameraBusy" class="pill busy"><i class="dot"></i><span class="pill-text">Abrindo a câmera…</span></p>
        <div v-if="stepsNotice" class="pill steps">
          <span class="pill-text">Etapa {{ stepsNotice.position }} de {{ stepsNotice.total }}: {{ stepsNotice.label }}</span>
          <span class="steps-bar" aria-hidden="true"><i v-for="step in stepsNotice.steps" :key="step.key" :class="step.state"></i></span>
        </div>
        <div v-if="scanStepsNotice" class="pill steps scan-steps">
          <span class="pill-text">
            Etapa {{ scanStepsNotice.position }} de {{ scanStepsNotice.steps.length }}: {{ scanStepsNotice.current.label }}{{ scanStepsNotice.seconds !== null ? ` · ${scanStepsNotice.seconds} s` : '' }}
            <small v-if="scanStepsNotice.stability || scanStepsNotice.quality" class="pill-sub">{{ [scanStepsNotice.stability, scanStepsNotice.quality].filter(Boolean).join(' · ') }}</small>
          </span>
          <span class="steps-bar" aria-hidden="true"><i v-for="step in scanStepsNotice.steps" :key="step.key" :class="step.state" :title="step.label + (step.note ? ` — ${step.note}` : '')"></i></span>
          <span class="scan-actions">
            <button v-if="scan.phase === 'scanning'" type="button" class="link" @click="cancelScan">Cancelar</button>
            <button type="button" class="link" @click="restartScan">Reiniciar</button>
          </span>
        </div>
        <figure v-if="scan.photo && (scan.phase === 'scanning' || scan.phase === 'choosing')" class="pill scan-photo">
          <canvas ref="photoCanvasEl" aria-label="Foto temporária da carta"></canvas>
          <figcaption>
            📸 Foto temporária<template v-if="scan.photo.cardName">: {{ scan.photo.cardName }}</template>
            <small>só na memória · confirmando sem ler de novo</small>
          </figcaption>
        </figure>
        <p v-if="mainNotice" class="pill" :class="mainNotice.tone">
          <i class="dot"></i>
          <span class="pill-text">{{ mainNotice.text }}<small v-if="mainNotice.sub" class="pill-sub">{{ mainNotice.sub }}</small></span>
        </p>
        <p v-if="resultNotice" class="pill gold">
          <span class="pill-text scan-card-title">{{ resultNotice.name }}</span>
          <span class="scan-card-badges">
            <small class="scan-card-badge rarity">{{ resultNotice.rarity }}</small>
            <small class="scan-card-badge">{{ resultNotice.setName }}</small>
            <small class="scan-card-badge">Nº {{ resultNotice.number }}</small>
            <small v-if="resultNotice.dex" class="scan-card-badge">{{ resultNotice.dex }}</small>
            <small v-for="type in focusedTypes" :key="type" class="scan-card-badge element" :style="{ '--element-accent': TYPE_COLORS[type] }">{{ TYPE_LABELS_PT[type] }}</small>
          </span>
          <small class="pill-sub">{{ resultNotice.origin }}</small>
        </p>
        <div v-if="arActive" class="ar-radar" :class="{ active: arState.gyro }" role="status" aria-live="polite">
          <span class="ar-radar-glyph" aria-hidden="true">◎</span>
          <span><b>{{ gyroStatus }}</b><small>{{ arState.trackerHz ? `${arState.trackerHz} leituras/s` : 'Rastreamento ligado' }}</small></span>
        </div>
        <p v-if="spriteNotice" class="pill warn"><i class="dot"></i><span class="pill-text">{{ spriteNotice }}</span></p>
        <p v-if="adjustNotice" class="pill ok"><i class="dot"></i><span class="pill-text">{{ adjustNotice }}</span></p>
        <p v-if="moveNotice" class="pill warn"><i class="dot"></i><span class="pill-text">{{ moveNotice }}</span></p>
        <p v-if="manualAttention" class="pill warn"><i class="dot"></i><span class="pill-text">Não está lendo? Toque em «Buscar» para procurar a carta pelo nome.</span></p>
        <p v-if="trackerText" class="pill small">{{ trackerText }}</p>
      </div>

      <div v-if="immersive" class="stage-foot" @pointerdown.stop @pointerup.stop>
        <div ref="dockEl" class="stage-dock"></div>

        <div v-if="scan.phase === 'choosing' && scan.choices" class="stage-sheet" role="group" aria-label="Qual impressão é esta?">
          <header><strong>Qual impressão é esta?</strong></header>
          <div class="choices">
            <button v-for="choice in scan.choices" :key="choice.card.id" type="button" @click="controller?.choose(choice.card.id)">
              {{ choice.card.name }} · {{ choice.card.setName }} {{ choice.card.localId }}/{{ choice.card.setOfficial }}
              <small>({{ confidencePct(choice.confidence) }})</small>
            </button>
            <button type="button" class="primary" @click="controller?.start()">Tentar de novo</button>
          </div>
        </div>

        <div v-if="arStage === 'error'" class="stage-sheet" role="alert">
          <header><strong>O Pokémon não apareceu</strong></header>
          <p class="meta">{{ arError }}</p>
          <button type="button" class="primary" @click="startArFor(pendingArCardId as string)">Tentar de novo</button>
          <button type="button" @click="recompileAr">Recompilar o alvo da carta</button>
          <button type="button" @click="dismissAr">Escolher outra carta</button>
        </div>

        <SmoothingSheet v-if="sheet === 'smooth' && cameraOn" @close="sheet = null" />

        <div v-if="sheet === 'adjust' && arActive" class="stage-sheet" role="dialog" aria-label="Ajustes do Pokémon" @pointerdown.stop @pointerup.stop @click.stop>
          <header>
            <strong>Ajustes do Pokémon</strong>
            <button type="button" class="link" @click="resetLayout">Restaurar</button>
            <button type="button" class="link" @click="sheet = null">Fechar</button>
          </header>
          <div v-if="layout.showStats" class="panel-modes" role="group" aria-label="Página do painel de status">
            <button type="button" :class="{ active: panelMode === 'auto' }" :aria-pressed="panelMode === 'auto'" @click="setPanelMode('auto')">Auto</button>
            <button v-for="page in PANEL_PAGES" :key="page" type="button" :class="{ active: panelMode === page }" :aria-pressed="panelMode === page" @click="setPanelMode(page)">
              {{ PANEL_PAGE_LABELS_PT[page] }}
            </button>
          </div>
          <div class="layout">
            <label>{{ layout.realSize !== false ? 'Tamanho base' : 'Altura' }} ({{ layout.heightRatio.toFixed(2) }} larguras da carta{{ layout.realSize !== false ? ' para um Pokémon de 1 m' : '' }})
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
            <label>Inclinação para trás ({{ Math.round(layout.tiltDeg ?? 0) }}°)
              <input v-model.number="layout.tiltDeg" type="range" :min="LAYOUT_LIMITS.tiltDeg.min" :max="LAYOUT_LIMITS.tiltDeg.max" step="5" />
            </label>
            <label>Giro ({{ Math.round(layout.yawDeg) }}°)
              <input v-model.number="layout.yawDeg" type="range" :min="LAYOUT_LIMITS.yawDeg.min" :max="LAYOUT_LIMITS.yawDeg.max" step="5" />
            </label>
            <label>Ponto de apoio
              <select v-model="layout.anchor">
                <option value="rest">Centro, encostado na carta</option>
                <option value="base">Pés (sobre o ponto)</option>
                <option value="center">Centro (no ar)</option>
              </select>
            </label>
            <label class="art-option">
              <input v-model="layout.showStats" type="checkbox" />
              <span>Mostrar o painel de status no chão</span>
            </label>
            <label class="art-option">
              <input v-model="layout.realSize" type="checkbox" />
              <span>Tamanho pela altura real da espécie (Pikachu menor, Snorlax maior)</span>
            </label>
            <label class="art-option">
              <input v-model="sensorSettings.gyro" type="checkbox" />
              <span>Usar o giroscópio (acompanha o giro do celular entre as leituras)</span>
            </label>
            <label>Atraso da câmera para o sensor ({{ sensorSettings.latencyMs }} ms)
              <input v-model.number="sensorSettings.latencyMs" type="range" :min="LATENCY_RANGE.min" :max="LATENCY_RANGE.max" step="5" />
            </label>
          </div>
        </div>

        <div class="stage-bar">
          <label v-if="arActive" class="foil-control" title="Intensidade do brilho na borda">
            <span>Brilho</span><input v-model.number="foilIntensity" type="range" min="0" max="100" step="5" aria-label="Intensidade do brilho foil" />
          </label>
          <StageButton :icon="fullscreen ? 'exit-fullscreen' : 'fullscreen'" :label="fullscreen ? 'Sair' : 'Tela cheia'" @click="toggleFullscreen" />
          <StageButton v-if="arActive" icon="camera" :label="cameraFacing === 'environment' ? 'Câmera frontal' : 'Câmera traseira'" :disabled="cameraBusy" @click="switchCamera" />
          <StageButton icon="filters" label="Suavizar" :active="sheet === 'smooth'" @click="toggleSheet('smooth')" />
          <StageButton icon="rescan" :label="cardId ? 'Escanear outra' : 'Escanear'" @click="scanAnother" />
          <StageButton v-if="!cardId" icon="search" label="Buscar" :active="sheet === 'manual'" :attention="manualAttention" @click="toggleSheet('manual')" />
          <StageButton v-if="!cardId" icon="tools" label="Teste" :active="sheet === 'tools'" @click="toggleSheet('tools')" />
          <StageButton v-if="arActive" icon="adjust" :label="adjusting ? 'Concluir' : 'Ajustar'" :active="adjusting" @click="toggleAdjusting" />
          <StageButton v-if="arActive" icon="rotate" label="Zerar giro" @click="resetRotation" />
          <StageButton v-if="arActive" icon="panel" label="Status" :active="layout.showStats !== false" @click="layout.showStats = layout.showStats === false" />
          <StageButton v-if="arActive" icon="sliders" label="Ajustes" :active="sheet === 'adjust'" @click="toggleSheet('adjust')" />
          <StageButton icon="close" label="Fechar" @click="closeCamera" />
        </div>
      </div>
    </div>

    <div class="actions">
      <button v-if="!cameraOn" type="button" class="primary" :disabled="cameraBusy" @click="openCamera">Abrir câmera</button>
    </div>

    <p v-if="cameraMessage && !cameraOn" class="message error" role="alert">{{ cameraMessage }}</p>

    <!-- Com a câmera desligada, esta ferramenta fica aqui; com ela ligada, vira uma folha sobre a imagem (botão «Teste»). -->
    <StageSheet v-if="!cardId" :docked="immersive" :host="dockEl" :open="sheet === 'tools'" title="Teste e diagnóstico" @close="sheet = null">
      <!-- Com a câmera desligada, recolhido: quem só quer escanear não vê caixas de depuração embaixo do botão. -->
      <component :is="immersive ? 'div' : 'details'" class="tools-panel" v-bind="immersive ? {} : { open: debugOn || !!photoAttempt }">
      <summary v-if="!immersive">Ferramentas de teste e diagnóstico</summary>
      <label class="art-option">
        <input v-model="artOn" type="checkbox" @change="applyArtOption" />
        Usar a busca pela ilustração quando o número não for lido
      </label>
      <p v-if="artStatus" class="meta" role="status">{{ artStatus }}</p>

      <label class="art-option">
        <input v-model="debugOn" type="checkbox" @change="applyDebugOption" />
        Mostrar o que o app está vendo (diagnóstico)
      </label>
      <label v-if="debugOn" class="art-option">
        <input v-model="overlayOn" type="checkbox" @change="applyOverlayOption" />
        Desenhar contorno, cantos e áreas lidas sobre a câmera
      </label>
      <div v-if="debugOn || photoAttempt" class="debug-panel" role="status">
        <template v-if="shownAttempt">
          <p><strong>{{ shownAttempt.status }}</strong>{{ shownAttempt.reused ? ' (repetindo a leitura anterior)' : '' }} — {{ shownAttempt.message }}</p>
          <p class="meta">Total desta leitura: {{ shownAttempt.metrics.totalMs }} ms{{ shownAttempt.gated ? ' (só detecção: a carta ainda não estava parada)' : '' }}</p>
          <table v-if="stageRows.length" class="stage-table">
            <tbody>
              <tr v-for="row in stageRows" :key="row.stage" :class="{ skipped: row.ms === undefined }">
                <th scope="row">{{ row.label }}</th>
                <td>{{ row.ms !== undefined ? `${row.ms} ms` : `pulada: ${row.skipped}` }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="scan.stability && !photoAttempt" class="meta">
            Estabilidade: {{ scan.stability.kind === 'stable' ? 'parada' : scan.stability.kind === 'moving' ? 'mexendo' : 'sem carta' }}
            {{ scan.stability.motion !== null ? `· movimento ${(scan.stability.motion * 100).toFixed(1)}% da diagonal (limite 2%)` : '' }}
          </p>
          <p v-if="shownAttempt.view?.quality" class="meta">
            Luz {{ Math.round(shownAttempt.view.quality.brightness) }}/255 · nitidez {{ shownAttempt.view.quality.sharpness.toFixed(1) }} (heurística; aviso abaixo de 2,5)
          </p>
          <p class="meta">
            Candidatas: {{ shownAttempt.metrics.candidates }}{{ shownAttempt.metrics.artCandidates ? ` (${shownAttempt.metrics.artCandidates} pela ilustração)` : '' }}
            · origem: {{ shownAttempt.metrics.source }} · carta girada 180°: {{ shownAttempt.metrics.rotated180 ? 'sim' : 'não' }}
            · requisições: {{ shownAttempt.metrics.requests }}
            {{ shownAttempt.metrics.referenceCacheHits ? `· ${shownAttempt.metrics.referenceCacheHits} referência(s) reaproveitada(s)` : '' }}
          </p>
          <p v-if="moreMatches" class="meta">
            O número lido bate em {{ moreMatches.total }} cartas do catálogo; comparei as {{ moreMatches.compared }} mais prováveis.
            <button type="button" class="link" @click="searchReadNumber(moreMatches.value)">Ver todas na busca à mão</button>
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
              <figcaption>Faixa do número (entrada do OCR)</figcaption>
            </figure>
            <figure v-for="(url, i) in debugSideUrls" :key="url.slice(-24) + i">
              <img :src="url" :alt="`Metade ${i === 0 ? 'esquerda' : 'direita'} da faixa, como o OCR a recebe`" />
              <figcaption>Metade {{ i === 0 ? 'esquerda' : 'direita' }} (2ª tentativa)</figcaption>
            </figure>
            <figure v-if="debugNameUrl">
              <img :src="debugNameUrl" alt="Faixa do nome como o OCR a recebe" />
              <figcaption>Faixa do nome (entrada do OCR)</figcaption>
            </figure>
          </div>
          <p v-if="shownAttempt.ocrBottom !== undefined" class="meta">
            OCR da faixa de baixo: <code class="mono">{{ shownAttempt.ocrBottom.replace(/\s+/g, ' ').slice(0, 120) || '(vazio)' }}</code>
          </p>
          <p v-if="shownAttempt.ocrName" class="meta">OCR do nome: <code class="mono">{{ shownAttempt.ocrName.replace(/\s+/g, ' ').slice(0, 80) }}</code></p>
          <ol v-if="shownAttempt.view?.candidates?.length" class="verdicts">
            <li v-for="c in shownAttempt.view.candidates" :key="c.id" :class="c.verdict">
              <strong>{{ c.name }}</strong> · {{ c.setName }} {{ c.localId }}/{{ c.setOfficial }} — {{ confidencePct(c.confidence) }}
              <em>{{ VERDICT_PT[c.verdict] }}</em>
              <small>{{ c.why }}{{ c.reasons.length ? ` · ${c.reasons.join(', ')}` : '' }}{{ c.viaVariant ? ' · número parecido' : '' }}</small>
            </li>
          </ol>
        </template>
        <p v-else class="meta">Abra a câmera e aponte para a carta: aqui aparece o que o app enxerga a cada quadro.</p>
        <p v-if="indexStatus" class="meta">{{ indexStatus }}</p>
        <button v-if="photoAttempt" type="button" @click="clearPhoto">Voltar à câmera</button>
      </div>

      <div class="photo-test">
        <label class="meta">Testar com uma foto do aparelho (processada só aqui, nada é enviado):
          <input type="file" accept="image/*" :disabled="photoBusy" @change="testPhoto" />
        </label>
        <p v-if="photoMessage" class="message" role="status">{{ photoMessage }}</p>
      </div>
      </component>
    </StageSheet>

    <p v-if="loadingEngine && !cameraOn" class="message" role="status">{{ loadingEngine }}</p>
    <p v-if="scan.phase === 'preparing' && !cameraOn" class="message" role="status">{{ scan.message }}</p>
    <p v-if="scan.phase === 'error' && !cameraOn" class="message error" role="alert">{{ scan.message }}</p>

    <div v-if="arStage !== 'idle' && !cameraOn && !(scan.phase === 'ready' && scan.card)" class="ar-panel" role="status" aria-live="polite">
      <ol class="ar-steps">
        <li v-for="step in arSteps" :key="step.key" :class="step.state">{{ step.label }}</li>
      </ol>
      <p v-if="arStage === 'selected'" class="message">Carta escolhida. Abra a câmera para ver o Pokémon sobre ela.</p>
      <template v-if="arStage === 'error'">
        <p class="message error" role="alert">{{ arError }}</p>
        <div class="actions">
          <button type="button" class="primary" @click="startArFor(pendingArCardId as string)">Tentar de novo</button>
          <button type="button" @click="recompileAr">Recompilar o alvo da carta</button>
          <button type="button" @click="dismissAr">Escolher outra carta</button>
        </div>
      </template>
    </div>

    <div v-if="scan.card && scan.phase === 'ready' && !cameraOn" class="result" role="status">
      <h3>{{ scan.card.name }} <CardMarks :card="scan.card" /></h3>
      <section class="scan-saved" aria-label="Carta salva">
        <strong>✓ Carta salva em Minhas cartas</strong>
        <span>Ela fica guardada neste aparelho. Você pode vê-la na coleção, colocá-la na Vila ou apontar a câmera para a mesma carta física e vê-la em AR.</span>
      </section>
      <p v-if="scan.card.scanCount === 1 && isShiny(scan.card) && scan.origin !== 'cache'" class="message shiny-news">Esta carta saiu shiny! O brilho dourado fica com ela para sempre.</p>
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
      <div class="actions result-actions">
        <button type="button" class="primary" :disabled="teamAction === 'loading' || teamAction === 'added' || teamAction === 'already' || teamAction === 'full' || teamAction === 'unavailable'" @click="takeScannedCardToVillage">
          {{ teamAction === 'loading' ? 'Levando para a Vila…' : teamAction === 'added' ? 'Na Vila ✓' : teamAction === 'already' ? 'Já mora na Vila ✓' : teamAction === 'full' ? 'Vila cheia' : teamAction === 'unavailable' ? 'Pokémon não carregado' : 'Próximo passo: levar para a Vila' }}
        </button>
        <a class="button" :href="routeHref('cartas')">Ver em Minhas cartas</a>
        <a class="button" :href="routeHref('escanear', scan.card.id)">Ver esta carta em AR</a>
        <a class="button" :href="routeHref('caixa')">Abrir a Caixa em AR</a>
        <button type="button" @click="scanAnother">Escanear outra carta</button>
      </div>
      <p v-if="teamAction === 'added'" class="message" role="status">{{ scan.card.name }} agora mora na Vila e também aparece na Caixa em AR.</p>
      <p v-else-if="teamAction === 'already'" class="message" role="status">{{ scan.card.name }} já mora na Vila e aparece na Caixa em AR.</p>
      <p v-else-if="teamAction === 'full'" class="message error" role="alert">A Vila chegou ao limite. <a :href="routeHref('cartas')">Abra Minhas cartas para trocar moradores.</a></p>
      <p v-else-if="teamAction === 'unavailable'" class="message" role="status">O Pokémon desta carta ainda não está carregado. <a :href="routeHref('cartas')">Veja o status em Minhas cartas.</a></p>
      <p v-else-if="teamAction === 'error'" class="message error" role="alert">Não consegui atualizar os moradores da Vila. Tente novamente ou abra <a :href="routeHref('cartas')">Minhas cartas</a>.</p>
    </div>

    <!-- Busca à mão: plano B quando a leitura automática não acha a carta. Com a câmera ligada vira uma folha («Buscar»). -->
    <StageSheet v-if="!cardId" :docked="immersive" :host="dockEl" :open="sheet === 'manual'" title="Buscar a carta à mão" @close="sheet = null">
      <component
        :is="immersive ? 'div' : 'details'"
        class="layout manual"
        v-bind="immersive ? {} : { open: manualOpen, onToggle: (e: Event) => (manualOpen = (e.target as HTMLDetailsElement).open) }"
      >
        <summary v-if="!immersive">Não está lendo? Buscar a carta à mão</summary>
        <label>Nome da carta (em inglês, ex.: Pikachu)
          <input v-model="manualName" type="text" autocomplete="off" @keyup.enter="searchManual()" />
        </label>
        <label>Número da carta (opcional, ex.: 58)
          <input v-model="manualNumber" type="text" inputmode="numeric" autocomplete="off" @keyup.enter="searchManual()" />
        </label>
        <button type="button" class="primary" @click="searchManual()">Buscar</button>
        <p v-if="manualMessage" class="message">{{ manualMessage }}</p>
        <p v-if="manualTotal > 0" class="meta">Mostrando {{ manualResults.length }} de {{ manualTotal }} cartas.</p>
        <button v-for="match in manualResults" :key="match.id" type="button" class="manual-result" @click="pickManual(match.id)">
          <CardArtwork v-if="match.thumb" :src="match.thumb" :alt="`Carta ${match.name}, ${match.setName}`" />
          <span v-else class="thumb-missing" aria-hidden="true">sem imagem</span>
          <span class="manual-result-text">
            <strong>{{ match.name }}</strong>
            <small>{{ match.setName }} · {{ match.localId }}/{{ match.setOfficial }}{{ match.release ? ` · ${match.release.slice(0, 4)}` : '' }}</small>
          </span>
        </button>
        <button v-if="manualResults.length < manualTotal" type="button" class="link" @click="searchManual(true)">
          Mostrar mais ({{ manualTotal - manualResults.length }} restantes)
        </button>
      </component>
    </StageSheet>
  </section>
</template>
