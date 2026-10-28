<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useDialogFocus } from '../composables/useDialogFocus';
import { fetchSprite, getCache } from '../app/services';
import { createBattleSession, decodeSprite } from '../app/box-battle-session';
import { digitalCandidates } from '../app/digital-members';
import { loadCardCompanionEntry } from '../app/companion-creatures';
import { MAX_CHALLENGE_TEAM } from '../app/challenge-battle';
import { trainerSpriteUrl } from '../core/trainer-sprites';
import { routeFlags, routeHref } from '../app/route';
import { displayName, setNickname } from '../core/village/nickname';
import type { CreatureEntry } from '../box/box-scene';
import { useFullscreen } from '../app/fullscreen';
import { resolveTeam } from '../app/team';
import { savedTeam } from '../app/team-store';
import { resetRoster, roster, rosterFor, setSlot, slotOf } from '../app/roster-store';
import { battleMode, setBattleMode } from '../app/battle-mode-store';
import { maybeGalladeSpeaks } from '../app/speech-store';
import { effectiveVisual } from '../app/visual-settings';
import CardMarks from '../components/CardMarks.vue';
import SmoothingSheet from '../components/SmoothingSheet.vue';
import StageButton from '../components/StageButton.vue';
import TeamPicker from '../components/TeamPicker.vue';
import BoxPvpPanel from '../components/BoxPvpPanel.vue';
import PokeBook from '../components/PokeBook.vue';
import { loadVillage, saveVillage } from '../app/village-store';
import { BATTLE_REWARDS_PER_DAY, battleRewardsLeft, dailyHelp, friendLevel, itemName } from '../core/village/life';
import type { VillageState } from '../core/village/life';
import { paintAccessory } from '../village/item-art';
import { itemDef } from '../core/village/catalog';
import { dayKey } from '../core/trainer';
import type { PokemonType } from '../core/pokemon-data';
import { loadPinData } from '../app/services';
import { boxPvp } from '../app/box-pvp-store';
import { BOX_PVP_LABELS_PT } from '../pvp/box-wire';
import type { BoxMode } from '../box/box-scene';
import { loadCreatureEntries } from '../box/load-creatures';
import type { RunningBox } from '../box/start-box';
import type { BoxCreature } from '../box/creature';
import { MEGA_ENERGY_COST } from '../core/mega';
import { TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import { TEAM_COLORS, BATTLE_MODE_HINTS_PT, BATTLE_MODE_LABELS_PT, BATTLE_MODES, rosterBlocker, STATUS_LABELS_PT } from '../core/battle';
import type { BattleMode, RosterSlot } from '../core/battle';
import { loadChunk } from '../app/stale-build';
import { ENDLESS_ARENA_LABELS } from '../core/endless-arena';
import type { EndlessArenaMode } from '../core/endless-arena';

type Phase = 'idle' | 'starting' | 'running';

const openButton = ref<HTMLButtonElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const stageEl = ref<HTMLElement | null>(null);
const showFilters = ref(false);
const showTeam = ref(false);
const showAdjust = ref(false);
const showSummary = ref(false);
const showModes = ref(false);
const modesDialog = ref<HTMLElement | null>(null);
const teamDialog = ref<HTMLElement | null>(null);
const adjustDialog = ref<HTMLElement | null>(null);
const summaryDialog = ref<HTMLElement | null>(null);
useDialogFocus(modesDialog); useDialogFocus(teamDialog); useDialogFocus(adjustDialog); useDialogFocus(summaryDialog);
const boxMode = ref<BoxMode>('passeio');

const phase = ref<Phase>('idle');
/** Com a câmera ligada (ou abrindo) o visor cobre a janela e tudo aparece sobre a imagem: sem rolar a página. */
const immersive = computed(() => phase.value !== 'idle');
const { fullscreen, pseudo, toggle: toggleFullscreen, exit: exitFullscreen } = useFullscreen(stageEl, immersive);
const error = ref('');
const hint = ref('');
const population = ref({ shown: 0, available: 0, failed: 0 });
/** Quem está na caixa agora (para a escalação das batalhas). */
const rosterRows = ref<{ id: string; name: string; shiny: boolean; mega: boolean }[]>([]);
const currentRoster = computed(() => rosterFor(rosterRows.value.map((r) => r.id)));
const modeBlocker = (m: BattleMode) => rosterBlocker(m, population.value.shown, currentRoster.value);
const rosterCustom = computed(() => rosterRows.value.some((r) => slotOf(r.id) !== 'auto'));
/** Acima disto, as barras de vida viram só um traço (o nome aparece em quem está agindo): 40 etiquetas não cabem na tela. */
const DENSE_BARS = 12;
const SLOT_CHOICES: { slot: RosterSlot; label: string; title: string }[] = [
  { slot: 'auto', label: 'Sorteio', title: 'Entra na luta e o lado é sorteado' },
  { slot: 0, label: 'Vermelha', title: 'Equipe Vermelha' },
  { slot: 1, label: 'Azul', title: 'Equipe Azul' },
  { slot: 'out', label: 'Fora', title: 'Fica de fora da luta' },
];
const loadingCreatures = ref(false);
/** Modo vida (a Vila, sem câmera). */
/** Vindo da Vila (`#/caixa?vila=1`) a Vila abre direto; vindo da Arena (`?pvp=1`) o PvP já aparece aberto. */
const arrival = routeFlags(window.location.hash);
const pvpOpen = ref(arrival.has('pvp'));
/** Fluxos confirmados na Arena entram no palco e iniciam a batalha sem uma terceira confirmação. */
const autoStart = arrival.has('autoiniciar');
const endlessModes: readonly EndlessArenaMode[] = ['formatacao', 'restauracao'];
const endlessShortcut = ref<EndlessArenaMode | null>(arrival.has('formatacao') ? 'formatacao' : arrival.has('restauracao') ? 'restauracao' : null);
const pvpEl = ref<HTMLDetailsElement | null>(null);
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
  rosterRows.value = rosterRows.value.map((x) => (x.id === id ? { ...x, name: shown(id, row?.real ?? x.name) } : x));
  nickTick.value++;
}
/** Faz o Livro reler os apelidos (o `village` desta tela não é reativo). */
const nickTick = ref(0);
const bookNicks = computed(() => (nickTick.value >= 0 ? { ...village.nicks } : {}));

function openPvp(): void {
  pvpOpen.value = true;
  void nextTick(() => pvpEl.value?.scrollIntoView({ block: 'start' }));
}

/**
 * Veio do Fliperama (`?batalha=1`): o botão principal destaca a batalha na Arena 3D.
 */
const battleShortcut = ref(arrival.has('batalha'));
/** Vindo do Coliseu da Vila (`?vila=1`): o botão «Voltar à Vila» fica na tela inicial. */
const fromVila = arrival.has('vila');
const fromArena = arrival.has('arena');

onMounted(() => {
  motionPreference = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  reducedMotion.value = motionPreference?.matches ?? false;
  motionPreference?.addEventListener('change', onMotionPreferenceChange);
});

function onMotionPreferenceChange(): void {
  reducedMotion.value = motionPreference?.matches ?? false;
  box?.setImpactEffects(effectiveVisual.value.impactFx && !reducedMotion.value);
}

onMounted(() => {
  if (arrival.has('pvp')) openPvp();
  if (autoStart) void nextTick(open);
});
const picked = ref<{ name: string; detail: string; dexId?: number; shiny?: boolean; mega?: boolean } | null>(null);
const reducedMotion = ref(false);
let motionPreference: MediaQueryList | null = null;
let box: RunningBox | null = null;
let disposed = false;
let sessionVersion = 0;
let populationVersion = 0;
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
      c.say('🎁', 2600);
      const what = [...help.items.map((h) => `${h.qty} ${itemName(h.item)}`), ...(help.rare ? [itemName(help.rare)] : [])].join(' e ');
      notes.push({ text: `${c.info.name} trouxe ${what} para a sua mochila da Vila!`, tone: 'ok' });
    }
  }
  if (notes.length > 0) {
    saveVillage(village);
    showMegaNotes(notes.slice(0, 3));
  }
}

const heartTimer = setInterval(() => {
  if (document.hidden) return;
  const current = box;
  if (!current || battleHud.value || phase.value !== 'running') return;
  const close = current.scene.creatureList.filter((c) => bondOf(c.info.id) >= 3 && !c.bubbleEmoji);
  const pick = close[Math.floor(Math.random() * close.length)];
  if (pick && Math.random() < 0.6) {
    pick.poke();
    pick.say(['❤️', '🥰', '😊', '💕'][Math.floor(Math.random() * 4)]!, 2000);
  }
}, 7000);

/** Os moradores da Vila (cartas e Digital Pokémon) já com os sprites prontos para a cena. */
async function loadTeamCreatures(cache: Awaited<ReturnType<typeof getCache>>) {
  const digital = loadVillage().digital;
  const team = resolveTeam(savedTeam.value, [...(await cache.list()), ...digitalCandidates(digital)]);
  return loadCreatureEntries(cache, undefined, team.ids, {
    instances: digital.instances,
    // O mesmo GIF da Showdown das cartas (não o pacote da Vila), para o digital ficar em pé no chão como os outros.
    sprite: async (dexId) => {
      const sprite = await fetchSprite(dexId).catch(() => null);
      return sprite ? decodeSprite(sprite) : null;
    },
  }, loadCardCompanionEntry);
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

/** O que foi carregado da sua equipe por último (a equipe do desafio sai daqui, sem os Pokémon do líder). */
let lastEntries: CreatureEntry[] = [];

// ---- A sessão de batalha (batalha comum, desafio da Liga, corrida 6×6 e PvP) mora em `app/box-battle-session.ts`;
// aqui ficam a cena 3D e os Pokémon da equipe, que a sessão pede por `BattleSessionHost`.
const session = createBattleSession({
  box: () => box,
  disposed: () => disposed,
  entries: () => lastEntries,
  populate,
  shown,
  bondOf,
  refreshVillage: () => { village = loadVillage(); },
  fullscreen: { active: () => fullscreen.value, toggle: () => void toggleFullscreen(), exit: () => void exitFullscreen() },
  closeSummary: () => { showSummary.value = false; },
  closeSheets: () => { showFilters.value = showTeam.value = showAdjust.value = showModes.value = false; },
  openModes: () => { showModes.value = true; },
}, { error, hint, phase, endlessShortcut, battleShortcut });
const {
  battleHud, preparing, battleFighters, battleSummary, megaPicks, megaNotes, versus, stageSpeech, endlessRun, endlessLabel,
  challenge, pvpOn, battling, endlessTeam, energy,
  toggleMega, showMegaNotes, cancelChallenge, startBattle, startSelectedBattle, startEndless, stopBattle,
} = session;
const megaWanted = computed(() => megaPicks.value.length);
const megaAffordable = computed(() => Math.floor(energy.value / MEGA_ENERGY_COST));

async function populate(): Promise<void> {
  const current = box;
  if (!current) return;
  const version = ++populationVersion;
  loadingCreatures.value = true;
  try {
    const cache = await getCache();
    // Os moradores escolhidos (ou, sem escolha, os 6 mais recentes) vão para a caixa — Digital Pokémon inclusive.
    const loaded = await loadTeamCreatures(cache);
    if (disposed || box !== current || version !== populationVersion) return;
    current.setCreatures(loaded.entries);
    lastEntries = loaded.entries;
    applyVillage();
    void session.syncPvpTeam();
    for (const entry of loaded.entries) if (maybeGalladeSpeaks(entry.info)) break;
    population.value = { shown: loaded.entries.length, available: loaded.available, failed: loaded.failed.length };
    rosterRows.value = loaded.entries.map((e) => ({ id: e.info.id, name: shown(e.info.id, e.info.name), shiny: e.info.shiny === true, mega: e.info.mega === true }));
    megaPicks.value = megaPicks.value.filter((id) => rosterRows.value.some((r) => r.id === id && r.mega));
    if (autoStart && phase.value === 'running') void nextTick(startSelectedBattle);
  } catch (e) {
    if (disposed || box !== current || version !== populationVersion) return;
    error.value = `Não consegui ler as cartas guardadas: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    if (box === current && version === populationVersion) loadingCreatures.value = false;
  }
}

/** O que a cena virtual recebe ao abrir. */
function applyBoxSettings(running: RunningBox): void {
  running.setSmoothing(effectiveVisual.value.smoothing);
  running.setLighting(effectiveVisual.value.lighting);
  running.setImpactEffects(effectiveVisual.value.impactFx && !reducedMotion.value);
  running.setTerrain(effectiveVisual.value.terrain);
  running.setScenery(effectiveVisual.value.scenery);
  running.setSocial(effectiveVisual.value.social);
  running.setWeather(effectiveVisual.value.weather);
  running.setSound(effectiveVisual.value.sound);
  running.setMode(boxMode.value);
}

/** Arena 3D: sem câmera, sem sensores e sem escolher o ponto no chão (a arena nasce de frente para a visão). */
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
      canvas, container: stage, virtual: true, onBattleHud: (hud) => (battleHud.value = hud),
    });
    if (disposed || version !== sessionVersion) { openedBox.stop(); return; }
    box = openedBox;
  } catch (e) {
    if (disposed || version !== sessionVersion) return;
    close();
    error.value = `Não consegui montar a Arena 3D: ${e instanceof Error ? e.message : String(e)}`;
    return;
  }
  applyBoxSettings(box);
  const placed = box.placeAt(0, 0);
  if (!placed.ok) {
    close();
    error.value = `Não consegui montar a Arena 3D: ${placed.message}`;
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
  loadingCreatures.value = false;
  session.reset();
  lastEntries = [];
  rosterRows.value = [];
  population.value = { shown: 0, available: 0, failed: 0 };
  void exitFullscreen();
  showFilters.value = false;
  showTeam.value = false;
  showAdjust.value = false;
  showSummary.value = false;
  showModes.value = false;
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
  pointerDown = { x: event.clientX, y: event.clientY };
  lastPointer = { x: event.clientX, y: event.clientY };
}

function onPointerMove(event: PointerEvent): void {
  if (!lastPointer || !box) return;
  box.orientation.lookBy(event.clientX - lastPointer.x, event.clientY - lastPointer.y);
  lastPointer = { x: event.clientX, y: event.clientY };
}

function onPointerUp(event: PointerEvent): void {
  const down = pointerDown;
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

watch(() => effectiveVisual.value.smoothing, (smoothing) => box?.setSmoothing(smoothing));
watch(() => effectiveVisual.value.lighting, (on) => box?.setLighting(on));
watch(() => effectiveVisual.value.impactFx, (on) => box?.setImpactEffects(on && !reducedMotion.value));
watch(() => effectiveVisual.value.terrain, (on) => box?.setTerrain(on));
watch(() => effectiveVisual.value.scenery, (on) => box?.setScenery(on));
watch(() => effectiveVisual.value.social, (on) => box?.setSocial(on));
watch(() => effectiveVisual.value.weather, (mode) => box?.setWeather(mode));
watch(() => effectiveVisual.value.sound, (on) => box?.setSound(on));

const canBattle = computed(() => phase.value === 'running' && population.value.shown >= (challenge.value || pvpOn.value ? 1 : 2) && !loadingCreatures.value && !preparing.value);
/** A Arena usa deliberadamente os seis marcados como Vermelha: a escalação deixa de ser um detalhe escondido. */
// A lista da equipe não é reativa: os sinais reativos vêm antes dela, para o botão ser reavaliado quando a equipe terminar de carregar.
const canStartEndless = computed(() => phase.value === 'running' && !loadingCreatures.value && !preparing.value && !pvpOn.value && endlessTeam().length === MAX_CHALLENGE_TEAM);
/** Tremor e "soco" de zoom da imagem desenhada nos golpes fortes (o vídeo da câmera não treme). */
const shakeStyle = computed(() => {
  const s = battleHud.value?.shake;
  if (!s || (Math.abs(s.x) < 0.2 && Math.abs(s.y) < 0.2 && s.zoom < 1.002)) return undefined;
  return { transform: `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) scale(${s.zoom.toFixed(3)})` };
});

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
  if (phase.value === 'starting') list.push({ text: 'Montando a arena…', tone: 'busy' });
  for (const note of megaNotes.value) list.push({ text: note.text, tone: note.tone });
  if (battleHud.value) return list;
  if (hint.value) list.push({ text: hint.value, tone: 'busy' });
  if (pvpOn.value && !preparing.value) {
    const friend = boxPvp.friend?.name ?? 'o amigo';
    const sub = boxPvp.role === 'host'
      ? boxPvp.friend ? `${BOX_PVP_LABELS_PT[boxPvp.mode].title} · toque em Batalhar${boxPvp.friendPlaced ? '' : ` (${friend} ainda não colocou a caixa)`}` : 'Esperando a equipe do amigo…'
      : boxPvp.pending ? 'Aguarde a Arena 3D ser montada.' : 'Esperando o anfitrião começar.';
    list.push({ text: `PvP com ${friend}`, sub, tone: 'ok', gold: true });
  } else if (endlessShortcut.value && !preparing.value) {
    const mode = ENDLESS_ARENA_LABELS[endlessShortcut.value];
    list.push({ text: `Arena Digital: ${mode.title}`, sub: 'Toque em Começar para a primeira batalha 6×6.', tone: 'ok', gold: true });
  } else if (challenge.value && !preparing.value) {
    list.push({ text: `Desafio: ${challenge.value.role} ${challenge.value.leader}`, sub: 'Toque em Batalhar: até 6 da sua caixa contra a equipe do líder, um duelo por vez.', tone: 'ok', gold: true });
  } else if (battleShortcut.value && !preparing.value) {
    const left = battleRewardsLeft(village, dayKey(new Date()));
    list.push({
      text: 'Fliperama: batalha na Arena 3D',
      sub: `Toque em Batalhar · ${left > 0 ? `+100 moedas (${left} de ${BATTLE_REWARDS_PER_DAY} hoje)` : 'as moedas de hoje já saíram'}`,
      tone: 'ok',
      gold: true,
    });
  }
  if (picked.value) {
    list.push({ text: `${picked.value.name}${picked.value.dexId ? ` · Nº ${picked.value.dexId}` : ''}${picked.value.shiny ? ' · Shiny' : ''}${picked.value.mega ? ' · Mega' : ''}`, sub: picked.value.detail, tone: 'ok', gold: true });
  }
  if (arenaOn.value && loadingCreatures.value) list.push({ text: 'Chamando os Pokémon…', tone: 'busy' });
  else if (arenaOn.value && population.value.available === 0) {
    list.push({ text: 'A caixa está vazia. Escaneie uma carta (aba Escanear) ou carregue suas cartas (aba Cartas) para os Pokémon aparecerem aqui.', tone: 'warn' });
  } else if (phase.value === 'running' && population.value.shown === 1) {
    list.push({ text: 'Para batalhar, inclua pelo menos 2 Pokémon na equipe.', tone: 'warn' });
  }
  return list;
});
/** Linha de resumo fixa (pequena) enquanto a caixa está montada e nada mais pede atenção. */
const populationNote = computed(() => {
  if (phase.value !== 'running' || battleHud.value || loadingCreatures.value || population.value.available === 0) return '';
  const { shown, available, failed } = population.value;
  const more = available > shown ? ` (de ${available} guardados)` : '';
  const broken = failed > 0 ? ` · ${failed} sprite(s) sem leitura` : '';
  return `${shown} Pokémon na arena${more}${broken} · toque num Pokémon para ver quem é`;
});

const incompleteFighters = computed(() => (battleHud.value ? battleFighters.value.filter((f) => f.notes.length > 0) : []));

function hpTone(frac: number): string {
  return frac > 0.5 ? 'ok' : frac > 0.2 ? 'warn' : 'low';
}

function toggleMode(): void {
  boxMode.value = boxMode.value === 'passeio' ? 'formacao' : 'passeio';
  box?.setMode(boxMode.value);
}

onBeforeUnmount(() => {
  disposed = true;
  clearInterval(heartTimer);
  session.dispose();
  if (pickedTimer) clearTimeout(pickedTimer);
  motionPreference?.removeEventListener('change', onMotionPreferenceChange);
  close();
});
</script>

<template>
  <section class="card" aria-labelledby="box-title">
    <h2 id="box-title">Arena 3D</h2>
    <p class="note">
      Os moradores da Vila lutam num Coliseu virtual, sem câmera nem sensores: arraste na imagem para olhar em volta. Quem
      aparece você escolhe em <a :href="routeHref('cartas')">Minhas cartas</a>; quem luta em cada batalha é escolhido na
      escalação.
    </p>

    <div
      ref="stageEl"
      class="viewport box-viewport"
      :class="{ 'pseudo-full': pseudo, immersive }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <div class="virtual-sky" aria-hidden="true" :style="videoStyle"></div>
      <div v-if="battleHud" class="battle-env" aria-hidden="true" :style="shakeStyle">
        <div class="vignette" :style="{ opacity: Math.min(1, battleHud.dim * 3) }"></div>
        <div v-if="envLights" class="lights" :style="envLights"></div>
      </div>
      <canvas ref="canvasEl" class="overlay" :style="shakeStyle" aria-label="Caixa com os Pokémon escaneados"></canvas>
      <p v-if="phase === 'idle'" class="placeholder">Arena desligada</p>
      <div v-if="phase === 'starting'" class="box-opening" role="status"><p>Montando a arena…</p><button type="button" @click.stop="close">Cancelar abertura</button></div>
      <div v-if="battleHud" class="battle-hud" :class="{ compact: battleHud.bars.length > 4, dense: battleHud.bars.length > DENSE_BARS }">
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
        <div v-if="battleHud.impactFrame" :key="battleHud.impactFrame.key" class="critical-impact-frame" :style="{ '--impact': battleHud.impactFrame.color }" aria-hidden="true"></div>
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
      <div v-if="versus && battleHud" class="vs-trainers" aria-hidden="true">
        <span class="vs-trainer me"><img :src="versus.me.sprite" alt="" width="64" height="64" /><b>{{ versus.me.name }}</b></span>
        <span class="vs-trainer them"><img :src="versus.them.sprite" alt="" width="64" height="64" /><b>{{ versus.them.name }}</b><small>{{ versus.them.role }}</small></span>
      </div>
      <div v-if="stageSpeech" class="speech in-stage" role="dialog" :aria-label="`${stageSpeech.name} diz`" @pointerdown.stop @pointerup.stop @click.stop="stageSpeech = null">
        <img :src="stageSpeech.sprite" alt="" class="speech-sprite trainer" />
        <div class="speech-box">
          <strong>{{ stageSpeech.name }}</strong>
          <p>{{ stageSpeech.text }}</p>
        </div>
      </div>
      <div v-if="immersive" class="stage-head" role="status" aria-live="polite">
        <p v-for="(n, i) in notices" :key="i + n.text" class="pill" :class="[n.tone, { gold: n.gold }]">
          <i class="dot"></i>
          <span class="pill-text">{{ n.text }}<small v-if="n.sub" class="pill-sub">{{ n.sub }}</small></span>
        </p>
        <p v-if="populationNote && notices.length === 0" class="pill small">{{ populationNote }}</p>
      </div>

      <div v-if="immersive" class="stage-foot" @pointerdown.stop @pointerup.stop>
        <SmoothingSheet v-if="showFilters && arenaOn" battle @close="showFilters = false" />
        <div v-if="showSummary && battleSummary && battleHud?.phase === 'finished'" ref="summaryDialog" class="stage-sheet battle-summary" role="dialog" aria-label="Resumo da batalha" @keydown.esc.stop.prevent="showSummary = false" @pointerdown.stop @pointerup.stop @click.stop>
          <header>
            <strong>{{ battleSummary.winner }} venceu</strong>
            <button type="button" class="link" aria-label="Fechar resumo da batalha" @click="showSummary = false">Fechar</button>
          </header>
          <p>{{ battleSummary.turns }} turnos em {{ battleSummary.rounds }} rodadas.</p>
          <p v-if="endlessRun && endlessLabel"><strong>{{ endlessLabel.title }}</strong> · batalha {{ endlessRun.battles }} · {{ endlessRun.wins }} vitória{{ endlessRun.wins === 1 ? '' : 's' }} · <strong>{{ endlessRun.score }} pontos</strong>.</p>
          <p v-if="mvp">Mais dano: <strong>{{ mvp.name }}</strong> ({{ mvp.damageDealt }} PS, maior golpe {{ mvp.biggestHit }}, {{ mvp.knockouts }} nocaute{{ mvp.knockouts === 1 ? '' : 's' }}).</p>
          <p>{{ crits }} crítico{{ crits === 1 ? '' : 's' }} · {{ inflicted }} condição(ões) causada(s) · {{ guards }} defesa{{ guards === 1 ? '' : 's' }}.</p>
          <template v-if="incompleteFighters.length > 0">
            <p class="hint">Dados incompletos (usei valores neutros):</p>
            <p v-for="f in incompleteFighters" :key="f.id" class="hint">{{ f.name }}: {{ f.notes.join('; ') }}</p>
          </template>
        </div>
        <div v-if="showModes && arenaOn && !battling" ref="modesDialog" class="stage-sheet battle-team-sheet" role="dialog" aria-label="Equipe de batalha" @keydown.esc.stop.prevent="showModes = false" @pointerdown.stop @pointerup.stop @click.stop>
          <header>
            <strong>Equipe de batalha</strong>
            <button type="button" class="link" aria-label="Fechar equipe de batalha" @click="showModes = false">Fechar</button>
          </header>
          <p class="selection-caption">1 · Escolha o formato da batalha</p>
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
          <section class="arena-run-options" aria-label="Arena digital contínua">
            <p class="selection-caption">2 · Arena digital contínua</p>
            <p class="hint">Marque exatamente 6 Pokémon em <strong>Vermelha</strong> na escalação abaixo. Eles permanecem como a sua equipe entre as ondas.</p>
            <div class="mode-list">
              <button
                v-for="m in endlessModes"
                :key="m"
                type="button"
                class="mode-option"
                :disabled="!canStartEndless"
                @click="void startEndless(m)"
              >
                <strong>{{ ENDLESS_ARENA_LABELS[m].title }}</strong>
                <span>{{ ENDLESS_ARENA_LABELS[m].tutorial }}</span>
              </button>
            </div>
            <small v-if="endlessTeam().length !== MAX_CHALLENGE_TEAM">Vermelha: {{ endlessTeam().length }}/{{ MAX_CHALLENGE_TEAM }} · selecione exatamente 6 para liberar.</small>
          </section>
          <p class="hint">3 · Escale os Pokémon abaixo. Para mudar quem aparece na Arena, abra Quem passeia.</p>
          <p v-if="rosterRows.some((r) => r.mega)" class="hint mega-hint">
            Cartas Mega podem mudar de forma por uma batalha: marque «Forma Mega» embaixo do nome delas. Moedas: {{ energy }}<template v-if="megaWanted > megaAffordable"> (só dá para {{ megaAffordable }} {{ megaAffordable === 1 ? 'troca' : 'trocas' }}; as outras lutam na forma normal)</template>.
          </p>
          <div v-if="rosterRows.length > 0" class="roster">
            <div class="roster-summary" role="status">
              <span>Vermelha <b>{{ rosterRows.filter((r) => slotOf(r.id) === 0).length }}</b></span>
              <span>Azul <b>{{ rosterRows.filter((r) => slotOf(r.id) === 1).length }}</b></span>
              <span>Sorteio <b>{{ rosterRows.filter((r) => slotOf(r.id) === 'auto').length }}</b></span>
              <span>Fora <b>{{ rosterRows.filter((r) => slotOf(r.id) === 'out').length }}</b></span>
            </div>
            <div class="roster-head">
              <strong>Quem vai lutar · {{ rosterRows.filter((r) => slotOf(r.id) !== 'out').length }}/{{ rosterRows.length }}</strong>
              <button v-if="rosterCustom" type="button" class="link" @click="resetRoster">Tudo em sorteio</button>
            </div>
            <p class="hint">Escolha Vermelha ou Azul para cada Pokémon, ou Fora para deixá-lo só passeando na Caixa. Quem ficar em sorteio completa os lados. No 3x3 cada lado usa 3.</p>
            <ul class="roster-list">
              <li v-for="row in rosterRows" :key="row.id" :class="{ out: roster[row.id] === 'out' }">
                <span class="roster-who">
                  <span class="roster-name">
                    <span class="roster-label">{{ row.name }}</span>
                    <CardMarks :card="{ name: row.name, localId: '', setOfficial: 0, shiny: row.shiny, mega: row.mega }" compact />
                  </span>
                  <button
                    v-if="row.mega"
                    type="button"
                    class="mega-toggle"
                    :class="{ on: megaPicks.includes(row.id) }"
                    :aria-pressed="megaPicks.includes(row.id)"
                    :title="`Muda para a forma Mega só nesta batalha (custa ${MEGA_ENERGY_COST} moedas)`"
                    :aria-label="`${row.name}: forma Mega só nesta batalha, custa ${MEGA_ENERGY_COST} moedas`"
                    @click="toggleMega(row.id)"
                  >Mega −{{ MEGA_ENERGY_COST }} moedas</button>
                </span>
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
        <div v-if="showTeam && arenaOn" ref="teamDialog" class="stage-sheet" role="dialog" aria-label="Moradores na Caixa" @keydown.esc.stop.prevent="showTeam = false" @pointerdown.stop @pointerup.stop @click.stop>
          <header>
            <strong>Moradores da Vila</strong>
            <button type="button" class="link" aria-label="Fechar moradores na Caixa" @click="showTeam = false">Fechar</button>
          </header>
          <TeamPicker @change="populate" />
        </div>
        <div v-if="showAdjust && arenaOn && !battling" ref="adjustDialog" class="stage-sheet" role="dialog" aria-label="Ajustes da caixa" @keydown.esc.stop.prevent="showAdjust = false" @pointerdown.stop @pointerup.stop @click.stop>
          <header>
            <strong>Ajustes da caixa</strong>
            <button type="button" class="link" aria-label="Fechar ajustes da Caixa" @click="showAdjust = false">Fechar</button>
          </header>
          <div class="layout">
            <p class="meta">Arraste a Arena para olhar ao redor. Os efeitos visuais podem ser ajustados sem usar câmera ou sensores.</p>
          </div>
        </div>
        <div v-if="arenaOn" class="stage-bar" role="toolbar" aria-label="Controles da Arena 3D">
          <StageButton :icon="fullscreen ? 'exit-fullscreen' : 'fullscreen'" :label="fullscreen ? 'Sair' : 'Tela cheia'" @click="toggleFullscreen" />
          <StageButton icon="filters" label="Suavizar" :active="showFilters" @click="showFilters = !showFilters; showTeam = false; showAdjust = false; showModes = false" />
          <StageButton v-if="!battling" icon="team" label="Quem passeia" :active="showTeam" @click="showTeam = !showTeam; showFilters = false; showAdjust = false; showModes = false" />
          <StageButton v-if="!battling" icon="sliders" label="Ajustes" :active="showAdjust" @click="showAdjust = !showAdjust; showFilters = false; showTeam = false; showModes = false" />
          <StageButton v-if="!battling" :icon="boxMode === 'passeio' ? 'formation' : 'wander'" :label="boxMode === 'passeio' ? 'Formação' : 'Passeio'" @click="toggleMode" />
          <StageButton v-if="!battling" icon="modes" :label="BATTLE_MODE_LABELS_PT[battleMode]" :active="showModes" @click="showModes = !showModes; showFilters = false; showTeam = false; showAdjust = false" />
          <StageButton class="stage-primary" v-if="!battling && phase === 'running'" icon="battle" :label="preparing ? 'Preparando…' : endlessShortcut ? `Começar ${ENDLESS_ARENA_LABELS[endlessShortcut].title}` : 'Batalhar'" :disabled="endlessShortcut ? !canStartEndless : !canBattle" :attention="endlessShortcut ? canStartEndless && !preparing : battleShortcut && canBattle && !preparing" @click="startSelectedBattle" />
          <StageButton class="stage-primary" v-if="battling && battleHud?.phase === 'finished' && !endlessRun" icon="battle" label="De novo" @click="startBattle" />
          <StageButton v-if="battling && battleHud?.phase === 'finished' && battleSummary" icon="panel" label="Resumo" :active="showSummary" @click="showSummary = !showSummary" />
          <StageButton v-if="battling" icon="adjust" label="Centrar" @click="box?.recenterBattle()" />
          <StageButton class="stage-primary" v-if="battling" icon="stop" :label="endlessRun ? `Desistir · ${endlessRun.score}` : 'Parar'" @click="stopBattle" />
          <StageButton v-if="challenge && !battling" icon="close" label="Sem desafio" @click="cancelChallenge" />
          <StageButton icon="close" label="Fechar" @click="close" />
        </div>
      </div>
    </div>

    <div v-if="challenge && !immersive" class="challenge-card">
      <img :src="trainerSpriteUrl(challenge.sprite)" alt="" width="72" height="72" />
      <span>
        <strong>Desafio: {{ challenge.role }} {{ challenge.leader }}</strong>
        <small>Entre na Arena e toque em Batalhar. Até 6 Pokémon da sua equipe lutam contra a equipe do líder, um duelo por vez.</small>
        <button type="button" class="link" @click="cancelChallenge">Cancelar desafio</button>
      </span>
    </div>

    <div class="actions" :class="{ stack: battleShortcut || endlessShortcut || fromVila || fromArena }">
      <button ref="openButton" type="button" class="primary" :class="{ 'battle-cta': battleShortcut }" :disabled="phase !== 'idle'" @click="open">
        {{ phase === 'starting' ? 'Abrindo…' : endlessShortcut ? `⚔️ Entrar na arena · ${ENDLESS_ARENA_LABELS[endlessShortcut].title}` : battleShortcut ? '⚔️ Entrar na arena e batalhar' : '🏟️ Entrar na Arena 3D' }}
      </button>
      <a v-if="battleShortcut || endlessShortcut || fromVila || fromArena" class="button" :href="routeHref(endlessShortcut || fromArena ? 'arena' : 'vila')">{{ endlessShortcut || fromArena ? 'Voltar à Arena' : 'Voltar à Vila' }}</a>
    </div>

    <p v-if="error && !immersive" class="message error" role="alert">{{ error }}</p>

    <details v-if="!immersive" class="layout" :open="bookOpen" @toggle="(e: Event) => (e.target as HTMLDetailsElement).open !== bookOpen && void openBook()">
      <summary>Livro dos Pokémon (opiniões, humor e intimidade)</summary>
      <p v-if="bookList.length === 0" class="hint">Nenhum morador da Vila ainda. Escaneie cartas para começar o livro.</p>
      <PokeBook v-else :mons="bookMons" :friends="village.friends" :nicks="bookNicks" :nick-note="bookNote" @nickname="onBookNickname" />
    </details>

    <details v-if="!immersive" ref="pvpEl" class="layout" :open="pvpOn || pvpOpen" @toggle="(e: Event) => (pvpOpen = (e.target as HTMLDetailsElement).open)">
      <summary>Batalhar com um amigo (PvP)</summary>
      <BoxPvpPanel />
    </details>
  </section>
</template>
