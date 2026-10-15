<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { clampLayout, DEFAULT_LAYOUT } from '../ar/anchor';
import { fetchSprite } from '../ar/sprite-source';
import type { MultiArState } from '../ar/multi-session';
import type { RunningMulti } from '../ar/start-multi';
import { MULTI_MAX_TRACK } from '../ar/start-multi';
import { prepareMultiAssets } from '../app/multi-prepare';
import { routeHref } from '../app/route';
import { getCache } from '../app/services';
import { useFullscreen } from '../app/fullscreen';
import { resolveTeam } from '../app/team';
import { savedTeam } from '../app/team-store';
import { visual } from '../app/visual-settings';
import SmoothingSheet from '../components/SmoothingSheet.vue';
import StageButton from '../components/StageButton.vue';
import { CameraError, startRearCamera, stopCamera } from '../core/camera';
import { loadChunk } from '../app/stale-build';
import { spriteIdOf } from '../core/dex-form';
import { isShiny } from '../core/shiny';

type Phase = 'idle' | 'starting' | 'running';

const videoEl = ref<HTMLVideoElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const stageEl = ref<HTMLElement | null>(null);
const showFilters = ref(false);
const canvasKey = ref(0);

const phase = ref<Phase>('idle');
/** Com a câmera ligada (ou abrindo) o visor cobre a janela e tudo aparece sobre a imagem: sem rolar a página. */
const immersive = computed(() => phase.value !== 'idle');
const { fullscreen, pseudo, toggle: toggleFullscreen, exit: exitFullscreen } = useFullscreen(stageEl, immersive);
const error = ref('');
const progress = ref('');
const state = ref<MultiArState>({ phase: 'idle', visible: [] });
const teamNames = ref<{ id: string; name: string }[]>([]);
const teamAuto = ref(true);
const failed = ref<{ name: string; reason: string }[]>([]);
const loadedNames = ref<Map<string, string>>(new Map());

let stream: MediaStream | null = null;
let running: RunningMulti | null = null;
let disposed = false;
let run = 0;

const cameraOn = computed(() => phase.value === 'running');
const visibleNames = computed(() => state.value.visible.map((id) => loadedNames.value.get(id) ?? id));

async function readTeam(): Promise<void> {
  try {
    const cards = await (await getCache()).list();
    const team = resolveTeam(savedTeam.value, cards);
    const byId = new Map(cards.map((card) => [card.id, card.name]));
    teamNames.value = team.ids.map((id) => ({ id, name: byId.get(id) ?? id }));
    teamAuto.value = team.auto;
  } catch (e) {
    error.value = `Não consegui ler as cartas guardadas: ${e instanceof Error ? e.message : String(e)}`;
  }
}

onMounted(readTeam);
watch(savedTeam, readTeam);

async function open(): Promise<void> {
  const video = videoEl.value;
  const stage = stageEl.value;
  if (!video || !stage) return;
  const mine = ++run;
  phase.value = 'starting';
  error.value = '';
  failed.value = [];
  progress.value = 'Abrindo a câmera…';
  try {
    stream = await startRearCamera(video);
  } catch (e) {
    phase.value = 'idle';
    error.value = e instanceof CameraError ? e.message : 'Não foi possível abrir a câmera.';
    return;
  }
  try {
    const cache = await getCache();
    const cards = await cache.list();
    const team = resolveTeam(savedTeam.value, cards);
    const names = new Map(cards.map((card) => [card.id, card.name]));
    if (team.ids.length === 0) throw new Error('Não há cartas com Pokémon guardadas. Escaneie cartas ou carregue-as em Cartas.');
    const prepared = await prepareMultiAssets(cache, team.ids, names, (done, total, name, detail) => {
      if (mine === run) progress.value = total > 0 && name ? `Preparando ${done + 1}/${total}: ${name}. ${detail}` : detail;
    });
    if (mine !== run || disposed) return;
    failed.value = prepared.failed.map((f) => ({ name: f.name, reason: f.reason }));
    if (prepared.ready.length === 0) throw new Error('Nenhuma carta da equipe ficou pronta para rastrear.');
    loadedNames.value = new Map(prepared.ready.map((r) => [r.card.id, r.card.name]));
    // <canvas> novo a cada sessão: contexto WebGL limpo.
    canvasKey.value++;
    await nextTick();
    // Pausa curta para o GC liberar buffers do TensorFlow.js depois das compilações.
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (mine !== run || disposed || !canvasEl.value || !videoEl.value || !stageEl.value) return;
    progress.value = 'Iniciando o motor de rastreamento…';
    const { startMulti } = await loadChunk(() => import('../ar/start-multi'));
    const started = await startMulti({
      video: videoEl.value,
      canvas: canvasEl.value,
      container: stageEl.value,
      cards: prepared.ready.map((r) => ({ cardId: r.card.id, name: r.card.name, dexId: spriteIdOf(r.card), shiny: isShiny(r.card), target: r.target, cachedSprite: r.cachedSprite })),
      fetchSprite: (dexId, shiny) => fetchSprite(dexId, undefined, { shiny }),
      onState: (s) => {
        if (mine === run) state.value = s;
      },
      onSprite: () => undefined,
    });
    if (mine !== run || disposed) {
      started.stop();
      return;
    }
    running = started;
    running.setLayout(clampLayout({ ...DEFAULT_LAYOUT, smoothing: visual.smoothing, showShadow: visual.shadow }));
    phase.value = 'running';
    progress.value = '';
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    close();
  }
}

function close(): void {
  run++;
  void exitFullscreen();
  showFilters.value = false;
  running?.stop();
  running = null;
  stopCamera(videoEl.value, stream);
  stream = null;
  phase.value = 'idle';
  progress.value = '';
  state.value = { phase: 'idle', visible: [] };
}

watch(() => [visual.smoothing, visual.shadow] as const, ([smoothing, shadow]) => {
  running?.setLayout(clampLayout({ ...DEFAULT_LAYOUT, smoothing, showShadow: shadow }));
});

onBeforeUnmount(() => {
  disposed = true;
  close();
});
</script>

<template>
  <section class="card" aria-labelledby="multi-title">
    <h2 id="multi-title">Várias cartas</h2>
    <p class="note">
      Coloque até {{ MULTI_MAX_TRACK }} cartas da sua equipe na mesa: cada uma ganha o seu Pokémon ao mesmo tempo. As cartas são reconhecidas pela imagem guardada; nada é lido do texto.
    </p>

    <div ref="stageEl" class="viewport box-viewport" :class="{ 'pseudo-full': pseudo, immersive }">
      <video ref="videoEl" class="feed" playsinline muted></video>
      <canvas :key="canvasKey" ref="canvasEl" class="overlay" aria-label="Pokémon sobre as cartas"></canvas>
      <p v-if="phase === 'idle'" class="placeholder">Câmera desligada</p>

      <div v-if="immersive" class="stage-head" role="status" aria-live="polite">
        <p v-if="phase === 'starting'" class="pill busy"><i class="dot"></i><span class="pill-text">{{ progress || 'Preparando…' }}</span></p>
        <div v-else-if="visibleNames.length > 0" class="multi-chips">
          <span v-for="name in visibleNames" :key="name">{{ name }}</span>
        </div>
        <p v-else class="pill busy"><i class="dot"></i><span class="pill-text">Aponte a câmera para as cartas da equipe.</span></p>
        <p v-if="failed.length > 0" class="pill warn">
          <i class="dot"></i>
          <span class="pill-text">Ficaram de fora: {{ failed.map((f) => f.name).join(', ') }}<small class="pill-sub">{{ failed[0]?.reason }}</small></span>
        </p>
        <p v-if="cameraOn && state.trackerHz" class="pill small">
          {{ state.trackerHz }} leituras/s · {{ state.gyro ? 'giroscópio ativo' : 'sem giroscópio' }}
        </p>
      </div>

      <div v-if="immersive" class="stage-foot" @pointerdown.stop @pointerup.stop>
        <SmoothingSheet v-if="showFilters && cameraOn" @close="showFilters = false" />
        <div v-if="cameraOn" class="stage-bar">
          <StageButton :icon="fullscreen ? 'exit-fullscreen' : 'fullscreen'" :label="fullscreen ? 'Sair' : 'Tela cheia'" @click="toggleFullscreen" />
          <StageButton icon="filters" label="Suavizar" :active="showFilters" @click="showFilters = !showFilters" />
          <StageButton icon="close" label="Fechar" @click="close" />
        </div>
        <button v-else type="button" class="stage-cta" @click="close">Cancelar</button>
      </div>
    </div>

    <div class="actions">
      <button type="button" class="primary" :disabled="phase !== 'idle' || teamNames.length === 0" @click="open">
        {{ phase === 'starting' ? 'Preparando…' : 'Abrir câmera e rastrear a equipe' }}
      </button>
    </div>

    <p v-if="error" class="message error" role="alert">{{ error }}</p>
    <p v-if="failed.length > 0 && !immersive" class="message" role="status">
      Ficaram de fora:
      <span v-for="f in failed" :key="f.name" class="meta"><br />· {{ f.name }}: {{ f.reason }}</span>
    </p>
    <p v-if="teamNames.length === 0" class="message" role="status">
      Nenhuma carta com Pokémon guardada ainda. Escaneie cartas ou carregue-as em <a :href="routeHref('carregar')">Cartas</a>.
    </p>
    <p v-else class="meta">
      Equipe{{ teamAuto ? ' (automática: as mais recentes)' : '' }}: {{ teamNames.map((t) => t.name).join(', ') }}.
      Troque em <a :href="routeHref('carregar')">Cartas</a>.
      <template v-if="teamNames.length > MULTI_MAX_TRACK"> O rastreador acompanha até {{ MULTI_MAX_TRACK }} cartas por vez.</template>
    </p>
  </section>
</template>
