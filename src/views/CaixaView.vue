<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { isTap } from '../ar/gestures';
import { fetchSprite, getCache, loadBattle, prepareMegaFor } from '../app/services';
import { digitalCandidates } from '../app/digital-members';
import { loadCardCompanionEntry } from '../app/companion-creatures';
import { cardJourneyError, recordCardVictories } from '../app/card-evolution-store';
import { battleWinners } from '../core/card-evolution';
import type { CardCompanion } from '../core/card-evolution';
import { challengePlan, isLeaderCreature, leaderFighter, leaderLoader, loadArenaEntries, loadLeaderEntries, MAX_CHALLENGE_TEAM } from '../app/challenge-battle';
import { league, pendingChallenge, recordLeagueResult } from '../app/league-store';
import { profile } from '../app/profile-store';
import { routeFlags, routeHref } from '../app/route';
import { displayName, setNickname } from '../core/village/nickname';
import { challengeById, statusOf } from '../core/league';
import type { Challenge } from '../core/league';
import { trainerSpriteUrl } from '../core/trainer-sprites';
import type { CreatureEntry } from '../box/box-scene';
import type { BattleResult } from '../core/battle';
import { prepareFighters } from '../app/battle-setup';
import { megaAwareLoader, planMegaBattle } from '../app/mega-battle';
import { useFullscreen } from '../app/fullscreen';
import { resolveTeam } from '../app/team';
import { savedTeam } from '../app/team-store';
import { resetRoster, roster, rosterFor, setSlot, slotOf } from '../app/roster-store';
import { battleMode, setBattleMode } from '../app/battle-mode-store';
import { recordEvent } from '../app/trainer-store';
import { coins, spendCoins, withVillage } from '../app/wallet';
import { maybeGalladeSpeaks } from '../app/speech-store';
import { visual } from '../app/visual-settings';
import { LATENCY_RANGE, sensorSettings } from '../app/sensor-settings';
import { requestOrientationPermission } from '../core/orientation-permission';
import CardMarks from '../components/CardMarks.vue';
import SmoothingSheet from '../components/SmoothingSheet.vue';
import StageButton from '../components/StageButton.vue';
import TeamPicker from '../components/TeamPicker.vue';
import BoxPvpPanel from '../components/BoxPvpPanel.vue';
import PokeBook from '../components/PokeBook.vue';
import { loadVillage, saveVillage } from '../app/village-store';
import { BATTLE_REWARDS_PER_DAY, battleRewardsLeft, claimBattleReward, dailyHelp, friendLevel, itemName } from '../core/village/life';
import type { VillageState } from '../core/village/life';
import { paintAccessory } from '../village/item-art';
import { dayKey } from '../core/trainer';
import type { PokemonType } from '../core/pokemon-data';
import { loadPinData } from '../app/services';
import { boxPvp, sendTeam, startBoxPvp } from '../app/box-pvp-store';
import type { BoxPvpStart } from '../app/box-pvp-store';
import { boxPvpBattle, BOX_PVP_LABELS_PT, BOX_PVP_MAX } from '../pvp/box-wire';
import type { BoxPvpMon, BoxPvpTeam } from '../pvp/box-wire';
import type { BoxMode } from '../box/box-scene';
import { CameraError, startRearCamera, stopCamera } from '../core/camera';
import { DEFAULT_PHONE_HEIGHT_M, PHONE_HEIGHT_RANGE } from '../box/floor';
import { browserDecoders, loadCreatureEntries } from '../box/load-creatures';
import type { RunningBox } from '../box/start-box';
import type { OrientationMode } from '../box/orientation-source';
import type { BoxCreature } from '../box/creature';
import type { BattleHud } from '../box/battle-director';
import { MEGA_ENERGY_COST } from '../core/mega';
import { WEATHER_EMOJI, WEATHER_LABELS_PT } from '../core/weather';
import { TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import { TEAM_NAMES_PT, TEAM_COLORS, BATTLE_MODE_HINTS_PT, BATTLE_MODE_LABELS_PT, BATTLE_MODES, planBattle, rosterBlocker, seededRng, STATUS_LABELS_PT, summarizeBattle } from '../core/battle';
import type { BattleMode, BattleSummary, Fighter, RosterSlot } from '../core/battle';
import { loadChunk } from '../app/stale-build';
import { abandonEndlessArena, ENDLESS_ARENA_LABELS, nextEndlessOpponent, resolveEndlessBattle, startEndlessArena } from '../core/endless-arena';
import type { EndlessArenaMode, EndlessArenaRun } from '../core/endless-arena';

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
const rosterRows = ref<{ id: string; name: string; shiny: boolean; mega: boolean }[]>([]);
/** Cartas Mega marcadas para mudar de forma na próxima batalha (cada uma custa MEGA_ENERGY_COST moedas). */
const megaPicks = ref<string[]>([]);
/** O que aconteceu com a forma Mega na última batalha montada (quem trocou, quem ficou normal e por quê). */
const megaNotes = ref<{ text: string; tone: 'ok' | 'warn' }[]>([]);
let megaNotesTimer: ReturnType<typeof setTimeout> | null = null;
/** Saldo único de moedas (`app/wallet.ts`): paga a forma Mega (antes era a energia do Treinador). */
const energy = computed(() => coins.value);
const megaWanted = computed(() => megaPicks.value.length);
const megaAffordable = computed(() => Math.floor(energy.value / MEGA_ENERGY_COST));
function toggleMega(id: string): void {
  megaPicks.value = megaPicks.value.includes(id) ? megaPicks.value.filter((x) => x !== id) : [...megaPicks.value, id];
}
function showMegaNotes(notes: { text: string; tone: 'ok' | 'warn' }[]): void {
  megaNotes.value = notes;
  if (megaNotesTimer) clearTimeout(megaNotesTimer);
  clearInterval(weatherTimer);
  clearInterval(heartTimer);
  if (stageSpeechTimer) clearTimeout(stageSpeechTimer);
  megaNotesTimer = notes.length > 0 ? setTimeout(() => (megaNotes.value = []), 9000) : null;
}
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
 * Veio do Fliperama ("Batalha na câmera", `?batalha=1`): um botão grande abre a câmera e o Batalhar fica em destaque.
 * A câmera não abre sozinha porque trocar de tela quebra o "toque" e o iOS só pede os sensores a partir de um toque.
 */
const battleShortcut = ref(arrival.has('batalha'));

onMounted(() => {
  if (arrival.has('pvp')) openPvp();
});
const picked = ref<{ name: string; detail: string; dexId?: number; shiny?: boolean; mega?: boolean } | null>(null);
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
/** Põe a intimidade nos lutadores da sua equipe (crítico e "aguentou firme"). */
function withBond(fighters: Fighter[]): Fighter[] {
  return fighters.map((f) => {
    const bond = bondOf(f.id);
    return bond > 0 ? { ...f, bond } : f;
  });
}

/** Ao montar a caixa: acessórios da Vila, corações dos mais próximos e a ajuda diária dos amigos. */
function applyVillage(): void {
  village = loadVillage();
  const current = box;
  if (!current) return;
  const today = dayKey(new Date());
  const notes: { text: string; tone: 'ok' | 'warn' }[] = [];
  for (const c of current.scene.creatureList) {
    const acc = village.wear.mons[c.info.id];
    c.setAccessory(acc ? paintAccessory(acc) : null);
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
  const current = box;
  if (!current || battleHud.value || phase.value !== 'running') return;
  const close = current.scene.creatureList.filter((c) => bondOf(c.info.id) >= 3 && !c.bubbleEmoji);
  const pick = close[Math.floor(Math.random() * close.length)];
  if (pick && Math.random() < 0.6) {
    pick.poke();
    pick.say(['❤️', '🥰', '😊', '💕'][Math.floor(Math.random() * 4)]!, 2000);
  }
}, 7000);

/** A turma da Caixa (cartas e Digital Pokémon) já com os sprites prontos para a cena. */
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
    if (!bookTypes.has(e.info.id)) void loadPinData(e.info.id, e.info.dexId).then((d) => d.profile && bookTypes.set(e.info.id, d.profile.types)).catch(() => undefined);
  }
}

/** O que foi carregado da sua equipe por último (a equipe do desafio sai daqui, sem os Pokémon do líder). */
let lastEntries: CreatureEntry[] = [];

// ---- Liga: desafio de Ginásio, Elite 4 ou Campeã (escolhido no Treinador)
const challenge = computed<Challenge | null>(() => (pendingChallenge.value ? challengeById(pendingChallenge.value) : null));
/** Os dois treinadores da batalha em cena (desafio ou PvP): aparecem nos cantos do visor. */
const versus = ref<{ me: { name: string; sprite: string }; them: { name: string; sprite: string; role: string } } | null>(null);
/** Fala dentro do visor (funciona também em tela cheia, onde o resto do app não aparece). */
const stageSpeech = ref<{ name: string; text: string; sprite: string } | null>(null);
let stageSpeechTimer: ReturnType<typeof setTimeout> | null = null;
let activeChallenge: Challenge | null = null;
let lastResult: BattleResult | null = null;
const endlessRun = ref<EndlessArenaRun | null>(null);
const endlessModes: readonly EndlessArenaMode[] = ['formatacao', 'restauracao'];
let endlessEntries: CreatureEntry[] = [];
let endlessFighters: Fighter[] = [];
let endlessTimer: ReturnType<typeof setTimeout> | null = null;

function clearEndlessTimer(): void {
  if (!endlessTimer) return;
  clearTimeout(endlessTimer);
  endlessTimer = null;
}

const endlessLabel = computed(() => endlessRun.value ? ENDLESS_ARENA_LABELS[endlessRun.value.mode] : null);

/** Encerra só a corrida contínua; a Caixa continua no chão para o jogador decidir o próximo passo. */
function finishEndlessRun(reason: string): void {
  const run = endlessRun.value;
  if (!run) return;
  clearEndlessTimer();
  const ended = abandonEndlessArena(run);
  const label = ENDLESS_ARENA_LABELS[ended.mode].title;
  showMegaNotes([{ text: `${label}: ${reason} Placar final ${ended.score} · ${ended.wins} vitória${ended.wins === 1 ? '' : 's'}.`, tone: ended.wins > 0 ? 'ok' : 'warn' }]);
  endlessRun.value = null;
  endlessEntries = [];
  endlessFighters = [];
}

/** Uma falha de carregamento não troca silenciosamente a corrida por uma batalha comum: ela fica encerrada até Desistir. */
function interruptEndlessRun(reason: string): void {
  const run = endlessRun.value;
  if (!run) return;
  clearEndlessTimer();
  const ended = abandonEndlessArena(run);
  const label = ENDLESS_ARENA_LABELS[ended.mode].title;
  endlessRun.value = ended;
  showMegaNotes([{ text: `${label}: ${reason} Placar ${ended.score} · ${ended.wins} vitória${ended.wins === 1 ? '' : 's'}.`, tone: ended.wins > 0 ? 'ok' : 'warn' }]);
}

function say(name: string, text: string, sprite: string, ms = 7000): void {
  stageSpeech.value = { name, text, sprite };
  if (stageSpeechTimer) clearTimeout(stageSpeechTimer);
  stageSpeechTimer = setTimeout(() => (stageSpeech.value = null), ms);
}

function cancelChallenge(): void {
  pendingChallenge.value = null;
}

/** Tira os Pokémon do adversário da caixa e volta a sua equipe. */
async function endVersus(): Promise<void> {
  if (!versus.value && !(box?.scene.creatureList.some((c) => isLeaderCreature(c.info.id)) ?? false)) return;
  versus.value = null;
  activeChallenge = null;
  activePvp = null;
  await populate();
}

// ---- PvP da Caixa (dois celulares)
const pvpOn = computed(() => boxPvp.peer !== null);
let activePvp: { myTeam: number; friend: string } | null = null;
let pvpTeamKey = '';
let pvpFighters: Fighter[] = [];

/** Monta (uma vez por equipe) os lutadores da sua equipe e manda ao amigo, com o aviso de caixa no chão. */
async function syncPvpTeam(): Promise<void> {
  if (!boxPvp.peer) return;
  const mine = lastEntries.slice(0, BOX_PVP_MAX);
  if (mine.length === 0) return;
  const key = mine.map((e) => e.info.id).join('|');
  if (key !== pvpTeamKey) {
    pvpTeamKey = key;
    pvpFighters = withBond(await prepareFighters(mine.map((e) => ({ id: e.info.id, name: shown(e.info.id, e.info.name), dexId: e.info.dexId })), loadBattle));
    if (key !== pvpTeamKey) return;
  }
  const mons: BoxPvpMon[] = mine.map((e, i) => ({ id: e.info.id, name: shown(e.info.id, e.info.name), sprite: e.info.dexId ?? 1, shiny: e.info.shiny === true, fighter: pvpFighters[i]! }));
  const team: BoxPvpTeam = { name: profile.name, trainer: profile.sprite, mons };
  sendTeam(team, phase.value === 'running');
}

watch(() => [boxPvp.peer, phase.value] as const, () => void syncPvpTeam());

/** Encena a luta combinada: as duas equipes na caixa, na ordem anfitrião → convidado, com a semente combinada. */
async function runPvp(start: BoxPvpStart): Promise<void> {
  const current = box;
  const mine = boxPvp.mine;
  const friend = boxPvp.friend;
  if (!current || !mine || !friend || !boxPvp.role || preparing.value) return;
  boxPvp.pending = null;
  const host = boxPvp.role === 'host' ? mine : friend;
  const guest = boxPvp.role === 'host' ? friend : mine;
  const battle = boxPvpBattle(host, guest, { host: start.host, guest: start.guest });
  preparing.value = true;
  error.value = '';
  hint.value = `Chamando a equipe de ${friend.name}…`;
  if (!fullscreen.value) {
    fullscreenForBattle = true;
    void toggleFullscreen();
  }
  try {
    if (versus.value) {
      current.stopBattle();
      await endVersus();
    }
    const myIds = new Set(mine.mons.map((m) => m.id));
    const isMine = (k: number) => (boxPvp.role === 'host' ? k < start.host : k >= start.host);
    const entries: CreatureEntry[] = [];
    for (let k = 0; k < battle.mons.length; k++) {
      const m = battle.mons[k]!;
      const own = isMine(k) && myIds.has(m.id) ? lastEntries.find((e) => e.info.id === m.id) : undefined;
      const info = { id: m.fighter.id, name: m.name, dexId: m.sprite, detail: isMine(k) ? mine.name : friend.name, shiny: m.shiny };
      if (own) {
        entries.push({ info, source: own.source });
        continue;
      }
      const sprite = await fetchSprite(m.sprite, undefined, { shiny: m.shiny });
      if (!sprite) throw new Error(`sem sprite para ${m.name}`);
      entries.push({ info, source: await decodeSprite(sprite) });
    }
    if (disposed || box !== current) return;
    current.setCreatures(entries);
    current.unlockAudio();
    battleCounted = false;
    activePvp = { myTeam: boxPvp.role === 'host' ? 0 : 1, friend: friend.name };
    const result = current.startBattle(battle.fighters, battle.plan, seededRng(start.seed));
    lastResult = result;
    battleFighters.value = battle.fighters;
    battleSummary.value = {
      mode: 'tres',
      winner: battle.plan.teamNames[result.winningTeam ?? 0] ?? '',
      turns: result.turns.length,
      rounds: result.turns.at(-1)?.round ?? 0,
      stats: summarizeBattle(battle.fighters, result),
    };
    // Os cantos seguem as cores das equipes: anfitrião à esquerda (vermelha), convidado à direita (azul).
    versus.value = {
      me: { name: host.name, sprite: trainerSpriteUrl(host.trainer) },
      them: { name: guest.name, sprite: trainerSpriteUrl(guest.trainer), role: `PvP · ${BOX_PVP_LABELS_PT[start.mode].title}` },
    };
  } catch (e) {
    error.value = `Não consegui montar a luta do PvP: ${e instanceof Error ? e.message : String(e)}`;
    activePvp = null;
    await populate();
  } finally {
    preparing.value = false;
    hint.value = '';
  }
}

// O convidado encena quando a luta chega e a caixa dele está no chão.
watch(
  () => [boxPvp.pending, phase.value] as const,
  ([pending, ph]) => {
    if (pending && boxPvp.role === 'guest' && ph === 'running') void runPvp(pending);
  },
);

async function populate(): Promise<void> {
  loadingCreatures.value = true;
  try {
    const cache = await getCache();
    // A turma escolhida (ou, sem escolha, as 6 mais recentes) é quem vai para a caixa — Digital Pokémon inclusive.
    const loaded = await loadTeamCreatures(cache);
    if (disposed || !box) return;
    box.setCreatures(loaded.entries);
    lastEntries = loaded.entries;
    applyVillage();
    void syncPvpTeam();
    for (const entry of loaded.entries) if (maybeGalladeSpeaks(entry.info)) break;
    population.value = { shown: loaded.entries.length, available: loaded.available, failed: loaded.failed.length };
    rosterRows.value = loaded.entries.map((e) => ({ id: e.info.id, name: shown(e.info.id, e.info.name), shiny: e.info.shiny === true, mega: e.info.mega === true }));
    megaPicks.value = megaPicks.value.filter((id) => rosterRows.value.some((r) => r.id === id && r.mega));
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
  box.setWeather(visual.weather);
  box.setSound(visual.sound);
  box.setMode(boxMode.value);
  phase.value = 'placing';
  hint.value = 'Aponte o celular para o chão onde a caixa vai ficar e toque em "Colocar a caixa aqui".';
  void populate();
}

function close(): void {
  clearEndlessTimer();
  endlessRun.value = null;
  endlessEntries = [];
  endlessFighters = [];
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
  picked.value = { name: shown(creature.info.id, creature.info.name), detail: creature.info.detail, dexId: creature.info.dexId, shiny: creature.info.shiny, mega: creature.info.mega };
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
watch(() => visual.weather, (mode) => box?.setWeather(mode));
watch(() => visual.sound, (on) => box?.setSound(on));

const canBattle = computed(() => phase.value === 'running' && population.value.shown >= (challenge.value || pvpOn.value ? 1 : 2) && !loadingCreatures.value && !preparing.value);
/** A Arena usa deliberadamente os seis marcados como Vermelha: a escalação deixa de ser um detalhe escondido. */
const endlessTeamEntries = computed(() => endlessShortcut.value ? lastEntries.slice(0, MAX_CHALLENGE_TEAM) : lastEntries.filter((entry) => slotOf(entry.info.id) === 0));
const canStartEndless = computed(() => phase.value === 'running' && endlessTeamEntries.value.length === MAX_CHALLENGE_TEAM && !loadingCreatures.value && !preparing.value && !pvpOn.value);
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
let battleCompanions: CardCompanion[] = [];
watch(
  () => battleHud.value?.phase,
  (phase) => {
    if (phase !== 'finished' || battleCounted) return;
    battleCounted = true;
    if (endlessRun.value && lastResult) {
      const previous = endlessRun.value;
      const next = resolveEndlessBattle(previous, endlessFighters, lastResult);
      endlessRun.value = next;
      const label = ENDLESS_ARENA_LABELS[next.mode].title;
      if (next.stopped) {
        showMegaNotes([{ text: `${label}: a corrida terminou. Placar ${next.score} · ${next.wins} vitória${next.wins === 1 ? '' : 's'}.`, tone: next.wins > 0 ? 'ok' : 'warn' }]);
        return;
      }
      showMegaNotes([{ text: `${label}: vitória ${next.wins}! Próxima batalha em instantes · ${next.score} pontos.`, tone: 'ok' }]);
      clearEndlessTimer();
      endlessTimer = setTimeout(() => void startEndlessWave(), 1800);
      return;
    }
    if (activePvp && lastResult) {
      const won = lastResult.winningTeam === activePvp.myTeam;
      recordEvent({ type: 'pvp', won });
      showMegaNotes([{ text: won ? `Você venceu ${activePvp.friend}!` : `${activePvp.friend} venceu desta vez.`, tone: won ? 'ok' : 'warn' }]);
      return;
    }
    const ch = activeChallenge;
    if (ch && lastResult) {
      const won = lastResult.winningTeam === 0;
      const outcome = recordLeagueResult(ch, won);
      say(`${ch.role} ${ch.leader}`, won ? ch.defeat : 'Boa luta! Treine sua equipe e volte quando quiser a revanche.', trainerSpriteUrl(ch.sprite), 9000);
      showMegaNotes([{ text: outcome.message, tone: won ? 'ok' : 'warn' }]);
      if (won) pendingChallenge.value = null;
      return;
    }
    if (lastResult) {
      const winners = new Set(battleWinners(battleFighters.value, lastResult));
      if (!recordCardVictories(battleCompanions.filter((mon) => winners.has(mon.id)), 'battle')) {
        error.value = cardJourneyError.value;
      }
    }
    recordEvent({ type: 'battle', team: battleSummary.value ? battleSummary.value.mode !== 'royale' : false });
    // Moedas da Vila: cada batalha terminada rende moedas, até BATTLE_REWARDS_PER_DAY vezes por dia.
    // Pela carteira (saldo único): grava na Vila viva ou na guardada, e o saldo mostrado acompanha.
    const today = dayKey(new Date());
    let gained = 0;
    let left = 0;
    withVillage((v) => {
      gained = claimBattleReward(v, today);
      left = battleRewardsLeft(v, today);
      return gained > 0;
    });
    village = loadVillage();
    if (gained > 0) {
      showMegaNotes([{ text: `+${gained} moedas! (${BATTLE_REWARDS_PER_DAY - left} de ${BATTLE_REWARDS_PER_DAY} hoje)`, tone: 'ok' }]);
    } else {
      showMegaNotes([{ text: `As batalhas de hoje já renderam as moedas (${BATTLE_REWARDS_PER_DAY} de ${BATTLE_REWARDS_PER_DAY}). Amanhã tem mais.`, tone: 'warn' }]);
    }
    battleShortcut.value = false;
  },
);

async function decodeSprite(sprite: { kind: 'gif' | 'static'; blob: Blob }) {
  return sprite.kind === 'gif'
    ? ({ kind: 'gif', gif: await browserDecoders.gif(sprite.blob) } as const)
    : ({ kind: 'image', image: await browserDecoders.image(sprite.blob) } as const);
}

/** Desafio da Liga: até 6 da sua caixa contra a equipe do líder, em revezamento. */
async function startChallenge(ch: Challenge): Promise<void> {
  const current = box;
  if (!current || preparing.value) return;
  if (statusOf(league.value, ch) === 'locked') {
    error.value = 'Esse desafio ainda está bloqueado: vença os anteriores primeiro.';
    return;
  }
  current.unlockAudio();
  if (versus.value) {
    current.stopBattle();
    await endVersus();
  }
  const mine = lastEntries.slice(0, MAX_CHALLENGE_TEAM);
  if (mine.length === 0) {
    error.value = 'Sua caixa está vazia: escaneie cartas ou escolha a turma antes do desafio.';
    return;
  }
  preparing.value = true;
  showSummary.value = false;
  showFilters.value = showTeam.value = showAdjust.value = showModes.value = false;
  if (!fullscreen.value) {
    fullscreenForBattle = true;
    void toggleFullscreen();
  }
  error.value = '';
  hint.value = `Chamando a equipe de ${ch.leader}…`;
  try {
    const leader = await loadLeaderEntries(ch, { fetchSprite: (dex) => fetchSprite(dex), decode: decodeSprite });
    if (leader.entries.length === 0) throw new Error('não consegui baixar a equipe do líder (sem conexão?)');
    if (disposed || box !== current) return;
    current.setCreatures([...mine, ...leader.entries]);
    hint.value = 'Preparando a batalha: buscando atributos e golpes…';
    const creatures = current.scene.creatureList;
    const raw = await prepareFighters(creatures.map((c) => ({ id: c.info.id, name: shown(c.info.id, c.info.name), dexId: c.info.dexId })), leaderLoader(loadBattle));
    if (disposed || box !== current) return;
    const fighters = raw.map((f, i) => (i >= mine.length ? leaderFighter(f, ch.power) : withBond([f])[0]!));
    const plan = challengePlan(mine.length, leader.entries.length, ch, profile.name);
    battleCounted = false;
    activeChallenge = ch;
    const result = current.startBattle(fighters, plan);
    lastResult = result;
    battleFighters.value = fighters;
    battleSummary.value = {
      mode: 'tres',
      winner: result.winningTeam === 0 ? profile.name : ch.leader,
      turns: result.turns.length,
      rounds: result.turns.at(-1)?.round ?? 0,
      stats: summarizeBattle(fighters, result),
    };
    versus.value = { me: { name: profile.name, sprite: trainerSpriteUrl(profile.sprite) }, them: { name: ch.leader, sprite: trainerSpriteUrl(ch.sprite), role: ch.role } };
    say(`${ch.role} ${ch.leader}`, ch.intro, trainerSpriteUrl(ch.sprite));
    if (leader.failed.length > 0) showMegaNotes([{ text: `Não carregaram da equipe do líder: ${leader.failed.join(', ')}.`, tone: 'warn' }]);
  } catch (e) {
    error.value = `Não consegui começar o desafio: ${e instanceof Error ? e.message : String(e)}`;
    activeChallenge = null;
    await populate();
    if (fullscreenForBattle) {
      fullscreenForBattle = false;
      void exitFullscreen();
    }
  } finally {
    preparing.value = false;
    hint.value = '';
  }
}

/** Abre uma corrida 6×6 da Arena. A equipe fica fixa, mas o oponente é materializado de verdade a cada onda. */
async function startEndless(mode: EndlessArenaMode): Promise<void> {
  const current = box;
  if (!current || preparing.value || pvpOn.value) return;
  const mine = endlessTeamEntries.value;
  if (mine.length !== MAX_CHALLENGE_TEAM) {
    error.value = endlessShortcut.value
      ? 'A Arena contínua precisa de uma turma com exatamente 6 Pokémon. Volte à Arena para organizá-la.'
      : 'A Arena contínua precisa de exatamente 6 Pokémon marcados em Vermelha na escalação.';
    showModes.value = true;
    return;
  }
  current.unlockAudio();
  if (versus.value) {
    current.stopBattle();
    await endVersus();
  }
  pendingChallenge.value = null;
  preparing.value = true;
  showSummary.value = false;
  showFilters.value = showTeam.value = showAdjust.value = showModes.value = false;
  if (!fullscreen.value) {
    fullscreenForBattle = true;
    void toggleFullscreen();
  }
  error.value = '';
  hint.value = 'Conferindo a sua equipe de 6 para a Arena…';
  try {
    const fighters = withBond(await prepareFighters(mine.map((c) => ({ id: c.info.id, name: shown(c.info.id, c.info.name), dexId: c.info.dexId })), loadBattle));
    if (disposed || box !== current) return;
    const run = startEndlessArena(mode, fighters);
    if (!run) throw new Error('a sua equipe precisa ter exatamente 6 Pokémon');
    endlessEntries = mine;
    endlessFighters = fighters;
    endlessRun.value = run;
    await startEndlessWave();
  } catch (e) {
    finishEndlessRun('não foi possível preparar a equipe.');
    error.value = `Não consegui começar a Arena: ${e instanceof Error ? e.message : String(e)}`;
    if (fullscreenForBattle) {
      fullscreenForBattle = false;
      void exitFullscreen();
    }
  } finally {
    preparing.value = false;
    hint.value = '';
  }
}

/** Materializa a próxima equipe adversária e começa outra batalha automática sem curar indevidamente o jogador. */
async function startEndlessWave(): Promise<void> {
  const current = box;
  const run = endlessRun.value;
  if (!current || !run || run.stopped || preparing.value && endlessFighters.length === 0) return;
  clearEndlessTimer();
  preparing.value = true;
  error.value = '';
  const label = ENDLESS_ARENA_LABELS[run.mode].title;
  hint.value = `${label}: escolhendo o próximo treinador…`;
  try {
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff) ^ (run.battles + 1) * 0x45d9f3b) >>> 0;
    const opponent = nextEndlessOpponent(seededRng(seed));
    const loaded = await loadArenaEntries(run.battles + 1, opponent.trainer, opponent.dexIds, { fetchSprite: (dex) => fetchSprite(dex), decode: decodeSprite });
    if (loaded.entries.length !== MAX_CHALLENGE_TEAM) {
      const missing = loaded.failed.length > 0 ? loaded.failed.join(', ') : 'a equipe adversária completa';
      throw new Error(`a onda não abriu porque não carregou: ${missing}`);
    }
    if (disposed || box !== current || endlessRun.value !== run || run.stopped) return;
    hint.value = 'Preparando atributos e golpes da próxima equipe…';
    current.setCreatures([...endlessEntries, ...loaded.entries]);
    const creatures = current.scene.creatureList;
    const raw = await prepareFighters(creatures.map((c) => ({ id: c.info.id, name: shown(c.info.id, c.info.name), dexId: c.info.dexId })), leaderLoader(loadBattle));
    if (disposed || box !== current || endlessRun.value !== run || run.stopped) return;
    if (raw.length !== MAX_CHALLENGE_TEAM * 2) throw new Error('a equipe adversária não ficou completa');
    const power = Math.min(1.72, 1.2 + run.wins * 0.035);
    const foes = raw.slice(MAX_CHALLENGE_TEAM).map((fighter) => leaderFighter(fighter, power));
    const fighters = [...endlessFighters, ...foes];
    const plan = {
      picks: Array.from({ length: fighters.length }, (_, i) => i),
      teams: fighters.map((_, i) => i < MAX_CHALLENGE_TEAM ? 0 : 1),
      relay: true,
      initialHp: [...run.hp, ...foes.map((fighter) => fighter.maxHp)],
      teamNames: [profile.name, opponent.trainer],
      banner: { text: label, sub: `Batalha ${run.battles + 1} · ${run.wins} vitórias · ${run.score} pontos` },
    };
    battleCounted = false;
    activeChallenge = null;
    const result = current.startBattle(fighters, plan, seededRng(seed ^ 0x9e3779b9));
    lastResult = result;
    battleCompanions = [];
    battleFighters.value = fighters;
    battleSummary.value = {
      mode: 'tres',
      winner: result.winningTeam === 0 ? profile.name : opponent.trainer,
      turns: result.turns.length,
      rounds: result.turns.at(-1)?.round ?? 0,
      stats: summarizeBattle(fighters, result),
    };
    versus.value = { me: { name: profile.name, sprite: trainerSpriteUrl(profile.sprite) }, them: { name: opponent.trainer, sprite: trainerSpriteUrl('ace'), role: 'Arena digital' } };
    say(opponent.trainer, `Seis contra seis. Vamos ver até onde sua equipe aguenta!`, trainerSpriteUrl('ace'));
  } catch (e) {
    if (endlessRun.value === run) interruptEndlessRun('a conexão não conseguiu montar a próxima onda.');
    error.value = `Não consegui abrir a próxima batalha da Arena: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    preparing.value = false;
    hint.value = '';
  }
}

async function startBattle(): Promise<void> {
  if (pvpOn.value) {
    if (boxPvp.role !== 'host') {
      error.value = 'No PvP quem começa a luta é o anfitrião.';
      return;
    }
    const start = startBoxPvp();
    if (!start) {
      error.value = 'Esperando a equipe do amigo chegar.';
      return;
    }
    return runPvp(start);
  }
  if (challenge.value) return startChallenge(challenge.value);
  const current = box;
  if (!current || preparing.value) return;
  if (versus.value) {
    current.stopBattle();
    await endVersus();
  }
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
    // Forma Mega (só desta batalha): deixa tudo pronto antes; as moedas só são cobradas depois que a batalha começa.
    restoreForms(current);
    const wanted = fighting.filter((c) => c.info.mega === true && megaPicks.value.includes(c.info.id));
    if (wanted.length > 0) hint.value = 'Preparando a forma Mega…';
    const megaPlan = await planMegaBattle(
      wanted.map((c) => ({ id: c.info.id, name: c.info.name, baseDexId: c.info.dexId, shiny: c.info.shiny })),
      energy.value,
      { prepare: prepareMegaFor, decode: decodeMegaSprite },
    );
    const fighters = withBond(await prepareFighters(fighting.map((c) => ({ id: c.info.id, name: shown(c.info.id, c.info.name), dexId: c.info.dexId })), megaAwareLoader(loadBattle, megaPlan.entries)));
    if (disposed || box !== current) return;
    battleCounted = false;
    for (const entry of megaPlan.entries) fighting.find((c) => c.info.id === entry.cardId)?.setForm(entry.source);
    let result;
    try {
      result = current.startBattle(fighters, plan.mode === 'royale' ? undefined : plan);
      lastResult = result;
      battleCompanions = fighting.flatMap((c) => c.info.dexId === undefined || c.info.digital ? [] : [{ id: c.info.id, dexId: c.info.dexId, name: c.info.name }]);
    } catch (e) {
      restoreForms(current);
      throw e;
    }
    const notes: { text: string; tone: 'ok' | 'warn' }[] = megaPlan.notes.map((text) => ({ text, tone: 'warn' }));
    if (megaPlan.cost > 0) {
      if (spendCoins(megaPlan.cost)) {
        const names = megaPlan.entries.map((e) => fighting.find((c) => c.info.id === e.cardId)?.info.name ?? 'Pokémon').join(', ');
        notes.unshift({ text: `${names}: forma Mega só nesta batalha (−${megaPlan.cost} moedas).`, tone: 'ok' });
        megaPicks.value = megaPicks.value.filter((id) => !megaPlan.entries.some((e) => e.cardId === id));
      } else {
        notes.unshift({ text: 'As moedas acabaram antes de a batalha começar; nada foi cobrado.', tone: 'warn' });
      }
    }
    showMegaNotes(notes);
    battleFighters.value = fighters;
    battleSummary.value = {
      mode: plan.mode,
      winner: result.winningTeam === undefined ? (fighters[result.winner]?.name ?? '') : `${TEAM_NAMES_PT[result.winningTeam] ?? 'A equipe'} (${fighters[result.winner]?.name ?? ''})`,
      turns: result.turns.length,
      rounds: result.turns.at(-1)?.round ?? 0,
      stats: summarizeBattle(fighters, result),
    };
  } catch (e) {
    restoreForms(current);
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

function startSelectedBattle(): void {
  if (endlessShortcut.value) void startEndless(endlessShortcut.value);
  else void startBattle();
}

/** Volta cada Pokémon à forma da carta (a Mega dura uma batalha só). */
function restoreForms(running: RunningBox | null): void {
  for (const creature of running?.scene.creatureList ?? []) creature.restoreForm();
}

async function decodeMegaSprite(ready: { sprite: { kind: 'gif' | 'static'; blob: Blob } }) {
  return ready.sprite.kind === 'gif'
    ? ({ kind: 'gif', gif: await browserDecoders.gif(ready.sprite.blob) } as const)
    : ({ kind: 'image', image: await browserDecoders.image(ready.sprite.blob) } as const);
}

function stopBattle(): void {
  if (endlessRun.value) finishEndlessRun('você desistiu da corrida.');
  box?.stopBattle();
  restoreForms(box);
  stageSpeech.value = null;
  void endVersus();
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
  for (const note of megaNotes.value) list.push({ text: note.text, tone: note.tone });
  if (battleHud.value) return list;
  if (hint.value) list.push({ text: hint.value, tone: phase.value === 'placing' ? 'ok' : 'busy' });
  if (pvpOn.value && !preparing.value) {
    const friend = boxPvp.friend?.name ?? 'o amigo';
    const sub = boxPvp.role === 'host'
      ? boxPvp.friend ? `${BOX_PVP_LABELS_PT[boxPvp.mode].title} · toque em Batalhar${boxPvp.friendPlaced ? '' : ` (${friend} ainda não colocou a caixa)`}` : 'Esperando a equipe do amigo…'
      : boxPvp.pending ? 'Coloque a caixa no chão para ver a luta.' : 'Esperando o anfitrião começar.';
    list.push({ text: `PvP com ${friend}`, sub, tone: 'ok', gold: true });
  } else if (endlessShortcut.value && !preparing.value) {
    const mode = ENDLESS_ARENA_LABELS[endlessShortcut.value];
    list.push({ text: `Arena Digital: ${mode.title}`, sub: phase.value === 'running' ? 'Toque em Começar para a primeira batalha 6×6.' : 'Coloque a Caixa no chão para iniciar a corrida 6×6.', tone: 'ok', gold: true });
  } else if (challenge.value && !preparing.value) {
    list.push({ text: `Desafio: ${challenge.value.role} ${challenge.value.leader}`, sub: 'Toque em Batalhar: até 6 da sua caixa contra a equipe do líder, um duelo por vez.', tone: 'ok', gold: true });
  } else if (battleShortcut.value && !preparing.value) {
    const left = battleRewardsLeft(village, dayKey(new Date()));
    list.push({
      text: 'Fliperama: batalha na câmera',
      sub: `${phase.value === 'running' ? 'Toque em Batalhar' : 'Coloque a caixa no chão e toque em Batalhar'} · ${left > 0 ? `+100 moedas (${left} de ${BATTLE_REWARDS_PER_DAY} hoje)` : 'as moedas de hoje já saíram'}`,
      tone: 'ok',
      gold: true,
    });
  }
  if (picked.value) {
    list.push({ text: `${picked.value.name}${picked.value.dexId ? ` · Nº ${picked.value.dexId}` : ''}${picked.value.shiny ? ' · Shiny' : ''}${picked.value.mega ? ' · Mega' : ''}`, sub: picked.value.detail, tone: 'ok', gold: true });
  }
  if (cameraOn.value && mode.value === 'manual') {
    list.push({ text: 'Este aparelho não enviou dados dos sensores de movimento. Arraste na imagem para olhar em volta.', tone: 'warn' });
  }
  if (cameraOn.value && loadingCreatures.value) list.push({ text: 'Chamando os Pokémon…', tone: 'busy' });
  else if (cameraOn.value && population.value.available === 0) {
    list.push({ text: 'A caixa está vazia. Escaneie uma carta (aba Escanear) ou carregue suas cartas (aba Cartas) para os Pokémon aparecerem aqui.', tone: 'warn' });
  } else if (phase.value === 'running' && population.value.shown === 1) {
    list.push({ text: 'Para batalhar, ponha pelo menos 2 Pokémon na turma da Caixa.', tone: 'warn' });
  }
  return list;
});
/** Clima atual (o ciclo muda sozinho): lido da cena a cada poucos segundos para a linha de resumo. */
const weatherLabel = ref('');
const weatherTimer = setInterval(() => {
  const now = box?.scene.weatherNow;
  weatherLabel.value = now ? `${WEATHER_EMOJI[now.kind]} ${WEATHER_LABELS_PT[now.kind]}` : '';
}, 2000);
/** Linha de resumo fixa (pequena) enquanto a caixa está montada e nada mais pede atenção. */
const populationNote = computed(() => {
  if (phase.value !== 'running' || battleHud.value || loadingCreatures.value || population.value.available === 0) return '';
  const { shown, available, failed } = population.value;
  const more = available > shown ? ` (de ${available} guardados)` : '';
  const broken = failed > 0 ? ` · ${failed} sprite(s) sem leitura` : '';
  const sky = weatherLabel.value ? ` · ${weatherLabel.value}` : '';
  return `${shown} Pokémon na caixa${more}${broken}${sky} · toque num Pokémon para ver quem é`;
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
  if (megaNotesTimer) clearTimeout(megaNotesTimer);
  if (pickedTimer) clearTimeout(pickedTimer);
  close();
});
</script>

<template>
  <section class="card" aria-labelledby="box-title">
    <h2 id="box-title">Caixa em AR</h2>
    <p class="note">
      Sua turma de até 40 Pokémon passeia solta num quadrado do chão. Gire o celular para olhar em volta. Quem entra na
      turma você escolhe em <a :href="routeHref('cartas')">Minhas cartas</a>; quem luta em cada batalha (a equipe) é
      escolhido na escalação.
    </p>

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
        <button v-if="phase === 'placing'" type="button" class="primary stage-cta" @click="placeHere">Colocar a caixa aqui</button>
        <SmoothingSheet v-if="showFilters && cameraOn" battle @close="showFilters = false" />
        <div v-if="showSummary && battleSummary && battleHud?.phase === 'finished'" class="stage-sheet battle-summary" @pointerdown.stop @pointerup.stop @click.stop>
          <header>
            <strong>{{ battleSummary.winner }} venceu</strong>
            <button type="button" class="link" @click="showSummary = false">Fechar</button>
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
        <div v-if="showModes && cameraOn && !battling" class="stage-sheet battle-team-sheet" role="dialog" aria-label="Equipe de batalha" @pointerdown.stop @pointerup.stop @click.stop>
          <header>
            <strong>Equipe de batalha</strong>
            <button type="button" class="link" @click="showModes = false">Fechar</button>
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
            <small v-if="endlessTeamEntries.length !== MAX_CHALLENGE_TEAM">Vermelha: {{ endlessTeamEntries.length }}/{{ MAX_CHALLENGE_TEAM }} · selecione exatamente 6 para liberar.</small>
          </section>
          <p class="hint">3 · Escale os Pokémon abaixo. Para mudar quem passeia na Caixa AR, abra Quem passeia.</p>
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
        <div v-if="showTeam && cameraOn" class="stage-sheet" @pointerdown.stop @pointerup.stop @click.stop>
          <header>
            <strong>Turma da Caixa</strong>
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
          <StageButton v-if="!battling" icon="team" label="Quem passeia" :active="showTeam" @click="showTeam = !showTeam; showFilters = false; showAdjust = false; showModes = false" />
          <StageButton v-if="!battling" icon="sliders" label="Ajustes" :active="showAdjust" @click="showAdjust = !showAdjust; showFilters = false; showTeam = false; showModes = false" />
          <StageButton v-if="!battling" :icon="boxMode === 'passeio' ? 'formation' : 'wander'" :label="boxMode === 'passeio' ? 'Formação' : 'Passeio'" @click="toggleMode" />
          <StageButton v-if="!battling" icon="modes" :label="BATTLE_MODE_LABELS_PT[battleMode]" :active="showModes" @click="showModes = !showModes; showFilters = false; showTeam = false; showAdjust = false" />
          <StageButton v-if="!battling && phase === 'running'" icon="battle" :label="preparing ? 'Preparando…' : endlessShortcut ? `Começar ${ENDLESS_ARENA_LABELS[endlessShortcut].title}` : 'Batalhar'" :disabled="endlessShortcut ? !canStartEndless : !canBattle" :attention="endlessShortcut ? canStartEndless && !preparing : battleShortcut && canBattle && !preparing" @click="startSelectedBattle" />
          <StageButton v-if="battling && battleHud?.phase === 'finished' && !endlessRun" icon="battle" label="De novo" @click="startBattle" />
          <StageButton v-if="battling && battleHud?.phase === 'finished' && battleSummary" icon="panel" label="Resumo" :active="showSummary" @click="showSummary = !showSummary" />
          <StageButton v-if="battling" icon="adjust" label="Centrar" @click="box?.recenterBattle()" />
          <StageButton v-if="battling" icon="stop" :label="endlessRun ? `Desistir · ${endlessRun.score}` : 'Parar'" @click="stopBattle" />
          <StageButton v-if="phase === 'running' && !battling" icon="move" label="Mover" @click="moveBox" />
          <StageButton v-if="challenge && !battling" icon="close" label="Sem desafio" @click="cancelChallenge" />
          <StageButton icon="close" label="Fechar" @click="close" />
        </div>
      </div>
    </div>

    <div v-if="challenge && !immersive" class="challenge-card">
      <img :src="trainerSpriteUrl(challenge.sprite)" alt="" width="72" height="72" />
      <span>
        <strong>Desafio: {{ challenge.role }} {{ challenge.leader }}</strong>
        <small>Abra a câmera, coloque a caixa e toque em Batalhar. Até 6 da sua caixa lutam contra a equipe do líder, um duelo por vez.</small>
        <button type="button" class="link" @click="cancelChallenge">Cancelar desafio</button>
      </span>
    </div>

    <div class="actions">
      <button type="button" class="primary" :class="{ 'battle-cta': battleShortcut }" :disabled="phase !== 'idle'" @click="open">
        {{ phase === 'starting' ? 'Abrindo…' : endlessShortcut ? `⚔️ Abrir câmera · ${ENDLESS_ARENA_LABELS[endlessShortcut].title}` : battleShortcut ? '⚔️ Abrir câmera e batalhar' : 'Abrir câmera e sensores' }}
      </button>
      <a v-if="battleShortcut || endlessShortcut" class="button" :href="routeHref(endlessShortcut ? 'arena' : 'vila')">{{ endlessShortcut ? 'Voltar à Arena' : 'Voltar à Vila' }}</a>
    </div>

    <p v-if="error && !immersive" class="message error" role="alert">{{ error }}</p>

    <details v-if="!immersive" class="layout" :open="bookOpen" @toggle="(e: Event) => (e.target as HTMLDetailsElement).open !== bookOpen && void openBook()">
      <summary>Livro dos Pokémon (opiniões, humor e intimidade)</summary>
      <p v-if="bookList.length === 0" class="hint">Nenhum Pokémon na turma da Caixa ainda. Escaneie cartas para começar o livro.</p>
      <PokeBook v-else :mons="bookMons" :friends="village.friends" :nicks="bookNicks" :nick-note="bookNote" @nickname="onBookNickname" />
    </details>

    <details v-if="!immersive" ref="pvpEl" class="layout" :open="pvpOn || pvpOpen" @toggle="(e: Event) => (pvpOpen = (e.target as HTMLDetailsElement).open)">
      <summary>Batalhar com um amigo (PvP)</summary>
      <BoxPvpPanel />
    </details>
  </section>
</template>
