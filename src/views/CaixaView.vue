<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { isTap } from '../ar/gestures';
import { routeHref } from '../app/route';
import { getCache, loadBattle } from '../app/services';
import { prepareFighters } from '../app/battle-setup';
import { useFullscreen } from '../app/fullscreen';
import { resolveTeam } from '../app/team';
import { savedTeam } from '../app/team-store';
import { visual } from '../app/visual-settings';
import { LATENCY_RANGE, sensorSettings } from '../app/sensor-settings';
import { requestOrientationPermission } from '../sensors/orientation-feed';
import SmoothingSheet from '../components/SmoothingSheet.vue';
import StageButton from '../components/StageButton.vue';
import TeamPicker from '../components/TeamPicker.vue';
import type { BoxMode } from '../box/box-scene';
import { CameraError, startRearCamera, stopCamera } from '../core/camera';
import { DEFAULT_PHONE_HEIGHT_M, PHONE_HEIGHT_RANGE } from '../box/floor';
import { loadCreatureEntries } from '../box/load-creatures';
import type { RunningBox } from '../box/start-box';
import type { OrientationMode } from '../box/orientation-source';
import type { BoxCreature } from '../box/creature';
import type { BattleHud } from '../box/battle-director';
import { TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import { STATUS_LABELS_PT, summarizeBattle } from '../core/battle';
import type { BattleSummary, Fighter } from '../core/battle';

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
const battleHud = ref<BattleHud | null>(null);
const preparing = ref(false);
const battleFighters = ref<Fighter[]>([]);
const battleSummary = ref<{ winner: string; turns: number; rounds: number; stats: BattleSummary } | null>(null);

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
    box = await startBox({
      video, canvas, container: stage, onModeChange: (m) => (mode.value = m), onBattleHud: (hud) => (battleHud.value = hud),
    });
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
  box.setSmoothing(visual.smoothing);
  box.setMode(boxMode.value);
  phase.value = 'placing';
  hint.value = 'Aponte o celular para o chão onde a caixa vai ficar e toque em "Colocar a caixa aqui".';
  void populate();
}

function close(): void {
  battleHud.value = null;
  battleSummary.value = null;
  preparing.value = false;
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
  stopBattle();
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

watch(() => visual.smoothing, (smoothing) => box?.setSmoothing(smoothing));

const canBattle = computed(() => phase.value === 'running' && population.value.shown >= 2 && !loadingCreatures.value && !preparing.value);
const battling = computed(() => battleHud.value !== null);
/** Tremor e "soco" de zoom da imagem desenhada nos golpes fortes (o vídeo da câmera não treme). */
const shakeStyle = computed(() => {
  const s = battleHud.value?.shake;
  if (!s || (Math.abs(s.x) < 0.2 && Math.abs(s.y) < 0.2 && s.zoom < 1.002)) return undefined;
  return { transform: `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) scale(${s.zoom.toFixed(3)})` };
});

/** Carrega os dados de cada Pokémon da caixa (jogo + carta) e começa a luta automática. */
async function startBattle(): Promise<void> {
  const current = box;
  if (!current || preparing.value) return;
  const creatures = current.scene.creatureList;
  if (creatures.length < 2) return;
  preparing.value = true;
  error.value = '';
  hint.value = 'Preparando a batalha: buscando atributos e golpes…';
  showFilters.value = false;
  showTeam.value = false;
  try {
    const fighters = await prepareFighters(creatures.map((c) => ({ id: c.info.id, name: c.info.name, dexId: c.info.dexId })), loadBattle);
    if (disposed || box !== current) return;
    const result = current.startBattle(fighters);
    battleFighters.value = fighters;
    battleSummary.value = {
      winner: fighters[result.winner]?.name ?? '',
      turns: result.turns.length,
      rounds: result.turns.at(-1)?.round ?? 0,
      stats: summarizeBattle(fighters, result),
    };
  } catch (e) {
    error.value = `Não consegui começar a batalha: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    preparing.value = false;
    hint.value = '';
  }
}

function stopBattle(): void {
  box?.stopBattle();
  battleHud.value = null;
  battleSummary.value = null;
}

const mvp = computed(() => {
  const sum = battleSummary.value;
  return sum && sum.stats.fighters[sum.stats.mvp]?.damageDealt ? sum.stats.fighters[sum.stats.mvp]! : null;
});
const crits = computed(() => battleSummary.value?.stats.fighters.reduce((n, f) => n + f.criticals, 0) ?? 0);
const inflicted = computed(() => battleSummary.value?.stats.fighters.reduce((n, f) => n + f.inflicted, 0) ?? 0);
const guards = computed(() => battleSummary.value?.stats.fighters.reduce((n, f) => n + f.guards, 0) ?? 0);

const incompleteFighters = computed(() => (battleHud.value ? battleFighters.value.filter((f) => f.notes.length > 0) : []));

function hpTone(frac: number): string {
  return frac > 0.5 ? 'ok' : frac > 0.2 ? 'warn' : 'low';
}

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
      <video ref="videoEl" class="feed" playsinline muted></video>
      <canvas ref="canvasEl" class="overlay" :style="shakeStyle" aria-label="Caixa com os Pokémon escaneados"></canvas>
      <p v-if="phase === 'idle'" class="placeholder">Câmera desligada</p>
      <div v-if="phase === 'placing'" class="crosshair" aria-hidden="true"></div>
      <div v-if="battleHud" class="battle-hud" :class="{ compact: battleHud.bars.length > 4 }" aria-live="polite">
        <div class="battle-dim" :style="{ opacity: battleHud.dim }"></div>
        <div v-if="battleHud.banner" class="battle-banner" :style="{ '--fx': battleHud.banner.color }">
          <strong>{{ battleHud.banner.text }}</strong>
          <span>{{ battleHud.banner.sub }}</span>
        </div>
        <div v-if="battleHud.callout" :key="battleHud.callout.key" class="battle-callout" :style="{ color: battleHud.callout.color, opacity: Math.min(1, (1 - battleHud.callout.age) * 2.2) }">{{ battleHud.callout.text }}</div>
        <div v-if="battleHud.flash" class="battle-flash" :style="{ background: battleHud.flash.color, opacity: battleHud.flash.strength }"></div>
        <div
          v-for="bar in battleHud.bars"
          v-show="bar.visible"
          :key="bar.id"
          class="hp-bar"
          :class="[{ down: bar.fainted, guarding: bar.guard }, bar.status ? 'st-' + bar.status : '', 'pers-' + bar.personality]"
          :style="{ left: bar.x + '%', top: bar.y + '%' }"
        >
          <span class="hp-name">
            <i v-for="t in bar.types" :key="t" class="type-dot" :style="{ background: TYPE_COLORS[t] }" :title="TYPE_LABELS_PT[t]"></i>
            {{ bar.name }}
          </span>
          <span v-if="bar.status || bar.guard" class="hp-badges">
            <b v-if="bar.status" class="badge" :class="'badge-' + bar.status">{{ STATUS_LABELS_PT[bar.status] }}</b>
            <b v-if="bar.guard" class="badge badge-guard">Defesa</b>
          </span>
          <span class="hp-track"><i :class="hpTone(bar.frac)" :style="{ width: bar.frac * 100 + '%' }"></i></span>
          <span class="hp-num">{{ bar.hp }}/{{ bar.maxHp }}</span>
        </div>
        <span
          v-for="label in battleHud.labels"
          v-show="label.visible"
          :key="label.key"
          class="float-label"
          :class="label.tone"
          :style="{ left: label.x + '%', top: label.y + '%', color: label.color, opacity: 1 - label.age * label.age, '--size': label.size }"
        >{{ label.text }}</span>
      </div>
      <p v-if="hint" class="hud" role="status">{{ hint }}</p>
      <p v-else-if="picked" class="hud" role="status">
        <strong>{{ picked.name }}</strong>
        <template v-if="picked.dexId"> · Nº {{ picked.dexId }}</template>
        <br />{{ picked.detail }}
      </p>
      <SmoothingSheet v-if="showFilters && cameraOn" @close="showFilters = false" />
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
        <StageButton icon="filters" label="Suavizar" :active="showFilters" @click="showFilters = !showFilters; showTeam = false" />
        <StageButton v-if="!battling" icon="team" label="Equipe" :active="showTeam" @click="showTeam = !showTeam; showFilters = false" />
        <StageButton v-if="!battling" :icon="boxMode === 'passeio' ? 'formation' : 'wander'" :label="boxMode === 'passeio' ? 'Formação' : 'Passeio'" @click="toggleMode" />
        <StageButton v-if="!battling && phase === 'running'" icon="battle" :label="preparing ? 'Preparando…' : 'Batalhar'" :disabled="!canBattle" @click="startBattle" />
        <StageButton v-if="battling && battleHud?.phase === 'finished'" icon="battle" label="De novo" @click="startBattle" />
        <StageButton v-if="battling" icon="adjust" label="Centrar" @click="box?.recenterBattle()" />
        <StageButton v-if="battling" icon="stop" label="Parar" @click="stopBattle" />
        <StageButton v-if="phase === 'running' && !battling" icon="move" label="Mover" @click="moveBox" />
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
    <p v-if="cameraOn && phase === 'running' && population.shown === 1" class="message" role="status">
      Para batalhar, ponha pelo menos 2 Pokémon na equipe da caixa.
    </p>
    <div v-if="battleSummary && battleHud?.phase === 'finished'" class="message" role="status">
      <strong>{{ battleSummary.winner }} venceu</strong> em {{ battleSummary.turns }} turnos ({{ battleSummary.rounds }} rodadas).
      <template v-if="mvp">
        <br />Mais dano: {{ mvp.name }} ({{ mvp.damageDealt }} PS, maior golpe {{ mvp.biggestHit }}, {{ mvp.knockouts }} nocaute{{ mvp.knockouts === 1 ? '' : 's' }}).
      </template>
      <br />{{ crits }} crítico{{ crits === 1 ? '' : 's' }} · {{ inflicted }} condição(ões) causada(s) · {{ guards }} defesa{{ guards === 1 ? '' : 's' }}.
      <template v-if="incompleteFighters.length > 0">
        <br />Dados incompletos (usei valores neutros):
        <span v-for="f in incompleteFighters" :key="f.id" class="meta"><br />· {{ f.name }}: {{ f.notes.join('; ') }}</span>
      </template>
    </div>
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
      <template v-if="population.shown >= 2"> Use Batalhar para eles lutarem sozinhos: tipos, atributos e golpes decidem.</template>
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
