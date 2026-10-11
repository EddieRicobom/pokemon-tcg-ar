<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import type { SpriteOverlay } from '../ar/overlay';
import { CameraError, startRearCamera, stopCamera } from '../core/camera';
import { decodeGif, describeGifError, fetchGif, type DecodedGif } from '../core/gif';
import { showdownSpriteUrl } from '../core/showdown';

type CameraState = 'idle' | 'starting' | 'on';

const videoEl = ref<HTMLVideoElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);

const cameraState = ref<CameraState>('idle');
const cameraMessage = ref('');
const species = ref('pikachu');
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
  stopCamera(videoEl.value, stream);
  stream = null;
  cameraState.value = 'idle';
}

async function showGif(gif: DecodedGif, label: string): Promise<void> {
  const canvas = canvasEl.value;
  if (!canvas) return;

  if (!overlay) {
    // Three.js só é baixado quando o usuário realmente testa o renderizador.
    const { SpriteOverlay } = await import('../ar/overlay');
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

async function loadFromShowdown(): Promise<void> {
  gifMessage.value = '';

  let url: string;
  try {
    url = showdownSpriteUrl(species.value);
  } catch (error) {
    gifMessage.value = error instanceof Error ? error.message : 'Nome de Pokémon inválido.';
    return;
  }

  downloadAbort?.abort();
  const controller = new AbortController();
  downloadAbort = controller;
  loadingGif.value = true;
  try {
    const gif = await fetchGif(url, controller.signal);
    await showGif(gif, `${species.value.trim()} (Pokémon Showdown)`);
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
    <h2 id="stage-title">Teste da câmera e do renderizador</h2>
    <p class="note">
      Este teste só confirma que a câmera abre e que um GIF animado é desenhado com fundo
      transparente. O Pokémon aparece <strong>fixo na tela</strong>: o app ainda
      <strong>não reconhece nem rastreia cartas</strong>.
    </p>

    <div class="viewport">
      <video ref="videoEl" class="feed" playsinline muted></video>
      <canvas ref="canvasEl" class="overlay" aria-label="Camada de desenho do Pokémon"></canvas>
      <p v-if="cameraState !== 'on'" class="placeholder">
        {{ cameraState === 'starting' ? 'Abrindo a câmera…' : 'Câmera desligada' }}
      </p>
    </div>

    <div class="actions">
      <button
        v-if="cameraState !== 'on'"
        type="button"
        class="primary"
        :disabled="cameraState === 'starting'"
        @click="openCamera"
      >
        Abrir câmera
      </button>
      <button v-else type="button" @click="closeCamera">Fechar câmera</button>
    </div>
    <p v-if="cameraMessage" class="message error" role="alert">{{ cameraMessage }}</p>

    <form class="gif-form" @submit.prevent="loadFromShowdown">
      <label for="species">Pokémon (nome em inglês)</label>
      <div class="row">
        <input
          id="species"
          v-model="species"
          type="text"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
        />
        <button type="submit" :disabled="loadingGif">
          {{ loadingGif ? 'Baixando…' : 'Carregar GIF do Showdown' }}
        </button>
      </div>
    </form>

    <label class="file-picker">
      <span>Ou carregue um GIF do aparelho</span>
      <input type="file" accept="image/gif" @change="loadFromFile" />
    </label>

    <p v-if="gifLabel" class="message" role="status">Exibindo: {{ gifLabel }}</p>
    <p v-if="gifMessage" class="message error" role="alert">{{ gifMessage }}</p>
  </section>
</template>
