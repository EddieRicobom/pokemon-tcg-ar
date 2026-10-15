<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';
import { loadPinData, getCache } from '../app/services';
import { defaultSetup, loadSetup, roleOf, saveSetup, setRole, setupBlocker } from '../app/pins-setup';
import type { PinsSetup, Role } from '../app/pins-setup';
import { routeHref } from '../app/route';
import { recordEvent, spendTrainerEnergy, trainer } from '../app/trainer-store';
import { seededRng } from '../core/battle';
import {
  advanceRound, afterShot, affordable, aliveOf, arenaLimit, ARENA_RADIUS, canUse, clearEffects, createWorld, DIFFICULTIES, DIFFICULTY_LABELS_PT, EFFECT_INFO, effectLabel, isSettled, launch, MAX_PER_SIDE,
  nextLimit, outcomeOf, pinFromSpec, PATCH_LABELS_PT, previewPath, scoreMatch, shotFromDrag, stepWorld,
} from '../core/pins';
import { planEnemyShot } from '../core/pin-ai';
import { MARK_HINT_PT, TYPE_FOR_TERRAIN } from '../core/pin-terrain';
import { REPLAY_SPEED, ReplayRecorder } from '../core/pin-replay';
import { vibrate } from '../app/haptics';
import type { HapticCue } from '../app/haptics';
import { SoundEngine } from '../box/sound';
import type { SoundCue } from '../box/sound-recipes';
import { TERRAIN_KINDS, TERRAIN_LABELS_PT } from '../core/terrain';
import type { TerrainKind } from '../core/terrain';
import type { Difficulty, PinEvent, PinSpec, PinWorld, Shot } from '../core/pins';
import { energyLabelPt, TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import type { CardBattleInfo, PokemonProfile, PokemonType } from '../core/pokemon-data';
import { artSize, paintArena, paintBumpers, UNITS_PER_PIXEL } from '../pins/arena-art';
import { ArenaTerrainArt } from '../pins/terrain-paint';
import type { CachedCard } from '../cache/types';
import { spriteIdOf } from '../core/dex-form';
import PvpLobby from '../components/PvpLobby.vue';
import type { PvpPeer } from '../pvp/peer';
import { pokemonSpriteUrl } from '../ar/sprite-url';
import { applyWorld, buildPvpWorld, prefixSpecs, PVP_MAX_PINS, shotFromWire, shotToWire, snapshotInit, snapshotWorld } from '../pvp/wire';
import type { Frame, WireMessage, WireSpec, WireWorld } from '../pvp/wire';

type Phase = 'setup' | 'loading' | 'aim' | 'rolling' | 'enemy' | 'over';
interface Info { state: 'loading' | 'ok'; profile: PokemonProfile | null; card: CardBattleInfo | null }
interface TrayMove { index: number; name: string; label: string; hint: string; remaining: number; energy: string[] }
interface TrayPin { id: string; name: string; cost: number; thumb: string; selected: boolean; affordable: boolean; moves: TrayMove[]; estimated: boolean }
interface Popup { text: string; x: number; y: number; age: number; color: string }

const STEP = 1 / 120;
/** Borda do pin: azul para o seu lado (ou a sua equipe), vermelha para os adversários. */
const TEAM_COLORS = ['#4da3ff', '#ff5d5d'] as const;

const phase = ref<Phase>('setup');
// ---- PvP (contra um amigo, cada um no seu celular)
const mode = ref<'cpu' | 'friend'>('cpu');
const peer = shallowRef<PvpPeer | null>(null);
const frame = ref<Frame>('host');
/** O que sabemos do amigo na sala: pins escolhidos, se está pronto e, para o convidado, as opções do anfitrião. */
const friend = reactive({ ready: false, specs: [] as WireSpec[], shrink: true, marks: true });
const myReady = ref(false);
const pvpMatch = ref(false);
const roomNotice = ref('');
let pendingSettled: { world: WireWorld; at: number } | null = null;
const cards = ref<CachedCard[]>([]);
const thumbs = ref<Record<string, string>>({});
const infos = ref<Record<string, Info>>({});
const setup = ref<PinsSetup>({ mine: [], enemy: [], difficulty: 'normal', marks: true, shrink: true, sound: true, haptics: true });
/** Rodada em andamento (1, 2, …) e o aviso de que a borda vai avançar no fim dela. */
const roundNo = ref(1);
const borderWarn = ref(false);
const borderNote = ref('');
/** Repetição em câmera lenta do disparo decisivo. */
const replaying = ref(false);
const canReplay = ref(false);
/** Marcas que existem no chão agora (para a legenda da partida). */
const floorMarks = ref<TerrainKind[]>([]);
const search = ref('');
const notice = ref('');
const loadingCards = ref(true);
const message = ref('');
const tray = ref<TrayPin[]>([]);
const selectedId = ref<string | null>(null);
const selectedMove = ref<number | null>(null);
const result = ref<{ won: boolean; reason: 'won' | 'lost' | 'energia' | 'saiu' | 'empate'; shots: number; score: number } | null>(null);
const counts = ref({ mine: 0, enemy: 0 });
const shotCount = ref(0);

const stageEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const spriteLayer = ref<HTMLElement | null>(null);

let world: PinWorld | null = null;
/** Camadas da arena: fundo, chão em blocos (muda com os golpes) e pinos de mola por cima. */
let artCanvas: HTMLCanvasElement | null = null;
let bumperCanvas: HTMLCanvasElement | null = null;
let terrainArt: ArenaTerrainArt | null = null;
let terrainCanvas: HTMLCanvasElement | null = null;
let terrainShown = -1;
/** O raio que a tela mostra (alcança o raio real aos poucos, para a borda "andar"). */
let shownLimit = ARENA_RADIUS;
const recorder = new ReplayRecorder();
let replayAt = 0;
const engine = new SoundEngine();
const sprites = new Map<string, HTMLElement>();
let raf = 0;
let last = 0;
let acc = 0;
let rollTime = 0;
let settledTime = 0;
let rollOwner: 'me' | 'enemy' = 'me';
let enemyPlan: { pinId: string; shot: Shot; moveIndex: number | null } | null = null;
let enemyTimer = 0;
let shots = 0;
let drag: { fromX: number; fromY: number; toX: number; toY: number } | null = null;
let popups: Popup[] = [];
let disposed = false;
let cssSize = 0;
let dpr = 1;
const rng = seededRng((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);

// ---------------------------------------------------------------- preparação

const energy = computed(() => trainer.value.energy);
/** Energia que vale na partida: no PvP não há custo (os dois jogam com os mesmos pins e sem gastar a energia do treinador). */
const budget = computed(() => (pvpMatch.value ? Number.POSITIVE_INFINITY : trainer.value.energy));
const usable = computed(() => cards.value.filter((c) => c.sprite.state === 'ok' && c.dexIds.length > 0));
const shown = computed(() => {
  const q = search.value.trim().toLowerCase();
  return usable.value.filter((c) => !q || `${c.name} ${c.setName}`.toLowerCase().includes(q)).slice(0, 80);
});
const blocker = computed(() => setupBlocker(setup.value));

function specOf(card: CachedCard): PinSpec {
  const info = infos.value[card.id];
  const cardTypes = (info?.card?.types ?? []).map((t) => energyTypeOf(t)).filter((t): t is PokemonType => t !== null);
  return {
    id: card.id,
    name: card.name,
    types: info?.profile?.types.length ? info.profile.types : cardTypes,
    stats: info?.profile?.stats ?? null,
    weightKg: info?.profile?.weightKg ?? null,
    attacks: info?.card?.attacks,
  };
}

function energyTypeOf(name: string): PokemonType | null {
  const lower = name.toLowerCase();
  const map: Record<string, PokemonType> = { lightning: 'electric', darkness: 'dark', metal: 'steel' };
  const type = map[lower] ?? lower;
  return (Object.keys(TYPE_LABELS_PT) as PokemonType[]).find((t) => t === type) ?? null;
}

function rowInfo(card: CachedCard): { cost: number | null; types: PokemonType[]; moves: number; note: string } {
  const info = infos.value[card.id];
  if (!info || info.state === 'loading') return { cost: null, types: [], moves: 0, note: 'carregando…' };
  const pin = pinFromSpec(specOf(card), 0);
  return {
    cost: pin.cost,
    types: pin.types,
    moves: pin.moves.length,
    note: pin.estimated ? 'sem todos os dados (valores neutros)' : '',
  };
}

async function loadInfo(card: CachedCard): Promise<void> {
  if (infos.value[card.id]?.state === 'ok') return;
  infos.value = { ...infos.value, [card.id]: { state: 'loading', profile: null, card: null } };
  const data = await loadPinData(card.id, spriteIdOf(card)).catch(() => ({ profile: null, card: null }));
  if (disposed) return;
  infos.value = { ...infos.value, [card.id]: { state: 'ok', profile: data.profile, card: data.card } };
}

async function loadInfos(list: CachedCard[]): Promise<void> {
  const queue = [...list];
  const worker = async () => {
    for (let card = queue.shift(); card && !disposed; card = queue.shift()) await loadInfo(card);
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

onMounted(async () => {
  try {
    const cache = await getCache();
    const list = (await cache.list()).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    cards.value = list;
    const ok = list.filter((c) => c.sprite.state === 'ok' && c.dexIds.length > 0);
    setup.value = loadSetup(new Set(ok.map((c) => c.id)), ok);
    loadingCards.value = false;
    // Miniaturas dos primeiros da lista (o resto aparece só com o nome).
    const next: Record<string, string> = {};
    for (const card of ok.slice(0, 80)) {
      const blob = await cache.getAssetBlob(card, 'sprite').catch(() => null);
      if (blob) next[card.id] = URL.createObjectURL(blob);
      if (disposed) return;
    }
    thumbs.value = next;
    // Atributos e golpes dos escolhidos primeiro, depois do resto da lista.
    const chosen = new Set([...setup.value.mine, ...setup.value.enemy]);
    void loadInfos([...ok.filter((c) => chosen.has(c.id)), ...ok.filter((c) => !chosen.has(c.id)).slice(0, 60)]);
  } catch (e) {
    notice.value = `Não consegui ler as cartas guardadas: ${e instanceof Error ? e.message : String(e)}`;
    loadingCards.value = false;
  }
});

function choose(card: CachedCard, role: Role | null): void {
  const { setup: next, full } = setRole(setup.value, card.id, role);
  notice.value = full ? (full === 'mine' ? `Você já tem ${MAX_PER_SIDE[0]} pins. Tire um para colocar outro.` : `Já são ${MAX_PER_SIDE[1]} adversários. Tire um para colocar outro.`) : '';
  setup.value = next;
  saveSetup(next);
  void loadInfo(card);
  if (mode.value === 'friend' && peer.value) {
    // Mudou o time: o "pronto" vale só para o time que o amigo viu.
    myReady.value = false;
    void syncTeam();
  }
}

function roleShown(card: CachedCard): Role | null {
  const role = roleOf(setup.value, card.id);
  return mode.value === 'friend' && role === 'enemy' ? null : role;
}

function setDifficulty(d: Difficulty): void {
  setup.value = { ...setup.value, difficulty: d };
  saveSetup(setup.value);
}

function useRecent(): void {
  setup.value = { ...defaultSetup(usable.value), difficulty: setup.value.difficulty };
  saveSetup(setup.value);
  notice.value = '';
}

// ---------------------------------------------------------------- partida

async function start(): Promise<void> {
  engine.unlock();
  stopReplay();
  pvpMatch.value = false;
  if (blocker.value) {
    notice.value = blocker.value;
    return;
  }
  phase.value = 'loading';
  notice.value = '';
  const chosen = [...setup.value.mine, ...setup.value.enemy].map((id) => cards.value.find((c) => c.id === id)).filter((c): c is CachedCard => !!c);
  await Promise.all(chosen.map((c) => loadInfo(c)));
  // Miniaturas de quem está fora da primeira leva.
  const cache = await getCache();
  for (const card of chosen) {
    if (thumbs.value[card.id]) continue;
    const blob = await cache.getAssetBlob(card, 'sprite').catch(() => null);
    if (blob) thumbs.value = { ...thumbs.value, [card.id]: URL.createObjectURL(blob) };
  }
  if (disposed) return;
  const byId = (id: string) => cards.value.find((c) => c.id === id)!;
  world = createWorld({ mine: setup.value.mine.map((id) => specOf(byId(id))), enemy: setup.value.enemy.map((id) => specOf(byId(id))) }, rng, { marks: setup.value.marks, shrink: setup.value.shrink });
  await beginMatch('aim');
}

/** Põe a partida (o `world` já montado) na tela: arte, contadores e a primeira fase (`aim` = sua vez, `enemy` = espera o outro). */
async function beginMatch(first: 'aim' | 'enemy'): Promise<void> {
  if (!world) return;
  buildArt(world);
  shownLimit = world.radius;
  recorder.start(world);
  canReplay.value = false;
  refreshRound();
  shots = 0;
  shotCount.value = 0;
  popups = [];
  result.value = null;
  message.value = '';
  selectedMove.value = null;
  selectedId.value = null;
  pendingSettled = null;
  phase.value = first;
  await nextTick();
  mountSprites();
  resize();
  pickDefaultPin();
  refreshTray();
  startLoop();
}

function cue(c: SoundCue): void {
  if (setup.value.sound) engine.play(c);
}

function buzz(c: HapticCue): void {
  vibrate(c, setup.value.haptics);
}

function refreshRound(): void {
  if (!world) return;
  roundNo.value = (world.round ?? 0) + 1;
  const next = nextLimit(world);
  borderWarn.value = next !== null;
  borderNote.value = !world.shrinking ? '' : next !== null ? 'A borda avança no fim desta rodada.' : 'A borda começa a avançar na rodada 2.';
}

function canvasOf(art: { w: number; h: number; data: Uint8Array | Uint8ClampedArray }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = art.w;
  canvas.height = art.h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const image = ctx.createImageData(art.w, art.h);
    image.data.set(art.data);
    ctx.putImageData(image, 0, 0);
  }
  return canvas;
}

function buildArt(w: PinWorld): void {
  artCanvas = canvasOf(paintArena(w.radius, Math.floor(rng() * 1e6)));
  bumperCanvas = canvasOf(paintBumpers(w.radius, w.patches));
  terrainArt = w.terrain ? new ArenaTerrainArt(w.terrain, w.radius, Math.floor(rng() * 1e6)) : null;
  terrainCanvas = terrainArt ? canvasOf(terrainArt.buf) : null;
  terrainShown = terrainArt ? terrainArt.version : -1;
  refreshFloorMarks();
}

/** Copia o chão em pixel art para o canvas só quando algum bloco mudou. */
function syncTerrain(): void {
  if (!terrainArt || !terrainCanvas || terrainShown === terrainArt.version) return;
  const ctx = terrainCanvas.getContext('2d');
  if (!ctx) return;
  const { buf } = terrainArt;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(buf.data), buf.w, buf.h), 0, 0);
  terrainShown = terrainArt.version;
}

function refreshFloorMarks(): void {
  const counts = world?.terrain?.counts() ?? {};
  floorMarks.value = TERRAIN_KINDS.filter((k) => (counts[k] ?? 0) > 0);
}

function mountSprites(): void {
  const layer = spriteLayer.value;
  if (!layer || !world) return;
  layer.replaceChildren();
  sprites.clear();
  for (const pin of world.pins) {
    // O pin é uma ficha redonda com a borda da equipe e o GIF do Pokémon no centro.
    const token = document.createElement('div');
    token.className = 'pin-token';
    token.style.borderColor = TEAM_COLORS[pin.side];
    const img = document.createElement('img');
    img.src = thumbs.value[pin.id] ?? '';
    img.alt = '';
    img.draggable = false;
    token.appendChild(img);
    layer.appendChild(token);
    sprites.set(pin.id, token);
  }
}

function pickDefaultPin(): void {
  if (!world) return;
  const ok = affordable(world, budget.value);
  const current = ok.find((p) => p.id === selectedId.value);
  selectedId.value = (current ?? ok[0])?.id ?? null;
  if (selectedMove.value !== null) {
    const pin = world.pins.find((p) => p.id === selectedId.value);
    if (!pin || !canUse(pin, selectedMove.value)) selectedMove.value = null;
  }
}

function refreshTray(): void {
  if (!world) return;
  const mine = world.pins.filter((p) => p.side === 0 && p.alive);
  tray.value = mine.map((p) => ({
    id: p.id,
    name: p.name,
    cost: p.cost,
    thumb: thumbs.value[p.id] ?? '',
    selected: p.id === selectedId.value && p.fall === 0,
    affordable: p.cost <= budget.value && p.fall === 0,
    estimated: p.estimated,
    moves: p.moves.map((m, index) => ({
      index,
      name: m.name,
      label: effectLabel(m.effect),
      hint: EFFECT_INFO[m.effect.kind].hint,
      remaining: p.cooldowns[index] ?? 0,
      energy: m.cost.map((c) => energyLabelPt(c)),
    })),
  }));
  counts.value = { mine: aliveOf(world, 0).length, enemy: aliveOf(world, 1).length };
}

function selectPin(id: string): void {
  if (phase.value !== 'aim' || !world) return;
  const pin = world.pins.find((p) => p.id === id);
  if (!pin || pin.side !== 0 || !pin.alive || pin.fall > 0) return;
  if (pin.cost > budget.value) {
    message.value = `Sem energia para ${pin.name} (custa ${pin.cost}). Ganhe XP escaneando cartas ou jogando minigames.`;
    return;
  }
  message.value = '';
  selectedId.value = id;
  selectedMove.value = null;
  refreshTray();
}

function selectMove(index: number | null): void {
  if (phase.value !== 'aim' || !world) return;
  const pin = world.pins.find((p) => p.id === selectedId.value);
  if (!pin || !canUse(pin, index)) return;
  selectedMove.value = index;
  refreshTray();
}

const selectedPin = computed(() => tray.value.find((t) => t.selected) ?? null);

// ---------------------------------------------------------------- laço do jogo

function startLoop(): void {
  cancelAnimationFrame(raf);
  last = performance.now();
  acc = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw(now);
  };
  raf = requestAnimationFrame(frame);
}

function update(dt: number): void {
  if (!world) return;
  popups = popups.filter((p) => (p.age += dt) < 1.1);
  if (phase.value === 'rolling') {
    acc += dt;
    const events: PinEvent[] = [];
    while (acc >= STEP) {
      stepWorld(world, STEP, events);
      recorder.capture(world);
      acc -= STEP;
    }
    handleEvents(events);
    rollTime += dt;
    // Se algo teimar em se mexer (correnteza, pino de mola), a jogada acaba depois de um tempo.
    if (rollTime > 14) for (const p of world.pins) if (p.fall === 0) (p.vx = 0), (p.vy = 0);
    // PvP: o amigo já mandou o resultado e o meu movimento ainda não parou; não espero mais que isso.
    if (pvpMatch.value && rollOwner === 'enemy' && pendingSettled && performance.now() - pendingSettled.at > 2500) for (const p of world.pins) if (p.fall === 0) (p.vx = 0), (p.vy = 0);
    settledTime = isSettled(world) ? settledTime + dt : 0;
    if (settledTime >= 0.3) finishRoll();
  } else if (phase.value === 'enemy') {
    if (!pvpMatch.value) {
      enemyTimer -= dt;
      if (enemyTimer <= 0) fireEnemy();
    }
  } else if (replaying.value) {
    replayAt += dt * REPLAY_SPEED;
    const range = recorder.range();
    if (!range || replayAt >= range.to) stopReplay();
  } else if (phase.value === 'aim' || phase.value === 'over') {
    // Pins que ainda estão caindo terminam de cair.
    const events: PinEvent[] = [];
    if (world.pins.some((p) => p.alive && p.fall > 0)) stepWorld(world, dt, events);
  }
  // A borda mostrada anda até o raio real.
  const target = arenaLimit(world);
  shownLimit += Math.sign(target - shownLimit) * Math.min(Math.abs(target - shownLimit), dt * 70);
}

function handleEvents(events: PinEvent[]): void {
  if (!world) return;
  let added = 0;
  let reactions = 0;
  let marksChanged = false;
  let loudest = 0;
  let loudestEdge: 'super' | 'weak' | 'none' | null = null;
  let hitsMine = false;
  let bumped = false;
  let outMine = false;
  let outTheirs = false;
  for (const e of events) {
    if (e.type === 'hit') {
      if (e.strength > loudest) {
        loudest = e.strength;
        loudestEdge = e.edge;
      }
      if (e.strength >= 0.12 && [e.a, e.b].some((id) => world?.pins.find((p) => p.id === id)?.side === 0)) hitsMine = true;
    } else if (e.type === 'bumper') bumped = true;
    else if (e.type === 'out') {
      if (world.pins.find((p) => p.id === e.id)?.side === 0) outMine = true;
      else outTheirs = true;
    }
    if (e.type === 'hit' && e.edge !== null && added < 2) {
      const a = world.pins.find((p) => p.id === e.a);
      const b = world.pins.find((p) => p.id === e.b);
      if (!a || !b || e.strength < 0.2) continue;
      const text = e.edge === 'super' ? 'Super efetivo!' : e.edge === 'none' ? 'Não afeta…' : 'Pouco efetivo';
      popups.push({ text, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 20, age: 0, color: e.edge === 'super' ? '#ffd23f' : '#c9d1e6' });
      added++;
    } else if (e.type === 'wave') {
      const p = world.pins.find((x) => x.id === e.id);
      if (p) popups.push({ text: 'Onda!', x: p.x, y: p.y - 30, age: 0, color: '#8ec5ff' });
    } else if (e.type === 'mark') {
      terrainArt?.repaint(e.cells);
      marksChanged = true;
      if (e.reaction && reactions < 2) {
        popups.push({ text: e.reaction.text, x: e.x * 0.9, y: e.y * 0.9 - 24, age: 0, color: e.reaction.color });
        reactions++;
        cue({ kind: 'pin-reaction' });
        buzz({ kind: 'reaction' });
      } else if (e.cells.length > 12) {
        cue({ kind: 'pin-mark', type: TYPE_FOR_TERRAIN[e.kind], big: true });
      }
    } else if (e.type === 'shrink') {
      popups.push({ text: 'A borda avançou!', x: 0, y: -ARENA_RADIUS * 0.45, age: 0, color: '#ffb35c' });
      cue({ kind: 'pin-shrink' });
      buzz({ kind: 'shrink' });
      bumperCanvas = canvasOf(paintBumpers(world.radius, world.patches));
    } else if (e.type === 'out') {
      const p = world.pins.find((x) => x.id === e.id);
      if (p) popups.push({ text: p.side === 1 ? 'Fora!' : 'Caiu!', x: p.x * 0.85, y: p.y * 0.85, age: 0, color: p.side === 1 ? '#7dffa0' : '#ff8a8a' });
    }
  }
  if (marksChanged) refreshFloorMarks();
  if (loudest >= 0.12) cue({ kind: 'pin-hit', strength: loudest, edge: loudestEdge });
  if (hitsMine && loudest >= 0.3) buzz({ kind: 'hit', strength: loudest });
  if (bumped) {
    cue({ kind: 'pin-bumper' });
    buzz({ kind: 'bumper' });
  }
  if (events.some((e) => e.type === 'wave')) cue({ kind: 'pin-wave' });
  if (outMine || outTheirs) {
    cue({ kind: 'pin-out', mine: outMine });
    buzz({ kind: 'out', mine: outMine });
    // O último a cair decide a partida: marca o momento para a repetição.
    if (outcomeOf(world) !== 'playing' && phase.value === 'rolling') recorder.markDecisive(world);
  }
  if (events.some((e) => e.type === 'out')) refreshTray();
}

function finishRoll(): void {
  if (!world) return;
  settledTime = 0;
  if (pvpMatch.value) return finishPvpRoll();
  const outcome = outcomeOf(world);
  refreshTray();
  if (outcome !== 'playing') return endGame(outcome);
  if (rollOwner === 'me') {
    // O Escudo segue valendo durante a resposta; os outros efeitos acabam com o seu disparo.
    clearEffects(world, true);
    // No Normal e no Difícil o adversário simula as jogadas antes de escolher (core/pin-ai.ts).
    const plan = planEnemyShot(world, rng, setup.value.difficulty);
    if (!plan) return endGame('won');
    enemyPlan = plan;
    enemyTimer = 0.9;
    phase.value = 'enemy';
    message.value = 'O adversário está mirando…';
    return;
  }
  clearEffects(world, false);
  // Fim da rodada (o seu disparo e a resposta): a borda pode avançar.
  const closing: PinEvent[] = advanceRound(world);
  handleEvents(closing);
  refreshRound();
  const after = outcomeOf(world);
  if (after !== 'playing') return endGame(after);
  nextAim();
}

function nextAim(): void {
  if (!world) return;
  if (!pvpMatch.value && affordable(world, budget.value).length === 0) return endGame('energia');
  phase.value = 'aim';
  message.value = '';
  pickDefaultPin();
  refreshTray();
}

function fireEnemy(): void {
  if (!world || !enemyPlan) return;
  const pin = world.pins.find((p) => p.id === enemyPlan!.pinId);
  const plan = enemyPlan;
  enemyPlan = null;
  if (!pin || !pin.alive || !launch(pin, plan.shot, plan.moveIndex)) {
    nextAim();
    return;
  }
  afterShot(world, 1, { pinId: pin.id, moveIndex: plan.moveIndex });
  recorder.start(world);
  cue({ kind: 'pin-launch', power: plan.shot.power, type: pin.active?.kind === 'elemental' ? pin.active.type : null });
  if (plan.moveIndex !== null) popups.push({ text: pin.moves[plan.moveIndex]!.name, x: pin.x, y: pin.y - 36, age: 0, color: '#ffb3b3' });
  rollOwner = 'enemy';
  rollTime = 0;
  settledTime = 0;
  message.value = '';
  phase.value = 'rolling';
}

function endGame(kind: 'won' | 'lost' | 'energia' | 'saiu' | 'empate'): void {
  if (!world) return;
  phase.value = 'over';
  const won = kind === 'won';
  const score = pvpMatch.value ? 0 : scoreMatch(won, shots, setup.value.enemy.length);
  result.value = { won, reason: kind, shots, score };
  message.value = '';
  // Contra um amigo não vale XP nem recorde (nada impede alguém de mexer no próprio aparelho).
  if (!pvpMatch.value) recordEvent({ type: 'minigame', game: 'pins', won, score });
  refreshTray();
  cue({ kind: won ? 'pin-win' : 'pin-lose' });
  buzz({ kind: won ? 'win' : 'lose' });
  canReplay.value = recorder.hasReplay;
  if (canReplay.value) startReplay();
}

function startReplay(): void {
  const range = recorder.range();
  if (!range || !recorder.hasReplay) return;
  replayAt = range.from;
  replaying.value = true;
}

function stopReplay(): void {
  replaying.value = false;
}

function fireMine(shot: Shot): void {
  if (!world || phase.value !== 'aim') return;
  const pin = world.pins.find((p) => p.id === selectedId.value);
  if (!pin || !pin.alive) return;
  if (!canUse(pin, selectedMove.value)) {
    message.value = 'Esse golpe ainda está recarregando. Escolha outro ou o disparo normal.';
    return;
  }
  if (!pvpMatch.value && !spendTrainerEnergy(pin.cost)) {
    message.value = `Sem energia para ${pin.name} (custa ${pin.cost}).`;
    pickDefaultPin();
    refreshTray();
    return;
  }
  const moveIndex = selectedMove.value;
  launch(pin, shot, moveIndex);
  afterShot(world, 0, { pinId: pin.id, moveIndex });
  if (pvpMatch.value) peer.value?.send({ t: 'shot', pinId: pin.id, moveIndex, ...shotToWire(frame.value, shot) });
  recorder.start(world);
  cue({ kind: 'pin-launch', power: shot.power, type: pin.active?.kind === 'elemental' ? pin.active.type : null });
  buzz({ kind: 'launch', power: shot.power });
  if (moveIndex !== null) popups.push({ text: pin.moves[moveIndex]!.name, x: pin.x, y: pin.y - 36, age: 0, color: '#ffffff' });
  shots++;
  shotCount.value = shots;
  rollOwner = 'me';
  rollTime = 0;
  settledTime = 0;
  selectedMove.value = null;
  message.value = '';
  phase.value = 'rolling';
  refreshTray();
}

function again(): void {
  cancelAnimationFrame(raf);
  if (pvpMatch.value || mode.value === 'friend') {
    if (frame.value === 'host' && peer.value) void startPvp();
    return;
  }
  void start();
}

function backToSetup(): void {
  cancelAnimationFrame(raf);
  stopReplay();
  world = null;
  sprites.clear();
  phase.value = 'setup';
  message.value = '';
  pvpMatch.value = false;
  if (peer.value) {
    // Na sala, o time pode mudar entre uma partida e outra: cada um confirma de novo.
    myReady.value = false;
    void syncTeam();
  }
}

// ---------------------------------------------------------------- PvP

const friendBlocker = computed(() => {
  const n = setup.value.mine.length;
  if (n === 0) return 'Escolha ao menos 1 pin.';
  if (frame.value !== 'host') return null;
  if (!friend.ready) return 'Esperando o amigo ficar pronto.';
  if (friend.specs.length !== n) return `Vocês precisam levar o mesmo número de pins (você ${n}, amigo ${friend.specs.length}).`;
  return null;
});

function rawSpecsOfMine(): WireSpec[] {
  return setup.value.mine
    .map((id) => cards.value.find((c) => c.id === id))
    .filter((c): c is CachedCard => !!c)
    .flatMap((card) => {
      const sprite = spriteIdOf(card);
      return sprite ? [{ ...specOf(card), sprite }] : [];
    });
}

/** Manda os meus pins (já com os dados carregados) e se estou pronto. */
async function syncTeam(): Promise<void> {
  if (!peer.value) return;
  const chosen = setup.value.mine.map((id) => cards.value.find((c) => c.id === id)).filter((c): c is CachedCard => !!c);
  await Promise.all(chosen.map((c) => loadInfo(c)));
  peer.value?.send({ t: 'team', ready: myReady.value, specs: prefixSpecs(frame.value, rawSpecsOfMine()) });
}

function sendOptions(): void {
  if (frame.value === 'host') peer.value?.send({ t: 'options', shrink: setup.value.shrink, marks: setup.value.marks });
}

function onConnected(p: PvpPeer, role: Frame): void {
  peer.value = p;
  frame.value = role;
  mode.value = 'friend';
  roomNotice.value = '';
  friend.ready = false;
  friend.specs = [];
  myReady.value = false;
  p.onMessage = onPeerMessage;
  p.onState = onPeerState;
  sendOptions();
  void syncTeam();
}

function leaveRoom(): void {
  const p = peer.value;
  peer.value = null;
  if (p) {
    p.onState = null;
    p.onMessage = null;
    p.close();
  }
  friend.ready = false;
  friend.specs = [];
  myReady.value = false;
  pvpMatch.value = false;
}

function onPeerState(state: string): void {
  if (state !== 'closed') return;
  const inMatch = pvpMatch.value && phase.value !== 'over' && phase.value !== 'setup' && phase.value !== 'loading';
  peer.value = null;
  friend.ready = false;
  friend.specs = [];
  myReady.value = false;
  roomNotice.value = 'O amigo saiu ou a conexão caiu.';
  if (inMatch) endGame('saiu');
  else if (phase.value === 'loading') phase.value = 'setup';
}

function onPeerMessage(msg: WireMessage): void {
  const theirPrefix = frame.value === 'host' ? 'g:' : 'h:';
  switch (msg.t) {
    case 'team': {
      if (!msg.specs.every((s) => s.id.startsWith(theirPrefix))) return;
      friend.specs = msg.specs;
      friend.ready = msg.ready;
      const next = { ...thumbs.value };
      for (const s of msg.specs) next[s.id] = pokemonSpriteUrl(s.sprite);
      thumbs.value = next;
      return;
    }
    case 'options':
      if (frame.value === 'guest') {
        friend.shrink = msg.shrink;
        friend.marks = msg.marks;
      }
      return;
    case 'start':
      if (frame.value === 'guest') void onStartMessage(msg);
      return;
    case 'shot':
      return onRemoteShot(msg);
    case 'settled':
      return onRemoteSettled(msg.world);
    default:
  }
}

async function ensureMineThumbs(specs: readonly WireSpec[]): Promise<void> {
  const cache = await getCache();
  const next = { ...thumbs.value };
  for (const spec of specs) {
    const cardId = spec.id.slice(2);
    if (!next[cardId]) {
      const card = cards.value.find((c) => c.id === cardId);
      const blob = card ? await cache.getAssetBlob(card, 'sprite').catch(() => null) : null;
      if (blob) next[cardId] = URL.createObjectURL(blob);
    }
    // Sem a miniatura guardada, o sprite público do Pokémon (como o do amigo).
    next[spec.id] = next[cardId] ?? pokemonSpriteUrl(spec.sprite);
  }
  thumbs.value = next;
}

function registerFriendThumbs(specs: readonly WireSpec[]): void {
  const next = { ...thumbs.value };
  for (const s of specs) next[s.id] = pokemonSpriteUrl(s.sprite);
  thumbs.value = next;
}

/** Anfitrião: monta a arena com os pins dos dois, manda ao amigo e começa (a primeira jogada é do anfitrião). */
async function startPvp(): Promise<void> {
  engine.unlock();
  stopReplay();
  const p = peer.value;
  if (!p || (friendBlocker.value && phase.value !== 'over')) return;
  const previous = phase.value;
  phase.value = 'loading';
  await Promise.all(setup.value.mine.map((id) => cards.value.find((c) => c.id === id)).filter((c): c is CachedCard => !!c).map((c) => loadInfo(c)));
  const hostSpecs = prefixSpecs('host', rawSpecsOfMine());
  const guestSpecs = friend.specs;
  if (disposed || hostSpecs.length === 0 || hostSpecs.length !== guestSpecs.length || !peer.value) {
    phase.value = previous === 'over' ? 'over' : 'setup';
    return;
  }
  await ensureMineThumbs(hostSpecs);
  registerFriendThumbs(guestSpecs);
  const opts = { shrink: setup.value.shrink, marks: setup.value.marks };
  world = createWorld({ mine: hostSpecs, enemy: guestSpecs }, rng, opts);
  p.send({ t: 'start', hostSpecs, guestSpecs, init: snapshotInit(world, opts) });
  pvpMatch.value = true;
  await beginMatch('aim');
}

/** Convidado: o anfitrião começou; monta o espelho da arena e espera a vez. */
async function onStartMessage(msg: Extract<WireMessage, { t: 'start' }>): Promise<void> {
  if (phase.value === 'aim' || phase.value === 'rolling' || phase.value === 'enemy' || phase.value === 'loading') return;
  const mineIds = prefixSpecs('guest', rawSpecsOfMine()).map((s) => s.id);
  if (mineIds.length !== msg.guestSpecs.length || !mineIds.every((id, i) => id === msg.guestSpecs[i]?.id)) {
    roomNotice.value = 'O anfitrião começou com pins diferentes dos seus. Entrem na sala de novo.';
    leaveRoom();
    return;
  }
  engine.unlock();
  stopReplay();
  phase.value = 'loading';
  await ensureMineThumbs(msg.guestSpecs);
  registerFriendThumbs(msg.hostSpecs);
  if (disposed) return;
  world = buildPvpWorld(msg.init, msg.hostSpecs, msg.guestSpecs, 'guest', rng);
  setup.value = { ...setup.value, shrink: msg.init.shrink, marks: msg.init.marks };
  pvpMatch.value = true;
  await beginMatch('enemy');
  message.value = 'O anfitrião começa. Aguarde a sua vez…';
}

function pvpOutcome(): 'playing' | 'won' | 'lost' | 'empate' {
  if (!world) return 'playing';
  const mine = aliveOf(world, 0).length;
  const theirs = aliveOf(world, 1).length;
  return mine === 0 && theirs === 0 ? 'empate' : theirs === 0 ? 'won' : mine === 0 ? 'lost' : 'playing';
}

/** O amigo disparou: rodo o mesmo disparo aqui para ver o movimento; o estado final vem na mensagem `settled`. */
function onRemoteShot(msg: Extract<WireMessage, { t: 'shot' }>): void {
  if (!world || !pvpMatch.value || phase.value !== 'enemy') return;
  const pin = world.pins.find((p) => p.id === msg.pinId && p.side === 1 && p.alive && p.fall === 0);
  if (!pin || !launch(pin, shotFromWire(frame.value, msg), msg.moveIndex)) return;
  afterShot(world, 1, { pinId: pin.id, moveIndex: msg.moveIndex });
  recorder.start(world);
  cue({ kind: 'pin-launch', power: msg.power, type: pin.active?.kind === 'elemental' ? pin.active.type : null });
  if (msg.moveIndex !== null) popups.push({ text: pin.moves[msg.moveIndex]?.name ?? '', x: pin.x, y: pin.y - 36, age: 0, color: '#ffb3b3' });
  pendingSettled = null;
  rollOwner = 'enemy';
  rollTime = 0;
  settledTime = 0;
  message.value = '';
  phase.value = 'rolling';
}

function onRemoteSettled(snap: WireWorld): void {
  if (!world || !pvpMatch.value) return;
  if (phase.value === 'rolling' && rollOwner === 'enemy') {
    pendingSettled = { world: snap, at: performance.now() };
    return;
  }
  if (phase.value === 'enemy') applySettled(snap);
}

/** Adota o estado de quem disparou (posições, quem caiu, chão, borda) e passa a vez para mim. */
function applySettled(snap: WireWorld): void {
  if (!world) return;
  const applied = applyWorld(world, snap, frame.value);
  if (applied.changedCells.length > 0) {
    terrainArt?.repaint(applied.changedCells);
    refreshFloorMarks();
  }
  if (applied.limitChanged || applied.patchesChanged) bumperCanvas = canvasOf(paintBumpers(world.radius, world.patches));
  if (applied.limitChanged) {
    popups.push({ text: 'A borda avançou!', x: 0, y: -ARENA_RADIUS * 0.45, age: 0, color: '#ffb35c' });
    cue({ kind: 'pin-shrink' });
    buzz({ kind: 'shrink' });
  }
  refreshRound();
  refreshTray();
  const outcome = pvpOutcome();
  if (outcome !== 'playing') return endGame(outcome);
  phase.value = 'aim';
  message.value = '';
  pickDefaultPin();
  refreshTray();
}

function finishPvpRoll(): void {
  if (!world) return;
  refreshTray();
  if (rollOwner === 'me') {
    // O Escudo do anfitrião segue valendo durante a resposta do convidado; a rodada fecha quando o convidado joga.
    clearEffects(world, frame.value === 'host');
    if (frame.value === 'guest') {
      handleEvents(advanceRound(world));
      refreshRound();
    }
    peer.value?.send({ t: 'settled', world: snapshotWorld(world, frame.value) });
    const outcome = pvpOutcome();
    if (outcome !== 'playing') return endGame(outcome);
    phase.value = 'enemy';
    message.value = 'Vez do amigo…';
    return;
  }
  if (pendingSettled) {
    const snap = pendingSettled.world;
    pendingSettled = null;
    return applySettled(snap);
  }
  phase.value = 'enemy';
  message.value = 'Sincronizando com o amigo…';
}

async function setReady(on: boolean): Promise<void> {
  myReady.value = on;
  await syncTeam();
}

// ---------------------------------------------------------------- toque e arrasto

function toWorld(clientX: number, clientY: number): { x: number; y: number } | null {
  const rect = stageEl.value?.getBoundingClientRect();
  if (!rect || rect.width === 0) return null;
  const unitsAcross = artSize(ARENA_RADIUS) * UNITS_PER_PIXEL;
  const k = unitsAcross / rect.width;
  return { x: (clientX - rect.left - rect.width / 2) * k, y: (clientY - rect.top - rect.height / 2) * k };
}

function onDown(ev: PointerEvent): void {
  if (phase.value !== 'aim' || !world) return;
  const p = toWorld(ev.clientX, ev.clientY);
  if (!p) return;
  (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
  drag = { fromX: p.x, fromY: p.y, toX: p.x, toY: p.y };
}

function onMove(ev: PointerEvent): void {
  if (!drag) return;
  const p = toWorld(ev.clientX, ev.clientY);
  if (p) {
    drag.toX = p.x;
    drag.toY = p.y;
  }
}

function onUp(): void {
  const d = drag;
  drag = null;
  if (!d || !world || phase.value !== 'aim') return;
  const shot = shotFromDrag(d.fromX, d.fromY, d.toX, d.toY);
  if (shot) return fireMine(shot);
  // Toque curto: escolhe o pin que estiver embaixo do dedo.
  const hit = world.pins.find((p) => p.side === 0 && p.alive && p.fall === 0 && Math.hypot(p.x - d.fromX, p.y - d.fromY) < p.r * 1.5);
  if (hit) selectPin(hit.id);
}

function onCancel(): void {
  drag = null;
}

// ---------------------------------------------------------------- desenho

function resize(): void {
  const el = stageEl.value;
  const canvas = canvasEl.value;
  if (!el || !canvas) return;
  cssSize = el.clientWidth;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(cssSize * dpr);
  canvas.height = Math.round(cssSize * dpr);
}

function draw(now: number): void {
  const canvas = canvasEl.value;
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx || !world || !artCanvas) return;
  if (cssSize === 0) resize();
  const units = artSize(world.radius) * UNITS_PER_PIXEL;
  const k = canvas.width / units;
  const cx = canvas.width / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(artCanvas, 0, 0, canvas.width, canvas.height);
  if (terrainCanvas && terrainArt) {
    syncTerrain();
    const half = terrainArt.half * k;
    ctx.drawImage(terrainCanvas, cx - half, cx - half, half * 2, half * 2);
  }

  // Na repetição os pins vêm do quadro gravado; fora dela, do mundo.
  const frame = replaying.value ? recorder.frameAt(replayAt) : null;
  const frameById = frame ? new Map(frame.pins.map((p) => [p.id, p])) : null;
  const drawPins = frameById
    ? world.pins.map((p) => {
        const f = frameById.get(p.id);
        return f ? { ...p, x: f.x, y: f.y, fall: f.fall, alive: f.alive } : p;
      })
    : world.pins;
  const pulse = 0.5 + 0.5 * Math.sin(now / 180);

  // Borda que encolhe: o que ficou fora do raio vira vazio, e a próxima borda aparece como aviso.
  const limit = frame ? frame.limit : shownLimit;
  if (limit < world.radius - 0.5) {
    ctx.fillStyle = 'rgba(13,22,46,0.96)';
    ctx.beginPath();
    ctx.arc(cx, cx, (world.radius + 7) * k, 0, Math.PI * 2);
    ctx.arc(cx, cx, limit * k, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.strokeStyle = '#d9d2c2';
    ctx.lineWidth = Math.max(2, 5 * k);
    ctx.setLineDash([9 * k, 7 * k]);
    ctx.beginPath();
    ctx.arc(cx, cx, limit * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const warn = frame ? null : nextLimit(world);
  if (warn !== null) {
    ctx.fillStyle = `rgba(255,90,60,${0.1 + 0.1 * pulse})`;
    ctx.beginPath();
    ctx.arc(cx, cx, limit * k, 0, Math.PI * 2);
    ctx.arc(cx, cx, warn * k, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.strokeStyle = `rgba(255,176,60,${0.55 + 0.45 * pulse})`;
    ctx.lineWidth = Math.max(2, 4 * k);
    ctx.setLineDash([6 * k, 8 * k]);
    ctx.beginPath();
    ctx.arc(cx, cx, warn * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (bumperCanvas) ctx.drawImage(bumperCanvas, 0, 0, canvas.width, canvas.height);

  const selected = world.pins.find((p) => p.id === selectedId.value);
  const pinsSorted = [...drawPins].filter((p) => p.alive).sort((a, b) => a.y - b.y);
  for (const pin of pinsSorted) {
    const x = cx + pin.x * k;
    const y = cx + pin.y * k;
    const scale = 1 - pin.fall;
    const r = pin.r * k * scale;
    ctx.globalAlpha = 1 - pin.fall * 0.5;
    // Sombra no chão; a ficha (borda da equipe e GIF) é um elemento por cima do canvas.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(x + r * 0.15, y + r * 0.25, r * 1.05, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    if (pin.active?.kind === 'escudo') {
      ctx.strokeStyle = '#9be7ff';
      ctx.lineWidth = Math.max(2, r * 0.18);
      ctx.beginPath();
      ctx.arc(x, y, r * 1.28, 0, Math.PI * 2);
      ctx.stroke();
    } else if (pin.active?.kind === 'elemental' && pin.active.type) {
      ctx.strokeStyle = TYPE_COLORS[pin.active.type];
      ctx.lineWidth = Math.max(2, r * 0.18);
      ctx.beginPath();
      ctx.arc(x, y, r * 1.28, 0, Math.PI * 2);
      ctx.stroke();
    } else if (pin.active) {
      ctx.strokeStyle = '#ffe08a';
      ctx.lineWidth = Math.max(2, r * 0.14);
      ctx.beginPath();
      ctx.arc(x, y, r * 1.22, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (phase.value === 'aim' && selected?.id === pin.id) {
      ctx.strokeStyle = `rgba(255,236,120,${0.55 + 0.45 * pulse})`;
      ctx.lineWidth = Math.max(2, r * 0.16);
      ctx.beginPath();
      ctx.arc(x, y, r * (1.45 + 0.08 * pulse), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (phase.value === 'enemy' && enemyPlan?.pinId === pin.id) {
      ctx.strokeStyle = `rgba(255,120,120,${0.5 + 0.5 * pulse})`;
      ctx.lineWidth = Math.max(2, r * 0.16);
      ctx.beginPath();
      ctx.arc(x, y, r * (1.45 + 0.08 * pulse), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const token = sprites.get(pin.id);
    if (token) {
      const size = pin.r * 2 * (k / dpr) * scale;
      token.style.width = `${size}px`;
      token.style.height = `${size}px`;
      token.style.borderWidth = `${Math.max(2.5, size * 0.1)}px`;
      token.style.transform = `translate3d(${x / dpr - size / 2}px, ${y / dpr - size / 2}px, 0) rotate(${pin.fall * 220}deg)`;
      token.style.opacity = String(1 - pin.fall * 0.6);
      token.style.zIndex = String(Math.round(pin.y + 1000));
    }
  }

  // Mira: a prévia do caminho do pin escolhido, com o efeito do golpe.
  if (drag && selected && phase.value === 'aim') {
    const shot = shotFromDrag(drag.fromX, drag.fromY, drag.toX, drag.toY);
    // Elástico do arrasto.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2 * dpr;
    ctx.setLineDash([4 * dpr, 6 * dpr]);
    ctx.beginPath();
    ctx.moveTo(cx + drag.fromX * k, cx + drag.fromY * k);
    ctx.lineTo(cx + drag.toX * k, cx + drag.toY * k);
    ctx.stroke();
    ctx.setLineDash([]);
    if (shot) {
      const { points, falls } = previewPath(world, selected, shot, selectedMove.value);
      points.forEach((pt, i) => {
        const t = i / Math.max(1, points.length - 1);
        ctx.fillStyle = falls ? `rgba(255,140,140,${1 - t * 0.5})` : `rgba(255,255,255,${1 - t * 0.7})`;
        ctx.beginPath();
        ctx.arc(cx + pt.x * k, cx + pt.y * k, Math.max(2, (4 - t * 2) * dpr), 0, Math.PI * 2);
        ctx.fill();
      });
      // Barra de força ao lado do pin.
      const px = cx + selected.x * k;
      const py = cx + selected.y * k;
      const w = 44 * dpr;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(px - w / 2, py + selected.r * k * 1.7, w, 7 * dpr);
      ctx.fillStyle = shot.power > 0.85 ? '#ff6b6b' : '#ffd23f';
      ctx.fillRect(px - w / 2, py + selected.r * k * 1.7, w * shot.power, 7 * dpr);
    }
  }

  // Avisos que sobem e somem.
  ctx.font = `700 ${14 * dpr}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  for (const p of popups) {
    const t = p.age / 1.1;
    ctx.globalAlpha = 1 - t;
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.fillStyle = p.color;
    const tx = cx + p.x * k;
    const ty = cx + p.y * k - t * 24 * dpr;
    ctx.strokeText(p.text, tx, ty);
    ctx.fillText(p.text, tx, ty);
  }
  ctx.globalAlpha = 1;

  // Repetição: tarjas de cinema e o rótulo.
  if (frame) {
    const bar = canvas.height * 0.085;
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, canvas.width, bar);
    ctx.fillRect(0, canvas.height - bar, canvas.width, bar);
    ctx.fillStyle = `rgba(255,255,255,${0.7 + 0.3 * pulse})`;
    ctx.font = `800 ${13 * dpr}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('● REPETIÇÃO · câmera lenta', 12 * dpr, bar * 0.64);
  }
}

const onResize = () => resize();
onMounted(() => window.addEventListener('resize', onResize));
onBeforeUnmount(() => {
  disposed = true;
  cancelAnimationFrame(raf);
  leaveRoom();
  engine.dispose();
  window.removeEventListener('resize', onResize);
  Object.values(thumbs.value).forEach((url) => URL.revokeObjectURL(url));
});

const phaseHint = computed(() => {
  if (phase.value === 'aim') return selectedId.value ? 'Sua vez: arraste para trás em qualquer ponto da arena e solte.' : 'Escolha um pin abaixo.';
  if (phase.value === 'rolling') return rollOwner === 'me' ? 'Seu pin está rolando…' : pvpMatch.value ? 'O amigo disparou…' : 'O adversário disparou…';
  if (phase.value === 'over' && result.value) return result.value.won ? 'Partida encerrada: você venceu.' : 'Partida encerrada.';
  return message.value;
});

const legend = [
  ...TERRAIN_KINDS.map((k) => ({ key: k as string, name: TERRAIN_LABELS_PT[k], hint: MARK_HINT_PT[k] })),
  ...(Object.keys(PATCH_LABELS_PT) as (keyof typeof PATCH_LABELS_PT)[]).map((k) => ({ key: k as string, ...PATCH_LABELS_PT[k] })),
];
const floorLegend = computed(() => floorMarks.value.map((k) => ({ key: k, name: TERRAIN_LABELS_PT[k], hint: MARK_HINT_PT[k] })));

const MAX_MINE = MAX_PER_SIDE[0];
const MAX_ENEMY = MAX_PER_SIDE[1];
interface Slot { id: string; name: string; card: CachedCard | null }
const sideRows = computed(() => {
  const byId = new Map(cards.value.map((c) => [c.id, c]));
  const mineSlots = (max: number): (Slot | null)[] =>
    Array.from({ length: max }, (_, i) => {
      const card = byId.get(setup.value.mine[i] ?? '');
      return card ? { id: card.id, name: card.name, card } : null;
    });
  if (mode.value === 'friend') {
    const theirs = Array.from({ length: PVP_MAX_PINS }, (_, i): Slot | null => {
      const spec = friend.specs[i];
      return spec ? { id: spec.id, name: spec.name, card: null } : null;
    });
    return [
      { role: 'mine', label: 'Você', slots: mineSlots(PVP_MAX_PINS) },
      { role: 'enemy', label: friend.ready ? 'Amigo (pronto)' : 'Amigo', slots: theirs },
    ];
  }
  const enemySlots = Array.from({ length: MAX_ENEMY }, (_, i): Slot | null => {
    const card = byId.get(setup.value.enemy[i] ?? '');
    return card ? { id: card.id, name: card.name, card } : null;
  });
  return [
    { role: 'mine', label: 'Você', slots: mineSlots(MAX_MINE) },
    { role: 'enemy', label: 'Adversários', slots: enemySlots },
  ];
});

type OptionKey = 'shrink' | 'sound' | 'haptics' | 'marks';
const allOptionRows: { key: OptionKey; title: string; hint: string }[] = [
  { key: 'shrink', title: 'Borda que encolhe', hint: 'Depois da 1ª rodada a arena diminui: uma linha tracejada avisa onde a borda vai parar.' },
  { key: 'marks', title: 'Marcas no chão', hint: 'Golpes elementais e Pancada mudam o chão (gelo, lama, poças…) e o chão reage.' },
  { key: 'sound', title: 'Sons', hint: 'Disparo, choques, chão que reage, quedas e fim da partida.' },
  { key: 'haptics', title: 'Vibração', hint: 'Só em celulares que deixam o navegador vibrar (iPhone não).' },
];
/** No PvP só o anfitrião decide a borda e as marcas do chão; o convidado vê o que ele escolheu. */
const optionRows = computed(() => (mode.value === 'friend' && frame.value === 'guest' ? allOptionRows.filter((o) => o.key === 'sound' || o.key === 'haptics') : allOptionRows));
const optionsSummary = computed(() => {
  const rows = optionRows.value;
  const on = rows.filter((o) => setup.value[o.key]).length;
  return on === rows.length ? 'tudo ligado' : on === 0 ? 'tudo desligado' : `${on} de ${rows.length} ligadas`;
});

/** A frase ao lado do botão Começar: o que falta ou o que vai acontecer. */
const startNote = computed(() => {
  if (mode.value === 'friend') {
    if (frame.value === 'guest') return myReady.value ? 'Pronto! Aguardando o anfitrião começar.' : setup.value.mine.length === 0 ? 'Escolha ao menos 1 pin.' : `${setup.value.mine.length} pins escolhidos. Toque em «Estou pronto».`;
    return friendBlocker.value ?? `${setup.value.mine.length} pins de cada lado. Pode começar.`;
  }
  if (blocker.value && usable.value.length > 0) return blocker.value;
  if (usable.value.length === 0) return 'Escaneie cartas para ter pins.';
  return `${setup.value.mine.length} seus contra ${setup.value.enemy.length} adversários · ${DIFFICULTY_LABELS_PT[setup.value.difficulty]}`;
});

/** De quem é a vez, para colorir a faixa de aviso. */
const turnTone = computed(() => {
  if (phase.value === 'aim') return 'mine';
  if (phase.value === 'rolling') return rollOwner === 'me' ? 'mine' : 'enemy';
  if (phase.value === 'enemy') return 'enemy';
  return '';
});

const moveNote = computed(() => {
  const pin = selectedPin.value;
  if (!pin) return '';
  const base = selectedMove.value === null ? 'Disparo normal: empurra pelo peso e pela velocidade.' : (pin.moves.find((m) => m.index === selectedMove.value)?.hint ?? '');
  return pin.estimated ? `${base} (sem todos os dados: valores neutros)` : base;
});

function setFlag(key: OptionKey, on: boolean): void {
  setup.value = { ...setup.value, [key]: on };
  saveSetup(setup.value);
  if (key === 'shrink') sendOptions();
}

function setMarks(on: boolean): void {
  setup.value = { ...setup.value, marks: on };
  saveSetup(setup.value);
  sendOptions();
}
</script>

<template>
  <section class="pins" aria-labelledby="pins-title">
    <h2 id="pins-title" class="sr-only">Pin Mode</h2>

    <template v-if="phase === 'setup' || phase === 'loading'">
      <header class="pn-hero">
        <div>
          <h2>Pin Mode</h2>
          <p>Vista de cima, sem câmera: puxe para trás, solte e empurre os adversários para fora da arena.</p>
        </div>
        <p class="pn-energy" :title="'Cada disparo gasta a energia do pin escolhido (de 5 a 40). Ela sobe com o seu XP.'">
          <span class="bolt" aria-hidden="true"></span><strong>{{ energy }}</strong><small>energia</small>
        </p>
      </header>

      <div class="diff pn-mode" role="group" aria-label="Contra quem jogar">
        <button type="button" :class="{ on: mode === 'cpu' }" :aria-pressed="mode === 'cpu'" :disabled="phase === 'loading'" @click="mode = 'cpu'">Contra o computador</button>
        <button type="button" :class="{ on: mode === 'friend' }" :aria-pressed="mode === 'friend'" :disabled="phase === 'loading'" @click="mode = 'friend'">Contra um amigo</button>
      </div>

      <p v-if="mode === 'friend' && roomNotice && !peer" class="message error" role="alert">{{ roomNotice }}</p>
      <PvpLobby v-if="mode === 'friend' && !peer" @connected="onConnected" />

      <p v-if="mode === 'friend' && peer" class="pn-room" role="status">
        <i class="pn-room-dot" aria-hidden="true"></i>
        Conectado com o amigo · você é {{ frame === 'host' ? 'o anfitrião' : 'o convidado' }}
        <button type="button" class="pn-link" @click="leaveRoom">Sair da sala</button>
      </p>

      <section v-if="mode === 'cpu' || peer" class="pn-card pn-teams" aria-label="Equipes">
        <div v-for="side in sideRows" :key="side.role" class="pn-side" :class="side.role">
          <p class="pn-side-name">{{ side.label }} <b>{{ side.slots.filter(Boolean).length }}/{{ side.slots.length }}</b></p>
          <ul class="pn-slots">
            <li v-for="(slot, i) in side.slots" :key="i">
              <button v-if="slot?.card" type="button" class="pn-slot filled" :title="`Tirar ${slot.name}`" :aria-label="`Tirar ${slot.name} de ${side.label}`" @click="choose(slot.card, null)">
                <img v-if="thumbs[slot.id]" :src="thumbs[slot.id]" alt="" />
              </button>
              <span v-else-if="slot" class="pn-slot filled" :title="slot.name" role="img" :aria-label="`${slot.name} (do amigo)`">
                <img v-if="thumbs[slot.id]" :src="thumbs[slot.id]" alt="" />
              </span>
              <span v-else class="pn-slot empty" aria-hidden="true"></span>
            </li>
          </ul>
        </div>
        <div v-if="mode === 'cpu'" class="diff" role="group" aria-label="Dificuldade do adversário">
          <button v-for="d in DIFFICULTIES" :key="d" type="button" :class="{ on: setup.difficulty === d }" :aria-pressed="setup.difficulty === d" @click="setDifficulty(d)">{{ DIFFICULTY_LABELS_PT[d] }}</button>
        </div>
      </section>

      <section v-if="mode === 'cpu' || peer" class="pn-card pn-pick">
        <h3>Escolha os pins</h3>
        <p v-if="loadingCards" class="message">Lendo as cartas guardadas…</p>
        <p v-else-if="usable.length === 0" class="message">Nenhuma carta guardada com Pokémon ainda. <a :href="routeHref('escanear')">Escaneie uma carta</a> para ter pins.</p>
        <template v-else>
          <div class="pn-tools">
            <input v-model="search" type="text" placeholder="Buscar por nome ou coleção" aria-label="Buscar carta" autocomplete="off" />
            <button type="button" class="pn-link" @click="useRecent">Mais recentes</button>
          </div>
          <ul class="pin-rows">
            <li v-for="card in shown" :key="card.id" :class="roleShown(card) ?? ''">
              <span class="row-thumb" aria-hidden="true"><img v-if="thumbs[card.id]" :src="thumbs[card.id]" alt="" /></span>
              <span class="row-text">
                <strong>{{ card.name }}</strong>
                <small v-if="rowInfo(card).cost === null">{{ rowInfo(card).note }}</small>
                <small v-else>
                  <b class="cost">⚡ {{ rowInfo(card).cost }}</b>
                  <template v-for="t in rowInfo(card).types" :key="t"> <i class="type-dot" :style="{ background: TYPE_COLORS[t] }"></i>{{ TYPE_LABELS_PT[t] }}</template>
                  <template v-if="rowInfo(card).moves > 0"> · {{ rowInfo(card).moves }} golpe{{ rowInfo(card).moves === 1 ? '' : 's' }}</template>
                  <template v-if="rowInfo(card).note"> · {{ rowInfo(card).note }}</template>
                </small>
              </span>
              <span class="row-roles" role="group" :aria-label="`Papel de ${card.name}`">
                <button type="button" class="r-mine" :class="{ on: roleShown(card) === 'mine' }" :aria-pressed="roleShown(card) === 'mine'" title="Seu pin" @click="choose(card, roleShown(card) === 'mine' ? null : 'mine')">Meu</button>
                <button v-if="mode === 'cpu'" type="button" class="r-enemy" :class="{ on: roleShown(card) === 'enemy' }" :aria-pressed="roleShown(card) === 'enemy'" title="Adversário" @click="choose(card, roleShown(card) === 'enemy' ? null : 'enemy')">Inimigo</button>
              </span>
            </li>
          </ul>
        </template>
        <p v-if="notice" class="message" role="alert">{{ notice }}</p>
      </section>

      <details v-if="mode === 'cpu' || peer" class="pn-card pn-opts">
        <summary>Opções da partida <small>{{ optionsSummary }}</small></summary>
        <p v-if="mode === 'friend' && frame === 'guest'" class="pn-opts-note">Borda que encolhe: {{ friend.shrink ? 'ligada' : 'desligada' }} · Marcas no chão: {{ friend.marks ? 'ligadas' : 'desligadas' }} (o anfitrião escolhe).</p>
        <label v-for="o in optionRows" :key="o.key" class="pn-switch">
          <span class="pn-switch-text"><strong>{{ o.title }}</strong><small>{{ o.hint }}</small></span>
          <input type="checkbox" role="switch" :checked="setup[o.key]" @change="o.key === 'marks' ? setMarks(($event.target as HTMLInputElement).checked) : setFlag(o.key, ($event.target as HTMLInputElement).checked)" />
          <i class="pn-knob" aria-hidden="true"></i>
        </label>
      </details>

      <details v-if="mode === 'cpu' || peer" class="pn-card pn-how">
        <summary>Como funciona o chão</summary>
        <ul class="legend">
          <li v-for="l in legend" :key="l.key"><strong>{{ l.name }}</strong> <small>{{ l.hint }}</small></li>
        </ul>
        <p class="note">
          Quem passa da borda cai. Um golpe elemental deixa um rastro do tipo dele e um borrão grande onde acerta; a Pancada racha o chão.
          Cada tipo sente a marca de um jeito (Voador paira, Água não é freada pela poça, Gelo patina no gelo) e, quando um golpe cai sobre outra marca,
          o chão reage: fogo na poça, água no fogo, gelo no mato… Os golpes da carta recarregam conforme a energia do ataque. Sem energia?
          Escaneie cartas ou jogue os <a :href="routeHref('treinador')">minigames</a>.
        </p>
      </details>

      <div v-if="mode === 'cpu'" class="pn-start">
        <p class="pn-start-note" :class="{ warn: blocker !== null && usable.length > 0 }">{{ startNote }}</p>
        <button type="button" class="primary" :disabled="phase === 'loading' || blocker !== null || loadingCards" @click="start">{{ phase === 'loading' ? 'Preparando a arena…' : 'Começar' }}</button>
      </div>
      <div v-else-if="peer" class="pn-start">
        <p class="pn-start-note" :class="{ warn: frame === 'host' && friendBlocker !== null }">{{ startNote }}</p>
        <button v-if="frame === 'host'" type="button" class="primary" :disabled="phase === 'loading' || friendBlocker !== null" @click="startPvp">{{ phase === 'loading' ? 'Preparando a arena…' : 'Começar' }}</button>
        <button v-else type="button" class="primary" :disabled="phase === 'loading' || setup.mine.length === 0" @click="setReady(!myReady)">{{ myReady ? 'Cancelar' : 'Estou pronto' }}</button>
      </div>
    </template>

    <template v-else>
      <div class="pins-hud">
        <p class="hud-line">
          <span class="pn-chip gold"><span class="bolt" aria-hidden="true"></span><strong>{{ pvpMatch ? '∞' : energy }}</strong></span>
          <span class="pn-score" :aria-label="`Você ${counts.mine}, adversários ${counts.enemy}`">
            <span class="sides mine"><i></i>{{ counts.mine }}</span>
            <span class="sides enemy"><i></i>{{ counts.enemy }}</span>
          </span>
          <span class="pn-meta sides" :class="{ warn: borderWarn }">{{ setup.shrink ? `Rodada ${roundNo} · ` : '' }}{{ shotCount }} disparo{{ shotCount === 1 ? '' : 's' }}</span>
        </p>
        <p class="hud-hint pn-banner" :class="turnTone" role="status">
          <span>{{ message || phaseHint }}</span>
          <small v-if="borderNote && phase !== 'over'" class="hud-note" :class="{ warn: borderWarn }">{{ borderWarn ? '⚠ ' : '' }}{{ borderNote }}</small>
        </p>
      </div>

      <div
        ref="stageEl"
        class="pin-stage"
        :class="{ aiming: phase === 'aim' }"
        @pointerdown.prevent="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onCancel"
      >
        <canvas ref="canvasEl" role="img" aria-label="Arena vista de cima com os pins"></canvas>
        <div ref="spriteLayer" class="pin-sprites" aria-hidden="true"></div>
        <button v-if="replaying" type="button" class="pin-skip" @click.stop="stopReplay">Pular repetição</button>
        <div v-if="phase === 'over' && result && !replaying" class="pin-over" :class="result.won ? 'won' : 'lost'" role="dialog" aria-label="Fim da partida">
          <span class="pn-over-mark" aria-hidden="true">{{ result.won ? '★' : result.reason === 'energia' ? '⚡' : result.reason === 'empate' ? '＝' : result.reason === 'saiu' ? '…' : '✕' }}</span>
          <strong>{{ result.won ? 'Você venceu!' : result.reason === 'energia' ? 'Acabou a energia' : result.reason === 'empate' ? 'Empate!' : result.reason === 'saiu' ? 'O amigo saiu' : 'Você perdeu' }}</strong>
          <p class="pn-over-stats">
            <span>{{ result.shots }} disparo{{ result.shots === 1 ? '' : 's' }}</span>
            <span v-if="result.won && !pvpMatch">nota {{ result.score }}</span>
          </p>
          <p v-if="result.reason === 'saiu'">A conexão com o amigo acabou. Você pode escolher os pins de novo e criar outra sala.</p>
          <p v-else-if="result.reason === 'empate'">Os dois lados perderam o último pin na mesma jogada.</p>
          <p v-else-if="result.won && pvpMatch">Todos os pins do seu amigo caíram.</p>
          <p v-else-if="result.won">Todos os adversários caíram.</p>
          <p v-else-if="result.reason === 'energia'">Nenhum pin seu cabe na energia que sobrou. Ganhe XP escaneando cartas ou jogando <a :href="routeHref('treinador')">minigames</a>.</p>
          <p v-else-if="pvpMatch">Todos os seus pins caíram.</p>
          <p v-else>Seus pins caíram todos da arena.</p>
          <div class="game-actions">
            <button v-if="!pvpMatch || (frame === 'host' && peer)" type="button" class="primary" @click="again">Jogar de novo</button>
            <p v-else-if="peer" class="pn-over-wait">Aguardando o anfitrião jogar de novo…</p>
            <button v-if="canReplay" type="button" @click="startReplay">Ver a repetição</button>
            <button type="button" @click="backToSetup">Trocar pins</button>
          </div>
        </div>
      </div>

      <p v-if="floorLegend.length > 0" class="floor-legend" aria-label="Marcas no chão agora">
        <span v-for="l in floorLegend" :key="l.key" :title="l.hint">{{ l.name }}</span>
      </p>

      <div class="pins-tray">
        <ul class="tray" aria-label="Seus pins">
          <li v-for="p in tray" :key="p.id" :class="{ on: p.selected, dim: !p.affordable }">
            <button type="button" class="tray-pin" :disabled="phase !== 'aim' || !p.affordable" :aria-pressed="p.selected" @click="selectPin(p.id)">
              <span class="chip-token" aria-hidden="true"><img v-if="p.thumb" :src="p.thumb" alt="" /></span>
              <span class="tray-name">{{ p.name }}</span>
              <b class="cost">⚡ {{ p.cost }}</b>
            </button>
          </li>
        </ul>
        <div v-if="selectedPin" class="moves">
          <div class="move-list" role="group" :aria-label="`Golpe do disparo de ${selectedPin.name}`">
            <button type="button" :class="{ on: selectedMove === null }" :aria-pressed="selectedMove === null" :disabled="phase !== 'aim'" @click="selectMove(null)">
              <strong>Normal</strong><small>Sem golpe</small>
            </button>
            <button
              v-for="m in selectedPin.moves"
              :key="m.index"
              type="button"
              :class="{ on: selectedMove === m.index, cooling: m.remaining > 0 }"
              :aria-pressed="selectedMove === m.index"
              :disabled="phase !== 'aim' || m.remaining > 0"
              :title="m.hint"
              @click="selectMove(m.index)"
            >
              <strong>{{ m.name }}</strong>
              <small>{{ m.label }}</small>
              <small v-if="m.remaining > 0" class="cd">recarrega em {{ m.remaining }}</small>
              <small v-else class="cd">recarga {{ m.energy.length }}</small>
            </button>
          </div>
          <p class="pn-move-note">{{ moveNote }}</p>
        </div>
      </div>
    </template>
  </section>
</template>
