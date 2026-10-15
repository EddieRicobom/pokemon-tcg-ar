<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useFullscreen } from '../app/fullscreen';
import StageButton from './StageButton.vue';
import StageSheet from './StageSheet.vue';
import type { SpriteOverlay } from '../ar/overlay';
import { CameraError, startRearCamera, stopCamera } from '../core/camera';
import { decodeGif, describeGifError, fetchGif, type DecodedGif } from '../core/gif';
import { isValidDexId, pokemonSpriteUrl } from '../ar/sprite-url';
import { loadChunk } from '../app/stale-build';

type CameraState = 'idle' | 'starting' | 'on';

const videoEl = ref<HTMLVideoElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);

const stageEl = ref<HTMLElement | null>(null);
const dockEl = ref<HTMLElement | null>(null);
const sheetOpen = ref(false);

const cameraState = ref<CameraState>('idle');
/** Com a câmera ligada (ou abrindo) o visor cobre a janela e o formulário vira uma folha sobre a imagem. */
const immersive = computed(() => cameraState.value !== 'idle');
const { fullscreen, pseudo, toggle: toggleFullscreen } = useFullscreen(stageEl, immersive);
const cameraMessage = ref('');
const dexNumber = ref('25');
const loadingGif = ref(false);
const gifMessage = ref('');
const gifLabel = ref('');

let stream: MediaStream | null = null;
let overlay: SpriteOverlay | null = null;
let resizeObserver: ResizeObserver | null = null;
let downloadAbort: AbortController | null = null;
let disposed = false;

async function openCamera(): Promise<void> {
  const video = videoEl.value;
  if (!video) return;

  cameraState.value = 'starting';
  cameraMessage.value = '';
  try {
    stream = await startRearCamera(video);
    cameraState.value = 'on';
  } catch (error) {
    cameraState.value = 'idle';
    cameraMessage.value =
      error instanceof CameraError ? error.message : 'Não foi possível abrir a câmera.';
  }
}

function closeCamera(): void {
  sheetOpen.value = false;
  stopCamera(videoEl.value, stream);
  stream = null;
  cameraState.value = 'idle';
}

async function showGif(gif: DecodedGif, label: string): Promise<void> {
  const canvas = canvasEl.value;
  if (!canvas) return;

  if (!overlay) {
    // Three.js só é baixado quando o usuário realmente testa o renderizador.
    const { SpriteOverlay } = await loadChunk(() => import('../ar/overlay'));
    if (disposed) return;
    try {
      overlay = new SpriteOverlay(canvas);
    } catch {
      gifMessage.value = 'Este aparelho não conseguiu iniciar o WebGL, então o GIF não pode ser desenhado.';
      return;
    }
    overlay.start();
    resizeObserver = new ResizeObserver(() => overlay?.resize());
    resizeObserver.observe(canvas);
  }

  overlay.setGif(gif);
  gifLabel.value = label;
}

async function loadFromPokeApi(): Promise<void> {
  gifMessage.value = '';

  const dexId = Number(dexNumber.value);
  if (!isValidDexId(dexId)) {
    gifMessage.value = 'Digite o número da Pokédex Nacional (ex.: 25 para Pikachu).';
    return;
  }
  const url = pokemonSpriteUrl(dexId);

  downloadAbort?.abort();
  const controller = new AbortController();
  downloadAbort = controller;
  loadingGif.value = true;
  try {
    const gif = await fetchGif(url, controller.signal);
    await showGif(gif, `Pokédex nº ${dexId} (PokeAPI/sprites)`);
  } catch (error) {
    if (controller.signal.aborted) return;
    gifMessage.value = describeGifError(error);
  } finally {
    if (downloadAbort === controller) loadingGif.value = false;
  }
}

async function loadFromFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  gifMessage.value = '';
  try {
    await showGif(decodeGif(await file.arrayBuffer()), file.name);
  } catch (error) {
    gifMessage.value = describeGifError(error);
  } finally {
    input.value = '';
  }
}

onBeforeUnmount(() => {
  disposed = true;
  downloadAbort?.abort();
  resizeObserver?.disconnect();
  overlay?.dispose();
  overlay = null;
  closeCamera();
});
</script>

<template>
  <section class="card" aria-labelledby="stage-title">
    <h2 id="stage-title">Teste do renderizador (GIF fixo na tela)</h2>
    <p class="note">
      Este teste só confirma que a câmera abre e que um GIF animado é desenhado com fundo
      transparente. Aqui o Pokémon aparece <strong>fixo na tela</strong>: <strong>não há reconhecimento nem
      rastreamento de carta neste teste</strong>. O AR de verdade está em “Escanear”.
    </p>

    <div ref="stageEl" class="viewport" :class="{ 'pseudo-full': pseudo, immersive }">
      <video ref="videoEl" class="feed" playsinline muted></video>
      <canvas ref="canvasEl" class="overlay" aria-label="Camada de desenho do Pokémon"></canvas>
      <p v-if="cameraState !== 'on'" class="placeholder">
        {{ cameraState === 'starting' ? 'Abrindo a câmera…' : 'Câmera desligada' }}
      </p>

      <div v-if="immersive" class="stage-head" role="status" aria-live="polite">
        <p v-if="cameraState === 'starting'" class="pill busy"><i class="dot"></i><span class="pill-text">Abrindo a câmera…</span></p>
        <p v-if="gifLabel" class="pill gold"><span class="pill-text">Exibindo: {{ gifLabel }}<small class="pill-sub">Fixo na tela: não rastreia carta.</small></span></p>
        <p v-else-if="cameraState === 'on'" class="pill"><i class="dot"></i><span class="pill-text">Escolha um Pokémon em «Pokémon» para desenhar na tela.</span></p>
        <p v-if="loadingGif" class="pill busy"><i class="dot"></i><span class="pill-text">Baixando o GIF…</span></p>
        <p v-if="gifMessage" class="pill error"><i class="dot"></i><span class="pill-text">{{ gifMessage }}</span></p>
      </div>

      <div v-if="immersive" class="stage-foot" @pointerdown.stop @pointerup.stop>
        <div ref="dockEl" class="stage-dock"></div>
        <div v-if="cameraState === 'on'" class="stage-bar">
          <StageButton :icon="fullscreen ? 'exit-fullscreen' : 'fullscreen'" :label="fullscreen ? 'Sair' : 'Tela cheia'" @click="toggleFullscreen" />
          <StageButton icon="search" label="Pokémon" :active="sheetOpen" @click="sheetOpen = !sheetOpen" />
          <StageButton icon="close" label="Fechar" @click="closeCamera" />
        </div>
      </div>
    </div>

    <div class="actions">
      <button v-if="cameraState !== 'on'" type="button" class="primary" :disabled="cameraState === 'starting'" @click="openCamera">
        Abrir câmera
      </button>
    </div>
    <p v-if="cameraMessage" class="message error" role="alert">{{ cameraMessage }}</p>

    <!-- Com a câmera desligada o formulário fica aqui; com ela ligada vira a folha «Pokémon» sobre a imagem. -->
    <StageSheet :docked="immersive" :host="dockEl" :open="sheetOpen" title="Pokémon para desenhar" @close="sheetOpen = false">
      <form class="gif-form" @submit.prevent="loadFromPokeApi">
        <label for="species">Número da Pokédex Nacional</label>
        <div class="row">
          <input id="species" v-model="dexNumber" type="text" inputmode="numeric" autocomplete="off" />
          <button type="submit" :disabled="loadingGif">
            {{ loadingGif ? 'Baixando…' : 'Baixar GIF' }}
          </button>
        </div>
      </form>

      <label class="file-picker">
        <span>Ou carregue um GIF do aparelho</span>
        <input type="file" accept="image/gif" @change="loadFromFile" />
      </label>
    </StageSheet>

    <p v-if="gifLabel && !immersive" class="message" role="status">Exibindo: {{ gifLabel }}</p>
    <p v-if="gifMessage && !immersive" class="message error" role="alert">{{ gifMessage }}</p>
  </section>
</template>
