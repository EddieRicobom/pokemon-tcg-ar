<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { getCache, getDigitalSprite, getLocalVillageSpriteDirs, getVillageGroundTile, loadPinData, resolveSpeciesByDexId } from '../app/services';
import { resolveTeam } from '../app/team';
import { savedTeam } from '../app/team-store';
import { profile } from '../app/profile-store';
import { visual } from '../app/visual-settings';
import { attachLiveVillage, detachLiveVillage, syncCoins } from '../app/wallet';
import { loadVillage, requestPersistence, saveVillage, villageMap } from '../app/village-store';
import { browserDecoders, loadCreatureEntries } from '../box/load-creatures';
import { routeHref } from '../app/route';
import { canNickname, displayName, MAX_NICK_LEN, nickIdeas, nicknameOf, setNickname } from '../core/village/nickname';
import { recordEvent, trainer } from '../app/trainer-store';
import { claimPrizes } from '../core/village/rewards';
import LeagueCard from './LeagueCard.vue';
import MinigameHub from './MinigameHub.vue';
import MinigameSobrevivencia from './MinigameSobrevivencia.vue';
import { dayKey, levelOf } from '../core/trainer';
import { trainerSpriteUrl } from '../core/trainer-sprites';
import { ACCESSORY_IDS, COOK_IDS, CRAFT_IDS, FURNITURE_IDS, itemDef, ITEMS, shopToday } from '../core/village/catalog';
import {
  buy, canFollow, cook, count, craft, dailyHelp, describeCost, fish, FISH_PER_DAY, friendLevel, friendOf, giveGift, harvest, harvestCrop, HOUSE_LEVELS, itemName, pickUp, place,
  plant, pruneHarvest, RECIPES, sell, talk, tickCrops, upgradeHouse, water, wear,
  BATTLE_REWARD_COINS, BATTLE_REWARDS_PER_DAY, battleRewardsLeft,
} from '../core/village/life';
import { albumEntries, albumProgress, catchUp, makeEnv, pickMoment, recentGossip, relationMap, relationsOf, resolveScene, savedMoments, sceneChoice, setFavorite, unreadCount } from '../core/village/social';
import {
  canAffordSummon, canEvolve, COIN_SUMMON_COST, COIN_SUMMON_ENABLED, evolve, EVOLVE_COST, grantStarter, instanceOf, pickAnySpecies,
  pickFonteSpecies, summon, SUMMON_COST, summonWithCoins,
} from '../core/village/digital';
import type { DigitalPokemonInstance } from '../core/village/digital';
import { celebiDiaryPage, dismissActive, legendaryEffects, legendaryOf, rollLegendary } from '../core/village/legendary';
import type { LegendaryEffects } from '../core/village/legendary';
import { ALL_QUESTIONS, FONTE_POOL, isComplete as quizComplete, nextForm, resolveStarter } from '../core/village/starter-quiz';
import type { QuizAnswers } from '../core/village/starter-quiz';
import type { Resolved, Scene } from '../core/village/social';
import { FX_EMOJI, MAX_DIARY, MAX_SAVED, MOMENT_EMOJI, MOMENT_KINDS, MOMENT_LABELS, trimMoments } from '../core/village/social-state';
import { applyFollow, canAsk, markAsked, pickEcho, pickFollow, pickQuestion, QUESTION_BY_ID, recordAnswer, wordOf } from '../core/village/quiz';
import type { Follow, Question } from '../core/village/quiz';
import {
  assignHomes, CAFE_PRICE, cafeVisit, collectMail, HOME_DECORS, HOME_STAGES, homeComment, homeDecor, homeLevel, homeOf, knockDoor, LOTS, nextUnlock, paintRoof, PAINT_COST, residentsOf, ROOFS, roofIndex,
  toggleDecor, townStage, unlockedBetween, upgradeHome,
} from '../core/village/town';
import type { Building } from '../core/village/town';
import type { Moment, MomentKind } from '../core/village/social-state';
import type { ItemId } from '../core/village/life';
import type { Dir } from '../core/village/actors';
import { stickDirs, stickVector } from '../core/village/joystick';
import type { PokemonType } from '../core/pokemon-data';
import { paintItemIcon } from '../village/item-art';
import { VillageGame } from '../village/village-game';
import type { VillageMon } from '../village/village-game';
import MomentCard from './MomentCard.vue';
import PokeBook from './PokeBook.vue';
import QuizDialog from './QuizDialog.vue';

/** Modo vida da Caixa: a Vila, sem câmera, com controle na tela. */
/** `close` sai da Vila; com `'pvp'` a Caixa abre o PvP em seguida (a Vila mora dentro da Caixa, então não há troca de tela). */
/** `then`: para onde ir ao sair (Caixa com PvP, batalha na câmera ou desafio da Liga); sem nada, volta à tela anterior. */
const emit = defineEmits<{ close: [then?: 'pvp' | 'batalha' | 'caixa'] }>();

const canvasEl = ref<HTMLCanvasElement | null>(null);
const wrapEl = ref<HTMLElement | null>(null);
const loading = ref('Chamando os seus Pokémon para a Vila…');
const toast = ref('');
const clock = ref('');
const map = villageMap();
const state = reactive(loadVillage());
const day = ref(dayKey(new Date()));
pruneHarvest(state, day.value);

type Sheet = null | 'menu' | 'build' | 'shop' | 'dress' | 'arcade' | 'arena' | 'torre';
const sheet = ref<Sheet>(null);
type Tab = 'inicio' | 'mochila' | 'fabricar' | 'cozinha' | 'diario' | 'album' | 'colecao' | 'livro' | 'visual';
const tab = ref<Tab>('inicio');

/**
 * Menu da Vila (o B): uma página inicial com blocos grandes, em grupos, em vez de 8 abas apertadas — e com os
 * caminhos para o resto do app (a Vila é o centro). Cada bloco abre a seção de sempre, com "← Menu" para voltar.
 */
interface MenuTile { tab?: Tab; href?: string; icon: string; label: string; hint?: string }
const MENU_TITLES: Record<Tab, string> = {
  inicio: 'Menu da Vila', mochila: 'Mochila', fabricar: 'Fabricar', cozinha: 'Cozinha', diario: 'Diário',
  album: 'Álbum', colecao: 'Coleção', livro: 'Livro dos Pokémon', visual: 'Visual',
};
const menuGroups = computed<{ title: string; tiles: MenuTile[] }[]>(() => [
  {
    title: 'Itens',
    tiles: [
      { tab: 'mochila', icon: '🎒', label: 'Mochila', hint: inventory.value.length > 0 ? `${inventory.value.length} tipo(s)` : 'vazia' },
      { tab: 'fabricar', icon: '🔨', label: 'Fabricar' },
      { tab: 'cozinha', icon: '🍳', label: 'Cozinha' },
    ],
  },
  {
    title: 'Memórias',
    tiles: [
      { tab: 'diario', icon: '📔', label: 'Diário', hint: unread.value > 0 ? `${unread.value} novo(s)` : undefined },
      { tab: 'album', icon: '📸', label: 'Álbum' },
      { tab: 'colecao', icon: '🏆', label: 'Coleção' },
      { tab: 'livro', icon: '📖', label: 'Livro' },
    ],
  },
  {
    title: 'Ir para',
    tiles: [
      { href: routeHref('caixa'), icon: '📦', label: 'Caixa', hint: 'batalhas na câmera' },
      { href: routeHref('pins'), icon: '🎯', label: 'Pins' },
      { href: routeHref('treinador'), icon: '🏅', label: 'Treinador' },
      { href: routeHref('escanear'), icon: '📷', label: 'Escanear' },
    ],
  },
  { title: 'Ajustes', tiles: [{ tab: 'visual', icon: '🎨', label: 'Visual e acessórios' }] },
]);
const shopTab = ref<'comprar' | 'vender'>('comprar');
const dressFor = ref<string>('player');
const dialog = ref<{ id?: string; name: string; text: string; actions: { label: string; run: () => void; disabled?: boolean }[] } | null>(null);
const kindFilter = ref<MomentKind | 'todos' | 'guardados'>('todos');
const albumView = ref<'guardados' | 'colecao'>('guardados');
const portraitOk = ref(true);
const giftPick = ref(false);
const welcome = ref(true);
// O aviso de que a cidade cresceu espera você fechar as boas-vindas (para um não cobrir o outro).
watch(welcome, (open) => {
  if (open) return;
  announceGrowth();
  // O presente inicial (questionário) tem prioridade; o sorteio de lendário (no máximo 1/dia) espera a próxima vez.
  if (!state.digital.starterGiven) maybeOfferStarter();
  else rollLegendaryToday();
});

// ---- Fase 4: cutscene da primeira entrada (antes do aviso de controles, só na primeira vez de verdade).
const INTRO_LINES: readonly string[] = [
  'Bem-vindo à Vila! Aqui os Pokémon que você escaneia moram, crescem e criam laços de amizade com você.',
  'Mas tem mais: perto da praça existe uma Fonte antiga. Jogando de verdade — conversando, cuidando da Vila, jogando — você junta moedas.',
  'Com moedas, a Fonte pode trazer à vida um Digital Pokémon: um companheiro que não vem de nenhuma carta física, mas mora aqui com todo o resto.',
  'Antes de começar, me conta um pouco sobre você…',
];
const cutsceneOpen = ref(false);
const cutsceneLine = ref(0);

let game: VillageGame | null = null;
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

// ---- Treinador: o que acontece na Vila conta lá, e as conquistas voltam como acessórios e moedas
function trainerEvent(action: 'talk' | 'answer' | 'moment' | 'nickname', id?: string): void {
  recordEvent({ type: 'village', action, level: id ? friendLevel(friendOf(state, id).points).level : undefined });
}

/** Entrega os prêmios de conquistas novas e avisa o Treinador se a amizade com alguém subiu. */
function syncTrainer(): void {
  const best = Math.max(0, ...Object.values(state.friends).map((f) => friendLevel(f.points).level));
  if (best > trainer.value.bestFriend) recordEvent({ type: 'village', action: 'friend', level: best });
  const got = claimPrizes(state, trainer.value.achievements);
  if (!got) return;
  changed();
  say(`🏅 ${got.note}`, 5200);
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
  'Ele mora na Vila como qualquer outro: conversa, cria amizade, tem casa — só não pode ser alvo de scan ou AR, porque não vem de nenhuma carta física.',
  'Jogando de verdade — conversar, responder perguntas, lanchar no Café, o Correio, vencer um minigame, uma corrida na Torre ou uma batalha — você ganha moedas.',
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
  const r = rollLegendary(state.legendary, Math.random, day.value, new Date().toISOString());
  state.legendary = r.state;
  if (r.legendary) changed();
  // Celebi deixa a página especial no Diário (o bônus prometido na cutscene, de verdade).
  if (r.legendary?.id === 'celebi') {
    const now = new Date();
    state.diary = trimMoments([...state.diary, celebiDiaryPage(now.getTime(), day.value, now.getHours())]);
  }
  if (state.legendary.active) showLegendaryCutscene();
}

let legendaryLine = 0;
function showLegendaryCutscene(): void {
  const active = state.legendary.active;
  const def = active ? legendaryOf(active.id) : undefined;
  if (!def) {
    state.legendary = dismissActive(state.legendary);
    return;
  }
  legendaryLine = 0;
  const step = () => {
    if (legendaryLine < def.lines.length) {
      dialog.value = { name: def.name, text: def.lines[legendaryLine]!, actions: [{ label: legendaryLine + 1 < def.lines.length ? 'Continuar' : 'Ok', run: () => { legendaryLine++; step(); } }] };
      return;
    }
    dialog.value = {
      name: def.name,
      text: `${def.boon}\n\n${def.consequence}`,
      actions: [{ label: 'Ok', run: () => { state.legendary = dismissActive(state.legendary); changed(); closeDialog(); } }],
    };
  };
  step();
}

function nameOf(id: string): string {
  return mons.value.find((m) => m.id === id)?.name ?? 'Pokémon';
}

const inventory = computed(() => ITEMS.filter((i) => count(state, i.id) > 0));
const sellable = computed(() => inventory.value.filter((i) => i.sell > 0));
const giftable = computed(() => inventory.value.filter((i) => i.kind !== 'accessory'));
const nextHouse = computed(() => HOUSE_LEVELS[state.house + 1] ?? null);
const shopItems = computed(() => shopToday(day.value));
const collection = computed(() => FURNITURE_IDS.map((id) => ({ id, name: itemName(id), have: state.collected.includes(id), group: itemDef(id)?.group ?? '' })));
const craftable = CRAFT_IDS;
const cookable = COOK_IDS;
const actorList = (): { id: string; name: string; types: PokemonType[] }[] => mons.value.map((m) => ({ id: m.id, name: m.name, types: types.get(m.id) ?? [] }));
const unread = computed(() => unreadCount(state));
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
const bookMons = computed(() => mons.value.map((m) => ({ id: m.id, name: m.name, real: m.real, types: types.get(m.id) ?? [], thumb: m.thumb, accessory: state.wear.mons[m.id] ?? null })));
const accessoriesOwned = computed(() => ACCESSORY_IDS.filter((id) => count(state, id) > 0));

// ---- controle
// ---- Movimento: joystick na tela (toque/mouse) e teclado (setas/WASD, com diagonais segurando duas teclas).
// Os dois viram o mesmo vetor e as mesmas direções (`core/village/joystick.ts`); a Vila anda em blocos.
const JOY_MAX = 44;
const joy = reactive({ active: false, pointerId: -1, cx: 0, cy: 0, x: 0, y: 0 });
function applyStick(x: number, y: number): void {
  const dirs = stickDirs(x, y);
  game?.holdStick(dirs.primary ? dirs : null);
}
function joyDown(e: PointerEvent): void {
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  Object.assign(joy, { active: true, pointerId: e.pointerId, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 });
  el.setPointerCapture?.(e.pointerId);
  joyMove(e);
}
function joyMove(e: PointerEvent): void {
  if (!joy.active || e.pointerId !== joy.pointerId) return;
  const v = stickVector(e.clientX - joy.cx, e.clientY - joy.cy, JOY_MAX);
  joy.x = v.x;
  joy.y = v.y;
  applyStick(v.x, v.y);
}
function joyUp(e: PointerEvent): void {
  if (e.pointerId !== joy.pointerId) return;
  Object.assign(joy, { active: false, pointerId: -1, x: 0, y: 0 });
  applyKeys();
}

const KEYS: Record<string, Dir> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
};
const heldKeys = new Set<Dir>();
/** Teclas seguradas viram um vetor (duas teclas = diagonal), igual ao joystick. */
function applyKeys(): void {
  if (joy.active) return;
  const x = (heldKeys.has('right') ? 1 : 0) - (heldKeys.has('left') ? 1 : 0);
  const y = (heldKeys.has('down') ? 1 : 0) - (heldKeys.has('up') ? 1 : 0);
  applyStick(x, y);
}
function onKey(e: KeyboardEvent): void {
  if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
  // Dentro de uma folha (jogos do Fliperama, Arena…) Enter, espaço e setas são da folha, não do personagem.
  if (sheet.value && (e.target as HTMLElement | null)?.closest?.('.village-sheet') && (KEYS[e.key] || e.key === ' ' || e.key === 'Enter')) return;
  const dir = KEYS[e.key];
  if (e.type === 'keydown') {
    if (dir) {
      heldKeys.add(dir);
      applyKeys();
      e.preventDefault();
    } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'z') {
      pressA();
      e.preventDefault();
    } else if (e.key === 'x' || e.key === 'Escape') pressB();
  } else if (dir) {
    heldKeys.delete(dir);
    applyKeys();
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
  if (!game || document.hidden || dialog.value || quiz.value || quizOpen.value || cutsceneOpen.value || sheet.value || welcome.value || game.sceneActive || mons.value.length === 0) return;
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

// ---- apelidos (a partir de «Grande amigo»)
const NICK_CLEAR = 'Tirar o apelido';

/** Põe o apelido na tela: nos nomes dos Pokémon, nas falas, no mapa e no Livro. */
function applyNicks(): void {
  for (const m of mons.value) m.name = displayName(state, m.id, m.real);
  game?.setNames(Object.fromEntries(mons.value.map((m) => [m.id, m.name])));
}

function openNickname(id: string): void {
  const real = mons.value.find((m) => m.id === id)?.real ?? 'Pokémon';
  if (!canNickname(state, id)) {
    say(`${real} ainda não tem intimidade para um apelido. Ele aceita a partir de «Grande amigo».`);
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
const stage = computed(() => townStage(level.value));
let homes = new Map<string, number>();

function refreshTown(): void {
  homes = assignHomes(mons.value.map((m) => m.id), level.value);
  game?.setTown(level.value, homes);
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

function openBuilding(b: Building): void {
  if (b.kind === 'fountain') return openFountain(b);
  if (level.value < b.unlock) {
    const text = b.kind === 'home'
      ? `Um terreno vazio, com uma placa: "Em breve, uma casa". Ele é liberado no nível ${b.unlock} de Treinador (você está no ${level.value}). Escaneie cartas, batalhe e jogue para ganhar XP.`
      : `Em obras: o ${b.name} abre no nível ${b.unlock} de Treinador (você está no ${level.value}).`;
    dialog.value = { name: b.kind === 'home' ? `Terreno ${b.lot! + 1}` : b.name, text, actions: [{ label: 'Ok', run: closeDialog }] };
    return;
  }
  if (b.kind === 'home') return openHome(b);
  if (b.kind === 'arcade' || b.kind === 'pins' || b.kind === 'arena' || b.kind === 'torre') return openGameBuilding(b);
  if (b.kind === 'mail') {
    const r = collectMail(state, refreshDay(), Math.random, namesById());
    if (r.ok) {
      changed();
      earnCoins(10);
    }
    dialog.value = { name: b.name, text: r.message, actions: [{ label: 'Ok', run: closeDialog }] };
    return;
  }
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
  sheet.value = null;
  emit('close', 'pvp');
}

/** Fliperama → batalha na câmera: fecha a Vila e já abre a câmera e os sensores da Caixa (no mesmo toque). */
function goToBattle(): void {
  closeDialog();
  sheet.value = null;
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
      text: `Luzes piscando e o barulhinho das máquinas! Aqui você joga os minigames (Quem é esse Pokémon?, Tipos e Memória) com as cartas que já escaneou — ou vai direto para uma batalha da sua caixa na câmera (${battleRewardText.value}).`,
      actions: [
        { label: '⚔️ Batalha na câmera', run: goToBattle },
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
      text: 'A Arena da Vila: desafie os líderes de Ginásio, a Elite 4 e a Campeã, ou batalhe com um amigo (PvP). As lutas acontecem na Caixa, com a câmera e a sua equipe.',
      actions: [
        { label: 'Ginásios e Liga', run: () => { closeDialog(); sheet.value = 'arena'; } },
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
          state.coins--;
          changed();
          closeDialog();
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
    new Date().getHours(),
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

function openHome(b: Building, view: 'main' | 'decor' | 'roof' = 'main'): void {
  const lot = b.lot ?? 0;
  const ids = residentsOf(homes, lot);
  const names = ids.map((id) => nameOf(id));
  const v = homeOf(state, lot);
  const lvl = homeLevel(v);
  const sleeping = ids.length > 0 && ids.every((id) => game?.isAsleep(id));
  const title = ids.length === 0 ? `Terreno ${lot + 1} · livre` : `${HOME_STAGES[lvl]!.name} · ${names.join(' e ')}`;
  const again = (to: 'main' | 'decor' | 'roof' = view) => openHome(b, to);
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

function announce(r: Resolved): void {
  changed();
  if (r.firstTime) {
    trainerEvent('moment');
    earnCoins(8);
  }
  say(`📖 ${r.moment.emoji} ${r.moment.title}${r.firstTime ? ' · momento novo no Álbum! +10 moedas' : r.moment.fav ? ' · guardado no Álbum 📌' : ' · salvo no Diário'}`);
}

function afterResolve(r: Resolved, ids: string[]): void {
  announce(r);
  if (r.followUp.length > 0 && game) game.sayLines(ids, r.followUp, () => undefined);
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

function tickScenes(): void {
  if (!game || document.hidden || dialog.value || quiz.value || quizOpen.value || cutsceneOpen.value || sheet.value || welcome.value || game.sceneActive || mons.value.length === 0) return;
  if (Date.now() < nextSceneAt) return;
  nextSceneAt = Date.now() + (SCENE_GAP_MIN + Math.random() * SCENE_GAP_VAR) * effects().quietFactor;
  // Só entre os Pokémon que estão por perto, para você não perder o espetáculo.
  const near = actorList().filter((a) => game!.playerNear([a.id], 14) && !game!.sceneBusy(a.id));
  const env = makeEnv(state, refreshDay(), new Date().getHours(), game.weatherKind, profile.name);
  const scene = pickMoment(near, state, env, Math.random);
  if (!scene) return;
  const ids = scene.cast.map((a) => a.id);
  activeScene = { scene, ids };
  if (!game.playScene(ids, scene.lines, () => finishScene(scene, ids))) activeScene = null;
}

/** Enquanto você esteve fora, a vida seguiu: o Diário ganha os momentos que aconteceram. */
function awayCatchUp(): void {
  const now = Date.now();
  const list = actorList();
  if (list.length > 0 && state.lastSeen > 0) {
    const moments = catchUp(state, list, now, null, Math.random, profile.name);
    if (moments.length > 0) {
      changed();
      say(`📖 Enquanto você estava fora: ${moments.length} momento${moments.length > 1 ? 's' : ''} novo${moments.length > 1 ? 's' : ''} no Diário!`);
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
  settleScenes();
  state.lastSeen = Date.now();
  persist();
}

function onVisibility(): void {
  if (document.hidden) {
    // Saiu do app com uma tecla ou o dedo no joystick: ninguém fica andando sozinho ao voltar.
    heldKeys.clear();
    Object.assign(joy, { active: false, pointerId: -1, x: 0, y: 0 });
    game?.holdStick(null);
    onLeave();
  }
  else awayCatchUp();
}

function openDiary(): void {
  tab.value = 'diario';
  sheet.value = 'menu';
  state.diaryRead = Date.now();
  changed();
}

function pickTab(t: Tab): void {
  tab.value = t;
  if (t === 'diario') {
    state.diaryRead = Date.now();
    changed();
  }
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

function refreshDay(): string {
  const today = dayKey(new Date());
  if (today !== day.value) {
    day.value = today;
    pruneHarvest(state, today);
  }
  return today;
}

function pressA(): void {
  welcome.value = false;
  if (quiz.value) return;
  if (dialog.value) {
    if (dialog.value.actions.length === 0) dialog.value = null;
    return;
  }
  if (sheet.value || !game) return;
  const today = refreshDay();
  const t = game.target();
  if (t.kind === 'mon' && askingMon?.id === t.id) {
    game.faceMe(t.id);
    openQuiz(t.id);
  } else if (t.kind === 'mon') {
    game.faceMe(t.id);
    const name = nameOf(t.id);
    const result = talk(state, t.id, name, types.get(t.id) ?? [], today, new Date().getHours(), Math.random, recentGossip(state, t.id, Date.now()), game.weatherKind);
    if (result.gained > 0) {
      game.bubble(t.id, '❤️');
      trainerEvent('talk', t.id);
      earnCoins(5);
    }
    let text = result.text;
    const help = dailyHelp(state, t.id, today, Math.random);
    if (help.items.length > 0) text += ` Ah! Achei isto pela Vila para você: ${help.items.map((h) => `${h.qty} ${itemName(h.item)}`).join(' e ')}.`;
    if (help.rare) {
      text += ` E... guardei um presente especial: ${itemName(help.rare)}!`;
      game.bubble(t.id, '🎁', 2600);
    }
    changed();
    openFriendDialog(t.id, text);
  } else if (t.kind === 'crop') {
    const now = Date.now();
    tickCrops(state, now, effects().growthFactor);
    const ready = harvestCrop(state, t.x, t.y, Math.random);
    if (ready.ok) {
      say(ready.message);
      changed();
      return;
    }
    const r = water(state, t.x, t.y, now);
    say(r.message);
    if (r.ok) changed();
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
    sheet.value = 'build';
  } else if (t.kind === 'building') {
    openBuilding(t.building);
  } else if (t.kind === 'shop') {
    shopTab.value = 'comprar';
    sheet.value = 'shop';
  } else if (t.kind === 'tile' && t.tile === 'water') {
    if (fishing) return;
    if (state.fishing.day === today && state.fishing.casts >= FISH_PER_DAY) return say('Os peixes cansaram por hoje. Volte amanhã!');
    fishing = true;
    game.castLine(t.x, t.y, 1600);
    say('🎣 Lançou a linha…');
    setTimeout(() => {
      fishing = false;
      const r = fish(state, map, t.x, t.y, today, Math.random);
      say(r.message);
      if (r.ok) changed();
    }, 1500);
  } else if (t.kind === 'tile') {
    const r = harvest(state, map, t.x, t.y, today, Math.random);
    say(r.message);
    if (r.ok) changed();
  }
}

function openFriendDialog(id: string, text: string): void {
  const f = friendOf(state, id);
  const lvl = friendLevel(f.points);
  const following = state.follower === id;
  const actions: { label: string; run: () => void; disabled?: boolean }[] = [{ label: 'Presentear', run: () => { giftPick.value = true; } }];
  actions.push({ label: 'Acessório', run: () => { dialog.value = null; openDress(id); } });
  actions.push({ label: nicknameOf(state, id) ? 'Mudar o apelido' : 'Dar apelido', disabled: !canNickname(state, id), run: () => openNickname(id) });
  if (following) actions.push({ label: 'Pode passear', run: () => { state.follower = null; changed(); dialog.value = null; } });
  else if (canFollow(state, id)) actions.push({ label: 'Vem comigo!', run: () => { state.follower = id; changed(); game?.bubble(id, '🥰'); dialog.value = null; } });
  actions.push({ label: 'Tchau', run: () => { dialog.value = null; } });
  dialog.value = { id, name: `${nameOf(id)} · ${lvl.name} ${'♥'.repeat(lvl.hearts)}${'♡'.repeat(5 - lvl.hearts)}`, text, actions };
}

function give(item: ItemId): void {
  const id = dialog.value?.id;
  giftPick.value = false;
  if (!id) return;
  const r = giveGift(state, id, types.get(id) ?? [], item, refreshDay());
  if (r.ok) {
    changed();
    game?.bubble(id, r.gained >= 10 ? '😍' : '😊');
  }
  openFriendDialog(id, r.text);
}

function pressB(): void {
  welcome.value = false;
  if (giftPick.value) giftPick.value = false;
  else if (quiz.value) quizClose();
  else if (pendingChoice) decide(null);
  else if (dialog.value) dialog.value = null;
  else if (sheet.value === 'menu' && tab.value !== 'inicio') tab.value = 'inicio'; // B dentro de uma seção volta ao menu
  else if (sheet.value) sheet.value = null;
  else {
    tab.value = 'inicio';
    sheet.value = 'menu';
  }
}

function act(result: { ok: boolean; message: string }, close = false): void {
  say(result.message);
  if (result.ok) {
    changed();
    if (close) sheet.value = null;
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
  act(plant(state, map, seed, spot.x, spot.y, Date.now(), (x, y) => game?.occupied(x, y) ?? false), true);
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
onBeforeUnmount(() => detachLiveVillage(state));

onMounted(async () => {
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
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onLeave);
  window.addEventListener('beforeunload', onLeave);
  void requestPersistence();
  let villagers: VillageMon[] = [];
  try {
    const cache = await getCache();
    const team = resolveTeam(savedTeam.value, await cache.list());
    const loaded = await loadCreatureEntries(cache, browserDecoders, team.ids);
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
  const groundTile = await getVillageGroundTile().catch(() => null);
  if (!canvasEl.value || !wrapEl.value) return;
  game = new VillageGame(canvasEl.value, map, state, villagers, profile.sprite, groundTile);
  game.harvestedToday = (x, y) => state.harvested[`${x},${y}`] === day.value;
  game.onStep = changed;
  // Suicune: chuva fixa pelo resto do dia (se o clima não estiver desligado nas opções).
  game.weatherMode = () => (visual.weather !== 'off' && effects().rain ? 'chuva' : visual.weather);
  game.lampStorm = () => effects().lampStorm;
  game.animSpeed = () => effects().animSpeed;
  game.metallic = () => visual.metallic;
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
  loading.value = '';
  awayCatchUp();
  sceneTimer = setInterval(() => {
    tickScenes();
    tickQuestions();
  }, 1000);
  if (tickCrops(state, Date.now(), effects().growthFactor) > 0) changed();
  cropTimer = setInterval(() => {
    if (tickCrops(state, Date.now(), effects().growthFactor) > 0) changed();
  }, 5000);
  let beat = 0;
  saveTimer = setInterval(() => {
    // A cada ~30 s marca "você estava aqui", para saber o que aconteceu quando você sair.
    if (++beat % 20 === 0 && !document.hidden) {
      state.lastSeen = Date.now();
      dirty = true;
    }
    if (dirty) dirty = !persist();
  }, 1500);
  // Tipos (presente favorito, opiniões do Livro) chegam em segundo plano; sem rede, ficam neutros.
  for (const m of mons.value) {
    void loadPinData(m.id, m.dexId).then((d) => d.profile && types.set(m.id, d.profile.types)).catch(() => undefined);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('pagehide', onLeave);
  window.removeEventListener('beforeunload', onLeave);
  settleScenes();
  if (sceneTimer) clearInterval(sceneTimer);
  state.lastSeen = Date.now();
  game?.stop();
  observer?.disconnect();
  if (saveTimer) clearInterval(saveTimer);
  if (cropTimer) clearInterval(cropTimer);
  if (toastTimer) clearTimeout(toastTimer);
  saveVillage(state);
});
</script>

<template>
  <div class="village" role="application" aria-label="Vila: modo vida da Caixa">
    <div ref="wrapEl" class="village-stage">
      <canvas ref="canvasEl" class="village-canvas"></canvas>
      <header class="village-top">
        <img v-if="portraitOk" class="village-trainer" :src="trainerSpriteUrl(profile.sprite)" :alt="profile.name" width="28" height="28" @error="portraitOk = false" />
        <strong>Vila</strong>
        <span>{{ clock }}</span>
        <span class="village-coins" aria-label="Moedas"><i aria-hidden="true">●</i>{{ state.coins }}</span>
        <span class="village-house" :title="`Cidade: ${stage.name}`">Nv {{ level }}</span>
        <button type="button" class="village-diary" aria-label="Abrir o Diário de momentos" @click="openDiary">📖<b v-if="unread > 0">{{ unread }}</b></button>
        <button type="button" class="village-close" aria-label="Sair da Vila" @click="emit('close')">✕</button>
      </header>
      <p v-if="loading" class="village-loading">{{ loading }}</p>
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
        <span>Ande com o joystick (no teclado: setas ou WASD; duas juntas andam na diagonal). <b>A</b> conversa, coleta, rega, colhe e abre a loja e a casa. <b>B</b> abre a mochila, o Livro dos Pokémon e mais.</span>
      </div>
      <p v-if="toast" class="village-toast" role="status">{{ toast }}</p>

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
      <div v-else-if="dialog" class="speech in-stage village-dialog" role="dialog" :aria-label="dialog.name">
        <div class="speech-box">
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

      <div v-if="sheet === 'build'" class="village-sheet" role="dialog" aria-label="Construir a casa">
        <header><strong>Sua casa: {{ HOUSE_LEVELS[state.house]?.name }}</strong><button type="button" class="link" @click="sheet = null">Fechar</button></header>
        <template v-if="nextHouse">
          <p>Próximo: <strong>{{ nextHouse.name }}</strong></p>
          <p class="hint">Precisa de: {{ describeCost(state, nextHouse.cost) }}</p>
          <button type="button" class="primary" @click="act(upgradeHouse(state), true)">Construir</button>
        </template>
        <p v-else>Sua casa está completa! Decore o quintal com móveis.</p>
      </div>

      <div v-if="sheet === 'shop'" class="village-sheet" role="dialog" aria-label="Loja da Vila">
        <header>
          <div class="chips" role="tablist">
            <button type="button" role="tab" :class="{ active: shopTab === 'comprar' }" :aria-selected="shopTab === 'comprar'" @click="shopTab = 'comprar'">Comprar</button>
            <button type="button" role="tab" :class="{ active: shopTab === 'vender' }" :aria-selected="shopTab === 'vender'" @click="shopTab = 'vender'">Vender</button>
          </div>
          <span class="village-coins"><i aria-hidden="true">●</i>{{ state.coins }}</span>
          <button type="button" class="link" @click="sheet = null">Fechar</button>
        </header>
        <p class="hint">{{ shopTab === 'comprar' ? 'Sementes sempre; os móveis e acessórios mudam todo dia.' : 'A loja compra tudo o que você coleta e colhe.' }}</p>
        <ul v-if="shopTab === 'comprar'" class="item-grid">
          <li v-for="i in shopItems" :key="i.id">
            <img :src="icon(i.id)" alt="" width="40" height="40" />
            <span>{{ i.name }}<small>{{ i.price }} moedas</small></span>
            <button type="button" :disabled="state.coins < i.price" @click="act(buy(state, i.id, day))">Comprar</button>
          </li>
        </ul>
        <ul v-else class="item-grid">
          <li v-for="i in sellable" :key="i.id">
            <img :src="icon(i.id)" alt="" width="40" height="40" />
            <span>{{ i.name }} ×{{ count(state, i.id) }}<small>{{ i.sell }} cada</small></span>
            <button type="button" @click="act(sell(state, i.id))">Vender 1</button>
          </li>
          <li v-if="sellable.length === 0" class="hint">Nada para vender ainda.</li>
        </ul>
      </div>

      <div v-if="sheet === 'dress'" class="village-sheet" role="dialog" aria-label="Acessórios">
        <header><strong>Acessório {{ dressFor === 'player' ? 'para você' : `para ${nameOf(dressFor)}` }}</strong><button type="button" class="link" @click="sheet = null">Fechar</button></header>
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

      <div v-if="sheet === 'arcade'" class="village-sheet tall game-sheet" role="dialog" aria-label="Fliperama">
        <header><strong>Fliperama</strong><button type="button" class="link" @click="sheet = null">Fechar</button></header>
        <div class="card arcade-battle">
          <h2>⚔️ Batalha na câmera</h2>
          <p class="note">Abre a câmera e os sensores da Caixa direto no modo de batalha: coloque a caixa no chão e toque em Batalhar. {{ battleRewardText }}.</p>
          <button type="button" class="primary" @click="goToBattle">Abrir câmera e batalhar</button>
        </div>
        <MinigameHub closable @leave="sheet = null" />
      </div>

      <div v-if="sheet === 'arena'" class="village-sheet tall game-sheet" role="dialog" aria-label="Arena">
        <header><strong>Arena</strong><button type="button" class="link" @click="sheet = null">Fechar</button></header>
        <div class="card">
          <h2>Batalha com um amigo</h2>
          <p class="note">PvP na Caixa: os dois conectam por código, escolhem o modo e a luta aparece na caixa de cada um.</p>
          <button type="button" class="primary" @click="goToPvp">Ir para o PvP</button>
        </div>
        <LeagueCard @challenge="sheet = null; emit('close', 'caixa')" />
      </div>

      <div v-if="sheet === 'torre'" class="village-sheet tall game-sheet" role="dialog" aria-label="Torre de Sobrevivência">
        <header><strong>Torre de Sobrevivência</strong><button type="button" class="link" @click="sheet = null">Fechar</button></header>
        <MinigameSobrevivencia :digital="state.digital.instances.map((i) => ({ dexId: i.dexId, name: i.name }))" @leave="sheet = null" />
      </div>

      <div v-if="sheet === 'menu'" class="village-sheet tall village-menu" role="dialog" :aria-label="MENU_TITLES[tab]">
        <header class="menu-head">
          <button v-if="tab !== 'inicio'" type="button" class="link menu-back" @click="tab = 'inicio'">← Menu</button>
          <strong>{{ MENU_TITLES[tab] }}</strong>
          <button type="button" class="menu-close" aria-label="Fechar o menu" @click="sheet = null">✕</button>
        </header>

        <div v-if="tab === 'inicio'" class="menu-home">
          <p class="menu-status">
            <span>🪙 <b>{{ state.coins }}</b> moedas</span>
            <span>⭐ Nível <b>{{ level }}</b></span>
            <span>✨ <b>{{ state.digital.instances.length }}</b> Digital Pokémon</span>
          </p>
          <section v-for="g in menuGroups" :key="g.title" class="menu-group">
            <h4>{{ g.title }}</h4>
            <div class="menu-tiles">
              <template v-for="t in g.tiles" :key="t.label">
                <a v-if="t.href" class="menu-tile" :href="t.href">
                  <span class="menu-icon" aria-hidden="true">{{ t.icon }}</span>
                  <span>{{ t.label }}<small v-if="t.hint">{{ t.hint }}</small></span>
                </a>
                <button v-else type="button" class="menu-tile" @click="pickTab(t.tab!)">
                  <span class="menu-icon" aria-hidden="true">{{ t.icon }}</span>
                  <span>{{ t.label }}<small v-if="t.hint">{{ t.hint }}</small></span>
                </button>
              </template>
            </div>
          </section>
        </div>

        <ul v-else-if="tab === 'mochila'" class="item-grid">
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
          <MomentCard v-for="m in diaryList" :key="m.id" :moment="m" @toggle="toggleFav(m)" />
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

        <PokeBook v-else-if="tab === 'livro'" :mons="bookMons" :friends="state.friends" :relations="bookRels" :words="bookWords" :told="bookTold" :nicks="state.nicks" :nick-note="bookNote" can-dress @accessory="openDress" @nickname="bookNickname" />

        <div v-else>
          <p>Seu acessório: <strong>{{ state.wear.player ? itemName(state.wear.player) : 'nenhum' }}</strong></p>
          <label class="art-option">
            <input v-model="visual.metallic" type="checkbox" />
            <span>Brilho metálico nos Digital Pokémon (desligue em celular fraco)</span>
          </label>
          <button type="button" @click="openDress('player')">Escolher acessório</button>
          <h4>Amigos e pedidos de hoje</h4>
          <ul class="village-list">
            <li v-for="m in friendRows()" :key="m.id">
              <span>{{ m.name }}<small>{{ m.lvl.name }} · {{ '♥'.repeat(m.lvl.hearts) }}{{ '♡'.repeat(5 - m.lvl.hearts) }}{{ m.following ? ' · seguindo você' : '' }}{{ m.req ? ` · quer ${m.req.qty} ${itemName(m.req.item)}` : '' }}</small></span>
            </li>
            <li v-if="mons.length === 0" class="hint">Nenhum Pokémon na Vila ainda.</li>
          </ul>
        </div>
      </div>
    </div>

    <div class="village-pad" @contextmenu.prevent>
      <div
        class="village-joy"
        :class="{ active: joy.active }"
        role="application"
        aria-label="Joystick: arraste para andar (setas ou WASD no teclado)"
        @pointerdown.prevent="joyDown"
        @pointermove.prevent="joyMove"
        @pointerup.prevent="joyUp"
        @pointercancel.prevent="joyUp"
      >
        <div class="village-joy-stick" :style="{ transform: `translate(${joy.x * JOY_MAX}px, ${joy.y * JOY_MAX}px)` }"></div>
      </div>
      <div class="ab">
        <button type="button" class="b-btn" aria-label="B: menu e voltar" @click="pressB">B</button>
        <button type="button" class="a-btn" aria-label="A: interagir e falar" @click="pressA">A</button>
      </div>
    </div>
  </div>
</template>
