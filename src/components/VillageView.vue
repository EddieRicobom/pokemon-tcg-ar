<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { getCache, getLocalVillageSprite, loadPinData } from '../app/services';
import { resolveTeam } from '../app/team';
import { savedTeam } from '../app/team-store';
import { profile } from '../app/profile-store';
import { visual } from '../app/visual-settings';
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
} from '../core/village/life';
import { albumEntries, albumProgress, catchUp, makeEnv, pickMoment, recentGossip, relationMap, relationsOf, resolveScene, savedMoments, sceneChoice, setFavorite, unreadCount } from '../core/village/social';
import type { Resolved, Scene } from '../core/village/social';
import { FX_EMOJI, MAX_DIARY, MAX_SAVED, MOMENT_EMOJI, MOMENT_KINDS, MOMENT_LABELS } from '../core/village/social-state';
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
import type { PokemonType } from '../core/pokemon-data';
import { paintItemIcon } from '../village/item-art';
import { VillageGame } from '../village/village-game';
import type { VillageMon } from '../village/village-game';
import MomentCard from './MomentCard.vue';
import PokeBook from './PokeBook.vue';
import QuizDialog from './QuizDialog.vue';

/** Modo vida da Caixa: a Vila, sem câmera, com controle na tela. */
/** `close` sai da Vila; com `'pvp'` a Caixa abre o PvP em seguida (a Vila mora dentro da Caixa, então não há troca de tela). */
const emit = defineEmits<{ close: [then?: 'pvp'] }>();

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
type Tab = 'mochila' | 'fabricar' | 'cozinha' | 'diario' | 'album' | 'colecao' | 'livro' | 'visual';
const tab = ref<Tab>('mochila');
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
  if (!open) announceGrowth();
});

let game: VillageGame | null = null;
let observer: ResizeObserver | null = null;
let saveTimer: ReturnType<typeof setInterval> | null = null;
let cropTimer: ReturnType<typeof setInterval> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
let fishing = false;
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
function hold(dir: Dir | null): void {
  game?.hold(dir);
}

const KEYS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
let keyDir: Dir | null = null;
function onKey(e: KeyboardEvent): void {
  if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
  // Dentro de uma folha (jogos do Fliperama, Arena…) Enter, espaço e setas são da folha, não do personagem.
  if (sheet.value && (e.target as HTMLElement | null)?.closest?.('.village-sheet') && (KEYS[e.key] || e.key === ' ' || e.key === 'Enter')) return;
  if (e.type === 'keydown') {
    const dir = KEYS[e.key];
    if (dir) {
      keyDir = dir;
      hold(dir);
      e.preventDefault();
    } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'z') {
      pressA();
      e.preventDefault();
    } else if (e.key === 'x' || e.key === 'Escape') pressB();
  } else if (KEYS[e.key] && KEYS[e.key] === keyDir) {
    keyDir = null;
    hold(null);
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
  if (!game || document.hidden || dialog.value || quiz.value || sheet.value || welcome.value || game.sceneActive || mons.value.length === 0) return;
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
    if (r.ok) changed();
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

function openGameBuilding(b: Building): void {
  const exit = { label: 'Sair', run: closeDialog };
  if (b.kind === 'arcade') {
    dialog.value = {
      name: b.name,
      text: 'Luzes piscando e o barulhinho das máquinas! Aqui você joga os minigames (Quem é esse Pokémon?, Tipos e Memória) com as cartas que já escaneou. Vencer rende XP, igual no Treinador.',
      actions: [{ label: 'Jogar', run: () => { closeDialog(); sheet.value = 'arcade'; } }, exit],
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
    text: `Nível ${level.value} de Treinador: ${open} de ${LOTS.length} terrenos liberados. ${next ? `No nível ${next.level}: ${next.text}.` : 'A cidade já está completa!'} Jogue uma moeda para fazer um pedido.`,
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
  if (r.firstTime) trainerEvent('moment');
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
  if (!game || document.hidden || dialog.value || quiz.value || sheet.value || welcome.value || game.sceneActive || mons.value.length === 0) return;
  if (Date.now() < nextSceneAt) return;
  nextSceneAt = Date.now() + SCENE_GAP_MIN + Math.random() * SCENE_GAP_VAR;
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
  if (document.hidden) onLeave();
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
    tickCrops(state, now);
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
  else sheet.value = sheet.value ? null : 'menu';
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

onMounted(async () => {
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
        const local = e.info.dexId !== undefined ? await getLocalVillageSprite(e.info.dexId, e.info.shiny === true).catch(() => null) : null;
        return { id: e.info.id, name: displayName(state, e.info.id, e.info.name), shiny: e.info.shiny === true, gif: local ?? fallback };
      }),
    );
    mons.value = loaded.entries.map((e, i) => ({ id: e.info.id, name: displayName(state, e.info.id, e.info.name), real: e.info.name, shiny: e.info.shiny === true, dexId: e.info.dexId, thumb: thumbOf(villagers[i]!.gif) }));
  } catch {
    say('Não consegui ler as cartas guardadas; a Vila abre só com você.');
  }
  if (!canvasEl.value || !wrapEl.value) return;
  game = new VillageGame(canvasEl.value, map, state, villagers, profile.sprite);
  game.harvestedToday = (x, y) => state.harvested[`${x},${y}`] === day.value;
  game.onStep = changed;
  game.weatherMode = () => visual.weather;
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
  if (tickCrops(state, Date.now()) > 0) changed();
  cropTimer = setInterval(() => {
    if (tickCrops(state, Date.now()) > 0) changed();
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
      <div v-else-if="welcome" class="village-welcome" @click="welcome = false">
        <strong>Bem-vindo à Vila, {{ profile.name }}!</strong>
        <span>Ande com as setas. <b>A</b> conversa, coleta, rega, colhe e abre a loja e a casa. <b>B</b> abre a mochila, o Livro dos Pokémon e mais.</span>
      </div>
      <p v-if="toast" class="village-toast" role="status">{{ toast }}</p>

      <QuizDialog v-if="quiz" :name="quiz.name" :text="quiz.text" :stage="quiz.stage" :placeholder="quiz.q.placeholder" :chips="quiz.q.chips" :options="quiz.follow?.options.map((x) => x.label)" :submit-label="quiz.nick ? 'Salvar' : undefined" :cancel-label="quiz.nick ? 'Cancelar' : undefined" @answer="quizAnswer" @choose="quizChoose" @close="quizClose" />
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
        <MinigameHub closable @leave="sheet = null" />
      </div>

      <div v-if="sheet === 'arena'" class="village-sheet tall game-sheet" role="dialog" aria-label="Arena">
        <header><strong>Arena</strong><button type="button" class="link" @click="sheet = null">Fechar</button></header>
        <div class="card">
          <h2>Batalha com um amigo</h2>
          <p class="note">PvP na Caixa: os dois conectam por código, escolhem o modo e a luta aparece na caixa de cada um.</p>
          <button type="button" class="primary" @click="goToPvp">Ir para o PvP</button>
        </div>
        <LeagueCard @challenge="sheet = null; emit('close')" />
      </div>

      <div v-if="sheet === 'torre'" class="village-sheet tall game-sheet" role="dialog" aria-label="Torre de Sobrevivência">
        <header><strong>Torre de Sobrevivência</strong><button type="button" class="link" @click="sheet = null">Fechar</button></header>
        <MinigameSobrevivencia @leave="sheet = null" />
      </div>

      <div v-if="sheet === 'menu'" class="village-sheet tall" role="dialog" aria-label="Menu da Vila">
        <header>
          <div class="chips" role="tablist">
            <button v-for="t in (['mochila', 'fabricar', 'cozinha', 'diario', 'album', 'colecao', 'livro', 'visual'] as const)" :key="t" type="button" role="tab" :class="{ active: tab === t }" :aria-selected="tab === t" @click="pickTab(t)">
              {{ { mochila: 'Mochila', fabricar: 'Fabricar', cozinha: 'Cozinha', diario: 'Diário', album: 'Álbum', colecao: 'Coleção', livro: 'Livro', visual: 'Visual' }[t] }}
            </button>
          </div>
          <button type="button" class="link" @click="sheet = null">Fechar</button>
        </header>

        <ul v-if="tab === 'mochila'" class="item-grid">
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
      <div class="dpad" aria-label="Direcional">
        <button
          v-for="d in (['up', 'left', 'right', 'down'] as const)"
          :key="d"
          type="button"
          :class="'d-' + d"
          :aria-label="{ up: 'Cima', down: 'Baixo', left: 'Esquerda', right: 'Direita' }[d]"
          @pointerdown.prevent="hold(d)"
          @pointerup="hold(null)"
          @pointerleave="hold(null)"
          @pointercancel="hold(null)"
        >{{ { up: '▲', down: '▼', left: '◀', right: '▶' }[d] }}</button>
      </div>
      <div class="ab">
        <button type="button" class="b-btn" aria-label="B: menu e voltar" @click="pressB">B</button>
        <button type="button" class="a-btn" aria-label="A: interagir e falar" @click="pressA">A</button>
      </div>
    </div>
  </div>
</template>
