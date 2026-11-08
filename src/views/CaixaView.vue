<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useDialogFocus } from '../composables/useDialogFocus';
import { fetchSprite, getCache } from '../app/services';
import { digitalCandidates } from '../app/digital-members';
import { loadCardCompanionEntry } from '../app/companion-creatures';
import { routeFlags, routeHref } from '../app/route';
import { displayName, setNickname } from '../core/village/nickname';
import type { CreatureEntry } from '../box/box-scene';
import { useFullscreen } from '../app/fullscreen';
import { resolveTeam } from '../app/team';
import { savedTeam } from '../app/team-store';
import { maybeGalladeSpeaks } from '../app/speech-store';
import { decodeSprite } from '../box/load-creatures';
import { effectiveVisual } from '../app/visual-settings';
import SmoothingSheet from '../components/SmoothingSheet.vue';
import StageButton from '../components/StageButton.vue';
import TeamPicker from '../components/TeamPicker.vue';
import PokeBook from '../components/PokeBook.vue';
import { loadVillage, saveVillage } from '../app/village-store';
import { dailyHelp, friendLevel, itemName } from '../core/village/life';
import type { VillageState } from '../core/village/life';
import { paintAccessory } from '../village/item-art';
import { itemDef } from '../core/village/catalog';
import { dayKey } from '../core/trainer';
import type { PokemonType } from '../core/pokemon-data';
import { loadPinData } from '../app/services';
import type { BoxMode } from '../box/box-scene';
import { loadCreatureEntries } from '../box/load-creatures';
import type { LoadOptions } from '../box/load-creatures';
import type { RunningBox } from '../box/start-box';
import type { BoxCreature } from '../box/creature';
import { loadChunk } from '../app/stale-build';

type Phase = 'idle' | 'starting' | 'running';

const openButton = ref<HTMLButtonElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const stageEl = ref<HTMLElement | null>(null);
const skyEl = ref<HTMLElement | null>(null);
const showFilters = ref(false);
const showTeam = ref(false);
const showAdjust = ref(false);
const teamDialog = ref<HTMLElement | null>(null);
const adjustDialog = ref<HTMLElement | null>(null);
useDialogFocus(teamDialog); useDialogFocus(adjustDialog);
const boxMode = ref<BoxMode>('passeio');

const phase = ref<Phase>('idle');
/** Com a câmera ligada (ou abrindo) o visor cobre a janela e tudo aparece sobre a imagem: sem rolar a página. */
const immersive = computed(() => phase.value !== 'idle');
const { fullscreen, pseudo, toggle: toggleFullscreen, exit: exitFullscreen } = useFullscreen(stageEl, immersive);
const error = ref('');
const hint = ref('');
const population = ref({ shown: 0, available: 0, failed: 0 });
const loadingCreatures = ref(false);
/** As lutas moram no menu da Arena (`#/arena`): endereços antigos de luta só abrem o Coliseu. */
const arrival = routeFlags(window.location.hash);
if (arrival.size > 0) window.history.replaceState(null, '', routeHref('caixa'));
const bookNote = ref('');
/** O Livro da Caixa também deixa dar o apelido (a Vila e a Caixa guardam no mesmo arquivo). */
function onBookNickname(id: string, text: string): void {
  village = loadVillage();
  const row = bookList.value.find((r) => r.id === id);
  const r = setNickname(village, id, text, row?.real ?? 'Pokémon');
  bookNote.value = r.message;
  if (!r.ok) return;
  saveVillage(village);
  bookList.value = bookList.value.map((x) => ({ ...x, name: shown(x.id, x.real) }));
  nickTick.value++;
}
/** Faz o Livro reler os apelidos (o `village` desta tela não é reativo). */
const nickTick = ref(0);
const bookNicks = computed(() => (nickTick.value >= 0 ? { ...village.nicks } : {}));

/** Vindo do Coliseu da Vila (`?vila=1`): o botão «Voltar à Vila» fica na tela inicial. */
const fromVila = arrival.has('vila');
const fromArena = arrival.has('arena');

onMounted(() => {
  // Endereços antigos de luta: tudo isso mora no menu da Arena.
  const oldFight = (['batalha', 'formatacao', 'restauracao'] as const).find((flag) => arrival.has(flag));
  if (oldFight) {
    window.location.replace(routeHref('arena', undefined, [oldFight]));
    return;
  }
  // Endereço antigo do PvP (`#/caixa?pvp=1`).
  if (arrival.has('pvp') && !arrival.has('arena')) {
    window.location.replace(routeHref('arena', undefined, ['pvp']));
    return;
  }
  if (arrival.has('autoiniciar') || (arrival.has('pvp') && arrival.has('arena'))) void nextTick(open);
});
const picked = ref<{ name: string; detail: string; dexId?: number; shiny?: boolean; mega?: boolean } | null>(null);
let box: RunningBox | null = null;
let disposed = false;
let sessionVersion = 0;
let populationVersion = 0;
/** O dedo que está olhando em volta: um segundo dedo na tela não pode virar a câmera aos saltos. */
let activePointer: number | null = null;
let pointerDown: { x: number; y: number } | null = null;
let lastPointer: { x: number; y: number } | null = null;
let pickedTimer: ReturnType<typeof setTimeout> | null = null;

const arenaOn = computed(() => phase.value !== 'idle' && phase.value !== 'starting');

function ndcOf(clientX: number, clientY: number): { x: number; y: number } | null {
  const rect = stageEl.value?.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return null;
  return { x: ((clientX - rect.left) / rect.width) * 2 - 1, y: -(((clientY - rect.top) / rect.height) * 2 - 1) };
}

// ---- Intimidade (da Vila): vale na batalha, traz ajudas e corações na Caixa
let village: VillageState = loadVillage();
/** O nome do Pokémon na tela: o apelido que você deu na Vila, se tem, ou o da carta. */
const shown = (id: string, real: string): string => displayName(village, id, real);
const bookOpen = ref(false);
const bookTypes = reactive(new Map<string, PokemonType[]>());
const bookThumbs = reactive(new Map<string, string>());
const bookList = ref<{ id: string; name: string; real: string }[]>([]);
const bookMons = computed(() => bookList.value.map((r) => ({ id: r.id, name: r.name, real: r.real, types: bookTypes.get(r.id) ?? [], thumb: bookThumbs.get(r.id) })));
const bondOf = (id: string): number => friendLevel(village.friends[id]?.points ?? 0).level;

/** Ao montar a caixa: acessórios da Vila, corações dos mais próximos e a ajuda diária dos amigos. */
function applyVillage(): void {
  village = loadVillage();
  const current = box;
  if (!current) return;
  const today = dayKey(new Date());
  const notes: { text: string; tone: 'ok' | 'warn' }[] = [];
  for (const c of current.scene.creatureList) {
    const acc = village.wear.mons[c.info.id];
    const accDef = acc ? itemDef(acc) : undefined;
    c.setAccessory(acc ? paintAccessory(acc) : null, accDef?.pos, accDef?.nudge);
    const help = dailyHelp(village, c.info.id, today, Math.random);
    if (help.items.length > 0 || help.rare) {
      if (effectiveVisual.value.social) c.say('🎁', 2600);
      const what = [...help.items.map((h) => `${h.qty} ${itemName(h.item)}`), ...(help.rare ? [itemName(help.rare)] : [])].join(' e ');
      notes.push({ text: `${c.info.name} trouxe ${what} para a sua mochila da Vila!`, tone: 'ok' });
    }
  }
  if (notes.length > 0) {
    saveVillage(village);
    showStageNotes(notes.slice(0, 3));
  }
}

const heartTimer = setInterval(() => {
  if (document.hidden) return;
  const current = box;
  // Respeita a opção de vida social e a formação: nelas nenhum balão aparece.
  if (!current || phase.value !== 'running' || !effectiveVisual.value.social || boxMode.value !== 'passeio') return;
  const close = current.scene.creatureList.filter((c) => bondOf(c.info.id) >= 3 && !c.bubbleEmoji);
  const pick = close[Math.floor(Math.random() * close.length)];
  if (pick && Math.random() < 0.6) {
    pick.poke();
    pick.say(['❤️', '🥰', '😊', '💕'][Math.floor(Math.random() * 4)]!, 2000);
  }
}, 7000);

/** Os moradores da Vila (cartas e Digital Pokémon) já com os sprites prontos para a cena. */
async function loadTeamCreatures(cache: Awaited<ReturnType<typeof getCache>>, options?: LoadOptions) {
  const digital = loadVillage().digital;
  const team = resolveTeam(savedTeam.value, [...(await cache.list()), ...digitalCandidates(digital)]);
  return loadCreatureEntries(cache, undefined, team.ids, {
    instances: digital.instances,
    // O mesmo GIF da Showdown das cartas (não o pacote da Vila), para o digital ficar em pé no chão como os outros.
    sprite: async (dexId) => {
      const sprite = await fetchSprite(dexId).catch(() => null);
      return sprite ? decodeSprite(sprite) : null;
    },
  }, loadCardCompanionEntry, options);
}

async function openBook(): Promise<void> {
  bookOpen.value = !bookOpen.value;
  if (!bookOpen.value) return;
  village = loadVillage();
  let entries = lastEntries;
  if (entries.length === 0) {
    try {
      const cache = await getCache();
      entries = (await loadTeamCreatures(cache)).entries;
    } catch {
      entries = [];
    }
  }
  if (disposed || !bookOpen.value) return;
  bookList.value = entries.map((e) => ({ id: e.info.id, name: shown(e.info.id, e.info.name), real: e.info.name }));
  for (const e of entries) {
    if (!bookThumbs.has(e.info.id)) {
      const frame = e.source.kind === 'gif' ? { w: e.source.gif.width, h: e.source.gif.height, rgba: e.source.gif.frames[0]?.rgba } : { w: e.source.image.width, h: e.source.image.height, rgba: e.source.image.data };
      if (frame.rgba) {
        const c = document.createElement('canvas');
        c.width = frame.w;
        c.height = frame.h;
        const ctx = c.getContext('2d');
        if (ctx) {
          const img = ctx.createImageData(frame.w, frame.h);
          img.data.set(frame.rgba);
          ctx.putImageData(img, 0, 0);
          bookThumbs.set(e.info.id, c.toDataURL());
        }
      }
    }
    if (!bookTypes.has(e.info.id)) void loadPinData(e.info.id, e.info.dexId).then((d) => !disposed && d.profile && bookTypes.set(e.info.id, d.profile.types)).catch(() => undefined);
  }
}

/** O que foi carregado da sua equipe por último. */
let lastEntries: CreatureEntry[] = [];

/** Avisos curtos sobre o palco (por exemplo, o que um morador trouxe). */
const stageNotes = ref<{ text: string; tone: 'ok' | 'warn' }[]>([]);
let stageNotesTimer: ReturnType<typeof setTimeout> | null = null;
function showStageNotes(notes: { text: string; tone: 'ok' | 'warn' }[]): void {
  stageNotes.value = notes;
  if (stageNotesTimer) clearTimeout(stageNotesTimer);
  stageNotesTimer = notes.length > 0 ? setTimeout(() => (stageNotes.value = []), 9000) : null;
}

async function populate(): Promise<void> {
  const current = box;
  if (!current) return;
  const version = ++populationVersion;
  loadingCreatures.value = true;
  try {
    const cache = await getCache();
    // Os moradores escolhidos (ou, sem escolha, os 6 mais recentes) vão para a caixa — Digital Pokémon inclusive.
    // Quem já está em cena não é decodificado de novo, e uma troca mais nova interrompe esta leitura.
    const loaded = await loadTeamCreatures(cache, { reuse: new Map(lastEntries.map((e) => [e.info.id, e])), cancelled: () => disposed || box !== current || version !== populationVersion });
    if (disposed || box !== current || version !== populationVersion) return;
    current.setCreatures(loaded.entries);
    lastEntries = loaded.entries;
    applyVillage();
    for (const entry of loaded.entries) if (maybeGalladeSpeaks(entry.info)) break;
    population.value = { shown: loaded.entries.length, available: loaded.available, failed: loaded.failed.length };
  } catch (e) {
    if (disposed || box !== current || version !== populationVersion) return;
    error.value = `Não consegui ler as cartas guardadas: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    if (box === current && version === populationVersion) loadingCreatures.value = false;
  }
}

/** Vários toques seguidos em «Quem passeia» viram uma leitura só. */
let populateTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePopulate(): void {
  if (populateTimer) clearTimeout(populateTimer);
  populateTimer = setTimeout(() => {
    populateTimer = null;
    void populate();
  }, 250);
}

/** O que a cena virtual recebe ao abrir. */
function applyBoxSettings(running: RunningBox): void {
  running.setSmoothing(effectiveVisual.value.smoothing);
  running.setLighting(effectiveVisual.value.lighting);
  running.setTerrain(effectiveVisual.value.terrain);
  running.setScenery(effectiveVisual.value.scenery);
  running.setSocial(effectiveVisual.value.social);
  running.setWeather(effectiveVisual.value.weather);
  running.setMode(boxMode.value);
}

/** Coliseu: sem câmera, sem sensores e sem escolher o ponto no chão (ele nasce de frente para a visão). */
async function openVirtual(version: number): Promise<void> {
  const canvas = canvasEl.value;
  const stage = stageEl.value;
  if (!canvas || !stage) return;
  phase.value = 'starting';
  error.value = '';
  try {
    const { startBox } = await loadChunk(() => import('../box/start-box'));
    if (disposed || version !== sessionVersion) return;
    const openedBox = await startBox({
      canvas, container: stage, virtual: true, sky: skyEl.value,
    });
    if (disposed || version !== sessionVersion) { openedBox.stop(); return; }
    box = openedBox;
  } catch (e) {
    if (disposed || version !== sessionVersion) return;
    close();
    error.value = `Não consegui montar o Coliseu: ${e instanceof Error ? e.message : String(e)}`;
    return;
  }
  applyBoxSettings(box);
  const placed = box.placeAt(0, 0);
  if (!placed.ok) {
    close();
    error.value = `Não consegui montar o Coliseu: ${placed.message}`;
    return;
  }
  phase.value = 'running';
  hint.value = '';
  void populate();
}

async function open(): Promise<void> {
  if (disposed || phase.value !== 'idle') return;
  return openVirtual(++sessionVersion);
}

function close(): void {
  sessionVersion++;
  populationVersion++;
  if (populateTimer) clearTimeout(populateTimer);
  populateTimer = null;
  if (stageNotesTimer) clearTimeout(stageNotesTimer);
  stageNotesTimer = null;
  stageNotes.value = [];
  activePointer = null;
  pointerDown = null;
  lastPointer = null;
  loadingCreatures.value = false;
  lastEntries = [];
  population.value = { shown: 0, available: 0, failed: 0 };
  void exitFullscreen();
  showFilters.value = false;
  showTeam.value = false;
  showAdjust.value = false;
  box?.stop();
  box = null;
  phase.value = 'idle';
  picked.value = null;
  hint.value = '';
  if (!disposed) void nextTick(() => openButton.value?.focus());
}

function showPicked(creature: BoxCreature): void {
  if (effectiveVisual.value.social) creature.react();
  else creature.poke();
  picked.value = { name: shown(creature.info.id, creature.info.name), detail: creature.info.detail, dexId: creature.info.dexId, shiny: creature.info.shiny, mega: creature.info.mega };
  if (pickedTimer) clearTimeout(pickedTimer);
  pickedTimer = setTimeout(() => (picked.value = null), 5000);
}

function onPointerDown(event: PointerEvent): void {
  if (activePointer !== null) return;
  activePointer = event.pointerId;
  pointerDown = { x: event.clientX, y: event.clientY };
  lastPointer = { x: event.clientX, y: event.clientY };
  // Com a captura, soltar o dedo fora do palco (ou sobre a barra de botões) ainda termina o arraste. Só com a arena
  // aberta: capturar antes roubaria o clique de «Cancelar abertura».
  if (phase.value === 'running') {
    try { stageEl.value?.setPointerCapture?.(event.pointerId); } catch { /* ponteiro já acabou */ }
  }
}

function onPointerMove(event: PointerEvent): void {
  if (event.pointerId !== activePointer || !lastPointer || !box) return;
  box.orientation.lookBy(event.clientX - lastPointer.x, event.clientY - lastPointer.y);
  lastPointer = { x: event.clientX, y: event.clientY };
}

function onPointerUp(event: PointerEvent): void {
  if (event.pointerId !== activePointer) return;
  const down = pointerDown;
  activePointer = null;
  pointerDown = null;
  lastPointer = null;
  if (!down || !box || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 12) return;
  const ndc = ndcOf(event.clientX, event.clientY);
  if (!ndc) return;
  if (phase.value === 'running') {
    const creature = box.pick(ndc.x, ndc.y);
    if (creature) showPicked(creature);
  }
}

/** O sistema tomou o toque: não conta como toque num Pokémon. */
function onPointerCancel(event: PointerEvent): void {
  if (event.pointerId !== activePointer) return;
  activePointer = null;
  pointerDown = null;
  lastPointer = null;
}

watch(() => effectiveVisual.value.smoothing, (smoothing) => box?.setSmoothing(smoothing));
watch(() => effectiveVisual.value.lighting, (on) => box?.setLighting(on));
watch(() => effectiveVisual.value.terrain, (on) => box?.setTerrain(on));
watch(() => effectiveVisual.value.scenery, (on) => box?.setScenery(on));
watch(() => effectiveVisual.value.social, (on) => box?.setSocial(on));
watch(() => effectiveVisual.value.weather, (mode) => box?.setWeather(mode));

type Tone = 'busy' | 'ok' | 'warn' | 'error';
interface Notice {
  text: string;
  sub?: string;
  tone: Tone;
  gold?: boolean;
}

/** Avisos no topo do palco. */
const notices = computed<Notice[]>(() => {
  const list: Notice[] = [];
  if (!immersive.value) return list;
  if (error.value) list.push({ text: error.value, tone: 'error' });
  if (phase.value === 'starting') list.push({ text: 'Montando o Coliseu…', tone: 'busy' });
  for (const note of stageNotes.value) list.push({ text: note.text, tone: note.tone });
  if (hint.value) list.push({ text: hint.value, tone: 'busy' });
  if (picked.value) {
    list.push({ text: `${picked.value.name}${picked.value.dexId ? ` · Nº ${picked.value.dexId}` : ''}${picked.value.shiny ? ' · Shiny' : ''}${picked.value.mega ? ' · Mega' : ''}`, sub: picked.value.detail, tone: 'ok', gold: true });
  }
  if (arenaOn.value && loadingCreatures.value) list.push({ text: 'Chamando os Pokémon…', tone: 'busy' });
  else if (arenaOn.value && population.value.available === 0) {
    list.push({ text: 'A caixa está vazia. Escaneie uma carta (aba Escanear) ou carregue suas cartas (aba Cartas) para os Pokémon aparecerem aqui.', tone: 'warn' });
  }
  return list;
});
/** Linha de resumo fixa (pequena) enquanto a caixa está montada e nada mais pede atenção. */
const populationNote = computed(() => {
  if (phase.value !== 'running' || loadingCreatures.value || population.value.available === 0) return '';
  const { shown, available, failed } = population.value;
  const more = available > shown ? ` (de ${available} guardados)` : '';
  const broken = failed > 0 ? ` · ${failed} sprite(s) sem leitura` : '';
  return `${shown} Pokémon na arena${more}${broken} · toque num Pokémon para ver quem é`;
});

function toggleMode(): void {
  boxMode.value = boxMode.value === 'passeio' ? 'formacao' : 'passeio';
  box?.setMode(boxMode.value);
}

onBeforeUnmount(() => {
  if (stageNotesTimer) clearTimeout(stageNotesTimer);
  disposed = true;
  clearInterval(heartTimer);
  if (pickedTimer) clearTimeout(pickedTimer);
  close();
});
</script>

<template>
  <section class="card" aria-labelledby="box-title">
    <h2 id="box-title">Coliseu</h2>
    <p class="note">
      Os moradores da Vila passeiam num Coliseu virtual, sem câmera nem sensores: arraste na imagem para olhar em volta.
      As lutas ficam no <a :href="routeHref('arena')">menu da Arena</a>.
    </p>

    <div
      ref="stageEl"
      class="viewport box-viewport"
      :class="{ 'pseudo-full': pseudo, immersive }"
      :style="immersive ? { touchAction: 'none' } : undefined"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
    >
      <div ref="skyEl" class="virtual-sky" aria-hidden="true"><i class="sky-stars"></i></div>
      <canvas ref="canvasEl" class="overlay" aria-label="Coliseu com os Pokémon escaneados"></canvas>
      <p v-if="phase === 'idle'" class="placeholder">Coliseu fechado</p>
      <div v-if="phase === 'starting'" class="box-opening" role="status"><p>Montando o Coliseu…</p><button type="button" @click.stop="close">Cancelar abertura</button></div>
      <div v-if="immersive" class="stage-head" role="status" aria-live="polite">
        <p v-for="(n, i) in notices" :key="i + n.text" class="pill" :class="[n.tone, { gold: n.gold }]">
          <i class="dot"></i>
          <span class="pill-text">{{ n.text }}<small v-if="n.sub" class="pill-sub">{{ n.sub }}</small></span>
        </p>
        <p v-if="populationNote && notices.length === 0" class="pill small">{{ populationNote }}</p>
      </div>

      <div v-if="immersive" class="stage-foot" @pointerdown.stop @pointerup.stop>
        <SmoothingSheet v-if="showFilters && arenaOn" @close="showFilters = false" />
        <div v-if="showTeam && arenaOn" ref="teamDialog" class="stage-sheet" role="dialog" aria-label="Moradores na Caixa" @keydown.esc.stop.prevent="showTeam = false" @pointerdown.stop @pointerup.stop @click.stop>
          <header>
            <strong>Moradores da Vila</strong>
            <button type="button" class="link" aria-label="Fechar moradores na Caixa" @click="showTeam = false">Fechar</button>
          </header>
          <TeamPicker @change="schedulePopulate" />
        </div>
        <div v-if="showAdjust && arenaOn" ref="adjustDialog" class="stage-sheet" role="dialog" aria-label="Ajustes da caixa" @keydown.esc.stop.prevent="showAdjust = false" @pointerdown.stop @pointerup.stop @click.stop>
          <header>
            <strong>Ajustes do Coliseu</strong>
            <button type="button" class="link" aria-label="Fechar ajustes da Caixa" @click="showAdjust = false">Fechar</button>
          </header>
          <div class="layout">
            <p class="meta">Arraste a Arena para olhar ao redor. Os efeitos visuais podem ser ajustados sem usar câmera ou sensores.</p>
          </div>
        </div>
        <div v-if="arenaOn" class="stage-bar" role="toolbar" aria-label="Controles do Coliseu">
          <StageButton :icon="fullscreen ? 'exit-fullscreen' : 'fullscreen'" :label="fullscreen ? 'Sair' : 'Tela cheia'" @click="toggleFullscreen" />
          <StageButton icon="filters" label="Suavizar" :active="showFilters" @click="showFilters = !showFilters; showTeam = false; showAdjust = false" />
          <StageButton icon="team" label="Quem passeia" :active="showTeam" @click="showTeam = !showTeam; showFilters = false; showAdjust = false" />
          <StageButton icon="sliders" label="Ajustes" :active="showAdjust" @click="showAdjust = !showAdjust; showFilters = false; showTeam = false" />
          <StageButton :icon="boxMode === 'passeio' ? 'formation' : 'wander'" :label="boxMode === 'passeio' ? 'Formação' : 'Passeio'" @click="toggleMode" />
          <StageButton icon="close" label="Fechar" @click="close" />
        </div>
      </div>
    </div>

    <div class="actions" :class="{ stack: fromVila || fromArena }">
      <button ref="openButton" type="button" class="primary" :disabled="phase !== 'idle'" @click="open">
        {{ phase === 'starting' ? 'Abrindo…' : 'Entrar no Coliseu' }}
      </button>
      <a v-if="fromVila || fromArena" class="button" :href="routeHref(fromArena ? 'arena' : 'vila')">{{ fromArena ? 'Voltar ao menu da Arena' : 'Voltar à Vila' }}</a>
    </div>

    <p v-if="error && !immersive" class="message error" role="alert">{{ error }}</p>

    <details v-if="!immersive" class="layout" :open="bookOpen" @toggle="(e: Event) => (e.target as HTMLDetailsElement).open !== bookOpen && void openBook()">
      <summary>Livro dos Pokémon (opiniões, humor e intimidade)</summary>
      <p v-if="bookList.length === 0" class="hint">Nenhum morador da Vila ainda. Escaneie cartas para começar o livro.</p>
      <PokeBook v-else :mons="bookMons" :friends="village.friends" :nicks="bookNicks" :nick-note="bookNote" @nickname="onBookNickname" />
    </details>

  </section>
</template>

<style scoped>
/* Estrelas do céu da noite: só aparecem quando a cena pede (--stars vem de start-box). Sem custo por quadro. */
.sky-stars {
  position: absolute;
  inset: 0 0 45% 0;
  opacity: var(--stars, 0);
  background-image:
    radial-gradient(1.5px 1.5px at 12% 22%, #fff 99%, transparent),
    radial-gradient(1px 1px at 27% 58%, #dfe7ff 99%, transparent),
    radial-gradient(1.5px 1.5px at 41% 14%, #fff 99%, transparent),
    radial-gradient(1px 1px at 55% 41%, #ffeec2 99%, transparent),
    radial-gradient(1.5px 1.5px at 68% 18%, #fff 99%, transparent),
    radial-gradient(1px 1px at 79% 63%, #dfe7ff 99%, transparent),
    radial-gradient(1.5px 1.5px at 90% 30%, #fff 99%, transparent),
    radial-gradient(1px 1px at 6% 72%, #ffeec2 99%, transparent),
    radial-gradient(1px 1px at 34% 83%, #fff 99%, transparent),
    radial-gradient(1px 1px at 62% 79%, #dfe7ff 99%, transparent);
  background-size: 100% 100%;
}
</style>
