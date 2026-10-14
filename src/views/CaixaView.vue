<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { isTap } from '../ar/gestures';
import { getCache, loadBattle } from '../app/services';
import { prepareFighters } from '../app/battle-setup';
import { useFullscreen } from '../app/fullscreen';
import { resolveTeam } from '../app/team';
import { savedTeam } from '../app/team-store';
import { resetRoster, roster, rosterFor, setSlot, slotOf } from '../app/roster-store';
import { battleMode, setBattleMode } from '../app/battle-mode-store';
import { recordEvent } from '../app/trainer-store';
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
import { TEAM_NAMES_PT, TEAM_COLORS, BATTLE_MODE_HINTS_PT, BATTLE_MODE_LABELS_PT, BATTLE_MODES, planBattle, rosterBlocker, seededRng, STATUS_LABELS_PT, summarizeBattle } from '../core/battle';
import type { BattleMode, BattleSummary, Fighter, RosterSlot } from '../core/battle';
import { loadChunk } from '../app/stale-build';

type Phase = 'idle' | 'starting' | 'placing' | 'running';

const videoEl = ref<HTMLVideoElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const stageEl = ref<HTMLElement | null>(null);
const showFilters = ref(false);
const showTeam = ref(false);
const showAdjust = ref(false);
const showSummary = ref(false);
const showModes = ref(false);
/** Entramos em tela cheia só para a batalha (e saímos dela ao parar). */
let fullscreenForBattle = false;
const boxMode = ref<BoxMode>('passeio');

const phase = ref<Phase>('idle');
/** Com a câmera ligada (ou abrindo) o visor cobre a janela e tudo aparece sobre a imagem: sem rolar a página. */
const immersive = computed(() => phase.value !== 'idle');
const { fullscreen, pseudo, toggle: toggleFullscreen, exit: exitFullscreen } = useFullscreen(stageEl, immersive);
const error = ref('');
const hint = ref('');
const mode = ref<OrientationMode>('sensor');
const population = ref({ shown: 0, available: 0, failed: 0 });
/** Quem está na caixa agora (para a escalação das batalhas). */
const rosterRows = ref<{ id: string; name: string }[]>([]);
const currentRoster = computed(() => rosterFor(rosterRows.value.map((r) => r.id)));
const modeBlocker = (m: BattleMode) => rosterBlocker(m, population.value.shown, currentRoster.value);
const rosterCustom = computed(() => rosterRows.value.some((r) => slotOf(r.id) !== 'auto'));
/** Acima disto, as barras de vida viram só um traço (o nome aparece em quem está agindo): 40 etiquetas não cabem na tela. */
const DENSE_BARS = 12;
const SLOT_CHOICES: { slot: RosterSlot; label: string; title: string }[] = [
  { slot: 'auto', label: 'Sorteio', title: 'Entra na luta e o lado é sorteado' },
  { slot: 0, label: 'V', title: 'Equipe Vermelha' },
  { slot: 1, label: 'A', title: 'Equipe Azul' },
  { slot: 'out', label: 'Fora', title: 'Fica de fora da luta' },
];
const loadingCreatures = ref(false);
const picked = ref<{ name: string; detail: string; dexId?: number } | null>(null);
const phoneHeight = ref(DEFAULT_PHONE_HEIGHT_M);
const boxSize = ref(2.4);
const videoFov = ref(63);
const battleHud = ref<BattleHud | null>(null);
const preparing = ref(false);
const battleFighters = ref<Fighter[]>([]);
const battleSummary = ref<{ winner: string; turns: number; rounds: number; stats: BattleSummary; mode: BattleMode } | null>(null);

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
    rosterRows.value = loaded.entries.map((e) => ({ id: e.info.id, name: e.info.name }));
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
    const { startBox } = await loadChunk(() => import('../box/start-box'));
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
  box.setLighting(visual.lighting);
  box.setTerrain(visual.terrain);
  box.setSocial(visual.social);
  box.setSound(visual.sound);
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
  showAdjust.value = false;
  showSummary.value = false;
  fullscreenForBattle = false;
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
    hint.value = result.moved ? 'Afastei a caixa para ela não ficar colada em você. Use "Mover" para escolher outro ponto.' : '';
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
  if (visual.social) creature.react();
  else creature.poke();
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
watch(() => visual.lighting, (on) => box?.setLighting(on));
watch(() => visual.terrain, (on) => box?.setTerrain(on));
watch(() => visual.social, (on) => box?.setSocial(on));
watch(() => visual.sound, (on) => box?.setSound(on));

const canBattle = computed(() => phase.value === 'running' && population.value.shown >= 2 && !loadingCreatures.value && !preparing.value);
const battling = computed(() => battleHud.value !== null);
/** Tremor e "soco" de zoom da imagem desenhada nos golpes fortes (o vídeo da câmera não treme). */
const shakeStyle = computed(() => {
  const s = battleHud.value?.shake;
  if (!s || (Math.abs(s.x) < 0.2 && Math.abs(s.y) < 0.2 && s.zoom < 1.002)) return undefined;
  return { transform: `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) scale(${s.zoom.toFixed(3)})` };
});

/** Carrega os dados de cada Pokémon da caixa (jogo + carta) e começa a luta automática. */
/** A batalha em cena já rendeu XP ao Treinador (só conta quando termina). */
let battleCounted = false;
watch(
  () => battleHud.value?.phase,
  (phase) => {
    if (phase !== 'finished' || battleCounted) return;
    battleCounted = true;
    recordEvent({ type: 'battle', team: battleSummary.value ? battleSummary.value.mode !== 'royale' : false });
  },
);

async function startBattle(): Promise<void> {
  const current = box;
  if (!current || preparing.value) return;
  const creatures = current.scene.creatureList;
  if (creatures.length < 2) return;
  const slots = rosterFor(creatures.map((c) => c.info.id));
  const blocker = rosterBlocker(battleMode.value, creatures.length, slots);
  if (blocker) {
    error.value = blocker;
    showModes.value = true;
    return;
  }
  // O navegador só libera o áudio dentro de um toque: isso vem antes de qualquer espera.
  current.unlockAudio();
  preparing.value = true;
  showSummary.value = false;
  // A arena é pequena: a tela cheia (pedida já no toque, antes de esperar a rede) dá mais espaço para ver o que acontece.
  if (!fullscreen.value) {
    fullscreenForBattle = true;
    void toggleFullscreen();
  }
  error.value = '';
  hint.value = 'Preparando a batalha: buscando atributos e golpes…';
  showFilters.value = false;
  showTeam.value = false;
  showAdjust.value = false;
  showModes.value = false;
  try {
    // Todos da caixa lutam por padrão; equipes e 3x3 sorteiam os lados (e, no 3x3, quem entra) a cada batalha,
    // a menos que o jogador tenha montado a escalação (equipe fixa ou fora da luta).
    const plan = planBattle(battleMode.value, creatures.length, seededRng((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0), slots);
    const fighting = plan.picks.map((i) => creatures[i]!);
    const fighters = await prepareFighters(fighting.map((c) => ({ id: c.info.id, name: c.info.name, dexId: c.info.dexId })), loadBattle);
    if (disposed || box !== current) return;
    battleCounted = false;
    const result = current.startBattle(fighters, plan.mode === 'royale' ? undefined : plan);
    battleFighters.value = fighters;
    battleSummary.value = {
      mode: plan.mode,
      winner: result.winningTeam === undefined ? (fighters[result.winner]?.name ?? '') : `${TEAM_NAMES_PT[result.winningTeam] ?? 'A equipe'} (${fighters[result.winner]?.name ?? ''})`,
      turns: result.turns.length,
      rounds: result.turns.at(-1)?.round ?? 0,
      stats: summarizeBattle(fighters, result),
    };
  } catch (e) {
    error.value = `Não consegui começar a batalha: ${e instanceof Error ? e.message : String(e)}`;
    if (fullscreenForBattle) {
      fullscreenForBattle = false;
      void exitFullscreen();
    }
  } finally {
    preparing.value = false;
    hint.value = '';
  }
}

function stopBattle(): void {
  box?.stopBattle();
  battleHud.value = null;
  battleSummary.value = null;
  showSummary.value = false;
  if (fullscreenForBattle) {
    fullscreenForBattle = false;
    void exitFullscreen();
  }
}

const mvp = computed(() => {
  const sum = battleSummary.value;
  return sum && sum.stats.fighters[sum.stats.mvp]?.damageDealt ? sum.stats.fighters[sum.stats.mvp]! : null;
});
const crits = computed(() => battleSummary.value?.stats.fighters.reduce((n, f) => n + f.criticals, 0) ?? 0);
const inflicted = computed(() => battleSummary.value?.stats.fighters.reduce((n, f) => n + f.inflicted, 0) ?? 0);
const guards = computed(() => battleSummary.value?.stats.fighters.reduce((n, f) => n + f.guards, 0) ?? 0);

/** Vídeo da câmera durante o foco do golpe: mais escuro e menos saturado, para o golpe e os sprites se destacarem. */
const videoStyle = computed(() => {
  const dim = battleHud.value?.dim ?? 0;
  if (dim < 0.01) return undefined;
  return { filter: `brightness(${(1 - dim * 1.5).toFixed(3)}) saturate(${(1 - dim * 0.9).toFixed(3)})` };
});
/** Clarão dos golpes sobre o vídeo (atrás dos sprites): cada luz vira uma mancha colorida no ponto onde está. */
const envLights = computed(() => {
  const hud = battleHud.value;
  if (!hud || hud.lights.length === 0) return undefined;
  const layers = hud.lights.map((l) => {
    const alpha = Math.min(0.8, l.intensity * 0.55).toFixed(3);
    return `radial-gradient(ellipse ${l.radius.toFixed(1)}% ${(l.radius * 0.8).toFixed(1)}% at ${l.x.toFixed(1)}% ${l.y.toFixed(1)}%, ${rgba(l.color, alpha)} 0%, transparent 100%)`;
  });
  return { background: layers.join(',') };
});

function rgba(hex: string, alpha: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

type Tone = 'busy' | 'ok' | 'warn' | 'error';
interface Notice {
  text: string;
  sub?: string;
  tone: Tone;
  gold?: boolean;
}

/** Avisos sobre a câmera (topo): tudo que antes ficava abaixo do visor. Na batalha só erros, para não cobrir a arena. */
const notices = computed<Notice[]>(() => {
  const list: Notice[] = [];
  if (!immersive.value) return list;
  if (error.value) list.push({ text: error.value, tone: 'error' });
  if (phase.value === 'starting') list.push({ text: 'Abrindo a câmera e os sensores…', tone: 'busy' });
  if (battleHud.value) return list;
  if (hint.value) list.push({ text: hint.value, tone: phase.value === 'placing' ? 'ok' : 'busy' });
  if (picked.value) {
    list.push({ text: `${picked.value.name}${picked.value.dexId ? ` · Nº ${picked.value.dexId}` : ''}`, sub: picked.value.detail, tone: 'ok', gold: true });
  }
  if (cameraOn.value && mode.value === 'manual') {
    list.push({ text: 'Este aparelho não enviou dados dos sensores de movimento. Arraste na imagem para olhar em volta.', tone: 'warn' });
  }
  if (cameraOn.value && loadingCreatures.value) list.push({ text: 'Chamando os Pokémon…', tone: 'busy' });
  else if (cameraOn.value && population.value.available === 0) {
    list.push({ text: 'A caixa está vazia. Escaneie uma carta (aba Escanear) ou carregue suas cartas (aba Cartas) para os Pokémon aparecerem aqui.', tone: 'warn' });
  } else if (phase.value === 'running' && population.value.shown === 1) {
    list.push({ text: 'Para batalhar, ponha pelo menos 2 Pokémon na equipe da caixa.', tone: 'warn' });
  }
  return list;
});
/** Linha de resumo fixa (pequena) enquanto a caixa está montada e nada mais pede atenção. */
const populationNote = computed(() => {
  if (phase.value !== 'running' || battleHud.value || loadingCreatures.value || population.value.available === 0) return '';
  const { shown, available, failed } = population.value;
  const more = available > shown ? ` (de ${available} guardados)` : '';
  const broken = failed > 0 ? ` · ${failed} sprite(s) sem leitura` : '';
  return `${shown} Pokémon na caixa${more}${broken} · toque num Pokémon para ver quem é`;
});

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
    <p class="note">Sua equipe de até 40 Pokémon passeia solta num quadrado do chão. Gire o celular para olhar em volta.</p>

    <div
      ref="stageEl"
      class="viewport box-viewport"
      :class="{ placing: phase === 'placing', 'pseudo-full': pseudo, immersive }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <video ref="videoEl" class="feed" playsinline muted :style="videoStyle"></video>
      <div v-if="battleHud" class="battle-env" aria-hidden="true" :style="shakeStyle">
        <div class="vignette" :style="{ opacity: Math.min(1, battleHud.dim * 3) }"></div>
        <div v-if="envLights" class="lights" :style="envLights"></div>
      </div>
      <canvas ref="canvasEl" class="overlay" :style="shakeStyle" aria-label="Caixa com os Pokémon escaneados"></canvas>
      <p v-if="phase === 'idle'" class="placeholder">Câmera desligada</p>
      <div v-if="phase === 'placing'" class="crosshair" aria-hidden="true"></div>
      <div v-if="battleHud" class="battle-hud" :class="{ compact: battleHud.bars.length > 4, dense: battleHud.bars.length > DENSE_BARS }" aria-live="polite">
        <div class="battle-top">
          <div v-if="battleHud.banner" class="battle-banner" :style="{ '--fx': battleHud.banner.color }">
            <strong>{{ battleHud.banner.text }}</strong>
            <span>{{ battleHud.banner.sub }}</span>
          </div>
          <div v-if="battleHud.scoreboard" class="battle-score" aria-label="Placar das equipes">
            <span v-for="s in battleHud.scoreboard" :key="s.team" :style="{ '--team': s.color }"><i></i>{{ s.name.replace('Equipe ', '') }} {{ s.alive }}/{{ s.total }}</span>
          </div>
          <div v-if="battleHud.phase === 'fight'" class="battle-turn" :aria-label="`Rodada ${battleHud.round}, turno ${battleHud.turn} de ${battleHud.totalTurns}`">
            <span>Rodada {{ battleHud.round }}</span>
            <i><b :style="{ width: (battleHud.turn / Math.max(1, battleHud.totalTurns)) * 100 + '%' }"></b></i>
          </div>
        </div>
        <div v-if="battleHud.callout" :key="battleHud.callout.key" class="battle-callout" :style="{ color: battleHud.callout.color, opacity: Math.min(1, (1 - battleHud.callout.age) * 2.2) }">{{ battleHud.callout.text }}</div>
        <div v-if="battleHud.flash" class="battle-flash" :style="{ background: battleHud.flash.color, opacity: battleHud.flash.strength }"></div>
        <div
          v-for="bar in battleHud.bars"
          v-show="bar.visible"
          :key="bar.id"
          class="hp-bar"
          :class="[{ down: bar.fainted, guarding: bar.guard, acting: bar.acting, reserve: bar.reserve, teamed: bar.teamColor !== null }, bar.status ? 'st-' + bar.status : '', 'pers-' + bar.personality]"
          :style="{ left: bar.x + '%', top: bar.y + '%', '--team': bar.teamColor ?? undefined }"
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
      <div v-if="immersive" class="stage-head" role="status" aria-live="polite">
        <p v-for="(n, i) in notices" :key="i + n.text" class="pill" :class="[n.tone, { gold: n.gold }]">
          <i class="dot"></i>
          <span class="pill-text">{{ n.text }}<small v-if="n.sub" class="pill-sub">{{ n.sub }}</small></span>
        </p>
        <p v-if="populationNote && notices.length === 0" class="pill small">{{ populationNote }}</p>
      </div>

      <div v-if="immersive" class="stage-foot" @pointerdown.stop @pointerup.stop>
        <button v-if="phase === 'placing'" type="button" class="primary stage-cta" @click="placeHere">Colocar a caixa aqui</button>
        <SmoothingSheet v-if="showFilters && cameraOn" battle @close="showFilters = false" />
        <div v-if="showSummary && battleSummary && battleHud?.phase === 'finished'" class="stage-sheet battle-summary" @pointerdown.stop @pointerup.stop @click.stop>
          <header>
            <strong>{{ battleSummary.winner }} venceu</strong>
            <button type="button" class="link" @click="showSummary = false">Fechar</button>
          </header>
          <p>{{ battleSummary.turns }} turnos em {{ battleSummary.rounds }} rodadas.</p>
          <p v-if="mvp">Mais dano: <strong>{{ mvp.name }}</strong> ({{ mvp.damageDealt }} PS, maior golpe {{ mvp.biggestHit }}, {{ mvp.knockouts }} nocaute{{ mvp.knockouts === 1 ? '' : 's' }}).</p>
          <p>{{ crits }} crítico{{ crits === 1 ? '' : 's' }} · {{ inflicted }} condição(ões) causada(s) · {{ guards }} defesa{{ guards === 1 ? '' : 's' }}.</p>
          <template v-if="incompleteFighters.length > 0">
            <p class="hint">Dados incompletos (usei valores neutros):</p>
            <p v-for="f in incompleteFighters" :key="f.id" class="hint">{{ f.name }}: {{ f.notes.join('; ') }}</p>
          </template>
        </div>
        <div v-if="showModes && cameraOn && !battling" class="stage-sheet" role="dialog" aria-label="Modo de batalha" @pointerdown.stop @pointerup.stop @click.stop>
          <header>
            <strong>Modo de batalha</strong>
            <button type="button" class="link" @click="showModes = false">Fechar</button>
          </header>
          <div class="mode-list">
            <button
              v-for="m in BATTLE_MODES"
              :key="m"
              type="button"
              class="mode-option"
              :class="{ on: battleMode === m }"
              :aria-pressed="battleMode === m"
              :disabled="modeBlocker(m) !== null"
              @click="setBattleMode(m); error = ''"
            >
              <strong>{{ BATTLE_MODE_LABELS_PT[m] }}</strong>
              <span>{{ BATTLE_MODE_HINTS_PT[m] }}</span>
              <small v-if="modeBlocker(m)">{{ modeBlocker(m) }}</small>
            </button>
          </div>
          <p class="hint">Por padrão todos os Pokémon da caixa entram na luta. Para mudar quem está na caixa (até 40), use Equipe.</p>
          <div v-if="rosterRows.length > 0" class="roster">
            <div class="roster-head">
              <strong>Escalação</strong>
              <button v-if="rosterCustom" type="button" class="link" @click="resetRoster">Tudo em sorteio</button>
            </div>
            <p class="hint">Escolha a equipe de cada um (V = Vermelha, A = Azul) ou deixe de fora. Quem ficar em sorteio completa os lados. No 3x3 cada lado usa 3.</p>
            <ul class="roster-list">
              <li v-for="row in rosterRows" :key="row.id" :class="{ out: roster[row.id] === 'out' }">
                <span class="roster-name">{{ row.name }}</span>
                <span class="roster-slots" role="group" :aria-label="`Escalação de ${row.name}`">
                  <button
                    v-for="c in SLOT_CHOICES"
                    :key="String(c.slot)"
                    type="button"
                    :title="c.title"
                    :aria-label="`${row.name}: ${c.title}`"
                    :aria-pressed="slotOf(row.id) === c.slot"
                    :class="{ on: slotOf(row.id) === c.slot }"
                    :style="typeof c.slot === 'number' ? { '--team': TEAM_COLORS[c.slot] } : undefined"
                    @click="setSlot(row.id, c.slot)"
                  >{{ c.label }}</button>
                </span>
              </li>
            </ul>
          </div>
        </div>
        <div v-if="showTeam && cameraOn" class="stage-sheet" @pointerdown.stop @pointerup.stop @click.stop>
          <header>
            <strong>Equipe da caixa</strong>
            <button type="button" class="link" @click="showTeam = false">Fechar</button>
          </header>
          <TeamPicker @change="populate" />
        </div>
        <div v-if="showAdjust && cameraOn && !battling" class="stage-sheet" role="dialog" aria-label="Ajustes da caixa" @pointerdown.stop @pointerup.stop @click.stop>
          <header>
            <strong>Ajustes da caixa</strong>
            <button type="button" class="link" @click="showAdjust = false">Fechar</button>
          </header>
          <div class="layout">
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
          </div>
        </div>
        <div v-if="cameraOn" class="stage-bar">
          <StageButton :icon="fullscreen ? 'exit-fullscreen' : 'fullscreen'" :label="fullscreen ? 'Sair' : 'Tela cheia'" @click="toggleFullscreen" />
          <StageButton icon="filters" label="Suavizar" :active="showFilters" @click="showFilters = !showFilters; showTeam = false; showAdjust = false; showModes = false" />
          <StageButton v-if="!battling" icon="team" label="Equipe" :active="showTeam" @click="showTeam = !showTeam; showFilters = false; showAdjust = false; showModes = false" />
          <StageButton v-if="!battling" icon="sliders" label="Ajustes" :active="showAdjust" @click="showAdjust = !showAdjust; showFilters = false; showTeam = false; showModes = false" />
          <StageButton v-if="!battling" :icon="boxMode === 'passeio' ? 'formation' : 'wander'" :label="boxMode === 'passeio' ? 'Formação' : 'Passeio'" @click="toggleMode" />
          <StageButton v-if="!battling" icon="modes" :label="BATTLE_MODE_LABELS_PT[battleMode]" :active="showModes" @click="showModes = !showModes; showFilters = false; showTeam = false; showAdjust = false" />
          <StageButton v-if="!battling && phase === 'running'" icon="battle" :label="preparing ? 'Preparando…' : 'Batalhar'" :disabled="!canBattle" @click="startBattle" />
          <StageButton v-if="battling && battleHud?.phase === 'finished'" icon="battle" label="De novo" @click="startBattle" />
          <StageButton v-if="battling && battleHud?.phase === 'finished' && battleSummary" icon="panel" label="Resumo" :active="showSummary" @click="showSummary = !showSummary" />
          <StageButton v-if="battling" icon="adjust" label="Centrar" @click="box?.recenterBattle()" />
          <StageButton v-if="battling" icon="stop" label="Parar" @click="stopBattle" />
          <StageButton v-if="phase === 'running' && !battling" icon="move" label="Mover" @click="moveBox" />
          <StageButton icon="close" label="Fechar" @click="close" />
        </div>
      </div>
    </div>

    <div class="actions">
      <button type="button" class="primary" :disabled="phase !== 'idle'" @click="open">
        {{ phase === 'starting' ? 'Abrindo…' : 'Abrir câmera e sensores' }}
      </button>
    </div>

    <p v-if="error && !immersive" class="message error" role="alert">{{ error }}</p>

    <details v-if="!immersive" class="layout">
      <summary>Escolher a equipe da caixa (até 40)</summary>
      <TeamPicker />
    </details>
  </section>
</template>
