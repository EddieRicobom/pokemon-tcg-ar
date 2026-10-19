<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { assetUrl, getCache, getDigitalSprite, getLocalVillageSprite } from '../app/services';
import { fetchSprite } from '../ar/sprite-source';
import { pokemonSpriteUrl } from '../ar/sprite-url';
import { recordEvent } from '../app/trainer-store';
import { addCoins } from '../app/wallet';
import { cardCompanion, cardJourneyError, recordCardVictories } from '../app/card-evolution-store';
import type { CardCompanion } from '../core/card-evolution';
import { survivalWinners } from '../core/card-evolution';
import { effectiveVisual, maxVisualFps, visual } from '../app/visual-settings';
import { isFrameDue } from '../core/frame-rate';
import { cancelGameFrame, requestGameFrame } from '../app/frame-scheduler';
import { seededRng } from '../core/battle';
import {
  applyUpgrade,
  ARENA_H,
  ARENA_W,
  createSurvivorState,
  stepSurvivor,
  survivorCoins,
  survivorScore,
} from '../core/survivor';
import type { SurvivorEnemy, SurvivorEvolutionOption, SurvivorState, SurvivorSummary, SurvivorUpgradeOption } from '../core/survivor';
import { attackProfile, moveFor, MOVE_CATEGORY_LABELS_PT, MOVE_EFFECT_LABELS_PT, profileBars } from '../core/survivor-moves';
import { typesOfDex } from '../core/species-filter';
import { TYPE_LABELS_PT } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import { SURVIVOR_CLEAR_BONUS } from '../core/survivor';
import { trainer } from '../app/trainer-store';
import type { AttackProfile, SurvivorMove } from '../core/survivor-moves';
import { statsOfDex } from '../core/survivor-stats';
import { nextEvolutions, speciesName } from '../core/survivor-evolution';
import type { DecodedGif } from '../core/gif';
import { speciesTiles } from '../core/size-scale';
import { contentBounds } from '../village/local-sprite';
import type { ContentBounds } from '../village/local-sprite';
import { SoundEngine } from '../box/sound';
import { survivorRegionLabel } from '../core/survivor-regions';
import { survivorBiomeAt, survivorBiomeLabel } from '../core/survivor-biomes';
import { createSurvivorLandscape, drawSurvivorBiomeOverlay } from '../village/survivor-landscape';
import { REGIONAL_ENEMY_SPRITES, REGIONAL_KIND_COUNT, regionalEnemyDexId } from '../core/survivor-encounters';
import type { SoundCue } from '../box/sound-recipes';
import { normalizeSurvivorFavorites, selectSurvivorCandidates } from '../core/survivor-selection';
import { dayKey } from '../core/trainer';
import { survivorMinimapSnapshot } from '../core/survivor-minimap';
import { fitSurvivorViewport } from '../core/survivor-camera';
import { survivorObjectives, survivorRerollLimit, SURVIVOR_OBJECTIVE_DETAILS, SURVIVOR_OBJECTIVE_IDS } from '../core/survivor-objectives';
import { availableSurvivorPreparations, SURVIVOR_PREPARATIONS } from '../core/survivor-preparations';
import type { SurvivorPreparationId } from '../core/survivor-preparations';

/** Ícone por upgrade, só pra ficar mais fácil de reconhecer na hora do susto do nível — não muda a lógica. */
const UPGRADE_ICON: Record<string, string> = {
  power: '💥', haste: '⏳', legs: '👟', vigor: '❤️', range: '📏', multishot: '🎯', pierce: '🏹', magnet: '🧲', radius: '⭕',
  'second-attack': '✦',
};
const upgradeIcon = (id: string): string => (id.startsWith('evolve:') ? '✨' : (UPGRADE_ICON[id] ?? '✨'));

/** O golpe de uma espécie na Torre: elemento pelo 1º tipo, forma e números pelos stats reais (`core/survivor-moves.ts`). */
function attackOf(dexId: number, picked?: PokemonType): { move: SurvivorMove; profile: AttackProfile; types: PokemonType[]; secondMove?: SurvivorMove } {
  const stats = statsOfDex(dexId);
  const types = typesOfDex(dexId);
  const ordered = picked ? [picked, ...types.filter((t) => t !== picked)] : types;
  const move = moveFor(ordered, stats);
  const secondType = types.find((type) => type !== picked && type !== move.type);
  return { move, profile: attackProfile(move, stats), types, ...(secondType ? { secondMove: moveFor([secondType], stats) } : {}) };
}
const moveLine = (m: SurvivorMove): string => `${m.icon} ${m.name} · ${MOVE_CATEGORY_LABELS_PT[m.category]}`;

/**
 * Zona de Sobrevivência: um modo próprio da Vila (como a Arena e a Pista de Pins), aberto pela Torre — não é um
 * minigame do Fliperama. Você anda arrastando o dedo em qualquer lugar da tela (ou WASD/setas), seu Pokémon ataca sozinho quem chegar perto,
 * orbes de XP sobem de nível e abrem a escolha de um upgrade, e as ondas ficam mais difíceis com o tempo. A lógica
 * fica inteira em `core/survivor.ts` (pura, testada); aqui é só o laço de desenho e os controles — como a Vila faz
 * com o próprio jogo dela. O chão usa um recorte real de um dos tilesets enviados (`public/tilesets/`, créditos em
 * THIRD_PARTY_NOTICES.md); os inimigos e o seu Pokémon usam o mesmo pacote de sprites locais da Vila ("Walk").
 * Se algum sprite não carregar, desenha uma forma neutra no lugar — nunca finge ser outro Pokémon. XP conta do
 * mesmo jeito que a Pista de Pins (`recordEvent({ type: 'minigame', game: 'sobrevivencia', ... })`), sem entrar
 * no catálogo de minigames do Fliperama (`core/minigames.ts`).
 */
const emit = defineEmits<{ leave: []; complete: [summary: SurvivorSummary, participant: { id: string; name: string }, runId: string] }>();
/** Digital Pokémon (Fase 6: elegíveis como parceiro na Torre, igual a qualquer carta escaneada). */
const props = defineProps<{ digital?: { instanceId?: string; dexId: number; name: string }[] }>();

/**
 * A Torre ocupa a tela inteira. O lado menor parte de `VIEW_SHORT` unidades e aproxima 1,5×, mantendo o formato do
 * aparelho sem desenhar fora da arena.
 */
const VIEW_SHORT = 360;
const CAMERA_ZOOM = 1.5;
const view = reactive({ w: 340, h: 420 });
const stageEl = ref<HTMLElement | null>(null);
let resizer: ResizeObserver | null = null;
function fitView(): void {
  const el = stageEl.value;
  if (!el) return;
  const W = el.clientWidth;
  const H = el.clientHeight;
  if (W <= 0 || H <= 0) return;
  const fitted = fitSurvivorViewport(W, H, ARENA_W, ARENA_H, VIEW_SHORT, CAMERA_ZOOM);
  if (fitted.w <= 0 || fitted.h <= 0) return;
  view.w = fitted.w;
  view.h = fitted.h;
  // Mudar o tamanho do canvas apaga o contexto: as configurações voltam no próximo quadro (`draw` refaz tudo).
  if (ctx) ctx.imageSmoothingEnabled = false;
}
const JOY_MAX = 42;
const regionScenery = ref(true);
const minimapEnabled = ref(true);
const drawLandscape = createSurvivorLandscape(ARENA_W, ARENA_H);
let landscapeAtlasLoaded = false;
async function loadLandscapeAtlas(): Promise<void> {
  if (landscapeAtlasLoaded) return;
  landscapeAtlasLoaded = true;
  const image = new Image();
  image.src = assetUrl('tilesets/vila-atlas.png');
  await new Promise<void>((resolve) => {
    image.onload = () => resolve();
    image.onerror = () => resolve();
  });
  if (image.naturalWidth > 0) drawLandscape.setAtlas(image);
}

interface Sprite {
  frames: HTMLCanvasElement[];
  delays: number[];
  durationMs: number;
  w: number;
  h: number;
  /** Caixa dos pixels opacos (frações do quadro): os pés ficam no ponto do chão, sem a margem da folha. */
  bounds: ContentBounds;
  /** Fator que leva o desenho ao tamanho pela altura real da espécie (1 = tamanho da folha, sem dado de altura). */
  fit: number;
}

/** Pixels de altura na Torre para 1 bloco de altura real (`core/size-scale.ts`); Pikachu ≈ 19 px, Snorlax ≈ 37 px. */
const SURVIVOR_TILE_PX = 22;

function toSprite(gif: DecodedGif, dexId?: number): Sprite {
  const frames = gif.frames.map((f) => {
    const c = document.createElement('canvas');
    c.width = gif.width;
    c.height = gif.height;
    const fctx = c.getContext('2d')!;
    const img = fctx.createImageData(gif.width, gif.height);
    img.data.set(f.rgba);
    fctx.putImageData(img, 0, 0);
    return c;
  });
  const bounds = contentBounds(gif);
  const contentPx = Math.max(1, (bounds.bottom - bounds.top) * gif.height);
  const tiles = speciesTiles(dexId);
  const fit = tiles === undefined ? 1 : (tiles * SURVIVOR_TILE_PX) / contentPx;
  return { frames, delays: gif.frames.map((f) => f.delayMs), durationMs: gif.durationMs, w: gif.width, h: gif.height, bounds, fit };
}

function frameIndex(sprite: Sprite, timeMs: number): number {
  if (sprite.frames.length <= 1 || sprite.durationMs <= 0) return 0;
  let remaining = ((timeMs % sprite.durationMs) + sprite.durationMs) % sprite.durationMs;
  for (let i = 0; i < sprite.delays.length; i++) {
    remaining -= sprite.delays[i] ?? 0;
    if (remaining < 0) return i;
  }
  return sprite.frames.length - 1;
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** Aviso rapido na tela da Torre (treinador chegou, chefao caiu...): some em 3 s. */
const toast = ref('');
let toastTimer: ReturnType<typeof setTimeout> | null = null;
function say(text: string, ms = 3000): void {
  toast.value = text;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), ms);
}

/** Imagem parada (PNG) como um GIF de um quadro so: a ultima alternativa de sprite. */
async function staticAsGif(blob: Blob): Promise<DecodedGif> {
  const bmp = await createImageBitmap(blob);
  try {
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const cx = c.getContext('2d')!;
    cx.drawImage(bmp, 0, 0);
    const rgba = cx.getImageData(0, 0, c.width, c.height).data;
    return { width: c.width, height: c.height, frames: [{ rgba, delayMs: 1000 }], durationMs: 1000 } as DecodedGif;
  } finally {
    bmp.close();
  }
}

/**
 * O sprite de um Pokémon na Torre, na ordem: a pose de andar do pacote local; senão o GIF baixado (o mesmo da Vila,
 * `getDigitalSprite`); senão a imagem parada do PokéAPI. Sem nenhum dos três, null (vira a forma neutra, sem fingir
 * ser outro Pokémon).
 */
const spriteMemory = new Map<number, Promise<Sprite | null>>();

async function loadSpriteOrNull(dexId: number): Promise<Sprite | null> {
  const cached = spriteMemory.get(dexId);
  if (cached) return cached;
  const pending = loadSpriteOrNullUncached(dexId);
  pending.catch(() => spriteMemory.delete(dexId));
  spriteMemory.set(dexId, pending);
  return pending;
}

async function loadSpriteOrNullUncached(dexId: number): Promise<Sprite | null> {
  try {
    const gif = await getLocalVillageSprite(dexId, false, 'Walk');
    if (gif) return toSprite(gif, dexId);
  } catch {
    // segue para a próxima alternativa
  }
  try {
    const any = await getDigitalSprite(dexId, false);
    if (any) return toSprite(any.gif, dexId);
  } catch {
    // segue para a próxima alternativa
  }
  try {
    const src = await fetchSprite(dexId);
    if (src && src.kind !== 'gif') return toSprite(await staticAsGif(src.blob), dexId);
  } catch {
    // sem rede: fica a forma neutra
  }
  return null;
}

/** Moedas que a última corrida rendeu (mostradas no resumo). */
const runCoins = ref(0);

/** Premio extra deste fim de corrida (por zerar) e se destravou o infinito agora. */
const runClearBonus = ref(0);
const runUnlockedInfinite = ref(false);

let runCompanion: CardCompanion | null = null;
let runParticipant = { id: 'survivor-pikachu', name: 'Pikachu' };
let runCounter = 0;
let activeRunId = '';
const completedRunIds = new Set<string>();
const selectedPreparation = ref<SurvivorPreparationId>('classica');
function recordRun(s: SurvivorSummary): void {
  // A recompensa só é emitida pelo evento gameover, e o mesmo resultado não pode ser aplicado duas vezes.
  if (!activeRunId || completedRunIds.has(activeRunId)) return;
  completedRunIds.add(activeRunId);
  if (!recordCardVictories(survivalWinners(runCompanion, s), 'survival')) say(cardJourneyError.value, 9000);
  recordEvent({ type: 'minigame', game: 'sobrevivencia', won: s.kills > 0, score: survivorScore(s) });
  const beforeInfinite = trainer.value.torre.infiniteUnlocked;
  const runRewards = recordEvent({
    type: 'survivor', runId: activeRunId, survivedMs: s.survivedMs, trainersBeaten: s.trainersBeaten, bossesBeaten: s.bossesBeaten,
    clearedTorre: s.finalBossBeaten, infinite: s.infinite, wave: s.wave, kills: s.kills, level: s.level,
    completedObjectives: survivorObjectives(state.value!).filter((objective) => objective.complete).map((objective) => objective.id),
  });
  runUnlocks.value = runRewards.filter((reward) => reward.tone === 'achievement').map((reward) => reward.sub ?? reward.text);
  runUnlockedInfinite.value = s.finalBossBeaten && !beforeInfinite;
  const today = dayKey(new Date());
  const last = trainer.value.torre.lastClearBonusDay;
  const canClearBonus = s.finalBossBeaten && last !== today;
  if (canClearBonus) trainer.value.torre.lastClearBonusDay = today;
  const total = survivorCoins(s) + (canClearBonus ? SURVIVOR_CLEAR_BONUS : 0);
  runCoins.value = total > 0 ? addCoins(total) : 0;
  runClearBonus.value = canClearBonus ? SURVIVOR_CLEAR_BONUS : 0;
  emit('complete', s, runParticipant, activeRunId);
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

interface PickOption {
  id: string;
  origin: string;
  dexId: number;
  name: string;
  types: PokemonType[];
  move: SurvivorMove;
  /** Barras do golpe (dano, rapidez, alcance ou raio, vida) pelos stats. */
  bars: { label: string; value: number }[];
  /** Retrato (data URL) pro cartão de escolha; null quando o pacote local não tem sprite pra essa espécie. */
  thumb: string | null;
}

const canvasEl = ref<HTMLCanvasElement | null>(null);
const ready = ref(false);
const failed = ref(false);
const avatarName = ref('');
const state = ref<SurvivorState | null>(null);
const paused = ref(false);
const leaveConfirm = ref(false);
let wasPausedBeforeLeave = false;
const minimap = ref({ markers: [] as ReturnType<typeof survivorMinimapSnapshot>['markers'], viewport: { x: 0, y: 0, width: ARENA_W, height: ARENA_H } });
const objectives = ref<ReturnType<typeof survivorObjectives>>([]);
const pendingUpgrade = ref<SurvivorUpgradeOption[] | null>(null);
const summary = ref<SurvivorSummary | null>(null);
const runUnlocks = ref<string[]>([]);
/** Tela de escolha antes de cada corrida: 3 Pokémon aleatórios da caixa do jogador, pra ele dizer quem joga
 * dessa vez. Null enquanto ainda está sorteando/carregando os retratos; [] se a caixa estiver vazia (cai pro
 * Pikachu de reserva sem tela de escolha, igual ao comportamento antigo). */
const pickOptions = ref<PickOption[] | null>(null);
const pickBusy = ref(false);
const rerollsUsed = ref(0);
const previousPickIds = ref<string[]>([]);
const favoriteIds = ref<Set<string>>(new Set());
const FAVORITES_KEY = 'tcg-ar-survivor-favorites-v1';
/** Evoluindo: o jogo espera o sprite da nova forma carregar (com o brilho na tela) antes de continuar. */
const evolving = ref<string | null>(null);
/** Espécies que têm sprite no pacote local (`village-sprite-meta.json`): a carta "Evoluir" só oferece estas. */
let spriteSpecies: Set<number> | null = null;
async function loadSpriteSpecies(): Promise<Set<number>> {
  if (spriteSpecies) return spriteSpecies;
  const meta = (await fetch(assetUrl('data/village-sprite-meta.json')).then((r) => (r.ok ? r.json() : null)).catch(() => null)) as Record<string, { a?: Record<string, unknown> }> | null;
  spriteSpecies = new Set(Object.entries(meta ?? {}).filter(([, v]) => !!v.a?.Walk).map(([k]) => Number(k)));
  return spriteSpecies;
}
/**
 * Próximas formas reais que a Torre consegue desenhar (sem sprite no pacote, a forma não é oferecida), com os números
 * pelos stats da nova forma — a forma do golpe continua a mesma da corrida.
 */
function evolutionsFor(dexId: number): SurvivorEvolutionOption[] {
  const move = state.value?.player.move;
  return nextEvolutions(dexId)
    .filter((id) => spriteSpecies?.has(id))
    .map((id) => {
      const stats = statsOfDex(id);
      return { dexId: id, name: speciesName(id) || `Pokémon nº ${id}`, ...(move && stats ? { profile: attackProfile(move, stats) } : {}) };
    });
}
const sound = new SoundEngine();
type UiSound = Extract<SoundCue, { kind: 'ui' }>['cue'];

function unlockSound(): void {
  sound.setEnabled(visual.sound);
  sound.unlock();
}

function playSound(cue: UiSound): void {
  sound.setEnabled(visual.sound);
  sound.play({ kind: 'ui', cue });
}

let ctx: CanvasRenderingContext2D | null = null;
let groundPattern: CanvasPattern | null = null;
let playerSprite: Sprite | null = null;
const enemySprites = new Map<number, Sprite | null>();
const missingEnemySprites = ref(0);
let rafId = 0;
/**
 * A tela saiu (fechou a Torre). O carregamento da corrida espera sprites e o chão; se a pessoa sai no meio dele, nada
 * pode recomeçar o laço depois (antes o `beginRun` terminava e ligava um requestAnimationFrame que nunca parava).
 */
let disposed = false;
let lastTs = 0;
let animMs = 0;
let lastMinimapMs = -Infinity;
const heldKeys = new Set<string>();
/** Joystick flutuante: aparece onde o dedo encostou na tela da Torre (`lx`, `ly`, relativos à tela). */
const joystick = reactive({ active: false, pointerId: null as number | null, cx: 0, cy: 0, dx: 0, dy: 0, lx: 0, ly: 0 });

const KEY_DIR: Record<string, string> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
};

function onKey(e: KeyboardEvent): void {
  const dir = KEY_DIR[e.key];
  if (!dir) return;
  if (e.type === 'keydown') heldKeys.add(dir);
  else heldKeys.delete(dir);
}

function joyDown(e: PointerEvent): void {
  if (joystick.active || paused.value || !ready.value || summary.value || pickOptions.value) return;
  // Botões das cartas (escolha, upgrades, resumo) continuam sendo botões: o joystick não pega esse toque.
  if ((e.target as HTMLElement | null)?.closest?.('button, .card')) return;
  unlockSound();
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  joystick.active = true;
  joystick.pointerId = e.pointerId;
  joystick.cx = e.clientX;
  joystick.cy = e.clientY;
  joystick.lx = e.clientX - rect.left;
  joystick.ly = e.clientY - rect.top;
  el.setPointerCapture?.(e.pointerId);
  joyMove(e);
}
function joyMove(e: PointerEvent): void {
  if (!joystick.active || e.pointerId !== joystick.pointerId) return;
  const dx = e.clientX - joystick.cx;
  const dy = e.clientY - joystick.cy;
  const len = Math.hypot(dx, dy) || 1;
  const factor = Math.min(len, JOY_MAX) / len;
  joystick.dx = (dx * factor) / JOY_MAX;
  joystick.dy = (dy * factor) / JOY_MAX;
}
function joyUp(e: PointerEvent): void {
  if (e.pointerId !== joystick.pointerId) return;
  joystick.active = false;
  joystick.pointerId = null;
  joystick.dx = 0;
  joystick.dy = 0;
}

function drawSprite(sprite: Sprite | null, x: number, y: number, flip: boolean, scale: number): void {
  if (!ctx) return;
  if (!sprite) {
    ctx.fillStyle = 'rgba(110,116,130,0.92)';
    ctx.beginPath();
    ctx.ellipse(x, y, 12 * scale, 14 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const frame = sprite.frames[frameIndex(sprite, animMs)] ?? sprite.frames[0]!;
  const w = sprite.w * sprite.fit * scale;
  const h = sprite.h * sprite.fit * scale;
  // Pés (base dos pixels opacos) no ponto (x, y) e corpo centrado: a margem transparente da folha não conta.
  const left = -((sprite.bounds.left + sprite.bounds.right) / 2) * w;
  const top = -sprite.bounds.bottom * h;
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(frame, left, top, w, h);
  ctx.restore();
}

function drawEnemy(e: SurvivorEnemy): void {
  if (!ctx) return;
  const sprite = e.dexId === undefined ? null : (enemySprites.get(e.dexId) ?? null);
  // Grau: elite com anel dourado, chefão (do treinador) com anel vermelho — ajuda a reconhecer na correria.
  if (e.grade !== 'comum') {
    ctx.strokeStyle = e.grade === 'chefao' ? '#e8453c' : '#ffd84a';
    ctx.lineWidth = e.grade === 'chefao' ? 3 : 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, (e.grade === 'chefao' ? 22 : 18), 0, Math.PI * 2);
    ctx.stroke();
  }
  const scale = e.boss ? 1.2 : e.grade === 'chefao' ? 1.3 : e.grade === 'elite' ? 1.1 : 1;
  if (e.archetype === 'protetor' || e.archetype === 'suporte' || e.protectedMs) {
    ctx.save();
    ctx.globalAlpha = e.protectedMs ? 0.55 : 0.3;
    ctx.strokeStyle = e.protectedMs ? '#8ed8ff' : e.archetype === 'suporte' ? '#8ee6a0' : '#9bb8ff';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(e.x, e.y - 8, e.protectedMs ? 21 : 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  drawSprite(sprite, e.x, e.y, false, scale);
  // Efeitos do golpe no inimigo: um pontinho colorido em cima (queimando, lento, atordoado).
  const marks: string[] = [];
  if (e.burnMs) marks.push(state.value?.player.move.color ?? '#ff7a2f');
  if (e.slowMs) marks.push('#9fe8ff');
  if (e.stunMs) marks.push('#ffe23d');
  if (e.wetMs) marks.push('#5bc0ff');
  if (e.seededMs) marks.push('#5ccf5c');
  marks.forEach((color, i) => {
    ctx!.fillStyle = color;
    ctx!.beginPath();
    ctx!.arc(e.x - (marks.length - 1) * 4 + i * 8, e.y - (e.boss ? 54 : 32), 3, 0, Math.PI * 2);
    ctx!.fill();
  });
  if (e.hitFlashMs > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.35 * (e.hitFlashMs / 90)})`;
    ctx.beginPath();
    ctx.arc(e.x, e.y, (e.boss ? 24 : 13) * (e.boss ? 1.3 : 1), 0, Math.PI * 2);
    ctx.fill();
  }
  if (e.hp < e.maxHp) {
    const w = e.boss ? 44 : 22;
    const y = e.y - (e.boss ? 46 : 26);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(e.x - w / 2, y, w, 4);
    ctx.fillStyle = e.boss ? '#f06a6a' : '#8be06a';
    ctx.fillRect(e.x - w / 2, y, w * clamp(e.hp / e.maxHp, 0, 1), 4);
  }
}

function draw(): void {
  if (!ctx || !canvasEl.value || !state.value) return;
  const s = state.value;
  const VIEW_W = view.w;
  const VIEW_H = view.h;
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  const camX = clamp(s.player.x - VIEW_W / 2, 0, Math.max(0, ARENA_W - VIEW_W));
  const camY = clamp(s.player.y - VIEW_H / 2, 0, Math.max(0, ARENA_H - VIEW_H));
  ctx.save();
  ctx.translate(-camX, -camY);
  if (regionScenery.value) {
    drawLandscape(ctx, s.elapsedMs);
  } else if (groundPattern) {
    ctx.fillStyle = groundPattern;
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  } else {
    ctx.fillStyle = '#4e9a62';
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  }
  drawSurvivorBiomeOverlay(ctx, s.elapsedMs);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, ARENA_W - 4, ARENA_H - 4);

  ctx.fillStyle = '#ffe066';
  for (const orb of s.orbs) {
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  const move = s.player.move;
  // Aura: o raio fica sempre marcado de leve em volta do Pokémon, para dar para ver até onde o golpe chega.
  if (move.category === 'aura' || move.category === 'orbit') {
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = move.color;
    ctx.beginPath();
    ctx.arc(s.player.x, s.player.y - 8, s.player.attackRadius, 0, Math.PI * 2);
    if (move.category === 'orbit') ctx.arc(s.player.x, s.player.y - 8, s.player.attackRadius * 0.48, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = move.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.restore();
  }

  for (const e of s.enemies) drawEnemy(e);

  const blink = s.player.invulnMs > 0 && Math.floor(animMs / 80) % 2 === 0;
  if (!blink) drawSprite(playerSprite, s.player.x, s.player.y, s.player.facing < 0, 1);

  for (const proj of s.projectiles) {
    const r = proj.size ?? 4;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = proj.move?.color ?? move.color;
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, r * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const proj of s.hostileProjectiles) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ff5b5b';
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, proj.size * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff0a8';
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, proj.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Pulsos da aura, explosões da área e o brilho da evolução.
  if (!effectiveVisual.value.rotomMode) for (const f of s.fx) {
    const t = clamp(f.ageMs / f.lifeMs, 0, 1);
    ctx.save();
    if (f.kind === 'pulse') {
      ctx.globalAlpha = 0.55 * (1 - t);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(f.x, f.y - 8, f.r * (0.55 + 0.45 * t), 0, Math.PI * 2);
      ctx.stroke();
    } else if (f.kind === 'blast') {
      ctx.globalAlpha = 0.5 * (1 - t);
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (0.35 + 0.65 * t), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.8 * (1 - t);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      for (let k = 0; k < 3; k++) {
        ctx.globalAlpha = 0.7 * (1 - t);
        ctx.strokeStyle = k === 1 ? '#ffe066' : '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(s.player.x, s.player.y - 12, f.r * (0.2 + t) * (1 + k * 0.35), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

function updateMinimap(s: SurvivorState): void {
  // O minimapa é uma fotografia leve, atualizada algumas vezes por segundo; a arena continua no canvas a cada frame.
  if (animMs - lastMinimapMs < 120) return;
  lastMinimapMs = animMs;
  minimap.value = survivorMinimapSnapshot(s, { width: ARENA_W, height: ARENA_H }, { width: view.w, height: view.h });
  objectives.value = survivorObjectives(s);
}

function loop(ts: number): void {
  if (disposed) {
    rafId = 0;
    return;
  }
  rafId = requestGameFrame(loop, maxVisualFps);
  const fps = effectiveVisual.value.frameRate === 'auto' ? 0 : Number(effectiveVisual.value.frameRate);
  if (!isFrameDue(ts, lastTs, fps)) return;
  const dt = Math.min(60, ts - lastTs || 16);
  lastTs = ts;
  if (document.hidden || !state.value) return;
  if (paused.value) {
    draw();
    return;
  }
  animMs += dt;
  const s = state.value;
  if (!s.over && !s.pendingUpgrade && !evolving.value) {
    const projectilesBefore = s.projectiles.length;
    const hpBefore = s.player.hp;
    const xpBefore = s.player.xp;
    const killsBefore = s.kills;
    const kx = (heldKeys.has('right') ? 1 : 0) - (heldKeys.has('left') ? 1 : 0);
    const ky = (heldKeys.has('down') ? 1 : 0) - (heldKeys.has('up') ? 1 : 0);
    const dx = kx + (joystick.active ? joystick.dx : 0);
    const dy = ky + (joystick.active ? joystick.dy : 0);
    const events = stepSurvivor(s, { dx, dy }, dt);
    if (s.projectiles.length > projectilesBefore) playSound('survivor-shot');
    if (s.kills > killsBefore) playSound('survivor-hit');
    if (s.player.xp > xpBefore) playSound('survivor-pickup');
    if (s.player.hp < hpBefore) playSound('survivor-hurt');
    for (const ev of events) {
      if (ev.type === 'levelup') playSound('survivor-level');
      else if (ev.type === 'bossSpawn') playSound('survivor-boss');
      if (ev.type === 'gameover') {
        playSound('survivor-gameover');
        objectives.value = survivorObjectives(s);
        summary.value = ev.summary;
        recordRun(ev.summary);
      }
      else if (ev.type === 'trainerSpawn') say(ev.final ? 'CHEFAO FINAL! 6 Pokemon!' : 'Um treinador! 3 Pokemon mais fortes.');
      else if (ev.type === 'trainerDown') say(ev.final ? 'CHEFAO DERROTADO!' : 'Treinador derrotado!');
    }
  }
  updateMinimap(s);
  pendingUpgrade.value = s.pendingUpgrade;
  draw();
}

function chooseUpgrade(id: string): void {
  if (!state.value) return;
  const events = applyUpgrade(state.value, id);
  playSound('success');
  pendingUpgrade.value = null;
  for (const ev of events) if (ev.type === 'evolve') void evolveTo(ev.dexId, ev.name);
}

function togglePause(): void {
  if (!state.value || state.value.over || summary.value || pendingUpgrade.value || evolving.value) return;
  paused.value = !paused.value;
  joystick.active = false;
  joystick.pointerId = null;
  joystick.dx = 0;
  joystick.dy = 0;
  lastTs = performance.now();
  say(paused.value ? 'Jogo pausado.' : 'Jogo retomado.', 1600);
}

/** Troca o sprite pela nova forma; o jogo espera (com o brilho) até carregar. Sem sprite, a forma neutra no lugar. */
async function evolveTo(dexId: number, name: string): Promise<void> {
  evolving.value = `${avatarName.value} evoluiu para ${name}!`;
  const [sprite] = await Promise.all([loadSpriteOrNull(dexId), new Promise((r) => setTimeout(r, 900))]);
  if (disposed) return;
  playerSprite = sprite;
  avatarName.value = name;
  evolving.value = null;
  lastTs = performance.now();
}

function leaveNow(): void {
  emit('leave');
}

function requestLeave(): void {
  if (leaveConfirm.value) return;
  if (summary.value) {
    leaveNow();
    return;
  }
  wasPausedBeforeLeave = paused.value;
  paused.value = true;
  leaveConfirm.value = true;
}

function cancelLeave(): void {
  leaveConfirm.value = false;
  paused.value = wasPausedBeforeLeave;
}

function confirmLeave(): void {
  leaveConfirm.value = false;
  emit('leave');
}

defineExpose({ requestLeave });

/** Sorteia 3 companheiros da caixa, identificados por carta/instância, pra escolher quem joga desta vez.
 * Caixa vazia (nenhuma carta ainda) não trava nada: cai pro Pikachu de reserva sem tela de escolha, como antes. */
function readFavorites(ids: readonly string[]): Set<string> {
  try {
    return normalizeSurvivorFavorites(JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? 'null'), new Set(ids));
  } catch {
    return new Set();
  }
}

function writeFavorites(): void {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favoriteIds.value])); } catch { /* armazenamento indisponível */ }
}

function toggleFavorite(id: string): void {
  const next = new Set(favoriteIds.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  favoriteIds.value = next;
  writeFavorites();
  if (pickOptions.value) pickOptions.value = pickOptions.value.map((option) => ({ ...option }));
}

async function rollPickOptions(previousIds: readonly string[] = []): Promise<PickOption[]> {
  const cache = await getCache();
  const cards = await cache.list();
  const pool: (CardCompanion & { origin: string })[] = [];
  for (const c of cards) {
    const mon = cardCompanion(c);
    if (mon) pool.push({ ...mon, origin: `${c.setName} ${c.localId}` });
  }
  // Digital Pokémon entram no mesmo sorteio (Fase 6): não vêm de carta nenhuma, mas jogam igual a qualquer outro.
  for (const [i, d] of (props.digital ?? []).entries()) pool.push({ id: d.instanceId ?? `dp_torre_${i}`, dexId: d.dexId, name: d.name, origin: 'Digital Pokémon' });
  if (pool.length === 0) return [];
  const ids = pool.map((item) => item.id);
  favoriteIds.value = readFavorites(ids);
  const chosen = selectSurvivorCandidates(pool, seededRng((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0), favoriteIds.value, 3, previousIds);
  const thumbs = await Promise.all(
    chosen.map(({ dexId }) =>
      getLocalVillageSprite(dexId, false, 'Idle')
        .then((g) => (g ? toSprite(g).frames[0]?.toDataURL() ?? null : null))
        .catch(() => null)
        // Fora do pacote local: o sprite público da espécie (o mesmo que a Torre baixa para jogar).
        .then((url) => url ?? pokemonSpriteUrl(dexId)),
    ),
  );
  return chosen.map(({ id, dexId, name, origin }, i) => {
    const { move, profile, types } = attackOf(dexId);
    return { id, dexId, name, origin, types, move, bars: profileBars(move, profile), thumb: thumbs[i] ?? null };
  });
}

async function beginRun(dexId: number, name: string, picked?: PokemonType, infinite = false, companion: CardCompanion | null = null, preparation: SurvivorPreparationId = 'classica'): Promise<void> {
  runCompanion = companion;
  pickBusy.value = true;
  try {
    avatarName.value = name;
    evolving.value = null;
    await Promise.all([loadSpriteSpecies(), loadLandscapeAtlas()]);
    const [player] = await Promise.all([
      loadSpriteOrNull(dexId),
      ...REGIONAL_ENEMY_SPRITES.map(async (id) => {
        if (!enemySprites.get(id)) enemySprites.set(id, await loadSpriteOrNull(id));
      }),
    ]);
    playerSprite = player;
    missingEnemySprites.value = REGIONAL_ENEMY_SPRITES.filter((id) => !enemySprites.get(id)).length;

    if (disposed) return;
    if (!groundPattern) {
      const groundImg = new Image();
      groundImg.src = assetUrl('tilesets/survivor-grass.png');
      await new Promise<void>((resolve) => {
        groundImg.onload = () => resolve();
        groundImg.onerror = () => resolve();
      });
      if (ctx && groundImg.naturalWidth > 0) groundPattern = ctx.createPattern(groundImg, 'repeat');
    }

    if (disposed) return;
    pickOptions.value = null;
    summary.value = null;
    runUnlocks.value = [];
    pendingUpgrade.value = null;
    paused.value = false;
    const { move, profile, secondMove } = attackOf(dexId, picked);
    activeRunId = `${Date.now().toString(36)}-${(++runCounter).toString(36)}-${Math.floor(Math.random() * 0x1_0000_0000).toString(36)}`;
    state.value = createSurvivorState(Math.floor(Math.random() * 2 ** 31), { kindCount: REGIONAL_KIND_COUNT, enemyDexId: regionalEnemyDexId, move, profile, secondMove, dexId, evolutions: evolutionsFor, infinite, preparation });
    ready.value = true;
    lastTs = performance.now();
    if (!rafId) rafId = requestGameFrame(loop, maxVisualFps);
  } catch {
    failed.value = true;
  } finally {
    pickBusy.value = false;
  }
}

function choosePlayer(opt: PickOption, picked?: PokemonType): void {
  unlockSound();
  runParticipant = { id: opt.id, name: opt.name };
  void beginRun(opt.dexId, opt.name, picked, infiniteWanted.value && torre.value.infiniteUnlocked, opt.id.startsWith('dp_') ? null : { id: opt.id, dexId: opt.dexId, name: opt.name }, selectedPreparation.value);
}

/** Tela "qual tipo?" aberta: a opcao clicada tem dois tipos. */
const typeChoice = ref<PickOption | null>(null);
/** Marcou "Modo infinito" na tela de escolha (so vale se ja estiver destravado). */
const infiniteWanted = ref(false);
const torre = computed(() => trainer.value.torre);
const rerollLimit = computed(() => survivorRerollLimit(torre.value.completedObjectives));
const recordedObjectiveCount = computed(() => new Set(torre.value.completedObjectives).size);
const preparations = computed(() => availableSurvivorPreparations(torre.value.completedObjectives));
const nextPreparation = computed(() => SURVIVOR_PREPARATIONS.find(({ unlockAtObjectives }) => unlockAtObjectives > recordedObjectiveCount.value));
const nextTowerGoal = computed(() => {
  if (!torre.value.infiniteUnlocked) return 'Próximo marco: derrote o chefão final aos 20 min para abrir o modo infinito.';
  if (torre.value.trainersBeaten < 10) return `Próximo marco: derrote ${10 - torre.value.trainersBeaten} treinador(es) para a conquista Mestre da Torre.`;
  if (torre.value.bossesBeaten < 3) return `Próximo marco: derrote ${3 - torre.value.bossesBeaten} chefão(ões) para Caçador do infinito.`;
  if (recordedObjectiveCount.value < 3) return `Próximo marco: conclua ${3 - recordedObjectiveCount.value} desafio(s) opcional(is) distinto(s) em corridas encerradas para liberar outra troca de sorteio.`;
  return `Registro: ${torre.value.runs} corridas concluídas · melhor onda ${torre.value.bestWave} · nível ${torre.value.bestLevel}.`;
});
function openTypeChoice(opt: PickOption): void { typeChoice.value = opt; }
watch(() => torre.value.infiniteUnlocked, (ok) => { if (!ok) infiniteWanted.value = false; });

/** Abre a tela de escolha de novo (3 novos sorteados) antes de cada corrida, inclusive ao "Jogar de novo". */
async function openPicker(): Promise<void> {
  ready.value = false;
  pickBusy.value = true;
  pickOptions.value = null;
  try {
    rerollsUsed.value = 0;
    previousPickIds.value = [];
    const options = await rollPickOptions();
    if (disposed) return;
    if (options.length === 0) {
      // Caixa vazia: sem tela de escolha, igual ao comportamento de antes.
      await beginRun(25, 'Pikachu');
      return;
    }
    pickOptions.value = options;
    previousPickIds.value = options.map((option) => option.id);
  } catch {
    failed.value = true;
  } finally {
    pickBusy.value = false;
  }
}

async function rerollPicker(): Promise<void> {
  if (rerollsUsed.value >= rerollLimit.value || pickBusy.value || !pickOptions.value) return;
  rerollsUsed.value++;
  pickBusy.value = true;
  try {
    const options = await rollPickOptions(previousPickIds.value);
    if (disposed) return;
    pickOptions.value = options;
    previousPickIds.value = options.map((option) => option.id);
  } finally {
    pickBusy.value = false;
  }
}

function playAgain(): void {
  unlockSound();
  cancelGameFrame(rafId);
  rafId = 0;
  void openPicker();
}

onMounted(() => {
  ctx = canvasEl.value?.getContext('2d') ?? null;
  fitView();
  if (typeof ResizeObserver !== 'undefined' && stageEl.value) {
    resizer = new ResizeObserver(fitView);
    resizer.observe(stageEl.value);
  }
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  void openPicker();
});
/** Saiu do app (outra aba, tela apagada): ninguém fica andando sozinho com uma tecla "presa" ao voltar. */
function onVisibility(): void {
  if (document.hidden) {
    heldKeys.clear();
    joystick.active = false;
    joystick.pointerId = null;
    joystick.dx = 0;
    joystick.dy = 0;
  }
}
document.addEventListener('visibilitychange', onVisibility);

onBeforeUnmount(() => {
  disposed = true;
  cancelGameFrame(rafId);
  rafId = 0;
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  document.removeEventListener('visibilitychange', onVisibility);
  resizer?.disconnect();
  resizer = null;
  heldKeys.clear();
  sound.dispose();
});
</script>

<template>
  <div class="survivor">
    <p v-if="failed" class="hint">Não deu para carregar a Zona de Sobrevivência agora. Tente de novo mais tarde.</p>
    <template v-else>
      <div
        ref="stageEl"
        class="survivor-stage"
        :class="{ 'survivor-stage-picker': pickOptions }"
        @pointerdown="joyDown"
        @pointermove="joyMove"
        @pointerup="joyUp"
        @pointercancel="joyUp"
      >
        <canvas ref="canvasEl" :width="view.w" :height="view.h" class="survivor-canvas" aria-label="Torre: arraste em qualquer lugar para andar"></canvas>

        <div class="survivor-vignette" aria-hidden="true"></div>

        <div v-if="toast" class="survivor-toast" role="status" aria-live="polite">{{ toast }}</div>
        <div v-if="ready && state" class="survivor-hud">
          <div class="survivor-hp" :class="{ low: state.player.hp / state.player.maxHp < 0.3 }">
            <div class="survivor-hp-fill" :style="{ width: Math.max(0, (state.player.hp / state.player.maxHp) * 100) + '%' }"></div>
            <span>{{ avatarName }} · Nv {{ state.player.level }}</span>
          </div>
          <div class="survivor-stats">
            <span class="chip survivor-move-chip" :style="{ '--move': state.player.move.color }" :title="MOVE_EFFECT_LABELS_PT[state.player.move.effect]">{{ moveLine(state.player.move) }}</span>
             <span v-if="state.player.secondMove" class="chip survivor-move-chip second" :style="{ '--move': state.player.secondMove.color }" :title="MOVE_EFFECT_LABELS_PT[state.player.secondMove.effect]">{{ moveLine(state.player.secondMove) }}</span>
            <span class="chip survivor-xp" :title="`Faltam ${Math.max(0, state.player.xpToNext - state.player.xp)} XP para o próximo nível`">✨ {{ state.player.xp }}/{{ state.player.xpToNext }} XP <small>· faltam {{ Math.max(0, state.player.xpToNext - state.player.xp) }}</small></span>
            <span class="chip">⏱ {{ formatTime(state.elapsedMs) }}</span>
            <span class="chip">☠ {{ state.kills }}</span>
            <span class="chip">🌊 Onda {{ state.wave }}</span>
            <span class="chip">{{ survivorRegionLabel(state.elapsedMs) }}</span>
             <span v-if="survivorBiomeLabel(state.elapsedMs)" class="chip" :title="survivorBiomeAt(state.elapsedMs)?.description">{{ survivorBiomeLabel(state.elapsedMs) }}</span>
            <span v-if="missingEnemySprites" class="chip" role="status">{{ missingEnemySprites }} sprites indisponíveis: exibidos como formas neutras</span>
             <button v-if="!summary && !pendingUpgrade && !evolving" type="button" class="chip survivor-pause-btn" :aria-pressed="paused" @pointerdown.stop @click.stop="togglePause">{{ paused ? '▶ Retomar' : 'Ⅱ Pausar' }}</button>
            <button type="button" class="chip" :aria-pressed="minimapEnabled" @pointerdown.stop @click.stop="minimapEnabled = !minimapEnabled">Mapa: {{ minimapEnabled ? 'ligado' : 'desligado' }}</button>
            <button type="button" class="chip" :aria-pressed="regionScenery" @pointerdown.stop @click.stop="regionScenery = !regionScenery">Cenário regional: {{ regionScenery ? 'ligado' : 'desligado' }}</button>
          </div>
        </div>

        <div v-if="ready && state && minimapEnabled" class="survivor-minimap" role="img" aria-label="Minimapa da arena; o ponto azul é você, pontos vermelhos são chefes e pontos amarelos são elites">
          <span class="survivor-minimap-title">Mapa</span>
          <span class="survivor-minimap-viewport" :style="{ left: `${(minimap.viewport.x / ARENA_W) * 100}%`, top: `${(minimap.viewport.y / ARENA_H) * 100}%`, width: `${(minimap.viewport.width / ARENA_W) * 100}%`, height: `${(minimap.viewport.height / ARENA_H) * 100}%` }"></span>
          <span
            v-for="marker in minimap.markers"
            :key="`${marker.kind}-${marker.id}`"
            class="survivor-minimap-marker"
            :class="`kind-${marker.kind}`"
            :style="{ left: `${(marker.x / ARENA_W) * 100}%`, top: `${(marker.y / ARENA_H) * 100}%` }"
          ></span>
        </div>

        <div v-if="ready && state && objectives.length" class="survivor-objectives" aria-label="Objetivos opcionais da corrida">
          <span class="survivor-objectives-title">Objetivos</span>
          <span v-for="objective in objectives" :key="objective.id" class="survivor-objective" :class="{ complete: objective.complete }">
            <b>{{ objective.complete ? '✓' : '○' }}</b>
            <span>{{ objective.title }}</span>
            <small v-if="!objective.complete">{{ objective.unit === 's' ? Math.floor(objective.progress / 1000) : objective.progress }} / {{ objective.unit === 's' ? Math.floor(objective.target / 1000) : objective.target }}{{ objective.unit === 's' ? 's' : objective.unit }}</small>
          </span>
        </div>

        <div v-if="ready && !summary && joystick.active" class="survivor-joy-base active" :style="{ left: `${joystick.lx}px`, top: `${joystick.ly}px` }" aria-hidden="true">
          <div class="survivor-joy-stick" :style="{ transform: `translate(${joystick.dx * JOY_MAX}px, ${joystick.dy * JOY_MAX}px)` }"></div>
        </div>
        <p v-if="ready && !summary && !joystick.active && !pickOptions && state && state.elapsedMs < 6000" class="survivor-move-hint">Arraste em qualquer lugar para andar</p>

        <div v-if="paused" class="survivor-overlay" role="dialog" aria-label="Jogo pausado" aria-modal="true">
          <div class="card survivor-pause">
            <h2>Jogo pausado</h2>
            <p class="note">O relógio, os inimigos e os projéteis estão parados.</p>
            <button type="button" class="primary" @pointerdown.stop @click.stop="togglePause">▶ Retomar</button>
          </div>
        </div>

        <div v-if="pickOptions" class="survivor-overlay" role="dialog" aria-label="Escolha quem joga">
          <div v-if="typeChoice" class="card survivor-pick survivor-type-choice">
            <h2>{{ typeChoice.name }} tem dois tipos</h2>
            <p class="note">Qual deles ataca na corrida?</p>
            <div class="survivor-pick-grid">
              <button v-for="t in typeChoice.types" :key="t" type="button" class="survivor-pick-btn" @click="(() => { const o = typeChoice!; typeChoice = null; choosePlayer(o, t); })()">
                <strong>{{ TYPE_LABELS_PT[t] }}</strong>
                <small>{{ moveFor([t], null).name }}</small>
              </button>
            </div>
            <button type="button" class="link" @click="typeChoice = null">Voltar</button>
          </div>
          <div v-else class="card survivor-pick">
            <h2>Quem vai pra Torre dessa vez?</h2>
            <p class="note" role="status">{{ nextTowerGoal }}</p>
            <p v-if="torre.runs > 0" class="note">{{ torre.runs }} corridas concluídas · melhor onda {{ torre.bestWave }} · melhor nível {{ torre.bestLevel }} · {{ recordedObjectiveCount }} desafio(s) distinto(s) registrados.</p>
            <p class="note">Cada corrida traz 3 desafios opcionais, escolhidos entre 12 pelo sorteio da própria corrida. Só contam quando ela termina.</p>
            <details class="survivor-ledger">
              <summary>Trilha dos desafios · {{ recordedObjectiveCount }}/{{ SURVIVOR_OBJECTIVE_IDS.length }} concluídos</summary>
              <ul>
                <li v-for="objectiveId in SURVIVOR_OBJECTIVE_IDS" :key="objectiveId" :class="{ complete: torre.completedObjectives.includes(objectiveId) }">
                  <span>{{ SURVIVOR_OBJECTIVE_DETAILS[objectiveId].title }}</span>
                  <small>{{ torre.completedObjectives.includes(objectiveId) ? 'Concluído em corrida encerrada' : 'Ainda não registrado' }}</small>
                </li>
              </ul>
            </details>
             <p class="note">3 Pokémon sorteados da sua caixa. Você pode marcar favoritos para aumentar a chance de vê-los.</p>
            <p class="note">Viaje pelas nove regiões durante a corrida. Trilhas, árvores e lagoas são decorativas: você pode atravessar tudo.</p>
            <p class="note">Novos inimigos acompanham a região; os que já estão na arena mantêm a espécie. A dificuldade continua seguindo o tempo e a onda.</p>
            <div v-if="torre.infiniteUnlocked" class="survivor-mode" role="group" aria-label="Modo da Torre">
              <button type="button" :class="{ active: !infiniteWanted }" @click="infiniteWanted = false">🗼 Normal<small>Chefão aos 20 min</small></button>
              <button type="button" :class="{ active: infiniteWanted }" @click="infiniteWanted = true">♾️ Infinito<small>Mais difícil, sem fim</small></button>
            </div>
            <section v-if="preparations.length > 1" class="survivor-preparations" aria-label="Preparação para a corrida">
              <strong>Preparação</strong>
              <div class="survivor-mode" role="group" aria-label="Escolha uma preparação">
                <button v-for="preparation in preparations" :key="preparation.id" type="button" :class="{ active: selectedPreparation === preparation.id }" :aria-pressed="selectedPreparation === preparation.id" @click="selectedPreparation = preparation.id">
                  {{ preparation.name }}<small>{{ preparation.description }}</small>
                </button>
              </div>
            </section>
            <p v-if="preparations.length > 1 && nextPreparation" class="note">{{ recordedObjectiveCount }} desafio(s) distinto(s) registrado(s). Próxima preparação: {{ nextPreparation.name }} após {{ nextPreparation.unlockAtObjectives }} objetivos.</p>
            <p v-else-if="preparations.length > 1" class="note">Todas as preparações estratégicas estão liberadas pelos seus desafios concluídos.</p>
            <p v-else class="note">Conclua desafios em corridas reais para liberar preparações: 3 objetivos distintos liberam Passo leve; 6, Mira calculada; 9, Ímã de campo; 12, Mira de longo alcance.</p>
            <div class="survivor-pick-grid">
               <div
                v-for="opt in pickOptions"
                :key="opt.id"
                class="survivor-pick-btn"
                 :class="{ disabled: pickBusy }"
                 role="button"
                 :tabindex="pickBusy ? -1 : 0"
                 @keydown.enter.prevent="opt.types.length > 1 ? openTypeChoice(opt) : choosePlayer(opt, opt.types[0])"
                 @click="opt.types.length > 1 ? openTypeChoice(opt) : choosePlayer(opt, opt.types[0])"
              >
                 <button type="button" class="survivor-favorite" :aria-label="favoriteIds.has(opt.id) ? `Remover ${opt.name} dos favoritos` : `Favoritar ${opt.name}`" :aria-pressed="favoriteIds.has(opt.id)" @click.stop="toggleFavorite(opt.id)">{{ favoriteIds.has(opt.id) ? '★' : '☆' }}</button>
                <img v-if="opt.thumb" :src="opt.thumb" :alt="opt.name" class="survivor-pick-thumb" />
                <span v-else class="survivor-pick-thumb placeholder" aria-hidden="true">?</span>
                <strong>{{ opt.name }}</strong>
                <small>{{ opt.origin }}</small>
                <small class="survivor-pick-move" :style="{ '--move': opt.move.color }">{{ opt.move.icon }} {{ opt.move.name }}</small>
                <small class="survivor-pick-kind">{{ MOVE_CATEGORY_LABELS_PT[opt.move.category] }} · {{ MOVE_EFFECT_LABELS_PT[opt.move.effect] }}</small>
                <span class="survivor-pick-bars" :style="{ '--move': opt.move.color }">
                  <span v-for="b in opt.bars" :key="b.label" class="survivor-pick-bar"><small>{{ b.label }}</small><i><b :style="{ width: Math.round(b.value * 100) + '%' }"></b></i></span>
                </span>
                <small v-if="opt.move.estimated" class="survivor-pick-kind">Sem stats desta espécie: números médios.</small>
               </div>
            </div>
             <button type="button" class="link survivor-reroll" :disabled="rerollsUsed >= rerollLimit || pickBusy" @click="rerollPicker">🔄 Sortear novamente <small>{{ Math.max(0, rerollLimit - rerollsUsed) }} de {{ rerollLimit }} troca(s) grátis nesta tentativa</small></button>
            <p v-if="rerollLimit === 1" class="note">Conclua 3 desafios distintos em corridas encerradas para liberar uma segunda troca de sorteio nas próximas tentativas.</p>
            <p v-else class="note">📜 Caderno de campo completo: a segunda troca de sorteio foi liberada pelos seus três desafios concluídos.</p>
            <p v-if="pickBusy" class="note" role="status">Preparando a corrida…</p>
          </div>
        </div>

        <div v-if="pendingUpgrade" class="survivor-overlay" role="dialog" aria-label="Escolha um upgrade">
          <div class="card survivor-upgrades">
            <h2>Subiu de nível!</h2>
            <button v-for="u in pendingUpgrade" :key="u.id" type="button" class="survivor-upgrade-btn" :class="{ evolve: u.id.startsWith('evolve:') }" @click="chooseUpgrade(u.id)">
              <span class="survivor-upgrade-icon" aria-hidden="true">{{ upgradeIcon(u.id) }}</span>
              <span class="survivor-upgrade-text"><strong>{{ u.name }}</strong><small>{{ u.description }}</small></span>
            </button>
          </div>
        </div>

        <div v-if="leaveConfirm" class="survivor-overlay" role="alertdialog" aria-label="Abandonar corrida" aria-modal="true">
          <div class="card survivor-pause">
            <h2>Abandonar a Torre?</h2>
            <p class="note">A corrida será encerrada sem registrar objetivos, marcos ou recompensas. Só corridas que chegam ao fim contam para a progressão.</p>
            <button type="button" class="primary" @pointerdown.stop @click.stop="cancelLeave">Continuar na Torre</button>
            <button type="button" class="link" @pointerdown.stop @click.stop="confirmLeave">Abandonar corrida</button>
          </div>
        </div>

        <p v-if="evolving" class="survivor-evolving" role="status">✨ {{ evolving }}</p>

        <div v-if="summary" class="survivor-overlay" role="dialog" aria-label="Fim da corrida">
          <div class="card survivor-summary">
            <h2>Fim de jogo</h2>
            <div class="survivor-summary-grid">
              <div><strong>{{ formatTime(summary.survivedMs) }}</strong><small>Tempo</small></div>
              <div><strong>Nv {{ summary.level }}</strong><small>Nível</small></div>
              <div><strong>{{ summary.kills }}</strong><small>Derrotas</small></div>
              <div><strong>{{ summary.wave }}</strong><small>Onda</small></div>
            </div>
            <p v-if="objectives.length" class="survivor-objectives-summary" role="status">
              Objetivos opcionais: {{ objectives.filter((objective) => objective.complete).length }}/{{ objectives.length }} concluídos.
            </p>
            <p class="survivor-coins" role="status">
              {{ runCoins > 0 ? `🪙 +${runCoins} moedas` : 'Sem moedas desta vez: dure 20 segundos ou derrote alguém.' }}
              <small v-if="runClearBonus > 0"> (inclui o bônus de {{ runClearBonus }} por zerar, 1× por dia)</small>
            </p>
            <p v-if="summary.finalBossBeaten" class="survivor-cleared" role="status">🏆 Chefão final derrotado!<small v-if="runUnlockedInfinite"> Modo infinito destravado.</small></p>
            <p v-if="runUnlocks.length" class="survivor-cleared" role="status">Desbloqueios desta corrida: {{ runUnlocks.join(' · ') }}.</p>
            <p v-if="summary.trainersBeaten > 0 || summary.bossesBeaten > 0" class="note">Treinadores derrotados: {{ summary.trainersBeaten }}{{ summary.bossesBeaten > 0 ? ` · chefões: ${summary.bossesBeaten}` : '' }}.</p>
            <p v-if="summary.stage > 0" class="note">Evoluiu {{ summary.stage === 1 ? 'uma vez' : `${summary.stage} vezes` }} nesta corrida (como {{ avatarName }}).</p>
            <button type="button" class="primary" @click="playAgain">Jogar de novo</button>
            <button type="button" class="link" @click="leaveNow">Voltar aos jogos</button>
          </div>
        </div>

        <p v-if="!ready && !pickOptions" class="hint survivor-loading">Carregando a Zona de Sobrevivência…</p>
      </div>
      <p class="note">Arraste em qualquer lugar da tela para andar (ou WASD/setas); seu Pokémon ataca sozinho com o golpe do tipo dele: projétil, aura, área, cone frontal ou órbita. Evolua e escolha melhorias durante a corrida. Ondas cada vez maiores e um chefe de tempos em tempos. Chão e inimigos: créditos no rodapé do app.</p>
    </template>
  </div>
</template>
