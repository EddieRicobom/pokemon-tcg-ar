<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { isTap } from '../ar/gestures';
import { routeHref } from '../app/route';
import { getCache } from '../app/services';
import { useFullscreen } from '../app/fullscreen';
import { resolveTeam } from '../app/team';
import { savedTeam } from '../app/team-store';
import { cameraFilterCss, visual } from '../app/visual-settings';
import { LATENCY_RANGE, sensorSettings } from '../app/sensor-settings';
import { requestOrientationPermission } from '../sensors/orientation-feed';
import FilterSheet from '../components/FilterSheet.vue';
import StageButton from '../components/StageButton.vue';
import TeamPicker from '../components/TeamPicker.vue';
import type { BoxMode } from '../box/box-scene';
import { CameraError, startRearCamera, stopCamera } from '../core/camera';
import { DEFAULT_PHONE_HEIGHT_M, PHONE_HEIGHT_RANGE } from '../box/floor';
import { loadCreatureEntries } from '../box/load-creatures';
import type { RunningBox } from '../box/start-box';
import type { OrientationMode } from '../box/orientation-source';
import type { BoxCreature } from '../box/creature';

type Phase = 'idle' | 'starting' | 'placing' | 'running';

const videoEl = ref<HTMLVideoElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const stageEl = ref<HTMLElement | null>(null);
const { fullscreen, pseudo, toggle: toggleFullscreen, exit: exitFullscreen } = useFullscreen(stageEl);
const showFilters = ref(false);
const showTeam = ref(false);
const boxMode = ref<BoxMode>('passeio');

const phase = ref<Phase>('idle');
const error = ref('');
const hint = ref('');
const mode = ref<OrientationMode>('sensor');
const population = ref({ shown: 0, available: 0, failed: 0 });
const loadingCreatures = ref(false);
const picked = ref<{ name: string; detail: string; dexId?: number } | null>(null);
const phoneHeight = ref(DEFAULT_PHONE_HEIGHT_M);
const boxSize = ref(2.4);
const videoFov = ref(63);

let stream: MediaStream | null = null;
let box: RunningBox | null = null;
let disposed = false;
let tapDown: { x: number; y: number; at: number } | null = null;
let lastDrag: { x: number; y: number } | null = null;
let pickedTimer: ReturnType<typeof setTimeout> | null = null;

const cameraOn = computed(() => phase.value !== 'idle' && phase.value !== 'starting');

function ndcOf(clientX: number, clientY: number): { x: number; y: number } | null {
  const rect = stageEl.value?.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return null;
  return { x: ((clientX - rect.left) / rect.width) * 2 - 1, y: -(((clientY - rect.top) / rect.height) * 2 - 1) };
}

async function populate(): Promise<void> {
  loadingCreatures.value = true;
  try {
    const cache = await getCache();
    // A equipe escolhida (ou, sem escolha, as 6 mais recentes) é quem vai para a caixa.
    const team = resolveTeam(savedTeam.value, await cache.list());
    const loaded = await loadCreatureEntries(cache, undefined, team.ids);
    if (disposed || !box) return;
    box.setCreatures(loaded.entries);
    population.value = { shown: loaded.entries.length, available: loaded.available, failed: loaded.failed.length };
  } catch (e) {
    error.value = `Não consegui ler as cartas guardadas: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    loadingCreatures.value = false;
  }
}

async function open(): Promise<void> {
  // iOS: a permissão dos sensores precisa ser pedida direto do toque, antes de qualquer espera.
  void requestOrientationPermission();
  const video = videoEl.value;
  const canvas = canvasEl.value;
  const stage = stageEl.value;
  if (!video || !canvas || !stage) return;
  phase.value = 'starting';
  error.value = '';
  try {
    stream = await startRearCamera(video);
  } catch (e) {
    phase.value = 'idle';
    error.value = e instanceof CameraError ? e.message : 'Não foi possível abrir a câmera.';
    return;
  }
  try {
    const { startBox } = await import('../box/start-box');
    box = await startBox({ video, canvas, container: stage, onModeChange: (m) => (mode.value = m) });
  } catch (e) {
    close();
    error.value = `Não consegui iniciar a Caixa: ${e instanceof Error ? e.message : String(e)}`;
    return;
  }
  if (disposed) {
    close();
    return;
  }
  box.setPhoneHeight(phoneHeight.value);
  box.setHalfSize(boxSize.value / 2);
  box.setVideoFov(videoFov.value);
  box.setLook({ tone: visual.tone, outline: visual.outline });
  box.setMode(boxMode.value);
  phase.value = 'placing';
  hint.value = 'Aponte o celular para o chão onde a caixa vai ficar e toque em "Colocar a caixa aqui".';
  void populate();
}

function close(): void {
  void exitFullscreen();
  showFilters.value = false;
  showTeam.value = false;
  box?.stop();
  box = null;
  stopCamera(videoEl.value, stream);
  stream = null;
  phase.value = 'idle';
  picked.value = null;
  hint.value = '';
}

function placeAt(ndc: { x: number; y: number } | null): void {
  if (!box || !ndc) return;
  const result = box.placeAt(ndc.x, ndc.y);
  if (result.ok) {
    phase.value = 'running';
    hint.value = '';
  } else {
    hint.value = result.message;
  }
}

function placeHere(): void {
  placeAt({ x: 0, y: 0 });
}

function moveBox(): void {
  box?.clearPlacement();
  picked.value = null;
  phase.value = 'placing';
  hint.value = 'Aponte para o novo lugar no chão e toque em "Colocar a caixa aqui".';
}

function showPicked(creature: BoxCreature): void {
  creature.poke();
  picked.value = { name: creature.info.name, detail: creature.info.detail, dexId: creature.info.dexId };
  if (pickedTimer) clearTimeout(pickedTimer);
  pickedTimer = setTimeout(() => (picked.value = null), 5000);
}

function onPointerDown(event: PointerEvent): void {
  tapDown = { x: event.clientX, y: event.clientY, at: performance.now() };
  lastDrag = { x: event.clientX, y: event.clientY };
}

function onPointerMove(event: PointerEvent): void {
  if (!lastDrag || !box) return;
  // Sem sensores (computador), arrastar gira a visão.
  box.orientation.lookBy(event.clientX - lastDrag.x, event.clientY - lastDrag.y);
  lastDrag = { x: event.clientX, y: event.clientY };
}

function onPointerUp(event: PointerEvent): void {
  const down = tapDown;
  tapDown = null;
  lastDrag = null;
  if (!down || !box || !isTap(down, { x: event.clientX, y: event.clientY, at: performance.now() })) return;
  const ndc = ndcOf(event.clientX, event.clientY);
  if (!ndc) return;
  if (phase.value === 'placing') {
    placeAt(ndc);
  } else if (phase.value === 'running') {
    const creature = box.pick(ndc.x, ndc.y);
    if (creature) showPicked(creature);
  }
}

watch(() => [visual.tone, visual.outline] as const, ([tone, outline]) => box?.setLook({ tone, outline }));

function toggleMode(): void {
  boxMode.value = boxMode.value === 'passeio' ? 'formacao' : 'passeio';
  box?.setMode(boxMode.value);
}

function onPhoneHeight(): void {
  box?.setPhoneHeight(phoneHeight.value);
}
function onBoxSize(): void {
  box?.setHalfSize(boxSize.value / 2);
}
function onFov(): void {
  box?.setVideoFov(videoFov.value);
}

onBeforeUnmount(() => {
  disposed = true;
  if (pickedTimer) clearTimeout(pickedTimer);
  close();
});
</script>

<template>
  <section class="card" aria-labelledby="box-title">
    <h2 id="box-title">Caixa</h2>
    <p class="note">Sua equipe de até 6 Pokémon passeia solta num quadrado do chão. Gire o celular para olhar em volta.</p>

    <div
      ref="stageEl"
      class="viewport box-viewport"
      :class="{ placing: phase === 'placing', 'pseudo-full': pseudo, 'has-bar': cameraOn }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <video ref="videoEl" class="feed" playsinline muted :style="{ filter: cameraFilterCss(visual.camera) }"></video>
      <canvas ref="canvasEl" class="overlay" aria-label="Caixa com os Pokémon escaneados"></canvas>
      <p v-if="phase === 'idle'" class="placeholder">Câmera desligada</p>
      <div v-if="phase === 'placing'" class="crosshair" aria-hidden="true"></div>
      <p v-if="hint" class="hud" role="status">{{ hint }}</p>
      <p v-else-if="picked" class="hud" role="status">
        <strong>{{ picked.name }}</strong>
        <template v-if="picked.dexId"> · Nº {{ picked.dexId }}</template>
        <br />{{ picked.detail }}
      </p>
      <FilterSheet v-if="showFilters && cameraOn" @close="showFilters = false" />
      <div v-if="showTeam && cameraOn" class="stage-sheet" @pointerdown.stop @pointerup.stop @click.stop>
        <header>
          <strong>Equipe da caixa</strong>
          <button type="button" class="link" @click="showTeam = false">Fechar</button>
        </header>
        <TeamPicker @change="populate" />
      </div>
      <button v-if="phase === 'placing'" type="button" class="primary stage-cta" @pointerdown.stop @pointerup.stop @click="placeHere">Colocar a caixa aqui</button>
      <div v-if="cameraOn" class="stage-bar" @pointerdown.stop @pointerup.stop>
        <StageButton :icon="fullscreen ? 'exit-fullscreen' : 'fullscreen'" :label="fullscreen ? 'Sair' : 'Tela cheia'" @click="toggleFullscreen" />
        <StageButton icon="filters" label="Filtros" :active="showFilters" @click="showFilters = !showFilters; showTeam = false" />
        <StageButton icon="team" label="Equipe" :active="showTeam" @click="showTeam = !showTeam; showFilters = false" />
        <StageButton :icon="boxMode === 'passeio' ? 'formation' : 'wander'" :label="boxMode === 'passeio' ? 'Formação' : 'Passeio'" @click="toggleMode" />
        <StageButton v-if="phase === 'running'" icon="move" label="Mover" @click="moveBox" />
        <StageButton icon="close" label="Fechar" @click="close" />
      </div>
    </div>

    <div class="actions">
      <button v-if="phase === 'idle' || phase === 'starting'" type="button" class="primary" :disabled="phase === 'starting'" @click="open">
        {{ phase === 'starting' ? 'Abrindo…' : 'Abrir câmera e sensores' }}
      </button>
      <template v-else-if="phase === 'placing'">
        <button type="button" class="primary" @click="placeHere">Colocar a caixa aqui</button>
        <button type="button" @click="close">Fechar câmera</button>
      </template>
      <template v-else>
        <button type="button" @click="moveBox">Mover a caixa</button>
        <button type="button" @click="close">Fechar câmera</button>
      </template>
    </div>

    <p v-if="error" class="message error" role="alert">{{ error }}</p>
    <p v-if="cameraOn && mode === 'manual'" class="message" role="status">
      Este aparelho não enviou dados dos sensores de movimento. Arraste na imagem para olhar em volta.
    </p>
    <p v-if="loadingCreatures" class="message" role="status">Chamando os Pokémon…</p>
    <p v-else-if="cameraOn && population.available === 0" class="message" role="status">
      A caixa está vazia. Escaneie uma carta ou carregue suas cartas em <a :href="routeHref('carregar')">Cartas</a> para os Pokémon aparecerem aqui.
    </p>
    <p v-else-if="cameraOn" class="meta" role="status">
      {{ population.shown }} Pokémon na caixa<template v-if="population.available > population.shown"> (de {{ population.available }} guardados; cabem até 30)</template>.
      <template v-if="population.failed > 0"> {{ population.failed }} sprite(s) não puderam ser lidos.</template>
      Toque num Pokémon para ver quem é.
    </p>

    <details class="layout">
      <summary>Escolher a equipe da caixa (até 6)</summary>
      <TeamPicker @change="cameraOn ? populate() : undefined" />
    </details>

    <details v-if="cameraOn" class="layout">
      <summary>Ajustes da caixa</summary>
      <label>Altura do celular ({{ phoneHeight.toFixed(2) }} m)
        <input v-model.number="phoneHeight" type="range" :min="PHONE_HEIGHT_RANGE.min" :max="PHONE_HEIGHT_RANGE.max" step="0.05" @input="onPhoneHeight" />
      </label>
      <label>Tamanho da caixa ({{ boxSize.toFixed(1) }} m de lado)
        <input v-model.number="boxSize" type="range" min="1" max="6" step="0.2" @input="onBoxSize" />
      </label>
      <label>Atraso da câmera para o sensor ({{ sensorSettings.latencyMs }} ms)
        <input v-model.number="sensorSettings.latencyMs" type="range" :min="LATENCY_RANGE.min" :max="LATENCY_RANGE.max" step="5" />
      </label>
      <label>Ângulo de visão da câmera ({{ videoFov }}°)
        <input v-model.number="videoFov" type="range" min="45" max="85" step="1" @input="onFov" />
      </label>
      <p class="meta">
        A caixa fica presa ao chão pelos sensores de movimento: ela acompanha o giro do celular, mas não acompanha você andando.
        Se o chão parecer deslizar, ajuste a altura do celular e o ângulo de visão.
      </p>
    </details>
  </section>
</template>
