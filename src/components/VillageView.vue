<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { getCache, getDigitalSprite, getLocalVillageSprite, getLocalVillageSpriteDirs, getVillageAtlas, getVillageGroundTile, loadPinData, resolveSpeciesByDexId } from '../app/services';
import { resolveTeam } from '../app/team';
import { savedTeam } from '../app/team-store';
import { profile } from '../app/profile-store';
import { effectiveVisual, visual } from '../app/visual-settings';
import { villageArSettings } from '../app/village-ar-settings';
import { attachLiveVillage, detachLiveVillage, syncCoins } from '../app/wallet';
import { loadVillage, requestPersistence, saveVillage, villageMap } from '../app/village-store';
import { browserDecoders, loadCreatureEntries } from '../box/load-creatures';
import { gameShortcutOf, routeHref } from '../app/route';
import type { GameShortcut, VilaExit } from '../app/route';
import { handleDialogEscape, isGameKeyboardControl } from '../app/game-keyboard';
import { stopCamera } from '../core/camera';
import type { RunningVillageAr } from '../ar/start-village';
import { VILLAGE_SCALE_RANGE, normalizeVillageScale } from '../core/village/ar-diorama';
import { canNickname, displayName, MAX_NICK_LEN, nickIdeas, nicknameOf, setNickname } from '../core/village/nickname';
import { minimapPixels, minimapTileAt } from '../village/minimap';
import { loadTrainerAtlas } from '../village/trainer-atlas';
import { recordEvent, trainer } from '../app/trainer-store';
import { claimPrizes } from '../core/village/rewards';
import { ensureModeStories } from '../core/village/mode-stories';
import { challengeGalleryUnlocked, completedChallengeExhibits } from '../core/village/challenge-gallery';
import BackpackView from './BackpackView.vue';
import VillageSheetHeader from './VillageSheetHeader.vue';
import { villageSheetCloseAction } from '../core/village/sheet-close';
import { wrappedFocusIndex } from '../core/village/sheet-focus';
import HoOhWishCutscene from './HoOhWishCutscene.vue';
import LegendaryCutscene from './LegendaryCutscene.vue';
import VillageLegends from './VillageLegends.vue';
import { legendStoryOf } from '../core/village/legendary-stories';
import type { LegendStory } from '../core/village/legendary-stories';
import { inspectLegendClue, investigationPlace, legendDiaryPage, legendStep, nearbyLegendClues, openLegendClues } from '../core/village/legendary-investigation';
import { isLegendUnlocked, unlockedLegendRegions } from '../core/village/legendary-unlock';
import { league } from '../app/league-store';
import type { DecodedGif } from '../core/gif';
import MinigameHub from './MinigameHub.vue';
import MinigameSobrevivencia from './MinigameSobrevivencia.vue';
import { SURVIVOR_LOVE_CANDY_MS, SURVIVOR_MEGA_SHARD_MS, SURVIVOR_TRUST_STONE_MS } from '../core/survivor';
import { dayKey, levelOf } from '../core/trainer';
import { personalityOf } from '../core/village/personality';
import { trainerSpriteUrl } from '../core/trainer-sprites';
import { ACCESSORY_IDS, COOK_IDS, CRAFT_IDS, FURNITURE_IDS, itemDef, ITEMS, shopToday } from '../core/village/catalog';
import {
  add, buy, canFollow, claimFriendMilestones, cook, count, craft, dailyHelp, describeCost, fish, FISH_PER_DAY, friendLevel, friendOf, friendProgressText, giveGift, harvest, harvestCrop, HOUSE_LEVELS, itemName, pickUp, place,
  plant, pruneHarvest, RECIPES, sell, talk, tickCrops, upgradeHouse, water, wear,
  BATTLE_REWARD_COINS, BATTLE_REWARDS_PER_DAY, battleRewardsLeft, favoriteFoodOf,
} from '../core/village/life';
import { albumEntries, albumProgress, catchUp, makeEnv, pickMoment, recentGossip, recordFriendMilestone, relationMap, relationsOf, resolveScene, savedMoments, sceneChoice, setFavorite, unreadCount } from '../core/village/social';
import {
  canAffordSummon, canEvolve, COIN_SUMMON_COST, COIN_SUMMON_ENABLED, evolve, EVOLVE_COST, grantStarter, grantSurvival, instanceOf, LAST_DEX_ID, pickAnySpecies,
  pickFonteSpecies, summon, SUMMON_COST, summonWithCoins,
} from '../core/village/digital';
import { wishAtFountain } from '../core/village/fountain';
import type { DigitalPokemonInstance, SpeciesRef } from '../core/village/digital';
import { celebiDiaryPage, dismissActive, legendaryEffects, legendaryOf, rollLegendary } from '../core/village/legendary';
import type { LegendaryEffects } from '../core/village/legendary';
import { ALL_QUESTIONS, FONTE_POOL, isComplete as quizComplete, nextForm, resolveStarter } from '../core/village/starter-quiz';
import type { QuizAnswers } from '../core/village/starter-quiz';
import { claimRequest, ensureRequests, requestStatus } from '../core/village/requests';
import type { VillageRequest } from '../core/village/requests';
import { completeFestival, discoverAt, festivalRound, requestInfluence, resolveExpeditions, startExpedition, weeklyEventFor, weeklyModifiers } from '../core/village/world-progress';
import type { DiscoveryPlace, WeeklyEvent } from '../core/village/world-progress';
import type { Resolved, Scene } from '../core/village/social';
import { FX_EMOJI, MAX_DIARY, MAX_SAVED, MOMENT_EMOJI, MOMENT_KINDS, MOMENT_LABELS, trimMoments } from '../core/village/social-state';
import { applyFollow, canAsk, markAsked, pickEcho, pickFollow, pickQuestion, QUESTION_BY_ID, recordAnswer, wordOf } from '../core/village/quiz';
import type { Follow, Question } from '../core/village/quiz';
import {
  assignHomes, CAFE_PRICE, cafeVisit, HOME_DECORS, HOME_STAGES, homeComment, homeDecor, homeLevel, homeOf, knockDoor, LOTS, nextUnlock, paintRoof, PAINT_COST, residentsOf, ROOFS, roofIndex,
  HOME_EXTERIOR_STYLES, homeStyleOf, personalizeResidentHomes, setHomeStyle, toggleDecor, townStage, unlockedBetween, upgradeHome,
} from '../core/village/town';
import type { Building } from '../core/village/town';
import type { Moment, MomentKind } from '../core/village/social-state';
import type { ItemId } from '../core/village/life';
import { homePickUp, homePlace } from '../core/village/home-interior';
import HomeInteriorMap from './HomeInteriorMap.vue';
import { advanceResidentHomes } from '../core/village/home-autonomy';
import { chooseServiceResidents, professionActive } from '../core/village/professions';
import { LEISURE_SPOTS } from '../core/village/expansion';
import { enjoyVillagePlace } from '../core/village/leisure';
import { dailyRecap, needsDailyRecap } from '../core/village/daily-recap';
import type { RecapScene } from '../core/village/daily-recap';
import { villageSummary } from '../core/village/summary';
import type { SummaryEntry } from '../core/village/summary';
import { advanceCommunity, communityForecast, decideCommunityProject } from '../core/village/community';
import { FarmSession } from '../core/village/farm';
import type { FarmTask } from '../core/village/farm';
import FarmSeedBox from './FarmSeedBox.vue';
import VillageWorksites from './VillageWorksites.vue';
import { WORK_SITES } from '../core/village/town-layout';
import type { WorksiteId } from '../core/village/town-layout';
import { GUIDED_DESTINATIONS, guidedWalkArrived, guidedWalkProgress } from '../core/village/guided-walk';
import type { Dir } from '../core/village/actors';
import { stickDirs, stickVector } from '../core/village/joystick';
import type { PokemonType } from '../core/pokemon-data';
import { paintItemIcon } from '../village/item-art';
import { VillageGame } from '../village/village-game';
import type { VillageMon } from '../village/village-game';
import { SoundEngine } from '../box/sound';
import MusicControls from './MusicControls.vue';
import { MusicPlayer } from '../app/music-player';
import { villageAudio } from '../app/village-audio-settings';
import { advanceMusicTransition, transitionMusicMix, villageMusicTrack } from '../core/music';
import type { MusicTransition } from '../core/music';
import type { SoundCue } from '../box/sound-recipes';
import MomentCard from './MomentCard.vue';
import PokeBook from './PokeBook.vue';
import { unlocksAt } from '../core/village/book';
import CardEvolutionPanel from './CardEvolutionPanel.vue';
import { loadCardCompanionEntry } from '../app/companion-creatures';
import { companionCard } from '../app/card-evolution-store';
import type { CachedCard } from '../cache/types';
import QuizDialog from './QuizDialog.vue';
import { generateDailyMail, mailActionLabel, mailKindLabel, markMailRead, queueMomentMail, respondToMail } from '../core/village/mail';
import type { MailAction } from '../core/village/mail';

/** Modo vida da Caixa: a Vila, sem câmera, com controle na tela. */
/** `close` sai da Vila; com `'pvp'` a Caixa abre o PvP em seguida (a Vila mora dentro da Caixa, então não há troca de tela). */
/** `then`: para onde ir ao sair (Caixa com PvP, batalha na câmera ou desafio da Liga); sem nada, volta à tela anterior. */
const emit = defineEmits<{ close: [then?: VilaExit] }>();

const canvasEl = ref<HTMLCanvasElement | null>(null);
const dioramaFloorEl = ref<HTMLCanvasElement | null>(null);
const dioramaPropsEl = ref<HTMLCanvasElement | null>(null);
const arVideoEl = ref<HTMLVideoElement | null>(null);
const wrapEl = ref<HTMLElement | null>(null);
const loading = ref('Abrindo a sua Vila…');
const toast = ref('');
const idleGuideDismissed = ref(false);
const clock = ref('');
const map = villageMap();
const state = reactive(loadVillage());
const towerGameRef = ref<{ requestLeave: () => void } | null>(null);
const day = ref(dayKey(new Date()));
pruneHarvest(state, day.value);

type Sheet = null | 'menu' | 'build' | 'home' | 'shop' | 'dress' | 'arcade' | 'torre' | 'gallery' | 'card-evolution' | 'farm';
const sheet = ref<Sheet>(null);
const cardEvolutionAtAltar = ref(false);
const backpackOpen = ref(false);
type Tab = 'inicio' | 'resumo' | 'expedicoes' | 'mochila' | 'fabricar' | 'cozinha' | 'diario' | 'album' | 'colecao' | 'livro' | 'visual' | 'trabalhos' | 'lendas' | 'correio';
const tab = ref<Tab>('inicio');
const arActive = ref(false);
const arAnchored = ref(false);
const arScale = ref(villageArSettings.scale);
let arStream: MediaStream | null = null;
let villageAr: RunningVillageAr | null = null;
const arLook = ref<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);

function placeVillageAr(): void {
  const result = villageAr?.recenter();
  if (!result) return;
  if (!result.ok) return say(result.message, 4500);
  arAnchored.value = true;
  say('Âncora criada no ponto escolhido. Gire e incline o celular para observar a cidade.', 4500);
}

function placeVillageArAt(event: PointerEvent): void {
  if (!arActive.value || !villageAr || !wrapEl.value) return;
  const bounds = wrapEl.value.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const result = villageAr.placeAt(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
  if (!result.ok) return say(result.message, 4500);
  arAnchored.value = true;
  say('Âncora movida para o ponto escolhido.', 3000);
}

/** Com sensor, o celular gira a visão. Sem sensor, arrastar oferece a mesma inspeção sem mover a âncora. */
function arPointerDown(event: PointerEvent): void {
  if (!arActive.value) return;
  arLook.value = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  (event.currentTarget as HTMLCanvasElement).setPointerCapture?.(event.pointerId);
}
function arPointerMove(event: PointerEvent): void {
  const look = arLook.value;
  if (!look || look.pointerId !== event.pointerId || !villageAr) return;
  const dx = event.clientX - look.x;
  const dy = event.clientY - look.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) look.moved = true;
  if (look.moved) villageAr.lookBy(dx, dy);
  look.x = event.clientX;
  look.y = event.clientY;
}
function arPointerUp(event: PointerEvent): void {
  const look = arLook.value;
  if (!look || look.pointerId !== event.pointerId) return;
  arLook.value = null;
  if (!look.moved) placeVillageArAt(event);
}

function setVillageArScale(value: number): void {
  const next = normalizeVillageScale(value);
  arScale.value = next;
  villageArSettings.scale = next;
  villageAr?.setScale(next);
}

function stopArBeta(): void {
  villageAr?.stop();
  villageAr = null;
  stopCamera(arVideoEl.value, arStream);
  arStream = null;
  arActive.value = false;
  arAnchored.value = false;
  game?.setDioramaView(false);
  if (wrapEl.value) game?.resize(wrapEl.value.clientWidth, wrapEl.value.clientHeight);
}

/**
 * Menu da Vila: uma entrada só (o botão "☰ Menu" do canto ou o B, que abrem o mesmo menu), com blocos grandes em grupos
 * claros — você, fazer, Pokémon, memórias, os lugares da Vila (direto, sem andar até a porta) e o resto do app. Cada
 * bloco abre a seção de sempre, com "← Menu" para voltar.
 */
interface MenuTile { tab?: Tab; href?: string; run?: () => void; disabled?: boolean; icon: string; label: string; hint?: string; badge?: number }
const MENU_TITLES: Record<Tab, string> = {
  inicio: 'Menu da Vila', resumo: 'Resumo da Vila', expedicoes: 'Expedições', mochila: 'Mochila', fabricar: 'Fabricar', cozinha: 'Cozinha', diario: 'Diário de Momentos', correio: 'Correio da Vila',
  album: 'Álbum de Memórias', colecao: 'Coleção de Móveis', livro: 'Livro dos Pokémon', visual: 'Visual e Acessórios', trabalhos: 'Trabalhos da Vila', lendas: 'Caderno de Lendas',
};
/** Um lugar da Vila aberto direto pelo menu (ou trancado, com o nível que falta). */
function placeTile(kind: 'arcade' | 'arena' | 'torre', icon: string, label: string, opt: { bonk?: boolean; hint?: string } = {}): MenuTile {
  const b = map.buildings.find((x) => x.kind === kind);
  const open = !!b && level.value >= b.unlock;
  return {
    icon,
    label,
    disabled: !open,
    hint: open ? opt.hint : `🔒 nível ${b?.unlock ?? '?'}`,
    run: () => openPlace(kind, opt.bonk === true),
  };
}
/** Abre um jogo direto (menu e atalhos de endereço), com o aviso do nível que falta quando ainda está trancado. */
function openPlace(kind: 'arcade' | 'arena' | 'torre', bonk = false): void {
  const b = map.buildings.find((x) => x.kind === kind);
  if (!b) return;
  if (level.value < b.unlock) {
    say(`${b.name} abre no nível ${b.unlock}.`);
    return;
  }
  if (kind === 'torre') {
    towerStartBonk.value = bonk;
    sheet.value = 'torre';
  } else openGameBuilding(b);
}
/** Modo BONK já escolhido ao abrir a Torre (atalho do menu ou do endereço). */
const towerStartBonk = ref(false);
/** Atalho de jogo pedido pelo endereço (`#/vila?torre=1`): abre na chegada, depois dos avisos de boas-vindas. */
let pendingGame: GameShortcut | null = gameShortcutOf(window.location.hash);
function openRequestedGame(): void {
  const game = pendingGame;
  if (!game || dialog.value || legendaryScene.value || hoOhWishScene.value || sheet.value) return;
  pendingGame = null;
  // Tira o atalho do endereço: recarregar ou voltar não deve reabrir o jogo.
  window.history.replaceState(null, '', routeHref('vila'));
  if (game === 'coliseu') openPlace('arena');
  else openPlace('torre', game === 'bonk');
}
const menuGroups = computed<{ title: string; desc?: string; tiles: MenuTile[] }[]>(() => [
  {
    title: 'Jogar',
    desc: 'Direto aos jogos, sem andar até o prédio.',
    tiles: [placeTile('torre', '🗼', 'Survival', { hint: 'Torre de Sobrevivência' }), placeTile('torre', '💥', 'BONK', { bonk: true, hint: 'Torre em 3D' }), placeTile('arena', '⚔️', 'Arena', { hint: 'Coliseu' })],
  },
  {
    title: 'Você',
    tiles: [
      { tab: 'mochila', icon: '🎒', label: 'Mochila', hint: inventory.value.length > 0 ? `${inventory.value.length} tipo(s)` : 'vazia' },
      { tab: 'visual', icon: '🎨', label: 'Visual e acessórios' },
    ],
  },
  {
    title: 'Fazer',
    tiles: [
      { tab: 'trabalhos', icon: '🛠️', label: 'Trabalhos da Vila', hint: 'fazenda, mina, madeira e pesca' },
      { tab: 'fabricar', icon: '🔨', label: 'Fabricar' },
      { tab: 'cozinha', icon: '🍳', label: 'Cozinha' },
    ],
  },
  {
    title: 'Pokémon e memórias',
    tiles: [
      { tab: 'resumo', icon: '🗞️', label: 'Resumo da Vila', hint: 'o que aconteceu e mudou' },
      { tab: 'expedicoes', icon: '🧭', label: 'Expedições', hint: 'mande um Pokémon explorar' },
      { tab: 'livro', icon: '📖', label: 'Livro dos Pokémon', hint: 'amizade e apelidos' },
      { tab: 'lendas', icon: '✨', label: 'Caderno de Lendas', hint: 'pistas, encontros e lembranças' },
      { tab: 'diario', icon: '📔', label: 'Diário', hint: unread.value > 0 ? `${unread.value} novo(s)` : undefined },
      { tab: 'album', icon: '📸', label: 'Álbum' },
      { tab: 'colecao', icon: '🏆', label: 'Coleção' },
    ],
  },
  {
    title: 'Lugares da Vila',
    tiles: [{ icon: '📬', label: 'Correio', hint: mailUnread.value > 0 ? `${mailUnread.value} nova(s)` : 'cartas e momentos', badge: mailUnread.value || undefined, run: openMail }, placeTile('arcade', '🕹️', 'Fliperama')],
  },
  {
    title: 'Fora da Vila',
    tiles: [
      { icon: '📷', label: 'Diorama AR', hint: 'temporariamente indisponível', disabled: true },
      { href: routeHref('treinador'), icon: '🏅', label: 'Passaporte', hint: `Nv. ${level.value}` },
    ],
  },
  {
    title: 'Atividades Externas',
    desc: 'Outros modos e conexões do app',
    tiles: [
      { href: routeHref('cartas'), icon: '🃏', label: 'Minhas Cartas' },
      { href: routeHref('pins'), icon: '🎯', label: 'Mini Pins' },
      { href: routeHref('escanear'), icon: '📷', label: 'Escanear Carta' },
    ],
  },
]);
type MenuSection = 'vila' | 'historias' | 'lugares' | 'modos';
const menuSection = ref<MenuSection>('vila');
const menuSections: { id: MenuSection; label: string; icon: string; groups: string[] }[] = [
  { id: 'vila', label: 'Minha Vila', icon: '🏡', groups: ['Jogar', 'Você', 'Fazer'] },
  { id: 'historias', label: 'Histórias', icon: '📖', groups: ['Pokémon e memórias'] },
  { id: 'lugares', label: 'Lugares', icon: '🗺️', groups: ['Lugares da Vila'] },
  { id: 'modos', label: 'Outros modos', icon: '🎮', groups: ['Fora da Vila', 'Atividades Externas'] },
];
const visibleMenuGroups = computed(() => {
  const selected = menuSections.find((section) => section.id === menuSection.value);
  return menuGroups.value.filter((group) => selected?.groups.includes(group.title));
});
const shopTab = ref<'comprar' | 'vender'>('comprar');
const dressFor = ref<string>('player');
const dialog = ref<{ id?: string; name: string; text: string; actions: { label: string; run: () => void; disabled?: boolean }[] } | null>(null);
const mailUnread = computed(() => state.mail.inbox.filter((entry) => !entry.read).length);
/** O morador em destaque no minimapa enquanto uma conversa ou momento está acontecendo. */
const minimapSpeakerId = ref<string | null>(null);
/** Texto curto para a rota atual, sem transformar o minimapa em outro menu. */
const minimapRoute = ref('');
let dialogFocusReturn: HTMLElement | null = null;
let sheetFocusReturn: HTMLElement | null = null;
let quizOpenFocusReturn: HTMLElement | null = null;
let focusedVillageAction: HTMLElement | null = null;
function focusWithArrowIndicator(target: HTMLElement | undefined): void {
  if (!target) return;
  document.querySelector<HTMLElement>('.arrow-focus')?.classList.remove('arrow-focus');
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  target.classList.add('arrow-focus');
}
function rememberVillageActionFocus(event: FocusEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.closest('.village-pad')) return;
  focusedVillageAction = target.closest('.legend-cutscene, .village-sheet, .village-dialog, .quiz-dialog') ? target : null;
}
function focusFirstVillageAction(selector: string): void {
  const panel = document.querySelector<HTMLElement>(selector);
  const candidates = [...(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]') ?? [])]
    .filter((element) => element.getClientRects().length > 0 && !element.closest('[inert]'));
  const first = candidates.find((element) => !element.matches('.menu-close, .bc-close, .village-close, .village-sheet-close') && element.textContent?.trim() !== 'Fechar') ?? candidates[0];
  focusWithArrowIndicator(first);
}
watch(sheet, (next, previous) => {
  if (next && !previous) sheetFocusReturn = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  if (next && next !== previous) void nextTick(() => { if (sheet.value === next) focusFirstVillageAction('.village-sheet'); });
  if (!next && previous) {
    const target = sheetFocusReturn;
    sheetFocusReturn = null;
    void nextTick(() => { if (!sheet.value) (target?.isConnected ? target : wrapEl.value)?.focus(); });
  }
});
watch(tab, (next, previous) => {
  if (next !== previous && sheet.value === 'menu') void nextTick(() => {
    focusFirstVillageAction('.village-sheet');
    const panel = document.querySelector<HTMLElement>('.village-sheet');
    if (panel) panel.scrollTop = 0;
  });
});
watch(dialog, (next, previous) => {
  if (next?.id && mons.value.some((mon) => mon.id === next.id)) minimapSpeakerId.value = next.id;
  else if (!next) minimapSpeakerId.value = null;
  if (next && !previous) dialogFocusReturn = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  if (next && !previous) void nextTick(() => focusFirstVillageAction('.village-dialog'));
  if (!next && previous) {
    const target = dialogFocusReturn;
    dialogFocusReturn = null;
    void nextTick(() => (target?.isConnected ? target : wrapEl.value)?.focus());
  }
});
/** Mantém a conversa montada enquanto o Livro aberto a partir dela ocupa a tela. */
const bookDialogId = ref<string | null>(null);
const kindFilter = ref<MomentKind | 'todos' | 'guardados'>('todos');
const albumView = ref<'guardados' | 'colecao'>('guardados');
const portraitOk = ref(true);
const giftPick = ref(false);
const weeklyEvent = ref<WeeklyEvent | null>(null);
const VILLAGE_CONTROLS_HINT_KEY = 'tcg-ar-vila-controls-hint-hidden-v1';
const welcome = ref(localStorage.getItem(VILLAGE_CONTROLS_HINT_KEY) !== 'true');
function hideVillageControlsHint(): void {
  localStorage.setItem(VILLAGE_CONTROLS_HINT_KEY, 'true');
  welcome.value = false;
}
// O aviso de que a cidade cresceu espera você fechar as boas-vindas (para um não cobrir o outro).
watch(welcome, (open) => {
  if (open || recapScenes.value.length) return;
  finishArrival();
});
function finishArrival(): void {
  announceGrowth();
  // O presente inicial (questionário) tem prioridade; o sorteio de lendário (no máximo 1/dia) espera a próxima vez.
  if (!state.digital.starterGiven) maybeOfferStarter();
  else rollLegendaryToday();
  openRequestedGame();
}

// ---- Fase 4: cutscene da primeira entrada (antes do aviso de controles, só na primeira vez de verdade).
const INTRO_LINES: readonly string[] = [
  'Bem-vindo à Vila! Aqui os Pokémon que você escaneia moram, crescem e criam laços de amizade com você.',
  'Mas tem mais: perto da praça existe uma Fonte antiga. Conversando, cuidando da Vila e jogando, você junta moedas.',
  'Com moedas, a Fonte pode trazer à vida um Digital Pokémon: um companheiro que não vem de nenhuma carta física, mas mora aqui com todo o resto.',
  'Antes de começar, me conta um pouco sobre você…',
];
const cutsceneOpen = ref(false);
const cutsceneLine = ref(0);
const hoOhWishScene = ref<{ spriteUrl: string } | null>(null);
const legendaryScene = ref<{ story: LegendStory; gif: DecodedGif | null; loading: boolean; replay: boolean } | null>(null);
const legendarySceneRef = ref<InstanceType<typeof LegendaryCutscene> | null>(null);
const legendaryDefinition = computed(() => legendaryScene.value && legendaryOf(legendaryScene.value.story.id));
type SurvivalDigitalOption = SpeciesRef & { thumb: string | null };
const survivalDigitalChoice = ref<{ options: SurvivalDigitalOption[]; total: number; runId: string } | null>(null);
const survivalDigitalCutscene = ref<{ species: SpeciesRef; spriteUrl: string | null } | null>(null);
const survivalDigitalBusy = ref(false);
const legendRegions = computed(() => unlockedLegendRegions(league.value));
/** Pista aberta ao alcance do jogador; atualizada pelo relógio da cena porque a posição não é reativa. */
const legendNearby = ref<ReturnType<typeof nearbyLegendClues>>([]);
const legendNearbyKey = (list: ReturnType<typeof nearbyLegendClues>) => list.map((clue) => `${clue.story.id}:${clue.step}`).join();
function refreshLegendNearby(): void {
  const next = game && !state.legendary.active ? nearbyLegendClues(state.legendary, game.player, legendRegions.value) : [];
  if (legendNearbyKey(next) !== legendNearbyKey(legendNearby.value)) legendNearby.value = next;
}
const legendNearbyLabel = computed(() => legendNearby.value.length === 1 ? legendNearby.value[0]!.story.name : `${legendNearby.value.length} lendários`);
let legendaryLoadToken = 0;
const recapScenes = ref<RecapScene[]>([]);
const recapIndex = ref(0);
const recapScene = computed(() => recapScenes.value[recapIndex.value]);
function finishRecap(): void {
  recapScenes.value = [];
  if (!cutsceneOpen.value && !welcome.value) finishArrival();
}
function advanceRecap(): void {
  if (recapIndex.value + 1 < recapScenes.value.length) recapIndex.value++;
  else finishRecap();
}
function prepareDailyRecap(): void {
  const now = Date.now();
  const today = dayKey(new Date(now));
  if (!needsDailyRecap(state.recap.day, today)) return;
  recapIndex.value = 0;
  recapScenes.value = dailyRecap(state, state.recap.at, now);
  state.recap = { day: today, at: now };
  // Persiste ao abrir: sair ou pular a cena não repete a abertura hoje.
  changed();
  persist();
}


let game: VillageGame | null = null;
const sound = new SoundEngine();
const musicUnavailable = ref(false);
const musicTitle = ref('');
const music = new MusicPlayer(path => `${import.meta.env.BASE_URL}${path}`, () => { musicUnavailable.value = true; });
let musicTransition: MusicTransition | null = null;
function syncMusic(): void {
  const date = new Date();
  const [id, title] = villageMusicTrack(date.getHours(), game?.weatherKind ?? null, Math.floor(date.getTime() / 360_000));
  musicTransition = advanceMusicTransition(musicTransition, `audio/village/${id}.mp3`, performance.now());
  musicTitle.value = title;
  const blocked = document.hidden || !!loading.value || sheet.value === 'torre' || sheet.value === 'arcade' || !!legendaryScene.value || !!hoOhWishScene.value || cutsceneOpen.value;
  music.update(transitionMusicMix(musicTransition, performance.now()), !blocked, villageAudio.enabled ? villageAudio.volume / 100 : 0);
}
watch([() => villageAudio.enabled, () => villageAudio.volume, sheet, () => !!legendaryScene.value, () => !!hoOhWishScene.value, cutsceneOpen, loading], syncMusic);
watch(() => villageAudio.effectsVolume, value => sound.setVolume(value / 100));
function unlockMusic(): void { musicUnavailable.value = false; syncMusic(); music.unlock(); }
let observer: ResizeObserver | null = null;
let saveTimer: ReturnType<typeof setInterval> | null = null;
let cropTimer: ReturnType<typeof setInterval> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
let fishing = false;
/** Cópia da lista de moradores usada em `game.setMons`, pra poder acrescentar um Digital Pokémon sem reler a Caixa. */
let villagerList: VillageMon[] = [];
/** `name` é o nome na tela (o apelido, se tem); `real` é o nome da carta. */
const mons = ref<{ id: string; name: string; real: string; shiny: boolean; dexId?: number; thumb?: string }[]>([]);
const types = reactive(new Map<string, PokemonType[]>());

// ---- ícones em pixel art (PixelBuf → imagem), uma vez por item
const iconCache = new Map<string, string>();
function icon(id: string): string {
  let url = iconCache.get(id);
  if (url) return url;
  const buf = paintItemIcon(id);
  const c = document.createElement('canvas');
  c.width = buf.w;
  c.height = buf.h;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(buf.w, buf.h);
  img.data.set(buf.data);
  ctx.putImageData(img, 0, 0);
  url = c.toDataURL();
  iconCache.set(id, url);
  return url;
}

function changed(): void {
  dirty = true;
}

function say(text: string, ms = 2800): void {
  if (!text) return;
  toast.value = text;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), ms);
}

// Só aparece com a Vila ainda vazia, para dizer como começar. Com moradores, o aviso "aproxime-se de um morador"
// voltava a cada entrada no topo da tela e o dono pediu para tirar.
const idleGuideVisible = computed(() =>
  mons.value.length === 0 && !idleGuideDismissed.value && !loading.value && !arActive.value && !sheet.value && !dialog.value && !quiz.value && !quizOpen.value
  && !cutsceneOpen.value && !welcome.value && !recapScenes.value.length && !legendaryScene.value && !hoOhWishScene.value && !toast.value,
);
const idleGuideText = 'Abra o Menu para começar a história da Vila e receber seu primeiro companheiro.';

type UiSound = Extract<SoundCue, { kind: 'ui' }>['cue'];
function unlockSound(): void {
  unlockMusic();
  sound.setVolume(villageAudio.effectsVolume / 100);
  sound.setEnabled(visual.sound);
  sound.unlock();
}
function playSound(cue: UiSound): void {
  if (document.hidden) return;
  sound.setVolume(villageAudio.effectsVolume / 100);
  sound.setEnabled(visual.sound);
  sound.play({ kind: 'ui', cue });
}

// ---- Treinador: o que acontece na Vila conta lá, e as conquistas voltam como acessórios e moedas
function trainerEvent(action: 'talk' | 'answer' | 'moment' | 'nickname', id?: string): void {
  recordEvent({ type: 'village', action, level: id ? friendLevel(friendOf(state, id).points).level : undefined });
}

/** Nível de amizade de um morador com você (o tom da despedida nas cartas). */
const friendLevelOf = (id: string): number => friendLevel(friendOf(state, id).points).level;

/** "+6 amizade (faltam 18 para Amigo)" ou "−2 amizade (…)": a mudança de agora e o caminho até o próximo marco. */
function friendGainNote(id: string, delta: number): string {
  if (delta === 0) return '';
  const progress = friendProgressText(friendOf(state, id).points);
  return delta > 0 ? ` ❤️ +${delta} amizade (${progress}).` : ` 💔 −${-delta} amizade (${progress}).`;
}

/**
 * Mudanças de nível de amizade, venha o ganho ou a perda de onde vier (conversa, presente, momento, carta, mural,
 * reforma, ausência): aviso na tela, emoji sobre o Pokémon e uma página no Diário. Quem cai abaixo de «Grande amigo»
 * deixa de seguir você até a amizade voltar.
 */
function celebrateFriendMilestones(): void {
  const changes = claimFriendMilestones(state, mons.value.map((m) => m.id));
  if (changes.length === 0) return;
  const now = Date.now();
  const today = refreshDay();
  for (const m of changes) {
    recordFriendMilestone(state, { id: m.id, name: nameOf(m.id) }, m, now, today, villageHour());
    game?.bubble(m.id, m.kind === 'down' ? '💔' : '💖', 3200);
    if (m.kind === 'down' && state.follower === m.id && !canFollow(state, m.id)) state.follower = null;
  }
  const first = changes[0]!;
  const name = nameOf(first.id);
  const unlock = first.kind === 'up' ? unlocksAt(first.level)[0] : undefined;
  const one = first.kind === 'down'
    ? `💔 A amizade com ${name} esfriou: agora é ${first.name}. Converse e leve um presente de que ele goste para recuperar.`
    : first.kind === 'back'
      ? `💖 ${name} voltou a ser seu ${first.name}!`
      : `💖 ${name} agora é seu ${first.name}!${unlock ? ` Novo: ${unlock}` : ''}`;
  say(changes.length === 1 ? one : `Amizades mudaram: ${changes.map((m) => `${m.kind === 'down' ? '💔' : '💖'} ${nameOf(m.id)} (${m.name})`).join(', ')}. Veja no Diário.`, 6500);
  playSound(changes.some((m) => m.kind !== 'down') ? 'success' : 'menu');
  syncTrainer();
}

/** Entrega os prêmios de conquistas novas e avisa o Treinador se a amizade com alguém subiu. */
function syncTrainer(): void {
  const best = Math.max(0, ...Object.values(state.friends).map((f) => friendLevel(f.points).level));
  if (best > trainer.value.bestFriend) recordEvent({ type: 'village', action: 'friend', level: best });
  const got = claimPrizes(state, trainer.value.achievements);
  const storyAdded = ensureModeStories(state, trainer.value.achievements);
  if (got || storyAdded) changed();
  if (got) say(`🏅 ${got.note}`, 5200);
}

// ---- Digital Pokémon: presente inicial, Fonte (invocação por moedas), evolução — ver `core/village/digital.ts`.
// A origem é sempre uma carta real confirmada por `resolveSpeciesByDexId`; sem rede pra confirmar, a ação falha
// com um aviso, nunca inventa uma espécie ou uma carta.
/** Atividade da Vila que rendia energia da Fonte: desde a unificação, rende moedas (saldo único, `app/wallet.ts`). */
function earnCoins(amount: number): void {
  const n = Math.round(Math.max(0, Math.floor(amount)) * effects().coinMultiplier);
  if (n === 0) return;
  state.coins = Math.min(999999, state.coins + n);
  changed();
}

/** Injeta (ou substitui, numa evolução) um Digital Pokémon na cena, sem reler a Caixa inteira. */
/**
 * Põe (ou atualiza) um Digital Pokémon na cena na hora — ao lado do jogador, sem reembaralhar os outros moradores.
 * Devolve false se o sprite não carregou (sem rede e fora do pacote local): aí ele não aparece nesta sessão, sem
 * nenhum sprite inventado no lugar. Se a cena ainda não existe (a Vila ainda está abrindo), entra quando ela subir.
 */
async function syncDigitalVillager(inst: DigitalPokemonInstance): Promise<boolean> {
  const sprite = await getDigitalSprite(inst.dexId, false).catch(() => null);
  if (!sprite) return false;
  const entry: VillageMon = { id: inst.instanceId, name: displayName(state, inst.instanceId, inst.name), shiny: false, gif: sprite.gif, dirGifs: sprite.dirs, digital: true, dexId: inst.dexId };
  villagerList = [...villagerList.filter((v) => v.id !== inst.instanceId), entry];
  mons.value = [...mons.value.filter((m) => m.id !== inst.instanceId), { id: inst.instanceId, name: entry.name, real: inst.name, shiny: false, dexId: inst.dexId, thumb: thumbOf(entry.gif) }];
  if (!game) {
    pendingDigital.set(inst.instanceId, entry);
    return true;
  }
  game.addMon(entry);
  refreshTown();
  return true;
}
/** Digital Pokémon recebidos antes da cena terminar de abrir: entram assim que ela existir. */
const pendingDigital = new Map<string, VillageMon>();

function advanceCutscene(): void {
  if (cutsceneLine.value + 1 < INTRO_LINES.length) {
    cutsceneLine.value++;
    return;
  }
  cutsceneOpen.value = false;
  state.digital = { ...state.digital, introSeen: true };
  changed();
}

// -- Mini tutorial dos Digital Pokémon (Fase 4): uma vez, logo depois do presente inicial.
const TUTORIAL_LINES: readonly string[] = [
  'Ele mora na Vila como qualquer outro: conversa, cria amizade, tem casa e anda na Caixa em AR com sua equipe. Só não é escaneado, porque não vem de nenhuma carta física.',
  'Você ganha moedas conversando, respondendo perguntas, lanchando no Café, usando o Correio e vencendo minigames, corridas na Torre e batalhas.',
  'Na Fonte: 500 moedas invocam outro Digital Pokémon; 1000 + amizade bem alta evoluem o que você já tem, pra uma forma real.',
];
let tutorialLine = 0;
function showDigitalTutorial(): void {
  if (state.digital.tutorialSeen) return;
  tutorialLine = 0;
  const step = () => {
    if (tutorialLine < TUTORIAL_LINES.length) {
      dialog.value = { name: 'Como funciona', text: TUTORIAL_LINES[tutorialLine]!, actions: [{ label: tutorialLine + 1 < TUTORIAL_LINES.length ? 'Continuar' : 'Entendi', run: () => { tutorialLine++; step(); } }] };
      return;
    }
    dialog.value = null;
    state.digital = { ...state.digital, tutorialSeen: true };
    changed();
  };
  step();
}

// -- Presente inicial: questionário de 6 perguntas (ver `core/village/starter-quiz.ts`), uma vez por perfil.
const quizOpen = ref(false);
const quizStep = ref(0);
const quizAnswers = ref<QuizAnswers>({});
const quizQuestion = computed(() => ALL_QUESTIONS[quizStep.value] ?? null);

function maybeOfferStarter(): void {
  if (!state.digital.starterGiven) {
    quizOpen.value = true;
    quizStep.value = 0;
    quizAnswers.value = {};
  }
}

async function pickQuizOption(optionId: string): Promise<void> {
  const q = quizQuestion.value;
  if (!q) return;
  const answers = { ...quizAnswers.value, [q.id]: optionId };
  quizAnswers.value = answers;
  if (quizStep.value + 1 < ALL_QUESTIONS.length) {
    quizStep.value++;
    return;
  }
  if (!quizComplete(answers)) return;
  quizOpen.value = false;
  const { dexId } = resolveStarter(answers);
  loading.value = 'Preparando o seu Digital Pokémon inicial…';
  const species = await resolveSpeciesByDexId(dexId).catch(() => null);
  loading.value = '';
  if (!species) {
    say('Não consegui confirmar essa espécie agora (sem conexão?). Você pode tentar de novo mais tarde, pela Fonte.');
    return;
  }
  const next = grantStarter(state.digital, species, new Date().toISOString());
  if (!next) return;
  state.digital = next;
  changed();
  const given = next.instances[next.instances.length - 1]!;
  // Entra na cena antes do aviso: quando a mensagem diz que ele mora na Vila, ele já está do seu lado.
  loading.value = `${species.name} está chegando…`;
  const placed = await syncDigitalVillager(given);
  loading.value = '';
  say(
    placed
      ? `🎁 ${species.name} chegou como o seu Digital Pokémon e já está aqui do seu lado, na Vila!`
      : `🎁 ${species.name} é o seu Digital Pokémon! Não consegui baixar a imagem dele agora (sem conexão?); ele aparece na Vila quando você voltar com internet.`,
    5200,
  );
  showDigitalTutorial();
}

// -- A Fonte: invocar por moedas (500) e evoluir um Digital Pokémon (1000 + amizade + próxima forma real).
async function doSummon(): Promise<void> {
  closeDialog();
  loading.value = 'A Fonte brilha…';
  const picked = pickFonteSpecies(state.digital, FONTE_POOL.map((dexId) => ({ dexId })), Math.random);
  const species = picked ? await resolveSpeciesByDexId(picked.dexId).catch(() => null) : null;
  loading.value = '';
  if (!species) {
    say('A Fonte não respondeu agora (sem conexão?). Suas moedas continuam guardadas.');
    return;
  }
  const next = summon(state.digital, state.coins, species, new Date().toISOString());
  if (!next) {
    say(`Moedas insuficientes: invocar custa ${SUMMON_COST}.`);
    return;
  }
  state.digital = next.state;
  state.coins = next.coins;
  changed();
  const made = next.state.instances[next.state.instances.length - 1]!;
  say(`✨ A Fonte trouxe ${species.name}!`, 5200);
  await syncDigitalVillager(made);
}

/** Invocação na sorte por moedas (qualquer espécie). Pronta, mas só aparece com `COIN_SUMMON_ENABLED`. */
async function doCoinSummon(): Promise<void> {
  closeDialog();
  loading.value = 'A Fonte gira…';
  const dexId = pickAnySpecies(state.digital, Math.random);
  const species = await resolveSpeciesByDexId(dexId).catch(() => null);
  loading.value = '';
  if (!species) {
    say('A Fonte não respondeu agora (sem conexão?). Suas moedas continuam guardadas.');
    return;
  }
  const r = summonWithCoins(state.digital, state.coins, species, new Date().toISOString());
  if (!r) {
    say(`Faltam moedas: a invocação na sorte custa ${COIN_SUMMON_COST}.`);
    return;
  }
  state.digital = r.state;
  state.coins = r.coins;
  changed();
  const made = r.state.instances[r.state.instances.length - 1]!;
  say(`🎲 A Fonte trouxe ${species.name}!`, 5200);
  await syncDigitalVillager(made);
}

function openEvolveList(b: Building): void {
  const actions = state.digital.instances.map((inst) => {
    const next = nextForm(inst.dexId);
    const lvl = friendLevel(friendOf(state, inst.instanceId).points).level;
    const able = next !== null && canEvolve(state.digital, state.coins, inst.instanceId, lvl, true);
    return {
      label: `Evoluir ${inst.name}${able ? '' : ' (ainda não)'}`,
      disabled: !able,
      run: () => void doEvolve(inst.instanceId, next!),
    };
  });
  dialog.value = {
    name: 'Fonte da praça · evoluir',
    text: state.digital.instances.length === 0 ? 'Nenhum Digital Pokémon pra evoluir ainda.' : `Evoluir exige ${EVOLVE_COST} moedas (você tem ${state.coins}), amizade alta (Grande amigo+) e uma próxima forma real.`,
    actions: [...actions, { label: 'Voltar', run: () => openFountain(b) }],
  };
}

async function syncCardEvolution(card: CachedCard): Promise<void> {
  const evolved = companionCard(card);
  const dexId = evolved.dexIds[0];
  if (dexId === undefined) return;
  const sprite = await getDigitalSprite(dexId, card.shiny === true).catch(() => null);
  if (!sprite) {
    say('A evolução foi guardada, mas não consegui mostrar o novo sprite agora.');
    return;
  }
  const entry: VillageMon = { id: card.id, name: displayName(state, card.id, evolved.name), shiny: card.shiny === true, gif: sprite.gif, dirGifs: sprite.dirs, dexId };
  villagerList = [...villagerList.filter((v) => v.id !== card.id), entry];
  mons.value = [...mons.value.filter((m) => m.id !== card.id), { id: card.id, name: entry.name, real: evolved.name, shiny: card.shiny === true, dexId, thumb: thumbOf(sprite.gif) }];
  if (game) game.addMon(entry);
  else pendingDigital.set(card.id, entry);
  refreshTown();
}

async function doEvolve(instanceId: string, nextDexId: number): Promise<void> {
  closeDialog();
  loading.value = 'Evoluindo…';
  const species = await resolveSpeciesByDexId(nextDexId).catch(() => null);
  loading.value = '';
  if (!species) {
    say('Não consegui confirmar a próxima forma agora (sem conexão?). Tente de novo mais tarde.');
    return;
  }
  const lvl = friendLevel(friendOf(state, instanceId).points).level;
  const next = evolve(state.digital, state.coins, instanceId, lvl, species, new Date().toISOString());
  if (!next) {
    say('Ainda faltam condições para essa evolução.');
    return;
  }
  state.digital = next.state;
  state.coins = next.coins;
  changed();
  const evolved = instanceOf(next.state, instanceId)!;
  say(`🌟 ${evolved.name} evoluiu!`, 5200);
  await syncDigitalVillager(evolved);
}

// -- Encontros lendários: uma oportunidade de sorteio por dia do calendário (ver `core/village/legendary.ts`).
/** O que os encontros lendários estão mudando agora (chuva, horta, moedas, conversas, postes, animações). */
function effects(): LegendaryEffects {
  const now = Date.now();
  return legendaryEffects(state.legendary, now, dayKey(new Date(now)), (ms) => dayKey(new Date(ms)));
}

function rollLegendaryToday(): void {
  const r = rollLegendary(state.legendary, Math.random, day.value, new Date().toISOString(), (id) => isLegendUnlocked(id, legendRegions.value));
  state.legendary = r.state;
  changed(); // Persiste inclusive a tentativa sem visita: reabrir não dá outro sorteio.
  // Celebi deixa a página especial no Diário (o bônus prometido na cutscene, de verdade).
  if (r.legendary?.id === 'celebi') {
    const now = new Date();
    state.diary = trimMoments([...state.diary, celebiDiaryPage(now.getTime(), day.value, now.getHours())]);
  }
  if (state.legendary.active) showLegendaryCutscene();
}

function showLegendaryCutscene(id = state.legendary.active?.id, replay = false): void {
  const story = id && legendStoryOf(id);
  if (!story || replay && !state.legendary.seen[story.id]) return;
  closeVillageSheet();
  closeDialog();
  game?.stopWalk();
  if (!replay) {
    const at = state.legendary.seen[story.id] ?? new Date().toISOString();
    state.legendary.seen[story.id] = at;
    if (!state.diary.some((entry) => entry.tpl === `lendario-${story.id}`)) {
      const now = new Date(at);
      const page = legendDiaryPage(story.id, now.getTime(), dayKey(now), now.getHours());
      if (page) state.diary = trimMoments([...state.diary, page]);
    }
    changed(); persist();
  }
  legendaryScene.value = { story, gif: null, loading: true, replay };
  const token = ++legendaryLoadToken;
  // Um sprite por encontro, sob demanda. A ausência é visível; não inventa um Pokémon substituto.
  void getDigitalSprite(story.dexId, false).then((sprite) => {
    if (token !== legendaryLoadToken || !legendaryScene.value) return;
    legendaryScene.value.gif = sprite ? markRaw(sprite.gif) : null;
  }).catch(() => undefined).finally(() => { if (token === legendaryLoadToken && legendaryScene.value) legendaryScene.value.loading = false; });
}
function finishLegendaryCutscene(): void {
  const replay = legendaryScene.value?.replay;
  legendaryLoadToken++;
  legendaryScene.value = null;
  if (!replay) { state.legendary = dismissActive(state.legendary); changed(); persist(); }
  // Vários lendários no mesmo ponto: o próximo da fila entra em seguida.
  if (!replay && state.legendary.active) { showLegendaryCutscene(); return; }
  void nextTick(() => document.querySelector<HTMLButtonElement>('.b-btn')?.focus());
}
function travelToLegendClue(id: string): void {
  const place = isLegendUnlocked(id, legendRegions.value) && !state.legendary.seen[id] ? investigationPlace(id, legendStep(state.legendary, id)) : null;
  if (!place) return;
  closeVillageSheet();
  game?.walkTo(place.x, place.y);
  minimapRoute.value = `Pista: ${place.name}`;
  say(`🔎 ${legendStoryOf(id)?.name}: siga até ${place.name} e use Investigar pista ou A.`, 6000);
}
function investigateLegendClue(): void {
  if (!game || sheet.value || dialog.value || legendaryScene.value || game.player.t < 1) return;
  minimapRoute.value = '';
  const result = inspectLegendClue(state.legendary, game.player, new Date().toISOString(), legendRegions.value);
  state.legendary = result.state;
  refreshLegendNearby();
  changed(); persist();
  if (result.encounter) {
    if (result.encounters.includes('celebi')) state.diary = trimMoments([...state.diary, celebiDiaryPage(Date.now(), day.value, villageHour())]);
    showLegendaryCutscene();
  } else say(result.message, 7000);
}

function nameOf(id: string): string {
  return mons.value.find((m) => m.id === id)?.name ?? 'Pokémon';
}

function residentNameForDisplay(id: string, fallback: string): string {
  const visible = nameOf(id);
  return visible === 'Pokémon' ? fallback : visible;
}

/** Ajusta apenas IDs antigos de saves; o texto completo da conversa permanece intacto. */
function displayResidentMessage(raw: string): string {
  let text = raw.trim();
  for (const mon of [...mons.value].sort((a, b) => b.id.length - a.id.length)) {
    if (mon.id && mon.name && mon.id !== mon.name) text = text.split(mon.id).join(mon.name);
  }
  return text;
}

const inventory = computed(() => ITEMS.filter((i) => count(state, i.id) > 0));
const backpackItems = computed(() => inventory.value.map((i) => ({ id: i.id, name: i.name, qty: count(state, i.id) })));
const sellable = computed(() => inventory.value.filter((i) => i.sell > 0 && i.kind !== 'accessory' && !i.gift));
const giftable = computed(() => inventory.value.filter((i) => i.kind !== 'accessory'));
const nextHouse = computed(() => HOUSE_LEVELS[state.house + 1] ?? null);
const selectedHomeItem = ref<ItemId | null>(null);
const homeInteriorLot = ref<number | null>(null);
const homeFurniture = computed(() => FURNITURE_IDS.filter((id) => count(state, id) > 0));
const displayedHomeInterior = computed(() => homeInteriorLot.value === null ? state.homeInterior : state.homeInteriors[String(homeInteriorLot.value)] ?? { wallpaper: 'creme' as const, floor: 'carvalho' as const, placed: [] });
const homeResidents = computed(() => {
  if (homeInteriorLot.value === null) return [{ id: 'player', name: profile.name }];
  return residentsOf(homes, homeInteriorLot.value).map((id) => ({
    id,
    name: nameOf(id),
    thumb: mons.value.find((mon) => mon.id === id)?.thumb,
  }));
});
function homeItemAt(x: number, y: number): string | undefined {
  return displayedHomeInterior.value.placed.find((entry) => entry.x === x && entry.y === y)?.item;
}
function openPlayerHome(): void {
  if (state.house < 1) { sheet.value = 'build'; return; }
  homeInteriorLot.value = null;
  selectedHomeItem.value = null;
  sheet.value = 'home';
}
function useHomeCell(x: number, y: number): void {
  if (homeInteriorLot.value !== null) return;
  const existing = homeItemAt(x, y);
  if (existing) { act(homePickUp(state, x, y)); return; }
  if (!selectedHomeItem.value) { say('Escolha um móvel da mochila para colocar nesse espaço.'); return; }
  const r = homePlace(state, selectedHomeItem.value, x, y);
  act(r);
  if (r.ok && count(state, selectedHomeItem.value) === 0) selectedHomeItem.value = null;
}
function exitHomeInterior(): void {
  homeInteriorLot.value = null;
  selectedHomeItem.value = null;
  closeVillageSheet();
}

function setPlayerHomeStyle(style: typeof HOME_EXTERIOR_STYLES[number]['id']): void {
  const result = setHomeStyle(state, -1, style, []);
  say(result.message);
  if (result.ok) changed();
}

function setHomeWallpaper(value: string): void {
  if (homeInteriorLot.value !== null) return;
  if (['creme', 'floral', 'noite', 'madeira'].includes(value)) state.homeInterior.wallpaper = value as typeof state.homeInterior.wallpaper;
  changed();
}
function setHomeFloor(value: string): void {
  if (homeInteriorLot.value !== null) return;
  if (['carvalho', 'xadrez', 'grama', 'ladrilho'].includes(value)) state.homeInterior.floor = value as typeof state.homeInterior.floor;
  changed();
}
const shopItems = computed(() => shopToday(day.value));
const collection = computed(() => FURNITURE_IDS.map((id) => ({ id, name: itemName(id), have: state.collected.includes(id), group: itemDef(id)?.group ?? '' })));
const craftable = CRAFT_IDS;
const cookable = COOK_IDS;
const actorList = (): { id: string; name: string; types: PokemonType[] }[] => mons.value.map((m) => ({ id: m.id, name: m.name, types: types.get(m.id) ?? [] }));
const unread = computed(() => unreadCount(state));
const summary = computed(() => villageSummary(state, mons.value, Date.now()));
const communityView = computed(() => communityForecast(state, mons.value.map((mon) => mon.id)));
const lastCommunityCycle = computed(() => state.community.history.at(-1) ?? null);
const latestCommunityProject = computed(() => state.community.council.at(-1) ?? null);
const communityProjectCost = computed(() => latestCommunityProject.value?.ingredients.map((ingredient) => `${itemName(ingredient.item as ItemId)} ×${ingredient.qty}`).join(' · ') ?? '');
function chooseCouncilDecision(decision: 'apoiar' | 'adiar' | 'recusar'): void {
  const project = latestCommunityProject.value;
  if (!project) return;
  const outcome = decideCommunityProject(state, project.id, decision, day.value);
  say(outcome.message, 5500);
  if (outcome.ok) changed();
}
const summaryMomentId = ref<string | null>(null);
const album = computed(() => albumProgress(state));
const saved = computed(() => savedMoments(state));
const albumGroups = computed(() => {
  const all = albumEntries(state);
  return MOMENT_KINDS.map((k) => {
    const entries = all.filter((e) => e.kind === k);
    return { kind: k, entries, seen: entries.filter((e) => e.seen).length };
  }).filter((g) => g.entries.length > 0);
});
const pairs = computed(() => relationMap(state, mons.value));
const bookRels = computed(() => Object.fromEntries(mons.value.map((m) => [m.id, relationsOf(state, m.id, mons.value).map((r) => ({ name: r.name, label: r.status.label, emoji: r.status.emoji, met: r.met }))])));
const diaryList = computed(() => {
  const list = [...state.diary].reverse();
  return kindFilter.value === 'todos' ? list : kindFilter.value === 'guardados' ? list.filter((m) => m.fav) : list.filter((m) => m.kind === kindFilter.value);
});
const bookWords = computed(() => Object.fromEntries(mons.value.map((m) => [m.id, wordOf(state, m.id)])));
const bookTold = computed(() => {
  const out: Record<string, { q: string; a: string }[]> = {};
  for (const a of state.answers) (out[a.mon] ??= []).push({ q: QUESTION_BY_ID.get(a.q)?.ask(profile.name) ?? '', a: a.a });
  for (const k of Object.keys(out)) out[k] = out[k]!.slice(-3);
  return out;
});
const bookMemories = computed(() => Object.fromEntries(mons.value.map((mon) => [mon.id, state.memories.filter((memory) => memory.mon === mon.id).slice(-5).reverse().map((memory) => ({ kind: memory.kind, text: memory.text, day: memory.day }))])));
const bookMons = computed(() => mons.value.map((m) => ({ id: m.id, name: m.name, real: m.real, types: types.get(m.id) ?? [], thumb: m.thumb, accessory: state.wear.mons[m.id] ?? null })));
const accessoriesOwned = computed(() => ACCESSORY_IDS.filter((id) => count(state, id) > 0));

let guidedTrip: { id: string; destination: typeof GUIDED_DESTINATIONS[number] } | null = null;
const guidedTripVersion = ref(0);

// ---- controle
// ---- Movimento: joystick na tela (toque/mouse) e teclado (setas/WASD, com diagonais segurando duas teclas).
// Os dois viram o mesmo vetor e as mesmas direções (`core/village/joystick.ts`); a Vila anda em blocos.
const JOY_MAX = 44;
/**
 * Joystick flutuante: encostar em qualquer lugar da tela da Vila e arrastar (ele aparece onde o dedo encostou).
 * Um toque rápido, sem arrastar, leva você andando até aquele lugar (`game.walkTo`).
 */
const joy = reactive({ active: false, pointerId: -1, cx: 0, cy: 0, x: 0, y: 0, lx: 0, ly: 0, downAt: 0, moved: false });
let tapInteraction: { x: number; y: number } | null = null;
const TAP_MS = 320;
const TAP_PX = 10;
function applyStick(x: number, y: number): void {
  if (legendaryScene.value) { game?.holdStick(null); return; }
  if (x !== 0 || y !== 0) tapInteraction = null;
  const dirs = stickDirs(x, y);
  game?.holdStick(dirs.primary ? dirs : null);
}
function joyDown(e: PointerEvent): void {
  if (joy.active || recapScenes.value.length || legendaryScene.value) return;
  const el = e.currentTarget as HTMLElement;
  const stage = wrapEl.value?.getBoundingClientRect();
  Object.assign(joy, { active: true, pointerId: e.pointerId, cx: e.clientX, cy: e.clientY, x: 0, y: 0, lx: e.clientX - (stage?.left ?? 0), ly: e.clientY - (stage?.top ?? 0), downAt: performance.now(), moved: false });
  el.setPointerCapture?.(e.pointerId);
}
function joyMove(e: PointerEvent): void {
  if (!joy.active || e.pointerId !== joy.pointerId) return;
  if (Math.hypot(e.clientX - joy.cx, e.clientY - joy.cy) > TAP_PX) joy.moved = true;
  if (!joy.moved) return;
  const v = stickVector(e.clientX - joy.cx, e.clientY - joy.cy, JOY_MAX);
  joy.x = v.x;
  joy.y = v.y;
  applyStick(v.x, v.y);
}
function joyUp(e: PointerEvent): void {
  if (e.pointerId !== joy.pointerId) return;
  const tap = !joy.moved && performance.now() - joy.downAt < TAP_MS && e.type === 'pointerup';
  Object.assign(joy, { active: false, pointerId: -1, x: 0, y: 0, moved: false });
  applyKeys();
  if (tap && game) {
    const t = game.tileAtScreen(e.clientX, e.clientY);
    if (t) {
      tapInteraction = game.interactableAt(t.x, t.y) ? t : null;
      game.walkTo(t.x, t.y);
    }
  }
}

const KEYS: Record<string, Dir> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
};
const heldKeys = new Set<Dir>();
const gamepadKeys = new Set<Dir>();
const dpadPointers = new Map<number, Dir>();
let lastPointerAPress = -Infinity;
/** Teclas seguradas viram um vetor (duas teclas = diagonal), igual ao joystick. */
function applyKeys(): void {
  if (joy.active) return;
  const active = new Set([...heldKeys, ...gamepadKeys, ...dpadPointers.values()]);
  const x = (active.has('right') ? 1 : 0) - (active.has('left') ? 1 : 0);
  const y = (active.has('down') ? 1 : 0) - (active.has('up') ? 1 : 0);
  applyStick(x, y);
}
function dpadDown(event: PointerEvent, direction: Dir): void {
  if (sheet.value || dialog.value || quiz.value || quizOpen.value) {
    moveVillageFocus(direction);
    return;
  }
  if (welcome.value || cutsceneOpen.value || recapScenes.value.length) return;
  dpadPointers.set(event.pointerId, direction);
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  applyKeys();
}
function handleGamepadDirection(event: Event): void {
  const custom = event as CustomEvent<{ handled: boolean; direction?: Dir; pressed?: boolean }>;
  const direction = custom.detail.direction;
  if (!direction || custom.detail.pressed === undefined || custom.detail.handled) return;
  // A Torre gerencia o direcional durante a corrida; escolhas e pausas passam ao foco dos diálogos.
  if (sheet.value === 'torre') return;
  if (sheet.value || dialog.value || quiz.value || quizOpen.value || legendaryScene.value) {
    if (custom.detail.pressed) moveVillageFocus(direction);
    custom.detail.handled = true;
    return;
  }
  if (custom.detail.pressed) gamepadKeys.add(direction);
  else gamepadKeys.delete(direction);
  applyKeys();
  custom.detail.handled = true;
}
function handleGamepadAction(event: Event): void {
  const custom = event as CustomEvent<{ handled: boolean }>;
  // A Torre tem seu próprio alvo: deixe o evento chegar ao minigame para A ativar o especial.
  if (custom.detail.handled || sheet.value === 'torre') return;
  custom.detail.handled = true;
  pressA();
}
function handleGamepadBack(event: Event): void {
  const custom = event as CustomEvent<{ handled: boolean }>;
  // B pausa/retoma a Torre; não navegue para fora da Vila durante a corrida.
  if (custom.detail.handled || sheet.value === 'torre') return;
  custom.detail.handled = true;
  pressB();
}
function handleGamepadMenu(event: Event): void {
  const custom = event as CustomEvent<{ handled: boolean }>;
  if (custom.detail.handled || sheet.value === 'torre') return;
  custom.detail.handled = true;
  pressMenu();
}
function moveVillageFocus(direction: Dir): void {
  const panel = document.querySelector<HTMLElement>('.legend-cutscene, .village-sheet, .village-dialog, .quiz-dialog');
  if (!panel) return;
  const selector = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]';
  const candidates = [...panel.querySelectorAll<HTMLElement>(selector)].filter((element) => element.getClientRects().length > 0);
  if (!candidates.length) return;
  const active = document.activeElement;
  const current = candidates.find((element) => element === active)
    ?? (focusedVillageAction?.isConnected && panel.contains(focusedVillageAction) ? focusedVillageAction : undefined);
  if (!current) {
    focusWithArrowIndicator(candidates[0]);
    return;
  }
  const from = current.getBoundingClientRect();
  const originX = from.left + from.width / 2;
  const originY = from.top + from.height / 2;
  const next = candidates
    .filter((element) => element !== current)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - originX;
      const dy = rect.top + rect.height / 2 - originY;
      const primary = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
      const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
      return { element, primary, score: primary + secondary * 1.7 };
    })
    .filter((candidate) => candidate.primary > 1)
    .sort((a, b) => a.score - b.score)[0]?.element;
  focusWithArrowIndicator(next ?? candidates[(candidates.indexOf(current) + 1) % candidates.length]);
}
function dpadUp(event: PointerEvent): void {
  if (!dpadPointers.delete(event.pointerId)) return;
  applyKeys();
}

/**
 * Confirma no início do toque. O direcional usa outro pointerId, então os dois
 * podem permanecer pressionados ao mesmo tempo em telas touch (inclusive em
 * navegadores que só disparariam `click` depois de soltar o dedo).
 */
function pressAPointer(event: PointerEvent): void {
  event.preventDefault();
  event.stopPropagation();
  const now = performance.now();
  lastPointerAPress = now;
  pressA();
}

function pressAClick(event: MouseEvent): void {
  event.stopPropagation();
  // Touch browsers may dispatch click shortly after pointerdown; avoid a
  // second interaction while preserving keyboard/assistive-technology clicks.
  if (performance.now() - lastPointerAPress > 180) pressA();
}
function onKey(e: KeyboardEvent): void {
  if (backpackOpen.value) {
    if (e.type === 'keydown' && e.key === 'Escape') {
      e.preventDefault();
      backpackOpen.value = false;
    }
    return;
  }
  if (e.type === 'keydown' && e.key === 'Tab' && sheet.value && !backpackOpen.value) {
    const panel = document.querySelector<HTMLElement>('.village-sheet');
    const nested = panel && [...panel.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')]
      .filter((element) => element.getClientRects().length > 0).at(-1);
    const activePanel = nested ?? panel;
    if (activePanel) {
      const controls = [...activePanel.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]')]
        .filter((element) => element.getClientRects().length > 0 && !element.closest('[inert]'));
      if (controls.length) {
        const index = controls.indexOf(document.activeElement as HTMLElement);
        const next = wrappedFocusIndex(index, controls.length, e.shiftKey);
        if (next !== null) {
          e.preventDefault();
          controls[next]?.focus();
        }
      } else {
        e.preventDefault();
        activePanel.focus();
      }
    }
    return;
  }
  // A Torre tem seu próprio teclado; a Vila não deve capturar essas teclas por trás dela.
  if (sheet.value === 'torre') return;
  if (recapScenes.value.length) {
    if (e.type === 'keydown' && e.key === 'Escape') { e.preventDefault(); finishRecap(); }
    return;
  }
  const dir = KEYS[e.key];
  // Soltar uma tecla também precisa parar a caminhada se o foco entrou numa conversa.
  if (e.type === 'keyup' && dir) {
    heldKeys.delete(dir);
    applyKeys();
    return;
  }
  if (hoOhWishScene.value) {
    if (e.type === 'keydown' && (e.key === 'Escape' || e.key === 'x' || e.key === 'X')) {
      e.preventDefault();
      hoOhWishScene.value = null;
    }
    return;
  }
  if (legendaryScene.value) {
    if (e.type === 'keydown' && (e.key === 'Escape' || e.key.toLowerCase() === 'x')) { e.preventDefault(); finishLegendaryCutscene(); }
    return;
  }
  if (handleDialogEscape(e, pressB)) return;
  if (e.type === 'keydown' && (e.key === 'x' || e.key === 'X') && e.target instanceof Element && e.target.closest('.village-sheet, .village-dialog, .quiz-dialog')) {
    pressB();
    e.preventDefault();
    return;
  }
  if (e.type === 'keydown' && dir && e.target instanceof Element && e.target.closest('.village-sheet, .village-dialog, .quiz-dialog') && !e.target.closest('input, textarea, select, [contenteditable]')) {
    moveVillageFocus(dir);
    e.preventDefault();
    return;
  }
  const worldMovementActive = !sheet.value && !dialog.value && !quiz.value && !quizOpen.value && !cutsceneOpen.value && !welcome.value && !recapScenes.value.length;
  // O foco pode continuar em um botão do HUD depois de um toque. Setas/WASD ainda devem mover a Vila;
  // campos de texto continuam recebendo suas teclas normalmente.
  if (isGameKeyboardControl(e.target) && !(worldMovementActive && dir) && !(dir && e.target instanceof Element && e.target.closest('.village-control-cluster'))) return;
  // Dentro de uma folha (jogos do Fliperama, Arena…) Enter, espaço e setas são da folha, não do personagem.
  if (sheet.value && (e.target as HTMLElement | null)?.closest?.('.village-sheet') && (KEYS[e.key] || e.key === ' ' || e.key === 'Enter')) return;
  if (e.type === 'keydown') {
    if (dir) {
      heldKeys.add(dir);
      applyKeys();
      e.preventDefault();
    } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'z') {
      pressA();
      e.preventDefault();
    } else if (e.key === 'x' || e.key === 'Escape') pressB();
  }
}

// ---- perguntas dos Pokémon (você responde digitando; eles lembram e repetem)
type QuizStage = 'ask' | 'follow' | 'reply';
interface QuizState {
  monId: string;
  name: string;
  q: Question;
  stage: QuizStage;
  text: string;
  follow?: Follow;
  answer?: string;
  /** É a conversa do apelido (não uma pergunta): o texto digitado vira o apelido. */
  nick?: boolean;
}
const quiz = ref<QuizState | null>(null);
let quizFocusReturn: HTMLElement | null = null;
watch(quiz, (next, previous) => {
  if (next && !previous) quizFocusReturn = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  if (next && !previous) void nextTick(() => focusFirstVillageAction('.quiz-dialog'));
  if (!next && previous) {
    const target = quizFocusReturn;
    quizFocusReturn = null;
    void nextTick(() => (target?.isConnected ? target : wrapEl.value)?.focus());
  }
});
watch(() => quiz.value?.stage, (next, previous) => {
  if (next && previous && next !== previous) void nextTick(() => focusFirstVillageAction('.quiz-dialog'));
});
watch(quizStep, (next, previous) => {
  if (quizOpen.value && next !== previous) void nextTick(() => focusFirstVillageAction('.village-dialog'));
});
watch(quizOpen, (next, previous) => {
  if (next && !previous) quizOpenFocusReturn = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  if (next && !previous) void nextTick(() => focusFirstVillageAction('.village-dialog'));
  if (!next && previous) {
    const target = quizOpenFocusReturn;
    quizOpenFocusReturn = null;
    void nextTick(() => (target?.isConnected ? target : wrapEl.value)?.focus());
  }
});
/** Um Pokémon que quer te perguntar algo (o ❗ sobre ele); some sozinho depois de um tempo. */
let askingMon: { id: string; until: number } | null = null;
let nextAskAt = Date.now() + 60000 + Math.random() * 60000;
let nextEchoAt = Date.now() + 40000 + Math.random() * 40000;

function tickQuestions(): void {
  const now = Date.now();
  if (askingMon && now > askingMon.until) {
    askingMon = null;
    game?.setWaiting(null);
  }
  if (!game || document.hidden || dialog.value || quiz.value || quizOpen.value || cutsceneOpen.value || hoOhWishScene.value || legendaryScene.value || recapScenes.value.length > 0 || sheet.value || welcome.value || game.sceneActive || mons.value.length === 0) return;
  if (!askingMon && now >= nextAskAt) {
    nextAskAt = now + 4 * 60000 + Math.random() * 4 * 60000;
    const today = refreshDay();
    const near = actorList().filter((a) => game!.playerNear([a.id], 10) && !game!.sceneBusy(a.id) && canAsk(state, a.id, today));
    const who = near[Math.floor(Math.random() * near.length)];
    if (who) {
      askingMon = { id: who.id, until: now + 40000 };
      game.setWaiting(who.id);
      game.pop(who.id, '❗');
      game.faceMe(who.id);
      game.bubble(who.id, '❗', 40000);
    }
    return;
  }
  if (!askingMon && now >= nextEchoAt) {
    nextEchoAt = now + 45000 + Math.random() * 65000;
    const names: Record<string, string> = {};
    for (const m of mons.value) names[m.id] = m.name;
    const near = actorList().filter((a) => game!.playerNear([a.id], 16) && !game!.sceneBusy(a.id)).map((a) => a.id);
    const e = pickEcho(state, near, names, Math.random);
    if (e) game.sayLines([e.id], [{ who: 0, text: e.text, fx: e.fx }], () => undefined);
  }
}

function openQuiz(id: string): void {
  const today = refreshDay();
  const q = pickQuestion(state, Math.random);
  askingMon = null;
  game?.setWaiting(null);
  markAsked(state, id, today);
  changed();
  game?.bubble(id, '💬', 600);
  quiz.value = { monId: id, name: nameOf(id), q, stage: 'ask', text: q.ask(profile.name) };
}

function quizAnswer(raw: string): void {
  const z = quiz.value;
  if (!z || z.stage !== 'ask') return;
  if (z.nick) return nickAnswer(z, raw);
  const r = recordAnswer(state, { id: z.monId, name: z.name }, z.q, raw, Date.now(), refreshDay(), profile.name);
  if (!r) return;
  changed();
  trainerEvent('answer', z.monId);
  earnCoins(10);
  if (r.bordao) {
    game?.pop(z.monId, '🗣️');
    quiz.value = { ...z, stage: 'reply', answer: r.answer.a, text: `"${r.answer.a}"! Gostei tanto que vou falar isso a toda hora. Espera só os outros ouvirem!` };
    return;
  }
  const follow = pickFollow(z.q.kind, Math.random);
  quiz.value = { ...z, stage: 'follow', answer: r.answer.a, follow, text: `${r.odd ? `${r.odd} ` : ''}${follow.ask(r.answer.a)}` };
  game?.pop(z.monId, r.odd ? '😲' : '🤔');
}

function quizChoose(i: number): void {
  const z = quiz.value;
  const opt = z?.follow?.options[i];
  if (!z || z.stage !== 'follow' || !opt) return;
  applyFollow(state, z.monId, opt);
  changed();
  game?.pop(z.monId, FX_EMOJI[opt.fx]);
  quiz.value = { ...z, stage: 'reply', text: opt.reply(z.answer ?? '') };
}

function quizClose(): void {
  quiz.value = null;
}

// ---- apelidos (qualquer Pokémon, desde o primeiro dia)
const NICK_CLEAR = 'Tirar o apelido';

/** Põe o apelido na tela: nos nomes dos Pokémon, nas falas, no mapa e no Livro. */
function applyNicks(): void {
  for (const m of mons.value) m.name = displayName(state, m.id, m.real);
  game?.setNames(Object.fromEntries(mons.value.map((m) => [m.id, m.name])));
}

function openNickname(id: string): void {
  const real = mons.value.find((m) => m.id === id)?.real ?? 'Pokémon';
  if (!canNickname(state, id)) {
    say(`${real} ainda não aceita apelido.`);
    return;
  }
  const has = nicknameOf(state, id) !== '';
  const q: Question = { id: 'apelido', kind: 'palavra', ask: () => '', placeholder: `Apelido para ${real} (até ${MAX_NICK_LEN} letras)`, chips: [...nickIdeas(state, id), ...(has ? [NICK_CLEAR] : [])] };
  dialog.value = null;
  quiz.value = { monId: id, name: nameOf(id), q, stage: 'ask', text: has ? `${real} atende por «${nicknameOf(state, id)}». Como você quer chamar ${real} agora?` : `Como você quer chamar ${real}? Vai ser o apelido dele em todo lugar.`, nick: true };
}

function nickAnswer(z: QuizState, raw: string): void {
  const real = mons.value.find((m) => m.id === z.monId)?.real ?? 'Pokémon';
  const r = setNickname(state, z.monId, raw === NICK_CLEAR ? '' : raw, real);
  if (r.ok) {
    changed();
    applyNicks();
    if (nicknameOf(state, z.monId)) trainerEvent('nickname', z.monId);
    game?.pop(z.monId, nicknameOf(state, z.monId) ? '😍' : '🙂');
  }
  quiz.value = { ...z, name: nameOf(z.monId), stage: 'reply', text: r.message };
}

/** O Livro dos Pokémon (aba Livro) também deixa dar o apelido. */
function bookNickname(id: string, text: string): void {
  const real = mons.value.find((m) => m.id === id)?.real ?? 'Pokémon';
  const r = setNickname(state, id, text, real);
  bookNote.value = r.message;
  if (r.ok) {
    changed();
    applyNicks();
    if (nicknameOf(state, id)) trainerEvent('nickname', id);
  }
}
const bookNote = ref('');


// ---- a cidade: casas dos Pokémon, Café, Correio, Museu e a fonte
const level = computed(() => levelOf(trainer.value.xp));
const challengeExhibits = computed(() => completedChallengeExhibits(trainer.value.achievements));
const stage = computed(() => townStage(level.value));
let homes = new Map<string, number>();

/** Abre o Correio como uma caixa de entrada: a edição diária e as cartas de momentos ficam juntas no mesmo lugar. */
function openMail(): void {
  const generated = generateDailyMail(state, refreshDay(), namesById(), friendLevelOf);
  if (generated) {
    changed();
    say(`📬 ${generated.fromName} deixou uma carta: ${generated.subject}`, 4800);
  }
  // Cartas geradas enquanto o jogador estava fora também entram na rota do
  // carteiro quando o Correio é aberto, sem repetir destinos na mesma visita.
  const pendingTargets = [...new Set(state.mail.inbox.flatMap((mail) => mail.involvedIds))];
  if (pendingTargets.length > 0) game?.deliverMail(pendingTargets);
  closeDialog();
  tab.value = 'correio';
  sheet.value = 'menu';
}

function readMail(id: string): void {
  if (markMailRead(state.mail, id)) changed();
}

function answerMail(id: string, action: MailAction): void {
  const result = respondToMail(state, id, action, refreshDay());
  say(result.message, 4200);
  if (result.ok) changed();
}

/** Conversa social comum, compartilhada por todos os moradores, inclusive o carteiro. */
function speakToResident(id: string): void {
  if (!game) return;
  game.pauseResidentWork(id);
  game.faceMe(id);
  const today = refreshDay();
  const name = nameOf(id);
  const result = talk(state, id, name, types.get(id) ?? [], today, villageHour(), Math.random, recentGossip(state, id, Date.now(), { compact: true, nameOf: residentNameForDisplay }), game.weatherKind);
  if (result.gained > 0) {
    game.bubble(id, '❤️');
    trainerEvent('talk', id);
    earnCoins(5);
  }
  if (result.lost > 0) game.bubble(id, '😞', 2600);
  let text = result.text + friendGainNote(id, result.gained - result.lost);
  if (id === state.cafeWaiterId && level.value >= 3 && professionActive('cafe', mons.value.length)) text = 'Estou atendendo as mesas do Café! Mas tenho um tempinho para conversar. ' + text;
  const help = dailyHelp(state, id, today, Math.random);
  if (help.items.length > 0) text += ` Ah! Achei isto pela Vila para você: ${help.items.map((h) => `${h.qty} ${itemName(h.item)}`).join(' e ')}.`;
  if (help.rare) {
    text += ` E... guardei um presente especial: ${itemName(help.rare)}!`;
    game.bubble(id, '🎁', 2600);
  }
  changed();
  openFriendDialog(id, text);
}

function openMailCarrierDialog(id: string): void {
  const waiting = state.mail.inbox.filter((mail) => !mail.read).length;
  const lines = [
    'Estou entregando as cartas!',
    'Cada envelope tem o nome de quem viveu o momento.',
    waiting > 0 ? `Ainda tenho ${waiting} carta(s) na bolsa.` : 'A bolsa está leve hoje. Quando houver um momento novo, eu volto.',
  ];
  dialog.value = {
    id,
    name: `📬 ${nameOf(id)} · Carteiro da Vila`,
    text: lines[(Date.now() / 1000 | 0) % lines.length]!,
    actions: [
      { label: 'Conversar como morador', run: () => speakToResident(id) },
      { label: 'Abrir o Correio', run: openMail },
      { label: 'Continuar a entrega', run: () => { game?.deliverMail(state.mail.inbox.filter((mail) => mail.involvedIds.length > 0).flatMap((mail) => mail.involvedIds)); closeDialog(); } },
      { label: 'Sair', run: closeDialog },
    ],
  };
}

function refreshTown(): void {
  homes = assignHomes(mons.value.map((m) => m.id), level.value);
  game?.setTown(level.value, homes);
  const residentIds = mons.value.map((mon) => mon.id);
  const staff = chooseServiceResidents(residentIds, state.mailCarrierId, state.cafeWaiterId);
  if (staff.carrier && state.mailCarrierId !== staff.carrier) { state.mailCarrierId = staff.carrier; changed(); }
  if (staff.waiter && state.cafeWaiterId !== staff.waiter) { state.cafeWaiterId = staff.waiter; changed(); }
  game?.setMailCarrier(staff.carrier);
  game?.setCafeWaiter(staff.waiter);
  const initial = personalizeResidentHomes(state, homes);
  const automatic = advanceResidentHomes(state, homes, refreshDay());
  if (automatic.changed) changed();
  const changes = [...initial, ...automatic.events];
  if (changes.length > 0) {
    changed();
    const first = changes[0]!;
    const names = changes.slice(0, 3).map((change) => nameOf(change.residentId)).join(', ');
    const action = first.renovation ? `reformou a casa: ${first.renovation}` : first.restyled ? `escolheu uma fachada ${first.style}` : `decorou a própria casa${first.items.length ? ` com ${first.items.join(', ')}` : ''}`;
    say(`🏠 ${names}: ${action}.`, 5200);
  }
}

/** Entrou na Vila com o nível mais alto que da última vez: a cidade cresceu. */
function announceGrowth(): void {
  const from = state.town.level;
  const to = level.value;
  if (to > from) {
    const u = unlockedBetween(from, to);
    const parts: string[] = [];
    if (u.stage) parts.push(`Nova fase da cidade: ${u.stage}!`);
    if (u.houses > 0) parts.push(u.houses === 1 ? 'Mais um terreno para casa.' : `Mais ${u.houses} terrenos para casas.`);
    if (u.buildings.length > 0) parts.push(`Abriu: ${u.buildings.join(', ')}.`);
    say(`🏘️ A Vila cresceu com o seu nível ${to}! ${parts.join(' ')}`, 6500);
  }
  if (to !== from) {
    state.town.level = to;
    changed();
  }
}

const namesById = (): Record<string, string> => Object.fromEntries(mons.value.map((m) => [m.id, m.name]));

function closeDialog(): void {
  dialog.value = null;
}

function openRequestBoard(): void {
  if (ensureModeStories(state, trainer.value.achievements)) changed();
  const today = refreshDay();
  const previousDay = state.requests.day;
  const requests = ensureRequests(state, today, mons.value.map((m) => ({ id: m.id, name: m.name })));
  const storyRequests = state.requests.story ?? [];
  const allRequests = [...storyRequests, ...requests];
  if (previousDay !== state.requests.day) changed();
  const summary = allRequests.map((request) => {
    const status = requestStatus(state, request, today);
    return `${request.done ? '✅' : request.persistent ? '🔎' : '📌'} ${request.title}\n   ${request.detail}\n   ${request.location} · ${status.text}`;
  }).join('\n\n');
  const conclude = (id: string): void => {
    const result = claimRequest(state, id, refreshDay());
    if (result.ok) {
      earnCoins(result.coins);
      if (result.targetId) game?.bubble(result.targetId, '🎁');
      const story = storyRequests.find((request) => request.id === id);
      const modeStory = story?.id.startsWith('modo:') === true;
      if (story && !modeStory) say('🔎 Pedido da descoberta concluído. Uma nova pista pode ser encontrada na Vila.');
      if (state.requests.items.every((request) => request.done)) {
        state.town.level = Math.max(state.town.level, Math.min(99, level.value + 1));
        say('🏘️ Todos os pedidos de hoje foram atendidos: a Vila subiu um nível.');
      }
      changed();
      playSound('success');
    }
    const completedStory = storyRequests.find((request) => request.id === id);
    say(completedStory?.id.startsWith('modo:') ? `📚 História opcional concluída no Museu. ${result.message}` : result.message);
    openRequestBoard();
  };
  const festival = weeklyEvent.value ?? weeklyEventFor(state, today);
  dialog.value = {
    name: 'Mural de pedidos',
    text: summary || 'O mural está vazio por enquanto.',
    actions: [
      { label: `Festival: ${festival.title}`, run: openFestival },
      ...allRequests.map((request: VillageRequest) => {
        const status = requestStatus(state, request, today);
        return {
          label: request.done ? `✓ ${request.title}` : status.ready ? `Concluir: ${request.title}` : `Ver: ${request.title}`,
          disabled: request.done || !status.ready,
          run: () => conclude(request.id),
        };
      }),
      { label: 'Sair', run: closeDialog },
    ],
  };
}

/** A brincadeira semanal fica no mural: a pessoa escolhe a barraca e a participação não pode ser repetida. */
function openFestival(): void {
  const round = festivalRound(state, refreshDay());
  if (round.played) {
    dialog.value = { name: `🎪 ${round.title}`, text: 'Você já participou deste festival nesta semana. A próxima festa chega com a próxima semana da Vila.', actions: [{ label: 'Voltar ao mural', run: openRequestBoard }] };
    return;
  }
  dialog.value = {
    name: `🎪 ${round.title}`,
    text: `${round.prompt}\n\nEscolha uma barraca para participar.`,
    actions: [...round.choices.map((choice, index) => ({ label: choice, run: () => finishFestival(index) })), { label: 'Voltar ao mural', run: openRequestBoard }],
  };
}

function finishFestival(choice: number): void {
  const result = completeFestival(state, refreshDay(), choice);
  if (!result.ok) return openFestival();
  earnCoins(result.coins);
  const now = new Date();
  const host = mons.value[0];
  if (host) {
    state.diary = trimMoments([...state.diary, {
      id: `festival:${state.weekly.week}`, t: now.getTime(), day: refreshDay(), hour: now.getHours(), tpl: 'festival-semanal', kind: 'festa', title: result.title, emoji: '🎪',
      cast: [{ id: host.id, name: host.name }], lines: [{ who: 0, text: result.text }], result: [`+${result.coins} moedas`],
    }]);
  }
  changed();
  dialog.value = { name: result.title, text: `${result.text}\n\n+${result.coins} moedas.`, actions: [{ label: 'Voltar ao mural', run: openRequestBoard }] };
}

async function rollSurvivalDigitalOptions(total: number): Promise<SurvivalDigitalOption[]> {
  const used = new Set(state.digital.instances.map((instance) => instance.dexId));
  const options: SurvivalDigitalOption[] = [];
  for (let index = 0; index < total; index++) {
    let species: SpeciesRef | null = null;
    for (let attempt = 0; attempt < 30 && !species; attempt++) {
      const dexId = 1 + Math.floor(Math.random() * LAST_DEX_ID);
      if (used.has(dexId)) continue;
      used.add(dexId);
      species = await resolveSpeciesByDexId(dexId).catch(() => null);
    }
    if (!species) continue;
    const sprite = await getDigitalSprite(species.dexId, false).catch(() => null);
    options.push({ ...species, thumb: sprite ? thumbOf(sprite.gif) : null });
  }
  return options;
}

async function chooseSurvivalDigital(option: SurvivalDigitalOption): Promise<void> {
  if (survivalDigitalBusy.value || !survivalDigitalChoice.value) return;
  survivalDigitalBusy.value = true;
  const next = grantSurvival(state.digital, option, new Date().toISOString());
  state.digital = next;
  changed();
  survivalDigitalChoice.value = null;
  const instance = next.instances[next.instances.length - 1]!;
  const sprite = await getDigitalSprite(option.dexId, false).catch(() => null);
  await syncDigitalVillager(instance);
  survivalDigitalCutscene.value = { species: option, spriteUrl: sprite ? thumbOf(sprite.gif) : null };
  survivalDigitalBusy.value = false;
}

async function recordSurvivalAdventure(summary: import('../core/survivor').SurvivorSummary, participant: { id: string; name: string }, runId: string): Promise<void> {
  const id = `survival:${runId}`;
  if (state.diary.some((entry) => entry.id === id)) return;
  const now = new Date();
  const time = `${Math.floor(summary.survivedMs / 60000)}:${String(Math.floor(summary.survivedMs / 1000) % 60).padStart(2, '0')}`;
  const won = summary.finalBossBeaten ? 'A Torre foi vencida!' : `Chegou até a onda ${summary.wave}.`;
  const milestoneRewards: string[] = [];
  if (summary.survivedMs >= SURVIVOR_LOVE_CANDY_MS) {
    add(state, 'love-candy');
    milestoneRewards.push('🍬 Love Candy');
  }
  if (summary.survivedMs >= SURVIVOR_TRUST_STONE_MS) {
    add(state, 'trust-stone');
    milestoneRewards.push('💠 Pedra da Confiança');
  }
  if (summary.survivedMs >= SURVIVOR_MEGA_SHARD_MS) {
    add(state, 'mega-stone-shard');
    milestoneRewards.push('💎 Fragmento de Mega Stone');
  }
  const shadowTrustStones = Math.max(0, Math.floor(summary.shadowTrustStones ?? 0));
  for (let i = 0; i < shadowTrustStones; i++) add(state, 'trust-stone');
  if (shadowTrustStones > 0) milestoneRewards.push(`💠 ${shadowTrustStones} Pedra${shadowTrustStones === 1 ? '' : 's'} da Confiança (lendário sombrio)`);
  state.diary = trimMoments([...state.diary, {
    id, t: now.getTime(), day: refreshDay(), hour: now.getHours(), tpl: 'survival-adventure', kind: 'amizade', title: `Aventura na Torre · ${participant.name}`, emoji: '🗼',
    cast: [{ id: participant.id, name: participant.name }], lines: [{ who: 0, text: `${participant.name} enfrentou a Torre por ${time}.` }],
    result: [`${summary.kills} derrotas · nível ${summary.level} · onda ${summary.wave}.`, won, ...(summary.digitalPokeballs > 0 ? [`${summary.digitalPokeballs} Pokébola${summary.digitalPokeballs === 1 ? '' : 's'} especial${summary.digitalPokeballs === 1 ? '' : 'is'} recolhida${summary.digitalPokeballs === 1 ? '' : 's'}.`] : []), ...(shadowTrustStones > 0 ? [`${shadowTrustStones} lendário${shadowTrustStones === 1 ? '' : 's'} sombrio${shadowTrustStones === 1 ? '' : 's'} derrotado${shadowTrustStones === 1 ? '' : 's'}: Pedra${shadowTrustStones === 1 ? '' : 's'} da Confiança assegurada${shadowTrustStones === 1 ? '' : 's'}.`] : []), ...milestoneRewards.map((reward) => `${reward} conquistado nesta corrida.`), ...(summary.finalBossBeaten ? ['O troféu da Torre foi conquistado; o modo Infinito está disponível.'] : [])],
  }]);
  changed();
  syncTrainer();
  if (milestoneRewards.length > 0) say(`Recompensas da Torre: ${milestoneRewards.join(' · ')}.`, 7000);
  if (summary.digitalPokeballs > 0) {
    const options = await rollSurvivalDigitalOptions(summary.digitalPokeballs);
    if (options.length > 0) survivalDigitalChoice.value = { options, total: summary.digitalPokeballs, runId };
    else say('As Pokébolas foram registradas, mas não consegui confirmar opções de espécie agora. Tente voltar com conexão.', 7000);
  }
}

function finishGuidedTrip(): void {
  const trip = guidedTrip;
  guidedTrip = null;
  guidedTripVersion.value++;
  minimapRoute.value = '';
  if (!trip) return;
  if (state.follower === trip.id) {
    state.follower = null;
    changed();
  }
  const f = friendOf(state, trip.id);
  f.points = Math.min(100, f.points + 6);
  const mon = mons.value.find((m) => m.id === trip.id);
  const now = new Date();
  state.diary = trimMoments([...state.diary, {
    id: `passeio:${trip.id}:${now.getTime()}`,
    t: now.getTime(), day: refreshDay(), hour: now.getHours(), tpl: 'passeio-guiado', kind: 'amizade', title: `Passeio até ${trip.destination.place}`, emoji: '🚶',
    cast: [{ id: trip.id, name: mon?.name ?? nameOf(trip.id) }],
    lines: [{ who: 0, text: `${mon?.name ?? nameOf(trip.id)} adorou conhecer ${trip.destination.place} com você.`, fx: 'heart' }],
    result: ['+6 amizade'],
  }]);
  changed();
  game?.bubble(trip.id, '💖');
  say(`🚶 Passeio concluído! ${mon?.name ?? nameOf(trip.id)} ganhou +6 de amizade e o momento foi para o Diário.`);
}

function cancelGuidedTrip(): void {
  const trip = guidedTrip;
  guidedTrip = null;
  guidedTripVersion.value++;
  minimapRoute.value = '';
  if (!trip) return;
  if (state.follower === trip.id) state.follower = null;
  game?.setWaiting(null);
  changed();
  say(`🚶 Passeio com ${nameOf(trip.id)} encerrado. Nenhuma recompensa foi registrada.`);
}

function updateWorldProgress(): void {
  if (!game) return;
  const discovery = discoverAt(state, game.player.x, game.player.y);
  if (discovery) {
    if (discovery.rewardCoins > 0) earnCoins(discovery.rewardCoins);
    if (discovery.rewardItem) add(state, discovery.rewardItem, 1);
    if (discovery.rewardFurniture) add(state, discovery.rewardFurniture, 1);
    // A página só nasce ao encontrar o ponto no mapa. Não reconstituímos "segredos" antigos em saves já avançados.
    if (discovery.completed && discovery.diary && !state.diary.some((moment) => moment.id === `desc:${discovery.id}`)) {
      const now = new Date();
      state.diary = trimMoments([...state.diary, {
        id: `desc:${discovery.id}`, t: now.getTime(), day: refreshDay(), hour: now.getHours(), tpl: `descoberta:${discovery.id}`, kind: 'solo', title: discovery.title, emoji: '🔎',
        cast: [{ id: 'player', name: profile.name }], lines: [{ who: 0, text: discovery.diary }],
        result: [`+${discovery.rewardCoins} moedas`, `+1 ${itemName(discovery.rewardItem!)}`, `Nova peça: ${itemName(discovery.rewardFurniture!)}`], fav: true,
      }]);
    }
    say(`${discovery.text}${discovery.rewardCoins ? ` +${discovery.rewardCoins} moedas` : ''}${discovery.rewardItem ? ` e ${itemName(discovery.rewardItem)}` : ''}${discovery.rewardFurniture ? ` · nova peça: ${itemName(discovery.rewardFurniture)}` : ''}`);
    changed();
  }
  weeklyEvent.value = weeklyEventFor(state, refreshDay());
  const completed = resolveExpeditions(state, Date.now(), (id) => personalityOf(id).name, (id) => types.get(id) ?? [], (id) => friendOf(state, id).points);
  for (const expedition of completed) {
    const result = expedition.result;
    if (!result) continue;
    earnCoins(result.coins);
    if (result.item) add(state, result.item, result.qty);
    say(`🧭 ${result.text} +${result.coins} moedas${result.item ? ` e ${result.qty} ${itemName(result.item)}` : ''}`);
  }
  if (completed.length > 0) changed();
}

function villageHour(): number {
  return (new Date().getHours() + requestInfluence(state, refreshDay()).hourShift + weeklyModifiers(state).hourShift) % 24;
}

function beginExpedition(monId: string, place: DiscoveryPlace): void {
  const result = startExpedition(state, monId, place, Date.now(), game?.weatherKind ?? null);
  say(result.message);
  if (result.ok) changed();
}

function checkGuidedTrip(): void {
  const trip = guidedTrip;
  if (!trip || !game || game.walking) return;
  if (state.follower !== trip.id) { guidedTrip = null; guidedTripVersion.value++; minimapRoute.value = ''; return; }
  if (guidedWalkArrived(game.player, game.villagers.get(trip.id), trip.destination)) finishGuidedTrip();
}

function checkTapInteraction(): void {
  const target = tapInteraction;
  if (!target || !game || game.walking) return;
  const distance = Math.abs(game.player.x - target.x) + Math.abs(game.player.y - target.y);
  if (distance <= 1) {
    tapInteraction = null;
    game.facePoint(target.x, target.y);
    pressA();
  }
}

function startGuidedTrip(id: string, destination = GUIDED_DESTINATIONS[(state.seed + id.length + refreshDay().length) % GUIDED_DESTINATIONS.length]!): void {
  if (!game) return;
  guidedTrip = { id, destination };
  guidedTripVersion.value++;
  minimapRoute.value = `Passeio: ${destination.place}`;
  state.follower = id;
  game.setWaiting(null);
  tapInteraction = null;
  dialog.value = null;
  game.walkTo(destination.x, destination.y);
  changed();
  say(`🚶 ${nameOf(id)} vai seguir você até ${destination.place}.`);
}

function closeVillageSheet(): void {
  sheet.value = null;
  homeInteriorLot.value = null;
  selectedHomeItem.value = null;
  bookDialogId.value = null;
  askingMon = null;
  heldKeys.clear();
  dpadPointers.clear();
  tapInteraction = null;
  game?.setWaiting(null);
  game?.holdStick(null);
}

function requestCloseSheet(): void {
  const action = villageSheetCloseAction(sheet.value, tab.value === 'inicio');
  if (action === 'back') tab.value = 'inicio';
  else if (action === 'tower') towerGameRef.value?.requestLeave();
  else if (action === 'close') closeVillageSheet();
}

function openBookFromDialog(id: string): void {
  bookDialogId.value = id;
  tab.value = 'livro';
  sheet.value = 'menu';
}

function openBuilding(b: Building): void {
  if (b.kind === 'fountain') return openFountain(b);
  playSound('village-door');
  if (level.value < b.unlock) {
    const text = b.kind === 'home'
      ? `Um terreno vazio, com uma placa: "Em breve, uma casa". Ele é liberado no nível ${b.unlock} de Treinador (você está no ${level.value}). Escaneie cartas, batalhe e jogue para ganhar XP.`
      : `Em obras: o ${b.name} abre no nível ${b.unlock} de Treinador (você está no ${level.value}).`;
    dialog.value = { name: b.kind === 'home' ? `Terreno ${b.lot! + 1}` : b.name, text, actions: [{ label: 'Ok', run: closeDialog }] };
    return;
  }
  if (b.kind === 'home') return openHome(b);
  if (b.kind === 'altar') {
    cardEvolutionAtAltar.value = true;
    sheet.value = 'card-evolution';
    say('💠 Altar da Confiança: amizade máxima e 5 Pedras da Confiança evoluem uma carta sem as três provas.', 5200);
    return;
  }
  if (b.kind === 'arcade' || b.kind === 'pins' || b.kind === 'arena' || b.kind === 'torre') return openGameBuilding(b);
  if (b.kind === 'mail') return openMail();
  if (b.kind === 'cafe') {
    const text = `Cheiro de bolo no ar! Um lanche aqui custa ${CAFE_PRICE} moedas e rende amizade com os Pokémon que estão por perto (uma vez por dia). Você tem ${state.coins}.`;
    dialog.value = {
      name: b.name,
      text,
      actions: [
        {
          label: `Lanchar (${CAFE_PRICE})`,
          disabled: state.coins < CAFE_PRICE || state.town.cafeDay === day.value,
          run: () => {
            const near = actorList().filter((a) => game!.playerNear([a.id], 8) && !game!.sceneBusy(a.id)).map((a) => a.id);
            const r = cafeVisit(state, refreshDay(), near, namesById());
            if (r.ok) {
              changed();
              earnCoins(15);
              for (const id of near.slice(0, 4)) game?.pop(id, '☕');
            }
            dialog.value = { name: b.name, text: r.message, actions: [{ label: 'Ok', run: closeDialog }] };
          },
        },
        { label: 'Sair', run: closeDialog },
      ],
    };
    return;
  }
  const done = state.collected.length;
  dialog.value = {
    name: b.name,
    text: `Vitrines de tudo o que você já juntou. Móveis na coleção: ${done} de ${FURNITURE_IDS.length}. Momentos no Álbum: ${album.value.seen} de ${album.value.total}.`,
    actions: [
      ...(challengeGalleryUnlocked(state) ? [{ label: 'Visitar a vitrine de desafios', run: () => { closeDialog(); sheet.value = 'gallery'; } }] : []),
      { label: 'Ver a coleção', run: () => { closeDialog(); tab.value = 'colecao'; sheet.value = 'menu'; } },
      { label: 'Ver o Álbum', run: () => { closeDialog(); tab.value = 'album'; sheet.value = 'menu'; } },
      { label: 'Sair', run: closeDialog },
    ],
  };
}

/** Os prédios do bairro dos jogos: cada um abre um modo de verdade do app (nada aqui é uma imitação). */
function goToPins(): void {
  closeDialog();
  window.location.hash = routeHref('pins', undefined, ['vila']);
}

function goToPvp(): void {
  closeDialog();
  closeVillageSheet();
  emit('close', 'pvp');
}

/** Coliseu → Arena 3D: o palco virtual da Caixa, sem câmera nem sensores. */
function goToArena3d(): void {
  closeDialog();
  closeVillageSheet();
  emit('close', 'arena3d');
}

/** Coliseu → Caixa em AR: a câmera e os sensores, com os Pokémon no chão da sua sala. */
function goToCaixa(): void {
  closeDialog();
  closeVillageSheet();
  emit('close', 'caixa');
}

function goToArena(): void {
  closeDialog();
  closeVillageSheet();
  window.location.hash = routeHref('arena', undefined, ['vila']);
}

/** Fliperama → batalha na Arena 3D: fecha a Vila e abre o palco virtual (sem câmera) com a batalha em destaque. */
function goToBattle3d(): void {
  closeDialog();
  closeVillageSheet();
  emit('close', 'batalha3d');
}

/** Fliperama → batalha na câmera: fecha a Vila e já abre a câmera e os sensores da Caixa (no mesmo toque). */
function goToBattle(): void {
  closeDialog();
  closeVillageSheet();
  emit('close', 'batalha');
}
const battleRewardText = computed(() => {
  const left = battleRewardsLeft(state, day.value);
  return left > 0 ? `+${BATTLE_REWARD_COINS} moedas por batalha · ${left} de ${BATTLE_REWARDS_PER_DAY} hoje` : `as moedas de hoje já saíram (${BATTLE_REWARDS_PER_DAY} de ${BATTLE_REWARDS_PER_DAY}); amanhã tem mais`;
});

function openGameBuilding(b: Building): void {
  const exit = { label: 'Sair', run: closeDialog };
  if (b.kind === 'arcade') {
    dialog.value = {
      name: b.name,
      text: `Luzes piscando e o barulhinho das máquinas! Aqui você joga os minigames (Quem é esse Pokémon?, Tipos e Memória) com as cartas que já escaneou — ou vai direto para uma batalha da sua caixa, na Arena 3D ou na câmera (${battleRewardText.value}).`,
      actions: [
        { label: '🏟️ Batalha na Arena 3D', run: goToBattle3d },
        { label: '📷 Batalha na câmera', run: goToBattle },
        { label: 'Jogar minigames', run: () => { closeDialog(); sheet.value = 'arcade'; } },
        exit,
      ],
    };
  } else if (b.kind === 'pins') {
    dialog.value = {
      name: b.name,
      text: 'A pista de Pins: derrube os pinos do adversário com os golpes dos seus Pokémon, sozinho ou contra um amigo (PvP). Ela abre numa tela própria; um botão leva de volta à Vila.',
      actions: [{ label: 'Jogar Pins', run: goToPins }, exit],
    };
  } else if (b.kind === 'arena') {
    dialog.value = {
      name: b.name,
      text: 'O Coliseu da Vila! Aqui os seus Pokémon lutam: na Arena 3D, um Coliseu virtual sem câmera, ou na Caixa em AR, com a luta no chão da sua sala pela câmera. A Liga (Ginásios, Elite 4 e Campeã), as corridas 6×6 e o PvP também saem daqui.',
      actions: [
        { label: '🏟️ Arena 3D (sem câmera)', run: goToArena3d },
        { label: '📷 Caixa em AR (câmera)', run: goToCaixa },
        { label: '🏅 Liga e corridas 6×6', run: goToArena },
        { label: 'Batalhar com um amigo (PvP)', run: goToPvp },
        exit,
      ],
    };
  } else {
    dialog.value = {
      name: b.name,
      text: 'A Torre de Sobrevivência: suba com o seu Pokémon enquanto ondas de inimigos selvagens ficam mais difíceis com o tempo. Ataque sozinho em quem chegar perto, suba de nível, escolha upgrades e veja até onde aguenta.',
      actions: [{ label: 'Entrar na Torre', run: () => { closeDialog(); sheet.value = 'torre'; } }, exit],
    };
  }
}

function openFountain(b: Building): void {
  playSound('village-water');
  const next = nextUnlock(level.value);
  const open = LOTS.filter((l) => level.value >= l.unlock).length;
  dialog.value = {
    name: `${b.name} · ${stage.value.name}`,
    text: `Nível ${level.value} de Treinador: ${open} de ${LOTS.length} terrenos liberados. ${next ? `No nível ${next.level}: ${next.text}.` : 'A cidade já está completa!'} Jogue uma moeda para fazer um pedido, ou use as suas moedas (${state.coins}) pra invocar ou evoluir um Digital Pokémon.`,
    actions: [
      {
        label: 'Jogar uma moeda',
        disabled: state.coins < 1,
        run: () => {
          const wish = wishAtFountain(state.coins, state.fountainWishes);
          if (!wish) return;
          state.coins = wish.coinsAfter;
          state.fountainWishes = wish.wishesAfter;
          playSound('bell');
          changed();
          closeDialog();
          if (wish.showHoOhCutscene) {
            // O marco é gravado imediatamente após gastar a moeda: recarregar ou pular não repete a cena.
            state.hoOhWishSeen = true;
            changed();
            persist();
            hoOhWishScene.value = { spriteUrl: '' };
            void getLocalVillageSprite(250, false, 'Walk').then(async (sprite) => {
              const flight = sprite ?? (await getDigitalSprite(250, false))?.gif;
              if (flight && hoOhWishScene.value) hoOhWishScene.value.spriteUrl = thumbOf(flight);
            }).catch(() => undefined);
            return;
          }
          if (Math.random() < 0.06) {
            state.coins += 5;
            say('✨ A fonte brilhou e devolveu 5 moedas!');
          } else say('✨ Você fez um pedido…');
        },
      },
      {
        // Sem moedas suficientes o botão diz quanto falta (antes só ficava cinza, parecendo que a Fonte travou).
        label: canAffordSummon(state.coins)
          ? `Invocar Digital Pokémon (${SUMMON_COST} moedas)`
          : `Invocar Digital Pokémon: faltam ${SUMMON_COST - state.coins} moedas`,
        disabled: !canAffordSummon(state.coins),
        run: () => void doSummon(),
      },
      ...(COIN_SUMMON_ENABLED
        ? [{ label: `Invocar qualquer um na sorte (${COIN_SUMMON_COST} moedas)`, disabled: state.coins < COIN_SUMMON_COST, run: () => void doCoinSummon() }]
        : []),
      { label: 'Evoluir um Digital Pokémon', disabled: state.digital.instances.length === 0, run: () => openEvolveList(b) },
      { label: 'Evoluir Pokémon das cartas', run: () => { closeDialog(); cardEvolutionAtAltar.value = false; sheet.value = 'card-evolution'; } },
      { label: 'Sair', run: closeDialog },
    ],
  };
}

/** Quantas vezes você bateu seguidas na porta de cada casa (zera depois de 3 minutos sem bater): cada batida a mais convence mais. */
const knocks = new Map<number, { n: number; at: number }>();
const KNOCK_MEMORY_MS = 3 * 60000;

function knockAt(b: Building, ids: string[]): void {
  const lot = b.lot ?? 0;
  const now = Date.now();
  const prev = knocks.get(lot);
  const before = prev && now - prev.at < KNOCK_MEMORY_MS ? prev.n : 0;
  const r = knockDoor(
    ids.map((id) => ({ id, name: nameOf(id), asleep: !!game?.isAsleep(id) })),
    villageHour(),
    Math.random,
    before,
  );
  if (r.wake.length > 0 || r.refused.length > 0) knocks.set(lot, { n: before + 1, at: now });
  if (r.wake.length > 0) knocks.delete(lot);
  for (const id of r.wake) game?.wake(id, r.stayUpMs, r.grumpy.includes(id));
  if (r.refused.length > 0) game?.grumble(r.refused[0]!);
  const actions: { label: string; run: () => void }[] = [];
  if (r.refused.length > 0) actions.push({ label: 'Bater de novo', run: () => knockAt(b, ids) });
  actions.push({ label: r.wake.length > 0 ? 'Ok' : 'Deixar dormir', run: closeDialog });
  dialog.value = { name: ids.length === 1 ? nameOf(ids[0]!) : `Casa ${lot + 1}`, text: r.text, actions };
}

function openHome(b: Building, view: 'main' | 'decor' | 'roof' | 'inside' = 'main'): void {
  const lot = b.lot ?? 0;
  const ids = residentsOf(homes, lot);
  const names = ids.map((id) => nameOf(id));
  const v = homeOf(state, lot);
  const lvl = homeLevel(v);
  const sleeping = ids.length > 0 && ids.every((id) => game?.isAsleep(id));
  const title = ids.length === 0 ? `Terreno ${lot + 1} · livre` : `${HOME_STAGES[lvl]!.name} · ${names.join(' e ')}`;
  const again = (to: 'main' | 'decor' | 'roof' | 'inside' = view) => openHome(b, to);
  if (view === 'inside') {
    if (ids.length === 0) {
      dialog.value = { name: title, text: 'Este terreno ainda está vazio. Quando alguém vier morar aqui, a casa vai ganhar um interior próprio.', actions: [{ label: 'Voltar', run: () => again('main') }] };
      return;
    }
    dialog.value = null;
    homeInteriorLot.value = lot;
    sheet.value = 'home';
    return;
  }
  if (view === 'decor') {
    dialog.value = {
      name: title,
      text: 'Enfeites da casa (colocar custa moedas; tirar é de graça). Quem mora lá gosta.',
      actions: [
        ...HOME_DECORS.map((d) => {
          const on = (homeDecor(v) & d.bit) !== 0;
          return {
            label: on ? `Tirar: ${d.name}` : `${d.name} (${d.cost})`,
            disabled: !on && state.coins < d.cost,
            run: () => {
              const r = toggleDecor(state, lot, d, ids);
              say(r.message);
              if (r.ok) {
                changed();
                if (ids[0]) game?.pop(ids[0], '😍');
              }
              again();
            },
          };
        }),
        ...HOME_EXTERIOR_STYLES.map((style) => ({
          label: style.id === homeStyleOf(state, lot) ? `✓ Fachada ${style.name}` : `Fachada ${style.name} (${style.cost})`,
          disabled: style.id === homeStyleOf(state, lot) || state.coins < style.cost,
          run: () => {
            const result = setHomeStyle(state, lot, style.id, ids);
            say(result.message);
            if (result.ok) { changed(); for (const id of ids) game?.pop(id, '✨'); }
            again('decor');
          },
        })),
        { label: 'Voltar', run: () => again('main') },
      ],
    };
    return;
  }
  if (view === 'roof') {
    dialog.value = {
      name: title,
      text: `Tinta para o telhado: ${PAINT_COST} moedas por mão. Cor de agora: ${ROOFS[roofIndex(v, lot)]!.name.toLowerCase()}.`,
      actions: [
        ...ROOFS.map((r, i) => ({
          label: r.name,
          disabled: state.coins < PAINT_COST || roofIndex(v, lot) === i,
          run: () => {
            const res = paintRoof(state, lot, i, ids);
            say(res.message);
            if (res.ok) changed();
            again();
          },
        })),
        { label: 'Voltar', run: () => again('main') },
      ],
    };
    return;
  }
  const next = HOME_STAGES[lvl + 1];
  const comment = homeComment(state, lot, names, sleeping, Math.random);
  const actions: { label: string; run: () => void; disabled?: boolean }[] = [];
  if (ids.length > 0) {
    actions.push({ label: 'Bater na porta', run: () => knockAt(b, ids) });
    if (next) {
      actions.push({
        label: `Reformar: ${next.name}`,
        run: () => {
          const r = upgradeHome(state, lot, ids);
          say(r.message);
          if (r.ok) {
            changed();
            for (const id of ids) game?.pop(id, '🎉');
          }
          again();
        },
      });
    }
    actions.push({ label: 'Decorar', run: () => again('decor') });
    actions.push({ label: 'Pintar o telhado', run: () => again('roof') });
    actions.push({ label: 'Entrar e decorar por dentro', run: () => again('inside') });
  }
  actions.push({ label: 'Sair', run: closeDialog });
  dialog.value = { name: title, text: next && ids.length > 0 ? `${comment}\n\nReforma (${next.name}): ${describeCost(state, next.cost)}.` : comment, actions };
}

// ---- momentos entre os Pokémon (a vida social da Vila)
let pendingChoice: { scene: Scene; ids: string[] } | null = null;
/** O momento que está sendo encenado agora e ainda não foi gravado (se você sair no meio, ele é gravado do mesmo jeito). */
let activeScene: { scene: Scene; ids: string[] } | null = null;
/** Intervalo entre momentos: de 80 a 170 s (era de 25 a 60 s), para a Vila respirar entre um e outro. */
const SCENE_GAP_MIN = 80000;
const SCENE_GAP_VAR = 90000;
let nextSceneAt = Date.now() + 20000;
let sceneTimer: ReturnType<typeof setInterval> | null = null;
let nextAmbientSoundAt = Date.now() + 18000;

function announce(r: Resolved): void {
  changed();
  if (r.firstTime) {
    trainerEvent('moment');
  }
  // Momentos ambientes ficam no Diário e na abertura diária, sem interromper o passeio.
}

function afterResolve(r: Resolved, ids: string[]): void {
  announce(r);
  const letter = queueMomentMail(state.mail, r.moment, friendLevelOf);
  if (letter) {
    game?.deliverMail(letter.involvedIds);
  }
  if (letter && r.firstTime) {
    say(`📬 ${letter.fromName} escreveu sobre “${r.moment.title}”. Veja no Correio quando quiser.`, 4800);
  }
  if (r.followUp.length > 0 && game) {
    const firstSpeaker = ids[r.followUp[0]?.who ?? 0];
    minimapSpeakerId.value = firstSpeaker ?? null;
    game.sayLines(ids, r.followUp, () => {
      if (minimapSpeakerId.value === firstSpeaker) minimapSpeakerId.value = null;
    });
  } else {
    minimapSpeakerId.value = null;
  }
}

/** Sua decisão num momento (`null` = deixar pra lá). */
function decide(i: number | null): void {
  const p = pendingChoice;
  if (!p) return;
  pendingChoice = null;
  dialog.value = null;
  afterResolve(resolveScene(state, p.scene, i, Date.now()), p.ids);
}

function finishScene(scene: Scene, ids: string[]): void {
  activeScene = null;
  const choice = sceneChoice(scene);
  if (!choice || !game?.playerNear(ids, 12)) {
    afterResolve(resolveScene(state, scene, null, Date.now()), ids);
    return;
  }
  pendingChoice = { scene, ids };
  dialog.value = {
    id: ids[0],
    name: `${scene.tpl.emoji} ${scene.tpl.title}`,
    text: choice.prompt,
    actions: [
      ...choice.options.map((o, i) => {
        const lacks = !!o.needs && count(state, o.needs.item) < o.needs.qty;
        return { label: o.needs ? `${o.label} (${o.needs.qty} ${itemName(o.needs.item)})` : o.label, disabled: lacks, run: () => decide(i) };
      }),
      { label: 'Deixa pra lá', run: () => decide(null) },
    ],
  };
}

let nextCafeSceneAt = 0;
function tickScenes(): void {
  if (!game || document.hidden || dialog.value || quiz.value || quizOpen.value || cutsceneOpen.value || hoOhWishScene.value || legendaryScene.value || recapScenes.value.length > 0 || sheet.value || welcome.value || game.sceneActive || mons.value.length === 0) return;
  const cafeIds = game.cafeCompanions();
  const cafeOpportunity = cafeIds.length >= 2 && Date.now() >= nextCafeSceneAt && game.playerNear(cafeIds, 18);
  if (Date.now() < nextSceneAt && !cafeOpportunity) return;
  if (cafeOpportunity) nextCafeSceneAt = Date.now() + 60000;
  nextSceneAt = Date.now() + (SCENE_GAP_MIN + Math.random() * SCENE_GAP_VAR) * effects().quietFactor;
  // Só entre os Pokémon que estão por perto, para você não perder o espetáculo.
  const useCafe = cafeOpportunity && Math.random() < .65;
  const near = actorList().filter((a) => (useCafe ? cafeIds.includes(a.id) : game!.playerNear([a.id], 14)) && !game!.sceneBusy(a.id));
  const env = makeEnv(state, refreshDay(), villageHour(), game.weatherKind, profile.name);
  env.cafeGuests = cafeIds;
  const scene = pickMoment(near, state, env, Math.random);
  if (!scene) return;
  const ids = scene.cast.map((a) => a.id);
  activeScene = { scene, ids };
  minimapSpeakerId.value = ids[0] ?? null;
  if (!game.playScene(ids, scene.lines, () => finishScene(scene, ids))) {
    activeScene = null;
    minimapSpeakerId.value = null;
  }
}

/** Enquanto você esteve fora, a vida seguiu: o Diário ganha os momentos que aconteceram. */
function awayCatchUp(): void {
  const now = Date.now();
  const list = actorList();
  if (list.length > 0 && state.lastSeen > 0) {
    const moments = catchUp(state, list, now, null, Math.random, profile.name);
    if (moments.length > 0) {
      for (const moment of moments) queueMomentMail(state.mail, moment, friendLevelOf);
      changed();
    }
  }
  state.lastSeen = now;
  changed();
}

/**
 * Nada se perde: se você sair (ou o aparelho fechar o app) no meio de um momento ou de uma decisão, o momento é gravado
 * agora, como "deixa pra lá", em vez de sumir.
 */
function settleScenes(): void {
  const choice = pendingChoice;
  const playing = activeScene;
  pendingChoice = null;
  activeScene = null;
  if (choice) {
    dialog.value = null;
    resolveScene(state, choice.scene, null, Date.now());
  } else if (playing) resolveScene(state, playing.scene, null, Date.now());
  minimapSpeakerId.value = null;
  if (choice || playing) game?.abortScene();
}

let warnedSave = false;
function persist(): boolean {
  const ok = saveVillage(state);
  if (!ok && !warnedSave) {
    warnedSave = true;
    say('⚠️ Não consegui salvar a Vila neste aparelho (sem espaço ou modo privado). Libere espaço do navegador para não perder o progresso.');
  } else if (ok) warnedSave = false;
  return ok;
}

function onLeave(): void {
  cancelFarm();
  guidedTrip = null;
  minimapRoute.value = '';
  settleScenes();
  state.lastSeen = Date.now();
  persist();
}

function onVisibility(): void {
  sound.setPaused(document.hidden);
  syncMusic();
  if (document.hidden) {
    // Saiu do app com uma tecla ou o dedo no joystick: ninguém fica andando sozinho ao voltar.
    heldKeys.clear();
    dpadPointers.clear();
    Object.assign(joy, { active: false, pointerId: -1, x: 0, y: 0 });
    game?.holdStick(null);
    onLeave();
  }
  else {
    awayCatchUp();
    prepareDailyRecap();
  }
}

/** Abre o menu compartilhado quando a Vila está livre; o B usa este mesmo caminho. */
function openMenu(): void {
  if (recapScenes.value.length || cutsceneOpen.value || loading.value || game?.sceneActive) return;
  welcome.value = false;
  updateWorldProgress();
  askingMon = null;
  dpadPointers.clear();
  tapInteraction = null;
  game?.setWaiting(null);
  game?.holdStick(null);
  tab.value = 'inicio';
  menuSection.value = 'vila';
  sheet.value = 'menu';
}

function pickTab(t: Tab): void {
  tab.value = t;
  if (t === 'diario') {
    state.diaryRead = Date.now();
    changed();
  }
}

function visitWorksite(id: WorksiteId): void {
  const site = WORK_SITES.find((entry) => entry.id === id);
  if (!site) return;
  closeVillageSheet();
  game?.walkTo(site.visit.x, site.visit.y);
  say(`${site.icon} A caminho: ${site.name} · ${site.location}.`);
}

function openSummaryMoment(entry: SummaryEntry): void {
  summaryMomentId.value = entry.momentId ?? null;
  kindFilter.value = 'todos';
  pickTab('diario');
}

function openSummaryBook(entry: SummaryEntry): void {
  if (!entry.pokemonId) return;
  openBookFromDialog(entry.pokemonId);
}

function toggleFav(m: Moment): void {
  const pin = !m.fav;
  if (!setFavorite(state, m.id, pin)) {
    say(`O Álbum está cheio (${MAX_SAVED} momentos). Solte algum para guardar outro.`);
    return;
  }
  changed();
  say(pin ? '📌 Guardado no Álbum para sempre!' : 'Solto do Álbum: sai do Diário quando ele encher.');
}

const farmSession = new FarmSession();
const farmTasks = ref<readonly FarmTask[]>([]);
const farmClock = ref(Date.now());
function cancelFarm(): void {
  farmSession.cancel();
  farmTasks.value = [];
  game?.setFarmTasks([]);
}
watch(() => !!sheet.value || !!dialog.value || !!quiz.value || quizOpen.value || cutsceneOpen.value || !!hoOhWishScene.value || !!legendaryScene.value, (blocked) => {
  if (!blocked) return;
  cancelFarm();
  heldKeys.clear();
  dpadPointers.clear();
  gamepadKeys.clear();
  game?.holdStick(null);
});

function tickFarm(): void {
  if (!game || document.hidden || sheet.value || dialog.value || quiz.value || quizOpen.value || cutsceneOpen.value || hoOhWishScene.value || legendaryScene.value || welcome.value || recapScenes.value.length || loading.value) {
    cancelFarm();
    return;
  }
  const workers = game.farmWorkers().map((worker) => ({
    ...worker, types: types.get(worker.id) ?? [],
    available: worker.available && !state.expeditions.some((expedition) => expedition.monId === worker.id && !expedition.result),
  }));
  const previousRecords = new Set(state.farm.history);
  if (farmSession.tick(state, map, workers, Date.now(), Math.random, (x, y) => game!.occupied(x, y), mons.value.length)) changed();
  const nearby = state.farm.history.find(record => !previousRecords.has(record) && workers.some(worker => worker.id === record.residentId && Math.abs(worker.x - game!.player.x) + Math.abs(worker.y - game!.player.y) <= 8));
  if (nearby) playSound(nearby.kind === 'mine' ? 'village-mine' : nearby.kind === 'lumber' ? 'village-chop' : nearby.kind === 'fish' || nearby.kind === 'water' ? 'village-water' : nearby.kind === 'plant' ? 'village-plant' : 'collect');
  farmClock.value = Date.now();
  farmTasks.value = farmSession.tasks.map((task) => ({ ...task, stand: { ...task.stand }, ...(task.crop ? { crop: { ...task.crop } } : {}) }));
  game.setFarmTasks(farmSession.tasks);
}

function refreshDay(): string {
  const today = dayKey(new Date());
  if (today !== day.value) {
    day.value = today;
    pruneHarvest(state, today);
  }
  if (game) {
    const residents = mons.value.map((mon) => {
      const monTypes = types.get(mon.id);
      return monTypes?.length ? { id: mon.id, favoriteFood: favoriteFoodOf(monTypes), types: monTypes } : { id: mon.id };
    });
    const result = advanceCommunity(state, today, residents);
    if (result.initialized || result.cycles.length > 0) changed();
    const latestCycle = result.cycles.at(-1);
    if (latestCycle) game.showCommunityActivities(latestCycle.activities, latestCycle.day);
    const notice = [...result.cycles].reverse().find((cycle) => cycle.notice)?.notice;
    if (notice) say(`🏡 ${notice}`, 6500);
    if (result.skippedDays > 0) say(`A simulação comunitária considera até sete dias de ausência; ${result.skippedDays} dia(s) mais antigo(s) ficaram sem cobrança.`, 8000);
  }
  return today;
}

function confirmFocusedAction(): boolean {
  const active = document.activeElement;
  const action = active instanceof HTMLButtonElement && !active.closest('.village-pad') ? active : focusedVillageAction;
  if (!(action instanceof HTMLButtonElement) || action.disabled || !action.isConnected || !action.closest('.village')) return false;
  action.click();
  return true;
}

function pressA(): void {
  if (legendaryScene.value) { if (!confirmFocusedAction()) legendarySceneRef.value?.advance(); return; }
  if (recapScenes.value.length) return;
  unlockSound();
  playSound('interact');
  welcome.value = false;
  if (quiz.value || quizOpen.value) {
    confirmFocusedAction();
    return;
  }
  if (dialog.value) {
    const confirmed = confirmFocusedAction();
    if (!confirmed && dialog.value.actions.length === 0) dialog.value = null;
    return;
  }
  if (sheet.value) {
    confirmFocusedAction();
    return;
  }
  if (!game) return;
  const today = refreshDay();
  const t = game.target();
  // Moradores, plantas e prédios têm prioridade; o botão "Investigar pista" cobre quando há um deles perto da pista.
  if (t.kind === 'nothing' && nearbyLegendClues(state.legendary, game.player, legendRegions.value).length) { investigateLegendClue(); return; }
  if (t.kind === 'mon' && askingMon?.id === t.id) {
    game.faceMe(t.id);
    openQuiz(t.id);
  } else if (t.kind === 'mon') {
    speakToResident(t.id);
  } else if (t.kind === 'crop') {
    const now = Date.now();
    tickCrops(state, now, effects().growthFactor);
    const ready = harvestCrop(state, t.x, t.y, Math.random);
    if (ready.ok) {
      playSound('collect');
      say(ready.message);
      changed();
      return;
    }
    const r = water(state, t.x, t.y, now);
    say(r.message);
    if (r.ok) { playSound('village-water'); changed(); }
  } else if (t.kind === 'furniture') {
    dialog.value = {
      name: itemName(t.item),
      text: 'Quer guardar na mochila?',
      actions: [
        { label: 'Guardar', run: () => { say(pickUp(state, t.x, t.y).message); changed(); dialog.value = null; } },
        { label: 'Deixar', run: () => { dialog.value = null; } },
      ],
    };
  } else if (t.kind === 'plot') {
    openPlayerHome();
  } else if (t.kind === 'building') {
    openBuilding(t.building);
  } else if (t.kind === 'shop') {
    shopTab.value = 'comprar';
    sheet.value = 'shop';
  } else if (t.kind === 'bell') {
    ringBell();
  } else if (t.kind === 'seed-box') {
    sheet.value = 'farm';
  } else if (t.kind === 'leisure') {
    const place = LEISURE_SPOTS.find((p) => p.id === t.id)!;
    dialog.value = { name: `${place.icon} ${place.name}`, text: place.description, actions: [
      { label: place.action, run: () => { const nearby = mons.value.filter((m) => game!.playerNear([m.id], 5)).map((m) => m.id); const result = enjoyVillagePlace(state, place.id, refreshDay(), nearby); say(result.message, 5200); if (result.ok) { changed(); for (const id of nearby.slice(0, 3)) game?.pop(id, '❤️'); } closeDialog(); } },
      { label: 'Voltar', run: closeDialog },
    ] };
  } else if (t.kind === 'worksite') {
    tab.value = 'trabalhos';
    sheet.value = 'menu';
  } else if (t.kind === 'board') {
    openRequestBoard();
  } else if (t.kind === 'tile' && t.tile === 'water') {
    if (fishing) return;
    playSound('village-water');
    if (state.fishing.day === today && state.fishing.casts >= FISH_PER_DAY) return say('Os peixes cansaram por hoje. Volte amanhã!');
    fishing = true;
    game.castLine(t.x, t.y, 1600);
    say('🎣 Lançou a linha…');
    setTimeout(() => {
      fishing = false;
      const r = fish(state, map, t.x, t.y, today, Math.random);
      say(r.message);
      if (r.ok) {
        playSound('collect');
        changed();
      }
    }, 1500);
  } else if (t.kind === 'tile' && t.tile === 'deco') {
    const board = map.decor.find((decor) => decor.kind === 'board' && decor.x === t.x && decor.y === t.y);
    if (board) openRequestBoard();
  } else if (t.kind === 'tile') {
    const r = harvest(state, map, t.x, t.y, today, Math.random);
    say(r.message);
    if (r.ok) {
      playSound(t.tile === 'tree' ? 'village-chop' : t.tile === 'rock' ? 'village-mine' : 'collect');
      changed();
    }
  }
}

/** O sino da praça: chama todo Pokémon acordado para perto dele. */
function ringBell(): void {
  if (!game) return;
  const r = game.ringBell(performance.now(), requestInfluence(state, refreshDay()).bellBonus);
  const names = (ids: string[]) => ids.map((id) => nameOf(id)).join(', ');
  if (r.coming.length === 0 && r.sleeping.length === 0) return say('🔔 Dlim-dlom! Ainda não mora nenhum Pokémon na Vila.');
  const sleep = r.sleeping.length > 0 ? ` Dormindo em casa (não vêm): ${names(r.sleeping)}.` : '';
  say(r.coming.length > 0 ? `🔔 Dlim-dlom! Vindo para a praça: ${names(r.coming)}.${sleep}` : `🔔 Dlim-dlom!${sleep}`, 4200);
}

// ---- Minimapa: a Vila inteira num canto, com lugares, rota e quem está falando; tocar aumenta, e no grande um toque leva até lá.
const miniEl = ref<HTMLCanvasElement | null>(null);
const miniBig = ref(false);
const minimapTick = ref(0);
let miniBase: HTMLCanvasElement | null = null;
let miniTimer: ReturnType<typeof setInterval> | null = null;
/** Pixels por bloco no minimapa (o grande é o mesmo desenho, só que maior na tela). */
let MINI_K = 3;
const minimapGuides = [
  ...map.buildings.filter((b) => b.kind !== 'home').map((b) => ({ name: b.name, icon: ({ cafe: '☕', mail: '✉️', museum: '🏛️', arcade: '🕹️', pins: '🎳', arena: '⚔️', torre: '🗼', fountain: '⛲' } as Record<string, string>)[b.kind] ?? '📍', x: b.door.x, y: b.door.y })),
  ...WORK_SITES.map((p) => ({ name: p.name, icon: p.icon, ...p.visit })),
  ...LEISURE_SPOTS,
];
function visitMapGuide(place: { name: string; x: number; y: number }): void { game?.walkTo(place.x, place.y); minimapRoute.value = place.name; miniBig.value = false; say(`🧭 Caminhando até ${place.name}…`); }
const minimapSpeakerName = computed(() => minimapSpeakerId.value ? nameOf(minimapSpeakerId.value) : '');
const minimapRouteLabel = computed(() => minimapRoute.value);
const guidedTripActive = computed(() => { guidedTripVersion.value; return !!guidedTrip; });
const MINIMAP_BUILDING_ICONS: Record<string, string> = {
  cafe: '☕', mail: '📬', museum: '🏛️', arcade: '🕹️', pins: '🎳', arena: '⚔️', torre: '🗼', fountain: '⛲',
};
const MINIMAP_WORKSITE_ICONS: Record<string, string> = { farm: '🌱', mine: '⛏️', lumber: '🪓', fishing: '🎣' };
const guidedRouteStatus = computed(() => {
  minimapTick.value;
  const trip = guidedTrip;
  if (!trip || !game) return '';
  const progress = guidedWalkProgress(game.player, game.villagers.get(trip.id), trip.destination);
  const companion = progress.companionDistance === null ? 'companheiro indisponível' : `${progress.companionDistance} bloco(s) do destino`;
  return `${progress.playerDistance} bloco(s) para você · ${companion}`;
});

function buildMiniBase(): void {
  const c = document.createElement('canvas');
  c.width = map.w;
  c.height = map.h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(map.w, map.h);
  img.data.set(minimapPixels(map));
  ctx.putImageData(img, 0, 0);
  miniBase = c;
}

function drawMini(): void {
  const el = miniEl.value;
  if (!el || !game) return;
  if (!miniBase) buildMiniBase();
  const rect = el.getBoundingClientRect();
  if (!rect.width) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
  if (el.width !== width || el.height !== height) { el.width = width; el.height = height; }
  MINI_K = el.width / map.w;
  const ctx = el.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(miniBase!, 0, 0, map.w * MINI_K, map.h * MINI_K);
  const dot = (x: number, y: number, color: string, r: number) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc((x + 0.5) * MINI_K, (y + 0.5) * MINI_K, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  const square = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x * MINI_K + 0.5, y * MINI_K + 0.5, Math.max(1, w * MINI_K - 1), Math.max(1, h * MINI_K - 1));
  };
  const label = (text: string, x: number, y: number, color: string) => {
    if (!miniBig.value || !minimapRoute.value.includes(text.replace(/^\S+\s/, ''))) return;
    ctx.font = `700 ${12 * dpr}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const width = ctx.measureText(text).width + MINI_K * 1.8;
    const height = 19 * dpr;
    const left = Math.max(1, Math.min(map.w * MINI_K - width - 1, x * MINI_K - width / 2));
    const top = Math.max(1, y * MINI_K - height);
    ctx.fillStyle = 'rgba(8, 14, 25, 0.88)';
    ctx.fillRect(left, top, width, height);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, left + width / 2, top + height / 2 + 0.5);
  };
  const placeIcon = (icon: string, name: string, x: number, y: number, color: string) => {
    ctx.font = `${(miniBig.value ? 12 : 7) * dpr}px system-ui, "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, (x + 0.5) * MINI_K, (y + 0.5) * MINI_K);
    label(`${icon} ${name}`, x + 0.5, y - 0.1, color);
  };
  // Contornos dos lugares principais: a base continua sendo a leitura do terreno, e estes contornos ajudam a reconhecer
  // um prédio mesmo quando o minimapa está reduzido no celular.
  const placeColors: Partial<Record<string, string>> = { arcade: '#ffb347', pins: '#e78cff', arena: '#ff6d7a', torre: '#bd9cff', museum: '#71d7ff', cafe: '#ffc66d', mail: '#f5f0db', fountain: '#7de7ff' };
  for (const building of map.buildings) {
    if (building.kind === 'home') continue;
    const color = placeColors[building.kind] ?? '#ffffff';
    square(building.x, building.y, building.w, building.h, color);
    placeIcon(MINIMAP_BUILDING_ICONS[building.kind] ?? '•', building.name, building.x + building.w / 2 - 0.5, building.y + building.h / 2 - 0.5, color);
  }
  for (const site of WORK_SITES) {
    const color = site.id === 'farm' ? '#93d35b' : site.id === 'mine' ? '#b6b7c7' : site.id === 'lumber' ? '#d8a15d' : '#66bff2';
    square(site.visit.x - 1, site.visit.y - 1, 3, 3, color);
    placeIcon(MINIMAP_WORKSITE_ICONS[site.id] ?? '•', site.name, site.visit.x - 0.5, site.visit.y - 0.5, color);
  }
  for (const place of LEISURE_SPOTS) placeIcon(place.icon, place.name, place.x, place.y, '#ffe0a3');
  square(map.shop.x, map.shop.y, map.shop.w, map.shop.h, '#ffd166');
  placeIcon('🛒', 'Mercado', map.shop.x + map.shop.w / 2 - 0.5, map.shop.y + map.shop.h / 2 - 0.5, '#ffd166');
  const bell = map.decor.find((d) => d.kind === 'bell');
  if (bell) {
    ctx.font = `${MINI_K * 4}px ${'system-ui, "Segoe UI Emoji", "Noto Color Emoji", sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔔', (bell.x + 0.5) * MINI_K, (bell.y - 1) * MINI_K);
  }
  const requestPoint = (location: string): { x: number; y: number } | null => {
    const l = location.toLowerCase();
    if (l.includes('lago') || l.includes('praia')) return { x: 81, y: 16 };
    if (l.includes('bosque') || l.includes('pedreira')) return { x: 15, y: 64 };
    if (l.includes('parque')) return { x: 12, y: 48 };
    if (l.includes('fazenda') || l.includes('canteiro')) return { x: 82, y: 56 };
    if (l.includes('praça') || l.includes('mural')) return { x: 48, y: 37 };
    return null;
  };
  for (const request of state.requests.items) {
    if (request.done || request.day !== refreshDay()) continue;
    const point = requestPoint(request.location);
    if (!point) continue;
    ctx.font = `${MINI_K * 3}px ${'system-ui, "Segoe UI Emoji", "Noto Color Emoji", sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📌', (point.x + 0.5) * MINI_K, (point.y - 1) * MINI_K);
  }
  for (const [id, w] of game.villagers) if (!game.isAsleep(id)) dot(w.x, w.y, '#ffd84a', MINI_K * 0.9);
  // Pistas lendárias abertas (todas ao mesmo tempo): uma estrela por local, sem revelar de quem é.
  const clueSpots = new Set<string>();
  for (const story of openLegendClues(state.legendary, legendRegions.value)) {
    const spot = investigationPlace(story.id, legendStep(state.legendary, story.id));
    if (spot) clueSpots.add(`${spot.x},${spot.y}`);
  }
  if (clueSpots.size) {
    ctx.font = `${MINI_K * 3}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const key of clueSpots) {
      const [x, y] = key.split(',').map(Number);
      ctx.fillText('✨', (x! + 0.5) * MINI_K, (y! + 0.5) * MINI_K);
    }
  }
  const follower = state.follower ? game.villagers.get(state.follower) : undefined;
  if (follower && !game.isAsleep(state.follower!)) {
    ctx.strokeStyle = '#7de7ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc((follower.x + 0.5) * MINI_K, (follower.y + 0.5) * MINI_K, MINI_K * 1.8, 0, Math.PI * 2);
    ctx.stroke();
  }
  const route = guidedTrip?.destination;
  if (route) {
    dot(route.x, route.y, '#7de7ff', MINI_K * 1.25);
    ctx.strokeStyle = '#0b3344';
    ctx.lineWidth = 1;
    ctx.strokeRect(route.x * MINI_K, route.y * MINI_K, MINI_K, MINI_K);
  }
  // Durante um momento, acompanhe a fala atual (e não só o primeiro personagem do elenco).
  if (game.sceneSpeakerId) minimapSpeakerId.value = game.sceneSpeakerId;
  const speaker = minimapSpeakerId.value ? game.villagers.get(minimapSpeakerId.value) : undefined;
  if (speaker && !game.isAsleep(minimapSpeakerId.value!)) {
    const cx = (speaker.x + 0.5) * MINI_K;
    const cy = (speaker.y + 0.5) * MINI_K;
    // Balão de fala com cauda e três pontos: o marcador não parece mais uma
    // esfera rosa e continua legível mesmo quando o mapa está pequeno.
    const left = cx - MINI_K * 1.8;
    const top = cy - MINI_K * 4.4;
    const width = MINI_K * 3.6;
    const height = MINI_K * 2.4;
    const radius = MINI_K * 0.7;
    ctx.fillStyle = '#f7fbff';
    ctx.strokeStyle = '#2f6686';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(left + radius, top);
    ctx.lineTo(left + width - radius, top);
    ctx.quadraticCurveTo(left + width, top, left + width, top + radius);
    ctx.lineTo(left + width, top + height - radius);
    ctx.quadraticCurveTo(left + width, top + height, left + width - radius, top + height);
    ctx.lineTo(left + MINI_K * 1.05, top + height);
    ctx.lineTo(cx, cy - MINI_K * 0.2);
    ctx.lineTo(left + radius, top + height);
    ctx.quadraticCurveTo(left, top + height, left, top + height - radius);
    ctx.lineTo(left, top + radius);
    ctx.quadraticCurveTo(left, top, left + radius, top);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2f6686';
    for (const offset of [-0.8, 0, 0.8]) {
      ctx.beginPath();
      ctx.arc(cx + offset * MINI_K, top + height / 2, MINI_K * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  dot(game.player.x, game.player.y, '#ff4a4a', MINI_K * 1.3);
  minimapTick.value++;
}

function startMini(): void {
  drawMini();
  miniTimer = setInterval(drawMini, 300);
}

/** No minimapa grande, um toque leva você andando até o lugar tocado. */
function miniTap(e: MouseEvent): void {
  if (!miniBig.value) {
    miniBig.value = true;
    return;
  }
  const el = miniEl.value;
  if (!el || !game) return;
  const rect = el.getBoundingClientRect();
  const t = minimapTileAt(map, e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
  if (!t) return;
  game.walkTo(t.x, t.y);
  miniBig.value = false;
  say('🧭 Indo até lá…', 1500);
}

function miniKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  miniBig.value = !miniBig.value;
}

function openFriendDialog(id: string, text: string): void {
  const farmWork = [...state.farm.history].reverse().find((entry) => entry.residentId === id);
  if (farmWork) text += ` Meu último trabalho na Vila: ${farmWork.message}`;
  playSound('talk');
  const f = friendOf(state, id);
  const lvl = friendLevel(f.points);
  const following = state.follower === id;
  // Só o essencial na primeira tela (presente, o que depende da amizade e despedida); o resto fica em "Mais opções",
  // para quem acabou de chegar não encarar oito botões de uma vez.
  const actions: { label: string; run: () => void; disabled?: boolean }[] = [{ label: '🎁 Presentear', run: () => { giftPick.value = true; } }];
  if (id === state.mailCarrierId && professionActive('mail', mons.value.length)) actions.push({ label: '📬 Ver a bolsa do carteiro', run: () => openMailCarrierDialog(id) });
  if (following) actions.push({ label: 'Pode passear', run: () => { state.follower = null; changed(); dialog.value = null; } });
  else if (canFollow(state, id)) actions.push({ label: '🥰 Vem comigo!', run: () => { state.follower = id; changed(); game?.bubble(id, '🥰'); dialog.value = null; } });
  actions.push({ label: '⋯ Mais opções', run: () => openFriendMore(id) });
  actions.push({ label: 'Tchau', run: () => { dialog.value = null; } });
  dialog.value = { id, name: `${nameOf(id)} · ${lvl.name} ${'♥'.repeat(lvl.hearts)}${'♡'.repeat(5 - lvl.hearts)}`, text: displayResidentMessage(text), actions };
}

/** O que se faz com um morador com menos frequência: Livro, acessório, apelido e passeio. "Voltar" devolve a conversa. */
function openFriendMore(id: string): void {
  const main = dialog.value;
  dialog.value = {
    id,
    name: main?.name ?? nameOf(id),
    text: `O que você quer fazer com ${nameOf(id)}?`,
    actions: [
      { label: '📖 Ver no Livro', run: () => openBookFromDialog(id) },
      { label: '🎀 Acessório', run: () => { dialog.value = null; openDress(id); } },
      { label: nicknameOf(state, id) ? '✏️ Mudar o apelido' : '✏️ Dar apelido', disabled: !canNickname(state, id), run: () => openNickname(id) },
      { label: '🚶 Passeio guiado', run: () => openGuidedTrip(id) },
      { label: 'Voltar', run: () => { dialog.value = main; } },
    ],
  };
}

function openGuidedTrip(id: string): void {
  dialog.value = {
    id,
    name: `Passeio com ${nameOf(id)}`,
    text: 'Para onde vocês devem caminhar? O Pokémon seguirá você até o destino escolhido.',
    actions: GUIDED_DESTINATIONS.map((destination) => ({ label: `🚶 ${destination.place}`, run: () => startGuidedTrip(id, destination) })).concat({ label: 'Voltar', run: () => openFriendDialog(id, 'Escolha um destino para o passeio.') }),
  };
}

function give(item: ItemId): void {
  const id = dialog.value?.id;
  giftPick.value = false;
  if (!id) return;
  const r = giveGift(state, id, types.get(id) ?? [], item, refreshDay());
  if (r.ok) {
    playSound('gift');
    changed();
    game?.bubble(id, r.gained >= 10 ? '😍' : r.gained < 0 ? '😕' : '😊');
  }
  openFriendDialog(id, r.text + (r.ok ? friendGainNote(id, r.gained) : ''));
}

function pressB(): void {
  if (legendaryScene.value) { finishLegendaryCutscene(); return; }
  if (hoOhWishScene.value) { hoOhWishScene.value = null; return; }
  if (recapScenes.value.length) { finishRecap(); return; }
  // Com o aviso de boas-vindas na tela, o B só fecha o aviso (antes ele também abria o menu junto).
  if (welcome.value) {
    welcome.value = false;
    return;
  }
  unlockSound();
  playSound('menu');
  if (giftPick.value) giftPick.value = false;
  else if (quiz.value) quizClose();
  else if (quizOpen.value && quizStep.value > 0) quizStep.value--;
  else if (quizOpen.value) return;
  else if (pendingChoice) decide(null);
  else if (dialog.value) dialog.value = null;
  else if (sheet.value) requestCloseSheet();
  else openMenu();
}

function pressMenu(): void {
  if (legendaryScene.value) return;
  if (dialog.value || quiz.value || (sheet.value && sheet.value !== 'menu')) return;
  if (sheet.value === 'menu') {
    requestCloseSheet();
    return;
  }
  openMenu();
}

function act(result: { ok: boolean; message: string }, close = false, cue: UiSound = 'success'): void {
  say(result.message);
  if (result.ok) {
    playSound(cue);
    changed();
    if (close) closeVillageSheet();
  }
}

function doPlace(item: ItemId): void {
  const spot = game?.frontSpot();
  if (!spot) return say('Fique de frente para um lugar livre.');
  act(place(state, map, item, spot.x, spot.y, (x, y) => game?.occupied(x, y) ?? false), true);
}

function doPlant(seed: ItemId): void {
  const spot = game?.frontSpot();
  if (!spot) return say('Fique de frente para a grama livre.');
  act(plant(state, map, seed, spot.x, spot.y, Date.now(), (x, y) => game?.occupied(x, y) ?? false), true, 'village-plant');
}

function openDress(who: string): void {
  dressFor.value = who;
  sheet.value = 'dress';
}

function dress(acc: string | null): void {
  const r = wear(state, dressFor.value, acc);
  act(r);
  if (r.ok && dressFor.value !== 'player') game?.bubble(dressFor.value, acc ? '✨' : '🙂');
}

function fitsWho(acc: string): boolean {
  const slot = itemDef(acc)?.slot;
  return dressFor.value === 'player' ? slot !== 'pokemon' : slot !== 'player';
}

function friendRows() {
  return mons.value.map((m) => {
    const f = friendOf(state, m.id);
    const lvl = friendLevel(f.points);
    const req = f.request && f.request.day === day.value && !f.request.done ? f.request : null;
    return { ...m, lvl, points: f.points, following: state.follower === m.id, req };
  });
}

function tickClock(): void {
  const d = new Date();
  const h = d.getHours();
  clock.value = `${h >= 19 || h < 6 ? '🌙' : '☀️'} ${String(h).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (game) {
    const today = refreshDay();
    if ([...new Set(homes.values())].some((lot) => state.homeProjects[String(lot)]?.day !== today)) refreshTown();
  }
}

function thumbOf(gif: VillageMon['gif']): string {
  const f = gif.frames[0];
  if (!f) return '';
  const c = document.createElement('canvas');
  c.width = gif.width;
  c.height = gif.height;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(gif.width, gif.height);
  img.data.set(f.rgba);
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

// Saldo único: com a Vila aberta, a carteira mexe no estado vivo dela (ver `app/wallet.ts`).
attachLiveVillage(state, () => changed());
watch(() => state.coins, (value) => syncCoins(value));
onBeforeUnmount(() => {
  detachLiveVillage(state);
  sound.dispose();
  music.dispose();
});

onMounted(async () => {
  document.addEventListener('focusin', rememberVillageActionFocus);
  // Baixa o treinador enquanto cache e moradores são preparados, sem somar até 8 s à abertura.
  const trainerAtlasPromise = loadTrainerAtlas(profile.sprite);
  // Cutscene da primeira entrada (Fase 4): só na primeira vez de verdade, antes do aviso de controles.
  if (!state.digital.introSeen) cutsceneOpen.value = true;
  tickClock();
  const clockTimer = setInterval(tickClock, 15000);
  onBeforeUnmount(() => clearInterval(clockTimer));
  syncTrainer();
  const prizeTimer = setInterval(syncTrainer, 2000);
  onBeforeUnmount(() => clearInterval(prizeTimer));
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('tcg-gamepad-direction', handleGamepadDirection);
  window.addEventListener('tcg-gamepad-action', handleGamepadAction);
  window.addEventListener('tcg-gamepad-back', handleGamepadBack);
  window.addEventListener('tcg-gamepad-menu', handleGamepadMenu);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onLeave);
  window.addEventListener('beforeunload', onLeave);
  void requestPersistence();
  let villagers: VillageMon[] = [];
  try {
    const cache = await getCache();
    const team = resolveTeam(savedTeam.value, await cache.list());
    const loaded = await loadCreatureEntries(cache, browserDecoders, team.ids, undefined, loadCardCompanionEntry);
    if (loaded.failed.length) say('Não consegui mostrar alguns companheiros: ' + loaded.failed.map((f) => f.name + ' (' + f.reason + ')').join('; '), 12000);
    // Membros da equipe sem sprite no cache não entram na cena: continuam na equipe e voltam quando a carta for recarregada.
    const withoutSprite = team.ids.length - loaded.entries.length - loaded.failed.length;
    if (withoutSprite > 0) say(`${withoutSprite} companheiro(s) da equipe estão sem sprite neste aparelho. Em Carregar, toque em "Carregar" ou "Tentar de novo" nas cartas incompletas.`, 12000);
    // Sprite local da Vila (pacote de ação, derivado do PokéSurvivor/PMD SpriteCollab — ver THIRD_PARTY_NOTICES.md):
    // usado quando a espécie está no pacote; senão cai para o GIF que a Caixa já baixou e guardou no cache.
    villagers = await Promise.all(
      loaded.entries.map(async (e) => {
        const fallback = e.source.kind === 'gif'
          ? e.source.gif
          : { width: e.source.image.width, height: e.source.image.height, frames: [{ rgba: e.source.image.data, delayMs: 1000 }], durationMs: 1000 };
        const localDirs = e.info.dexId !== undefined ? await getLocalVillageSpriteDirs(e.info.dexId, e.info.shiny === true).catch(() => null) : null;
        return { id: e.info.id, name: displayName(state, e.info.id, e.info.name), shiny: e.info.shiny === true, gif: localDirs?.down ?? fallback, dirGifs: localDirs ?? undefined, dexId: e.info.dexId };
      }),
    );
    mons.value = loaded.entries.map((e, i) => ({ id: e.info.id, name: displayName(state, e.info.id, e.info.name), real: e.info.name, shiny: e.info.shiny === true, dexId: e.info.dexId, thumb: thumbOf(villagers[i]!.gif) }));
  } catch {
    say('Não consegui ler as cartas guardadas; a Vila abre só com você.');
  }
  // Digital Pokémon (presente inicial, Fonte) moram na Vila como qualquer residente, só que nunca passam pelo
  // cache de cartas/scan — ver `core/village/digital.ts`. Se o sprite não carregar agora (sem rede e fora do
  // pacote local), esse morador fica de fora da cena nesta sessão, sem inventar nenhum sprite para ele.
  for (const inst of state.digital.instances) {
    const sprite = await getDigitalSprite(inst.dexId, false).catch(() => null);
    if (!sprite) continue;
    villagers.push({ id: inst.instanceId, name: displayName(state, inst.instanceId, inst.name), shiny: false, gif: sprite.gif, dirGifs: sprite.dirs, digital: true, dexId: inst.dexId });
    mons.value = [...mons.value, { id: inst.instanceId, name: displayName(state, inst.instanceId, inst.name), real: inst.name, shiny: false, dexId: inst.dexId, thumb: thumbOf(sprite.gif) }];
  }
  villagerList = villagers;
  // Recorte real de tileset pra grama (ver `village-art.ts`); null se não der pra baixar, cai no ladrilho
  // desenhado por código de sempre — a Vila nunca trava nem finge por causa disso.
  // O atlas de tilesets (chão, natureza, casas, prédios): mesma regra, sem ele a Vila usa o desenho por código.
  const [groundTile, atlas, trainerAtlas] = await Promise.all([getVillageGroundTile().catch(() => null), getVillageAtlas().catch(() => null), trainerAtlasPromise]);
  if (!canvasEl.value || !wrapEl.value) return;
  game = new VillageGame(canvasEl.value, map, state, villagers, profile.sprite, groundTile, atlas, trainerAtlas, undefined, {
    floor: dioramaFloorEl.value ?? undefined,
    props: dioramaPropsEl.value ?? undefined,
  });
  game.harvestedToday = (x, y) => state.harvested[`${x},${y}`] === day.value;
  game.onStep = () => { changed(); updateWorldProgress(); checkTapInteraction(); checkGuidedTrip(); };
  game.onResidentEconomyChange = changed;
  // Suicune: chuva fixa pelo resto do dia (se o clima não estiver desligado nas opções).
  game.weatherMode = () => (effectiveVisual.value.weather !== 'off' && (effects().rain || requestInfluence(state, refreshDay()).weather) ? (requestInfluence(state, refreshDay()).weather ?? 'chuva') : effectiveVisual.value.weather);
  game.lampStorm = () => effects().lampStorm;
  game.animSpeed = () => effects().animSpeed;
  game.metallic = () => effectiveVisual.value.metallic;
  game.ambientFx = () => effectiveVisual.value.villageFx;
  game.nocturnal = (id) => types.get(id)?.includes('dark') === true;
  game.maxFps = () => effectiveVisual.value.frameRate === 'auto' ? 0 : Number(effectiveVisual.value.frameRate);
  // Presente recebido enquanto a cena abria: entra agora, ao lado do jogador.
  for (const entry of pendingDigital.values()) {
    if (villagers.some((v) => v.id === entry.id)) continue;
    game.addMon(entry);
    villagerList = [...villagerList, entry];
  }
  pendingDigital.clear();
  refreshTown();
  const resize = () => game?.resize(wrapEl.value!.clientWidth, wrapEl.value!.clientHeight);
  observer = new ResizeObserver(resize);
  observer.observe(wrapEl.value);
  resize();
  game.start();
  refreshDay();
  startMini();
  loading.value = '';
  awayCatchUp();
  prepareDailyRecap();
  if (!recapScenes.value.length && !cutsceneOpen.value && !welcome.value) finishArrival();
  sceneTimer = setInterval(() => {
    syncMusic();
    tickScenes();
    tickQuestions();
    refreshLegendNearby();
    if (!document.hidden && visual.sound && !dialog.value && !sheet.value && !legendaryScene.value && !hoOhWishScene.value && !cutsceneOpen.value && Date.now() >= nextAmbientSoundAt) {
      nextAmbientSoundAt = Date.now() + 18000 + Math.random() * 26000;
      const hour = new Date().getHours();
      playSound(game?.weatherKind === 'chuva' ? 'village-water' : hour >= 20 || hour < 5 ? 'village-night' : Math.random() < 0.68 ? 'village-birds' : 'village-chime');
    }
  }, 1000);
  if (tickCrops(state, Date.now(), effects().growthFactor) > 0) changed();
  cropTimer = setInterval(() => {
    if (tickCrops(state, Date.now(), effects().growthFactor) > 0) changed();
    tickFarm();
  }, 5000);
  let beat = 0;
  saveTimer = setInterval(() => {
    // A cada ~30 s marca "você estava aqui", para saber o que aconteceu quando você sair.
    if (++beat % 20 === 0 && !document.hidden) {
      state.lastSeen = Date.now();
      dirty = true;
    }
    if (dirty) {
      celebrateFriendMilestones();
      dirty = !persist();
    }
  }, 1500);
  // Tipos (presente favorito, opiniões do Livro) chegam em segundo plano; sem rede, ficam neutros.
  for (const m of mons.value) {
    void loadPinData(m.id, m.dexId).then((d) => d.profile && types.set(m.id, d.profile.types)).catch(() => undefined);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('focusin', rememberVillageActionFocus);
  legendaryLoadToken++;
  cancelFarm();
  stopArBeta();
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  window.removeEventListener('tcg-gamepad-direction', handleGamepadDirection);
  window.removeEventListener('tcg-gamepad-action', handleGamepadAction);
  window.removeEventListener('tcg-gamepad-back', handleGamepadBack);
  window.removeEventListener('tcg-gamepad-menu', handleGamepadMenu);
  gamepadKeys.clear();
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('pagehide', onLeave);
  window.removeEventListener('beforeunload', onLeave);
  settleScenes();
  if (sceneTimer) clearInterval(sceneTimer);
  state.lastSeen = Date.now();
  game?.stop();
  if (miniTimer) clearInterval(miniTimer);
  observer?.disconnect();
  if (saveTimer) clearInterval(saveTimer);
  if (cropTimer) clearInterval(cropTimer);
  if (toastTimer) clearTimeout(toastTimer);
  saveVillage(state);
});
</script>

<template>
  <div class="village" role="application" aria-label="Vila: modo vida da Caixa" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight W A S D Enter Space Z X Escape">
    <div ref="wrapEl" class="village-stage" :class="{ 'village-diorama': arActive }" role="group" tabindex="-1" aria-label="Mapa da Vila">
      <video ref="arVideoEl" class="village-ar-video" :class="{ active: arActive }" muted playsinline aria-hidden="true"></video>
      <canvas
        ref="canvasEl"
        class="village-canvas"
        :class="{ 'diorama-source': arActive }"
        aria-label="Vila: arraste em qualquer lugar para andar; toque num lugar para ir até ele; teclado: setas ou WASD movem, Enter/Espaço/Z interagem, X/Escape voltam"
        @pointerdown.prevent="arActive ? arPointerDown($event) : joyDown($event)"
        @pointermove.prevent="arActive ? arPointerMove($event) : joyMove($event)"
        @pointerup.prevent="arActive ? arPointerUp($event) : joyUp($event)"
        @pointercancel.prevent="arActive ? (arLook = null) : joyUp($event)"
        @contextmenu.prevent
      ></canvas>
      <canvas ref="dioramaFloorEl" class="diorama-layer-source" aria-hidden="true"></canvas>
      <canvas ref="dioramaPropsEl" class="diorama-layer-source" aria-hidden="true"></canvas>
      <canvas ref="arCanvasEl" class="village-ar-canvas" :class="{ active: arActive }" aria-hidden="true"></canvas>
      <div v-show="!loading && !welcome && sheet !== 'torre'" class="village-minimap" :class="{ big: miniBig }">
        <div class="village-minimap-head">
          <strong>Mapa da Vila</strong>
          <button type="button" class="link" :aria-label="miniBig ? 'Fechar mapa grande' : 'Abrir mapa grande'" @click.stop="miniBig = !miniBig">{{ miniBig ? 'Fechar' : 'Abrir' }}</button>
        </div>
        <p v-if="minimapSpeakerName" class="village-minimap-callout"><span aria-hidden="true">💬</span> <strong>{{ minimapSpeakerName }}</strong> está falando</p>
        <p v-if="minimapRouteLabel" class="village-minimap-route"><span aria-hidden="true">🧭</span> {{ minimapRouteLabel }}</p>
        <div v-if="guidedTripActive" class="village-guided-status" role="status">
          <span>{{ guidedRouteStatus }}</span>
          <button type="button" class="link" @click.stop="cancelGuidedTrip">Encerrar passeio</button>
        </div>
        <canvas
          ref="miniEl"
          :width="map.w * MINI_K"
          :height="map.h * MINI_K"
          :aria-label="miniBig ? 'Mapa da Vila: toque num lugar para ir até lá' : 'Minimapa da Vila: toque para aumentar'"
          role="button"
          tabindex="0"
          @click="miniTap"
          @keydown="miniKeydown"
        ></canvas>
        <p v-if="miniBig" class="village-minimap-legend">
          <span><i class="mm-you"></i> você</span><span><i class="mm-mon"></i> Pokémon</span><span><i class="mm-speaker"></i> falando</span><span><i class="mm-place"></i> lugar</span><span>🔔 sino (chama todos)</span>
        </p>
        <nav v-if="miniBig" class="village-map-guides" aria-label="Guia de lugares da Vila">
          <button v-for="place in minimapGuides" :key="place.name" type="button" @click="visitMapGuide(place)">
            <span aria-hidden="true">{{ place.icon }}</span><span>{{ place.name }}</span><small>Ir a pé →</small>
          </button>
        </nav>
      </div>
      <div v-if="joy.active && joy.moved" class="village-joy floating" :style="{ left: `${joy.lx}px`, top: `${joy.ly}px` }" aria-hidden="true">
        <div class="village-joy-stick" :style="{ transform: `translate(${joy.x * JOY_MAX}px, ${joy.y * JOY_MAX}px)` }"></div>
      </div>
      <header class="village-top">
        <div class="village-top-identity">
          <img v-if="portraitOk" class="village-trainer" :src="trainerSpriteUrl(profile.sprite)" :alt="profile.name" width="30" height="30" @error="portraitOk = false" />
          <div class="village-top-title"><strong>Vila</strong><span>{{ clock }}</span></div>
        </div>
        <div class="village-top-status" aria-label="Progresso da Vila">
          <span class="village-coins" aria-label="Moedas"><span class="coin-mark" aria-hidden="true"></span>{{ state.coins }}</span>
          <span class="village-house" :title="`Cidade: ${stage.name}`">Nv {{ level }}</span>
        </div>
        <div class="village-top-actions">
          <button v-if="arActive" type="button" class="village-ar-badge" @click="placeVillageAr">{{ arAnchored ? 'Reposicionar' : 'Ancorar à frente' }}</button>
          <button v-if="arActive" type="button" class="village-ar-badge" aria-label="Sair da Vila em AR" @click="stopArBeta">Sair do AR</button>
          <button v-if="!dialog && !quiz && !quizOpen && (!sheet || sheet === 'menu')" type="button" class="village-menu-btn" :aria-label="unread > 0 ? `Abrir o menu da Vila (${unread} momento(s) novo(s) no Diário)` : 'Abrir o menu da Vila'" @click="pressMenu"><span aria-hidden="true">☰</span> Menu <b v-if="unread > 0" class="menu-unread">{{ unread }}</b></button>
          <button type="button" class="village-close" aria-label="Sair da Vila" @click="emit('close')">✕</button>
        </div>
      </header>
      <section v-if="arActive" class="village-ar-controls" aria-label="Controles do diorama AR">
        <p><strong>{{ arAnchored ? 'Âncora ativa' : 'Escolha um ponto no chão' }}</strong><span>Toque para posicionar. Gire o celular para olhar ao redor; sem sensor, arraste a cena.</span></p>
        <div class="village-ar-actions">
          <label>Zoom
            <input :value="arScale" type="range" :min="VILLAGE_SCALE_RANGE.min" :max="VILLAGE_SCALE_RANGE.max" step="0.02" aria-label="Zoom da Vila em AR" @input="setVillageArScale(Number(($event.target as HTMLInputElement).value))" />
            <output>{{ Math.round(arScale * 100) }}%</output>
          </label>
        </div>
        <small>O Zoom muda o tamanho sem deslocar a âncora. A Vila fica no ponto escolhido enquanto esta câmera estiver aberta; a escala é lembrada neste aparelho.</small>
      </section>
      <p v-if="loading" class="village-loading">{{ loading }}</p>
      <HoOhWishCutscene v-else-if="hoOhWishScene" :sprite-url="hoOhWishScene.spriteUrl" @finish="hoOhWishScene = null" />
      <LegendaryCutscene v-else-if="legendaryScene && legendaryDefinition" ref="legendarySceneRef" :key="legendaryScene.story.id" :story="legendaryScene.story" :definition="legendaryDefinition" :gif="legendaryScene.gif" :loading="legendaryScene.loading" :replay="legendaryScene.replay" :effects="effectiveVisual.villageFx" :max-fps="effectiveVisual.frameRate === 'auto' ? 0 : Number(effectiveVisual.frameRate)" @finish="finishLegendaryCutscene" />
      <div v-else-if="recapScene" class="village-recap" role="dialog" aria-modal="true" aria-label="Capítulo diário da Vila">
        <article :key="recapIndex" class="village-recap-card">
          <small>HISTÓRIAS DA VILA · {{ recapIndex + 1 }}/{{ recapScenes.length }}</small>
          <h2>{{ recapScene.title }}</h2>
          <p v-if="recapScene.cast.length" class="hint">Em cena: {{ recapScene.cast.join(' e ') }}</p>
          <p class="recap-script">{{ recapScene.text }}</p>
          <p class="recap-next"><strong>Próximo passo:</strong> {{ recapIndex + 1 < recapScenes.length ? 'toque em “Próxima cena” para continuar esta história.' : 'toque em “Entrar na Vila” para explorar e conversar.' }}</p>
          <p v-if="!state.digital.starterGiven" class="recap-first-run">Depois desta abertura, você recebe um companheiro digital para começar a explorar a Vila, mesmo sem carta física.</p>
          <div class="village-choices">
            <button type="button" @click="finishRecap">Pular abertura</button>
            <button type="button" class="primary" autofocus @click="advanceRecap">{{ recapIndex + 1 < recapScenes.length ? 'Próxima cena' : 'Entrar na Vila' }}</button>
          </div>
        </article>
      </div>
      <div v-else-if="cutsceneOpen" class="speech in-stage village-dialog" role="dialog" aria-label="Bem-vindo">
        <div class="speech-box">
          <strong>Vila</strong>
          <p>{{ INTRO_LINES[cutsceneLine] }}</p>
          <div class="village-choices">
            <button type="button" @click="advanceCutscene">{{ cutsceneLine + 1 < INTRO_LINES.length ? 'Continuar' : 'Começar' }}</button>
          </div>
        </div>
      </div>
      <div v-else-if="welcome" class="village-welcome" @click="welcome = false">
        <strong>Bem-vindo à Vila, {{ profile.name }}!</strong>
        <span>Arraste na tela ou use o direcional para andar; toque no chão para ir até o local. Use <b>A</b> para conversar e interagir, <b>B</b> para voltar e <b>Menu</b> para acessar mochila, histórias, lugares e outros modos.</span>
        <label @click.stop>
          <input type="checkbox" @change="hideVillageControlsHint" />
          Não exibir mais ao entrar na Vila
        </label>
        <button type="button" class="village-welcome-dismiss" @click.stop="welcome = false">Entendi</button>
      </div>
      <p v-if="toast && !recapScene && !cutsceneOpen && !welcome" class="village-toast" role="status">{{ toast }} <button type="button" class="link" aria-label="Dispensar aviso" @click="toast = ''">✕</button></p>
      <p v-else-if="idleGuideVisible" class="village-idle-guide" role="status">
        {{ idleGuideText }} <button type="button" class="link" @click="idleGuideDismissed = true">Entendi</button>
      </p>

      <QuizDialog v-if="quiz" :name="quiz.name" :text="quiz.text" :stage="quiz.stage" :placeholder="quiz.q.placeholder" :chips="quiz.q.chips" :options="quiz.follow?.options.map((x) => x.label)" :submit-label="quiz.nick ? 'Salvar' : undefined" :cancel-label="quiz.nick ? 'Cancelar' : undefined" @answer="quizAnswer" @choose="quizChoose" @close="quizClose" />
      <div v-else-if="quizOpen && quizQuestion" class="speech in-stage village-dialog" role="dialog" aria-label="Presente inicial">
        <div class="speech-box">
          <strong>Presente inicial · {{ quizStep + 1 }}/{{ ALL_QUESTIONS.length }}</strong>
          <p>{{ quizQuestion.prompt }}</p>
          <div class="village-choices">
            <button v-for="o in quizQuestion.options" :key="o.id" type="button" @click="pickQuizOption(o.id)">{{ o.text }}</button>
          </div>
        </div>
      </div>
      <div v-else-if="dialog && !bookDialogId" class="speech in-stage village-dialog" role="dialog" :aria-label="dialog.name">
        <div class="speech-box">
          <small class="village-dialog-kicker">{{ dialog.id ? 'CONVERSA' : 'VILA' }}</small>
          <strong>{{ dialog.name }}</strong>
          <p>{{ dialog.text }}</p>
          <div v-if="giftPick" class="village-choices icons">
            <button v-for="i in giftable" :key="i.id" type="button" :title="i.name" @click="give(i.id)"><img :src="icon(i.id)" alt="" width="32" height="32" />{{ i.name }} ×{{ count(state, i.id) }}</button>
            <span v-if="giftable.length === 0">A mochila está vazia. Colete frutas, flores ou conchas!</span>
            <button type="button" @click="giftPick = false">Voltar</button>
          </div>
          <div v-else class="village-choices">
            <button v-for="a in dialog.actions" :key="a.label" type="button" :disabled="a.disabled" @click="a.run()">{{ a.label }}</button>
            <button v-if="dialog.actions.length === 0" type="button" @click="dialog = null">OK</button>
          </div>
        </div>
      </div>

      <div v-if="sheet === 'build'" class="village-sheet" role="dialog" aria-modal="true" aria-labelledby="village-build-title" tabindex="-1">
        <VillageSheetHeader :title="`Sua casa: ${HOUSE_LEVELS[state.house]?.name}`" title-id="village-build-title" @close="requestCloseSheet" />
        <template v-if="nextHouse">
          <p>Próximo: <strong>{{ nextHouse.name }}</strong></p>
          <p class="hint">Precisa de: {{ describeCost(state, nextHouse.cost) }}</p>
          <button type="button" class="primary" @click="act(upgradeHouse(state), true)">Construir</button>
        </template>
        <template v-else>
          <p>Sua casa está completa! Agora ela pode ficar com a sua cara.</p>
          <button type="button" class="primary" @click="openPlayerHome">Entrar e decorar</button>
        </template>
      </div>

      <div v-if="sheet === 'home'" class="village-sheet tall home-sheet" role="dialog" aria-modal="true" aria-labelledby="village-home-title" tabindex="-1">
        <VillageSheetHeader :title="homeInteriorLot === null ? 'Sua casa' : `Casa de ${residentsOf(homes, homeInteriorLot).map((id) => nameOf(id)).join(' e ')}`" icon="🏠" title-id="village-home-title" close-label="Sair" @close="requestCloseSheet" />
        <p v-if="homeInteriorLot === null" class="hint">Sua casa tem cantinhos de descanso, cozinha e convivência. Use Organizar móveis para decorar.</p>
        <p v-else class="hint">Os moradores organizam seus cantinhos e poupam para comprar móveis e reformar por conta própria.</p>
        <HomeInteriorMap
          :interior="displayedHomeInterior"
          :residents="homeResidents"
          :editable="homeInteriorLot === null"
          :selected-item="selectedHomeItem"
          :item-name="itemName"
          :icon="icon"
          @cell="useHomeCell($event.x, $event.y)"
          @exit="exitHomeInterior"
        />
        <div class="home-style">
          <label>Parede <select :value="displayedHomeInterior.wallpaper" :disabled="homeInteriorLot !== null" @change="setHomeWallpaper(($event.target as HTMLSelectElement).value)"><option value="creme">Creme</option><option value="floral">Floral</option><option value="noite">Noite estrelada</option><option value="madeira">Madeira</option></select></label>
          <label>Piso <select :value="displayedHomeInterior.floor" :disabled="homeInteriorLot !== null" @change="setHomeFloor(($event.target as HTMLSelectElement).value)"><option value="carvalho">Carvalho</option><option value="xadrez">Xadrez</option><option value="grama">Grama interna</option><option value="ladrilho">Ladrilho</option></select></label>
        </div>
        <template v-if="homeInteriorLot === null">
        <details class="home-facade-picker">
          <summary>Estilo da fachada</summary>
          <div class="village-choices">
            <button v-for="style in HOME_EXTERIOR_STYLES" :key="style.id" type="button"
              :aria-pressed="homeStyleOf(state, -1) === style.id"
              :disabled="homeStyleOf(state, -1) === style.id || state.coins < style.cost"
              @click="setPlayerHomeStyle(style.id)">{{ style.name }} · {{ style.cost }} moedas</button>
          </div>
        </details>
        <h3>Móveis na mochila</h3>
        <p v-if="selectedHomeItem" class="hint">Selecionado: <strong>{{ itemName(selectedHomeItem) }}</strong>. Toque num espaço livre para colocar.</p>
        <ul class="item-grid home-inventory">
          <li v-for="item in homeFurniture" :key="item" :class="{ selected: selectedHomeItem === item }">
            <button type="button" @click="selectedHomeItem = selectedHomeItem === item ? null : item"><img :src="icon(item)" alt="" width="40" height="40" /><span>{{ itemName(item) }}<small>você tem {{ count(state, item) }}</small></span></button>
          </li>
          <li v-if="homeFurniture.length === 0" class="hint">Nenhum móvel na mochila. Visite a Loja, fabrique algo ou recolha itens do quintal.</li>
        </ul>
        <button v-if="nextHouse" type="button" class="link" @click="sheet = 'build'">Reformar a fachada</button>
        </template>
      </div>

      <div v-if="sheet === 'shop'" class="village-sheet" role="dialog" aria-modal="true" aria-labelledby="village-shop-title" tabindex="-1">
        <VillageSheetHeader title="Loja da Vila" title-id="village-shop-title" @close="requestCloseSheet">
          <template #actions>
          <div class="chips" role="tablist">
            <button type="button" role="tab" :class="{ active: shopTab === 'comprar' }" :aria-selected="shopTab === 'comprar'" @click="shopTab = 'comprar'">Comprar</button>
            <button type="button" role="tab" :class="{ active: shopTab === 'vender' }" :aria-selected="shopTab === 'vender'" @click="shopTab = 'vender'">Vender</button>
          </div>
          <span class="village-coins"><span class="coin-mark" aria-hidden="true"></span>{{ state.coins }}</span>
          </template>
        </VillageSheetHeader>
        <p class="hint">{{ shopTab === 'comprar' ? 'Sementes sempre; os móveis e acessórios mudam todo dia.' : 'A loja compra tudo o que você coleta e colhe.' }}</p>
        <ul v-if="shopTab === 'comprar'" class="item-grid">
          <li v-for="i in shopItems" :key="i.id">
            <img :src="icon(i.id)" alt="" width="40" height="40" />
            <span>{{ i.name }}<small>{{ i.price }} moedas</small></span>
            <button type="button" :disabled="state.coins < i.price" @click="act(buy(state, i.id, day), false, 'village-coins')">Comprar</button>
          </li>
        </ul>
        <ul v-else class="item-grid">
          <li v-for="i in sellable" :key="i.id">
            <img :src="icon(i.id)" alt="" width="40" height="40" />
            <span>{{ i.name }} ×{{ count(state, i.id) }}<small>{{ i.sell }} cada</small></span>
            <span class="sell-btns">
              <button type="button" @click="act(sell(state, i.id), false, 'village-coins')">Vender 1</button>
              <button v-if="count(state, i.id) > 1" type="button" @click="act(sell(state, i.id, count(state, i.id)), false, 'village-coins')">Todos ({{ count(state, i.id) }})</button>
            </span>
          </li>
          <li v-if="sellable.length === 0" class="hint">Nada para vender ainda.</li>
        </ul>
      </div>

      <div v-if="sheet === 'dress'" class="village-sheet" role="dialog" aria-modal="true" aria-labelledby="village-dress-title" tabindex="-1">
        <VillageSheetHeader :title="`Acessório ${dressFor === 'player' ? 'para você' : `para ${nameOf(dressFor)}`}`" title-id="village-dress-title" @close="requestCloseSheet" />
        <ul class="item-grid">
          <li v-for="acc in accessoriesOwned.filter(fitsWho)" :key="acc">
            <img :src="icon(acc)" alt="" width="40" height="40" />
            <span>{{ itemName(acc) }}<small>{{ (dressFor === 'player' ? state.wear.player : state.wear.mons[dressFor]) === acc ? 'usando' : `você tem ${count(state, acc)}` }}</small></span>
            <button type="button" @click="dress(acc)">Usar</button>
          </li>
          <li v-if="accessoriesOwned.filter(fitsWho).length === 0" class="hint">Nenhum acessório para {{ dressFor === 'player' ? 'você' : 'Pokémon' }} ainda. A loja vende alguns todo dia; a coroa de flores se fabrica com 6 flores.</li>
        </ul>
        <button type="button" @click="dress(null)">Tirar o acessório</button>
      </div>

      <div v-if="sheet === 'arcade'" class="village-sheet tall game-sheet" role="dialog" aria-modal="true" aria-labelledby="village-arcade-title" tabindex="-1">
        <VillageSheetHeader title="Fliperama" title-id="village-arcade-title" @close="requestCloseSheet" />
        <div class="card arcade-battle">
          <h2>⚔️ Batalha na câmera</h2>
          <p class="note">Abre a câmera e os sensores da Caixa direto no modo de batalha: coloque a caixa no chão e toque em Batalhar. {{ battleRewardText }}.</p>
          <button type="button" class="primary" @click="goToBattle">Abrir câmera e batalhar</button>
        </div>
        <MinigameHub closable @leave="closeVillageSheet" />
      </div>

      <div v-if="sheet === 'farm'" class="village-sheet tall" role="dialog" aria-modal="true" aria-labelledby="village-farm-title" tabindex="-1">
        <VillageSheetHeader title="Caixa de sementes" icon="🌱" title-id="village-farm-title" @close="requestCloseSheet" />
        <FarmSeedBox :state="state" :name-of="nameOf" @change="changed" />
      </div>

      <!-- A Torre ocupa a tela inteira (por cima da Vila e dos botões A/B): um controle só, o dela. -->
      <div v-if="sheet === 'torre'" class="village-sheet torre-full" role="dialog" aria-modal="true" aria-labelledby="village-tower-title" tabindex="-1">
        <VillageSheetHeader title="Torre de Sobrevivência" title-id="village-tower-title" @close="requestCloseSheet" />
        <MinigameSobrevivencia ref="towerGameRef" :start-bonk="towerStartBonk" :digital="state.digital.instances.map((i) => ({ instanceId: i.instanceId, dexId: i.dexId, name: i.name, accessory: state.wear.mons[i.instanceId] ?? null }))" :accessories="state.wear.mons" @complete="recordSurvivalAdventure" @leave="closeVillageSheet" />
      </div>

      <div v-if="sheet === 'gallery'" class="village-sheet tall" role="dialog" aria-modal="true" aria-labelledby="village-gallery-title" tabindex="-1">
        <VillageSheetHeader title="Vitrine de desafios" icon="🏆" title-id="village-gallery-title" @close="requestCloseSheet" />
        <p class="hint">O pedestal foi montado com as lembranças da Liga e dos Pins. Cada peça abaixo corresponde a um marco registrado numa partida concluída.</p>
        <ul class="village-list">
          <li v-for="exhibit in challengeExhibits" :key="exhibit.achievementId">
            <span>🏅 {{ exhibit.title }}<small>{{ exhibit.source }} · {{ exhibit.origin }}</small></span>
          </li>
          <li v-if="challengeExhibits.length === 0" class="hint">Ainda não há marcos registrados para expor.</li>
        </ul>
        <p class="hint">Novas lembranças aparecem aqui quando você conquista outros marcos.</p>
      </div>

      <div v-if="sheet === 'card-evolution'" class="village-sheet tall" role="dialog" aria-modal="true" aria-labelledby="village-evolution-title" tabindex="-1">
        <VillageSheetHeader title="Evolução · seus companheiros" title-id="village-evolution-title" @close="requestCloseSheet" />
        <CardEvolutionPanel :friends="state.friends" :trust-stones="count(state, 'trust-stone')" :altar="cardEvolutionAtAltar" @evolved="syncCardEvolution" @spend-trust-stones="() => { state.inventory['trust-stone'] = Math.max(0, count(state, 'trust-stone') - 5); changed(); }" />
      </div>

      <div v-if="sheet === 'menu'" class="village-sheet tall village-menu" role="dialog" aria-modal="true" aria-labelledby="village-menu-title" tabindex="-1">
        <VillageSheetHeader class="menu-head" :title="MENU_TITLES[tab]" title-id="village-menu-title" :back="tab !== 'inicio' ? { label: 'Menu', run: () => { tab = 'inicio'; } } : undefined" @close="requestCloseSheet" />

        <div v-if="tab === 'inicio'" class="menu-home">
          <details><summary>Música e sons da Vila</summary><MusicControls v-model:enabled="villageAudio.enabled" v-model:volume="villageAudio.volume" v-model:effects-volume="villageAudio.effectsVolume" :track="musicTitle" :unavailable="musicUnavailable" @unlock="unlockMusic" /><p v-if="!visual.sound" class="hint">Os efeitos estão desligados nas opções gerais. A música tem seu próprio controle.</p></details>
          <p class="menu-status">
            <span><span class="coin-mark" aria-hidden="true"></span><b>{{ state.coins }}</b> moedas</span>
            <span>⭐ Nível <b>{{ level }}</b></span>
            <span>✨ <b>{{ state.digital.instances.length }}</b> Digital Pokémon</span>
          </p>
          <nav class="menu-section-tabs" aria-label="Categorias do menu da Vila" role="tablist">
            <button v-for="section in menuSections" :key="section.id" type="button" role="tab" :aria-selected="menuSection === section.id" :class="{ active: menuSection === section.id }" @click="menuSection = section.id">
              <span aria-hidden="true">{{ section.icon }}</span><span>{{ section.label }}</span>
            </button>
          </nav>
          <section v-for="g in visibleMenuGroups" :key="g.title" class="menu-group">
            <div class="menu-group-header">
              <h4>{{ g.title }}</h4>
              <span v-if="g.desc" class="menu-group-desc">{{ g.desc }}</span>
            </div>
            <div class="menu-tiles">
              <template v-for="t in g.tiles" :key="t.label">
                <a v-if="t.href" class="menu-tile" :href="t.href">
                  <span class="menu-icon" aria-hidden="true">{{ t.icon }}</span>
                  <span class="menu-label-wrap">
                    <span class="menu-label">{{ t.label }}</span>
                    <small v-if="t.hint">{{ t.hint }}</small>
                  </span>
                  <b v-if="t.badge" class="tile-badge">{{ t.badge }}</b>
                </a>
                <button v-else type="button" class="menu-tile" :disabled="t.disabled" @click="t.run ? t.run() : pickTab(t.tab!)">
                  <span class="menu-icon" aria-hidden="true">{{ t.icon }}</span>
                  <span class="menu-label-wrap">
                    <span class="menu-label">{{ t.label }}</span>
                    <small v-if="t.hint">{{ t.hint }}</small>
                  </span>
                  <b v-if="t.badge" class="tile-badge">{{ t.badge }}</b>
                </button>
              </template>
            </div>
          </section>
        </div>

        <VillageWorksites v-else-if="tab === 'trabalhos'" :state="state" :population="mons.length" :cafe-available="level >= 3" :name-of="nameOf" :tasks="farmTasks" :now="farmClock" @visit="visitWorksite" @seeds="sheet = 'farm'" />
        <VillageLegends v-else-if="tab === 'lendas'" :state="state.legendary" :regions="legendRegions" @replay="showLegendaryCutscene($event, true)" @travel="travelToLegendClue" />

        <div v-else-if="tab === 'resumo'" class="diary village-summary">
          <p class="hint">Uma visão rápida baseada no Diário, nas relações e nos pedidos reais da Vila.</p>
          <section aria-labelledby="community-summary-title">
            <h4 id="community-summary-title">🏡 Comunidade e reservas</h4>
            <p>{{ communityView.residents }} morador(es) ativo(s) na Vila · bem-estar {{ state.community.welfare }}/100 · confiança no cuidado {{ state.community.trust }}/100.</p>
            <p class="hint">Conta cada ID uma vez entre moradores da equipe e Digital Pokémon; cartas guardadas fora da Vila não entram no cálculo.</p>
            <p>Despensa: {{ communityView.foodAvailable }} porções disponíveis (cerca de {{ communityView.reserveDaysAtCurrentStock }} dia(s)) para {{ communityView.foodTarget }} porções estimadas por dia; reserva recomendada de três dias: {{ communityView.reserveTarget }}. Ingredientes e colheitas valem 1 porção; comida preparada vale 2.<span v-if="communityView.foodReservedForCouncil"> {{ communityView.foodReservedForCouncil }} porção(ões) estão reservadas para uma proposta do Conselho.</span></p>
            <p>Manutenção dos serviços comuns: até {{ communityView.maintenanceDue }} moedas por ciclo diário ({{ communityView.residents }} × 4, mais 10; população zero não paga). Seu saldo atual {{ communityView.maintenanceFunded ? 'cobre' : 'não cobre' }} essa estimativa.</p>
            <p v-if="lastCommunityCycle?.notice" role="status">Último ciclo, {{ lastCommunityCycle.day }}: {{ lastCommunityCycle.notice }}</p>
            <p v-else-if="lastCommunityCycle">Último ciclo, {{ lastCommunityCycle.day }}: {{ lastCommunityCycle.foodServed }} porções nutritivas para a meta de {{ lastCommunityCycle.foodTarget }}; {{ lastCommunityCycle.preferredServings }} porção(ões) corresponderam a preferências conhecidas; {{ lastCommunityCycle.maintenancePaid }}/{{ lastCommunityCycle.maintenanceDue }} moedas de manutenção pagas.</p>
            <ul v-if="lastCommunityCycle?.activities.length" aria-label="Atividades do último ciclo">
              <li v-for="activity in lastCommunityCycle.activities.slice(0, 5)" :key="activity.residentId">{{ activity.icon }} {{ nameOf(activity.residentId) }}: {{ activity.result }}</li>
              <li v-if="lastCommunityCycle.activities.length > 5" class="hint">E mais {{ lastCommunityCycle.activities.length - 5 }} atividade(s) no ciclo.</li>
            </ul>
            <p v-else class="hint">A estimativa é atualizada no próximo ciclo. Os saves antigos começam sem cobrança retroativa.</p>
            <section v-if="latestCommunityProject" aria-labelledby="community-council-title">
              <h5 id="community-council-title">🏛️ Conselho da Vila</h5>
              <p>{{ latestCommunityProject.cause }}</p>
              <template v-if="latestCommunityProject.status === 'proposto'">
                <p>Se apoiar, a cozinha tentará usar estes ingredientes reais para preparar duas levas: {{ communityProjectCost }}. O estoque só muda quando um morador executar a tarefa.</p>
                <div class="summary-actions">
                  <button type="button" @click="chooseCouncilDecision('apoiar')">Apoiar projeto</button>
                  <button type="button" @click="chooseCouncilDecision('adiar')">Adiar</button>
                  <button type="button" @click="chooseCouncilDecision('recusar')">Recusar</button>
                </div>
              </template>
              <p v-else>{{ latestCommunityProject.result || `Proposta ${latestCommunityProject.status}.` }}<span v-if="latestCommunityProject.participants.length"> Participou: {{ latestCommunityProject.participants.map(nameOf).join(', ') }}.</span></p>
            </section>
            <p class="hint">Estimativa baseada no estoque atual; a simulação liquida no máximo sete dias de ausência ao retornar. A Vila não processa ciclos enquanto o app está fechado.</p>
          </section>
          <section>
            <h4>O que aconteceu</h4>
            <ul v-if="summary.happened.length" class="book-opinions summary-links"><li v-for="line in summary.happened" :key="line.momentId ?? line.text" :class="{ 'summary-focus': summaryMomentId === line.momentId }"><span>{{ line.text }}</span><span class="summary-actions"><button v-if="line.momentId" type="button" @click="openSummaryMoment(line)">📓 Diário</button><button v-if="line.pokemonId" type="button" @click="openSummaryBook(line)">📖 Livro</button></span></li></ul>
            <p v-else class="hint">Ainda não há momentos registrados.</p>
          </section>
          <section>
            <h4>O que mudou</h4>
            <ul class="book-opinions summary-links"><li v-for="line in summary.changed" :key="line.momentId ? line.momentId + line.text : line.text" :class="{ 'summary-focus': summaryMomentId === line.momentId }"><span>{{ line.text }}</span><span class="summary-actions"><button v-if="line.momentId" type="button" @click="openSummaryMoment(line)">📓 Diário</button><button v-if="line.pokemonId" type="button" @click="openSummaryBook(line)">📖 Livro</button></span></li></ul>
          </section>
          <section>
            <h4>O que pode acontecer</h4>
            <ul class="book-opinions summary-links"><li v-for="line in summary.possible" :key="line.planId ?? line.requestId ?? line.text"><span>{{ line.text }}</span><span class="summary-actions"><button v-if="line.pokemonId" type="button" @click="openSummaryBook(line)">📖 Livro</button><button v-if="line.requestId" type="button" @click="pickTab('inicio')">📌 Mural</button></span></li></ul>
          </section>
        </div>

        <div v-else-if="tab === 'correio'" class="diary village-mail-panel">
          <p class="hint">Cartas ligadas a momentos que realmente aconteceram. Os nomes abaixo são os Pokémon envolvidos no Diário; responder pode criar um novo compromisso social.</p>
          <section aria-labelledby="mail-inbox-title">
            <h4 id="mail-inbox-title">📬 Caixa de entrada <small v-if="mailUnread">· {{ mailUnread }} nova(s)</small></h4>
            <ul v-if="state.mail.inbox.length" class="village-list mail-list">
              <li v-for="mail in state.mail.inbox.slice().reverse()" :key="mail.id" class="mail-card" :class="{ unread: !mail.read }">
                <div class="mail-card-head"><span>{{ mailKindLabel[mail.kind] }} · {{ mail.day }}</span><b v-if="!mail.read">NOVA</b></div>
                <strong>{{ mail.subject }}</strong>
                <small>De {{ mail.fromName }}<span v-if="mail.involvedIds.length"> · envolvidos: {{ mail.involvedIds.map(nameOf).join(', ') }}</span></small>
                <p>{{ mail.body }}</p>
                <div class="summary-actions mail-actions">
                  <button v-if="!mail.read" type="button" @click="readMail(mail.id)">Marcar como lida</button>
                  <button v-if="mail.fromId && !mail.responded" type="button" @click="answerMail(mail.id, 'responder')">{{ mailActionLabel('responder', mail.kind) }}</button>
                  <button v-if="mail.fromId && mail.involvedIds.length > 1 && !mail.responded" type="button" @click="answerMail(mail.id, 'ajudar')">{{ mailActionLabel('ajudar', mail.kind) }}</button>
                  <button type="button" @click="answerMail(mail.id, 'arquivar')">Guardar</button>
                </div>
              </li>
            </ul>
            <p v-else class="hint">Nenhuma carta esperando. Um momento novo entre moradores fará o carteiro voltar.</p>
          </section>
          <section v-if="state.mail.archive.length" aria-labelledby="mail-archive-title">
            <h4 id="mail-archive-title">🗄️ Arquivo</h4>
            <ul class="village-list mail-list archived"><li v-for="mail in state.mail.archive.slice().reverse().slice(0, 12)" :key="mail.id"><span><strong>{{ mail.subject }}</strong><small>{{ mail.fromName }} · {{ mail.day }}<span v-if="mail.responded"> · resposta enviada</span></small></span></li></ul>
          </section>
        </div>

        <div v-else-if="tab === 'expedicoes'" class="diary">
          <p class="hint">Cada expedição leva 15 minutos. O resultado combina tipo, personalidade, amizade e o clima registrado na partida.</p>
          <section v-if="weeklyEvent" class="weekly-event">
            <h4>📅 {{ weeklyEvent.title }}</h4>
            <p><strong>{{ weeklyEvent.place }}</strong> · {{ weeklyEvent.detail }}</p>
            <small>{{ weeklyEvent.bonus }}</small>
          </section>
          <section>
            <h4>Enviar alguém</h4>
            <ul class="village-list">
              <li v-for="m in mons" :key="m.id">
                <span>{{ m.name }}<small>{{ friendLevel(friendOf(state, m.id).points).name }} · {{ friendOf(state, m.id).points }} amizade</small></span>
                <span class="expedition-actions">
                  <button v-for="place in (['lago', 'bosque', 'fazenda', 'parque'] as DiscoveryPlace[])" :key="place" type="button" :disabled="state.expeditions.some((e) => !e.result && e.monId === m.id)" @click="beginExpedition(m.id, place)">{{ place }}</button>
                </span>
              </li>
            </ul>
          </section>
          <section>
            <h4>Expedições em andamento</h4>
            <ul class="village-list">
              <li v-for="e in state.expeditions.slice().reverse()" :key="e.id">
                <span>{{ nameOf(e.monId) }} · {{ e.place }}<small>{{ e.result ? e.result.text : `retorna em ${Math.max(0, Math.ceil((e.finishAt - Date.now()) / 60000))} min` }}</small></span>
                <b v-if="e.result">✅ +{{ e.result.coins }}</b>
              </li>
              <li v-if="state.expeditions.length === 0" class="hint">Nenhuma expedição ainda.</li>
            </ul>
          </section>
        </div>

        <ul v-else-if="tab === 'mochila'" class="item-grid">
          <li class="backpack-launch">
            <span>🎒 <strong>Mochila 3D</strong><small>Gire o celular para explorar os itens e ouvir os sons.</small></span>
            <button type="button" class="primary" @click="backpackOpen = true">Abrir mochila 3D</button>
          </li>
          <li v-for="i in inventory" :key="i.id">
            <img :src="icon(i.id)" alt="" width="40" height="40" />
            <span>{{ i.name }} ×{{ count(state, i.id) }}<small>{{ { material: 'Material', crop: 'Colheita', seed: 'Semente', furniture: i.group ?? 'Móvel', accessory: 'Acessório', food: 'Comida' }[i.kind] }}</small></span>
            <button v-if="i.kind === 'furniture'" type="button" @click="doPlace(i.id)">Colocar à frente</button>
            <button v-else-if="i.kind === 'seed'" type="button" @click="doPlant(i.id)">Plantar à frente</button>
            <button v-else-if="i.kind === 'accessory'" type="button" @click="openDress('player')">Usar</button>
          </li>
          <li v-if="inventory.length === 0" class="hint">Vazia. De frente para árvores, pedras, arbustos, flores, mato alto ou areia, toque em A para coletar.</li>
        </ul>

        <ul v-else-if="tab === 'fabricar'" class="item-grid">
          <li v-for="id in craftable" :key="id">
            <img :src="icon(id)" alt="" width="40" height="40" />
            <span>{{ itemName(id) }}<small>{{ describeCost(state, RECIPES[id]!) }}</small></span>
            <button type="button" @click="act(craft(state, id))">Fazer</button>
          </li>
        </ul>

        <ul v-else-if="tab === 'cozinha'" class="item-grid">
          <li class="hint">Comida cozida deixa o Pokémon mais feliz (uma refeição por dia cada). Os preferidos de cada um rendem mais.</li>
          <li v-for="id in cookable" :key="id">
            <img :src="icon(id)" alt="" width="40" height="40" />
            <span>{{ itemName(id) }} <small v-if="count(state, id) > 0">(você tem {{ count(state, id) }})</small><small>{{ describeCost(state, RECIPES[id]!) }}</small></span>
            <button type="button" @click="act(cook(state, id))">Cozinhar</button>
          </li>
        </ul>

        <div v-else-if="tab === 'diario'" class="diary">
          <p class="hint">O Diário guarda só os <strong>últimos {{ MAX_DIARY }} momentos</strong>; os mais antigos vão sumindo. Toque em 📍 para <strong>guardar no Álbum</strong>: lá fica para sempre. Os Pokémon vivem a vida mesmo quando você sai!</p>
          <div v-if="pairs.length > 0" class="rel-map">
            <h4>Mapa de relações</h4>
            <ul>
              <li v-for="p in pairs.slice(0, 8)" :key="p.a.id + p.b.id" :class="'rel-' + p.status.key">
                <span>{{ p.a.name }} {{ p.status.emoji }} {{ p.b.name }}</span><small>{{ p.status.label }}</small>
              </li>
            </ul>
          </div>
          <div class="chips diary-filter" role="group" aria-label="Filtrar momentos">
            <button type="button" :class="{ active: kindFilter === 'todos' }" @click="kindFilter = 'todos'">Todos</button>
            <button type="button" :class="{ active: kindFilter === 'guardados' }" @click="kindFilter = 'guardados'">📌</button>
            <button v-for="k in MOMENT_KINDS" :key="k" type="button" :class="{ active: kindFilter === k }" @click="kindFilter = k">{{ MOMENT_EMOJI[k] }} {{ MOMENT_LABELS[k] }}</button>
          </div>
          <MomentCard v-for="m in diaryList" :key="m.id" :moment="m" :class="{ 'moment-focus': summaryMomentId === m.id }" @toggle="toggleFav(m)" />
          <p v-if="diaryList.length === 0" class="hint">{{ kindFilter === 'todos' ? 'Nada registrado ainda. Fique na Vila e veja o que os Pokémon aprontam!' : 'Nenhum momento assim por enquanto.' }}</p>
        </div>

        <div v-else-if="tab === 'album'" class="diary album">
          <div class="chips" role="group" aria-label="Partes do Álbum">
            <button type="button" :class="{ active: albumView === 'guardados' }" @click="albumView = 'guardados'">📌 Guardados {{ saved.length }}/{{ MAX_SAVED }}</button>
            <button type="button" :class="{ active: albumView === 'colecao' }" @click="albumView = 'colecao'">🗂️ Vistos {{ album.seen }}/{{ album.total }}</button>
          </div>
          <template v-if="albumView === 'guardados'">
            <p class="hint">O que você guarda aqui fica para sempre (até {{ MAX_SAVED }}), mesmo depois que o Diário apaga os mais antigos. Pedidos de namoro, casamentos, términos e festas de aniversário entram sozinhos.</p>
            <MomentCard v-for="m in saved" :key="m.id" :moment="m" @toggle="toggleFav(m)" />
            <p v-if="saved.length === 0" class="hint">Nada guardado ainda. No Diário, toque em 📍 num momento de que você gostou.</p>
          </template>
          <template v-else>
            <p class="hint">Cada momento novo rende 10 moedas. Alguns só acontecem em datas especiais, como Natal, Halloween e o aniversário de cada Pokémon.</p>
            <section v-for="g in albumGroups" :key="g.kind" class="album-group">
              <h4>{{ MOMENT_EMOJI[g.kind] }} {{ MOMENT_LABELS[g.kind] }} <small>{{ g.seen }}/{{ g.entries.length }}</small></h4>
              <ul class="collection-grid album-grid">
                <li v-for="e in g.entries" :key="e.id" :class="{ have: e.seen }" :title="e.seen ? e.title : '???'">
                  <span class="album-emoji" aria-hidden="true">{{ e.seen ? e.emoji : '❔' }}</span>
                  <small>{{ e.seen ? e.title : '???' }}</small>
                </li>
              </ul>
            </section>
          </template>
        </div>

        <div v-else-if="tab === 'colecao'">
          <p class="hint">{{ collection.filter((c) => c.have).length }} de {{ collection.length }} móveis. Alguns só vêm de presente dos melhores amigos.</p>
          <ul class="collection-grid">
            <li v-for="c in collection" :key="c.id" :class="{ have: c.have }" :title="c.have ? c.name : '???'">
              <img :src="icon(c.id)" alt="" width="40" height="40" />
              <small>{{ c.have ? c.name : '???' }}</small>
            </li>
          </ul>
        </div>

        <PokeBook v-else-if="tab === 'livro'" :mons="bookMons" :friends="state.friends" :relations="bookRels" :words="bookWords" :told="bookTold" :memories="bookMemories" :nicks="state.nicks" :nick-note="bookNote" :initial-id="bookDialogId ?? undefined" can-dress @accessory="openDress" @nickname="bookNickname" />

        <div v-else>
          <p>Seu acessório: <strong>{{ state.wear.player ? itemName(state.wear.player) : 'nenhum' }}</strong></p>
          <label class="art-option">
            <input v-model="visual.rotomMode" type="checkbox" />
            <span>Modo Rotom: 20 FPS e efeitos gráficos pesados suspensos; desligue para restaurar suas opções</span>
          </label>
          <label class="art-option">
            <span>Limite global de quadros</span>
            <select v-model="visual.frameRate" :disabled="visual.rotomMode" aria-label="Taxa de quadros dos jogos">
              <option value="auto">Automática</option><option value="30">30 FPS</option><option value="20">20 FPS</option>
            </select>
          </label>
          <label class="art-option">
            <input v-model="visual.metallic" type="checkbox" />
            <span>Brilho metálico nos Digital Pokémon (desligue em celular fraco)</span>
          </label>
          <label class="art-option">
            <input v-model="visual.evolutionFx" type="checkbox" />
            <span>Chegada especial dos companheiros evoluídos nas cartas (desligue em celular fraco)</span>
          </label>
          <label class="art-option">
            <input v-model="visual.villageFx" type="checkbox" />
            <span>Efeitos da Vila: ondas, respingos da fonte e raios de sol (desligue em celular fraco)</span>
          </label>
          <button type="button" @click="openDress('player')">Escolher acessório</button>
          <h4>Amigos e pedidos de hoje</h4>
          <ul class="village-list">
            <li v-for="m in friendRows()" :key="m.id">
              <span>{{ m.name }}<small>{{ m.lvl.name }} · {{ '♥'.repeat(m.lvl.hearts) }}{{ '♡'.repeat(5 - m.lvl.hearts) }} · {{ m.points }}/100{{ m.lvl.next ? ` (faltam ${m.lvl.toNext} para ${m.lvl.next.name})` : '' }}{{ m.following ? ' · seguindo você' : '' }}{{ m.req ? ` · quer ${m.req.qty} ${itemName(m.req.item)}` : '' }}</small></span>
            </li>
            <li v-if="mons.length === 0" class="hint">Nenhum Pokémon na Vila ainda.</li>
          </ul>
        </div>
      </div>
    </div>

    <div v-if="legendNearby.length && !sheet && !dialog && !legendaryScene && !hoOhWishScene && !welcome && !loading && !recapScene && !cutsceneOpen && !quizOpen && !quiz" class="village-legend-clue" role="region" aria-label="Pista lendária"><small>🔎 {{ legendNearbyLabel }} · {{ legendNearby.length === 1 ? `pista ${legendNearby[0]!.step + 1}/2` : 'pistas aqui' }}</small><span>{{ legendNearby[0]!.place.name }}</span><div><button type="button" @click="investigateLegendClue">Investigar pista</button></div></div>
    <div v-show="!loading && !recapScene && !cutsceneOpen && !welcome && !legendaryScene" class="village-pad" @contextmenu.prevent>
      <p class="village-move-hint">Arraste para andar · toque para ir<span> · setas/WASD</span></p>
      <p class="village-arrow-hint">Setas/controle navegam · A confirma · B volta</p>
      <div class="village-control-cluster" :class="{ blocked: !!sheet || !!dialog || !!quiz || quizOpen }" role="group" aria-label="Controles da Vila">
        <div class="village-dpad" role="group" aria-label="Direcional">
          <button type="button" class="dpad-up" aria-label="Andar para cima" @pointerdown.prevent="dpadDown($event, 'up')" @pointerup="dpadUp" @pointercancel="dpadUp" @lostpointercapture="dpadUp">▲</button>
          <button type="button" class="dpad-left" aria-label="Andar para a esquerda" @pointerdown.prevent="dpadDown($event, 'left')" @pointerup="dpadUp" @pointercancel="dpadUp" @lostpointercapture="dpadUp">◀</button>
          <span class="dpad-center" aria-hidden="true">✦</span>
          <button type="button" class="dpad-right" aria-label="Andar para a direita" @pointerdown.prevent="dpadDown($event, 'right')" @pointerup="dpadUp" @pointercancel="dpadUp" @lostpointercapture="dpadUp">▶</button>
          <button type="button" class="dpad-down" aria-label="Andar para baixo" @pointerdown.prevent="dpadDown($event, 'down')" @pointerup="dpadUp" @pointercancel="dpadUp" @lostpointercapture="dpadUp">▼</button>
        </div>
        <div class="ab">
          <button type="button" class="b-btn" :disabled="quizOpen && quizStep === 0" :aria-label="sheet || dialog || quiz || quizOpen ? 'Voltar' : 'Abrir menu'" @click="pressB">B<small aria-hidden="true">{{ sheet || dialog || quiz || quizOpen ? 'Voltar' : 'Menu' }}</small></button>
          <button type="button" class="a-btn" aria-label="A: confirmar ou interagir" @pointerdown="pressAPointer" @click="pressAClick">A<small aria-hidden="true">{{ sheet || dialog || quiz || quizOpen ? 'Confirmar' : 'Interagir' }}</small></button>
        </div>
      </div>
    </div>
    <BackpackView v-if="backpackOpen" :items="backpackItems" @close="backpackOpen = false" />
    <div v-if="survivalDigitalChoice" class="survival-digital-recruit" role="dialog" aria-modal="true" aria-label="Escolha de Digital Pokémon da Torre">
      <section class="survival-digital-recruit-card">
        <small class="survival-digital-kicker">★ POKÉBOLA DA TORRE · RECOMPENSA REAL</small>
        <h2>Escolha um novo companheiro</h2>
        <p>Você recolheu {{ survivalDigitalChoice.total }} Pokébola{{ survivalDigitalChoice.total === 1 ? '' : 's' }}. Cada uma ampliou a busca por uma espécie confirmada.</p>
        <div class="survival-digital-options">
          <button v-for="option in survivalDigitalChoice.options" :key="option.cardId" type="button" class="survival-digital-option" :disabled="survivalDigitalBusy" @click="chooseSurvivalDigital(option)">
            <img v-if="option.thumb" :src="option.thumb" :alt="option.name" />
            <span v-else class="survival-digital-option-placeholder" aria-hidden="true">?</span>
            <strong>{{ option.name }}</strong>
            <small>Pokédex nº {{ option.dexId }} · confirmado por {{ option.cardId }}</small>
          </button>
        </div>
        <p v-if="survivalDigitalBusy" class="hint" role="status">O novo morador está chegando à Vila…</p>
      </section>
    </div>
    <div v-if="survivalDigitalCutscene" class="survival-digital-cutscene" role="dialog" aria-modal="true" aria-label="Chegada de um novo Digital Pokémon">
      <section class="survival-digital-cutscene-card">
        <div class="survival-digital-cutscene-sprite">
          <img v-if="survivalDigitalCutscene.spriteUrl" :src="survivalDigitalCutscene.spriteUrl" :alt="survivalDigitalCutscene.species.name" />
          <span v-else aria-hidden="true">✨</span>
        </div>
        <small>UM NOVO MORADOR CHEGOU</small>
        <h2>{{ survivalDigitalCutscene.species.name }}</h2>
        <p>“Fiquei feliz de conhecer um treinador tão forte. Quero ir para a sua Vila!”</p>
        <button type="button" class="primary" @click="survivalDigitalCutscene = null">Levar para a Vila</button>
      </section>
    </div>
  </div>
</template>

