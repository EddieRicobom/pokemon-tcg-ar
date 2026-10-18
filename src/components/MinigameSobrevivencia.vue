<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { assetUrl, getCache, getDigitalSprite, getLocalVillageSprite } from '../app/services';
import { fetchSprite } from '../ar/sprite-source';
import { pokemonSpriteUrl } from '../ar/sprite-url';
import { recordEvent } from '../app/trainer-store';
import { addCoins } from '../app/wallet';
import { visual } from '../app/visual-settings';
import { seededRng } from '../core/battle';
import { shuffle } from '../core/minigames';
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
import type { SoundCue } from '../box/sound-recipes';

/** Ícone por upgrade, só pra ficar mais fácil de reconhecer na hora do susto do nível — não muda a lógica. */
const UPGRADE_ICON: Record<string, string> = {
  power: '💥', haste: '⏳', legs: '👟', vigor: '❤️', range: '📏', multishot: '🎯', pierce: '🏹', magnet: '🧲', radius: '⭕',
};
const upgradeIcon = (id: string): string => (id.startsWith('evolve:') ? '✨' : (UPGRADE_ICON[id] ?? '✨'));

/** O golpe de uma espécie na Torre: elemento pelo 1º tipo, forma e números pelos stats reais (`core/survivor-moves.ts`). */
function attackOf(dexId: number, picked?: PokemonType): { move: SurvivorMove; profile: AttackProfile; types: PokemonType[] } {
  const stats = statsOfDex(dexId);
  const types = typesOfDex(dexId);
  const ordered = picked ? [picked, ...types.filter((t) => t !== picked)] : types;
  const move = moveFor(ordered, stats);
  return { move, profile: attackProfile(move, stats), types };
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
const emit = defineEmits<{ leave: [] }>();
/** Digital Pokémon (Fase 6: elegíveis como parceiro na Torre, igual a qualquer carta escaneada). */
const props = defineProps<{ digital?: { dexId: number; name: string }[] }>();

/** Espécies "selvagens" comuns para o elenco de inimigos desta corrida (todas têm sprite no pacote local). */
/**
 * Elenco maior (antes eram 12, agora ~34, varias geracoes, todos com sprite no pacote local): a tela nao repete
 * sempre os mesmos bichos.
 */
const WILD_DEX_IDS = [
  10, 16, 19, 21, 23, 27, 41, 46, 48, 54, 58, 69, 74, 92, 98, 109, 118, 129, 133, 161,
  165, 177, 190, 198, 220, 228, 261, 265, 273, 300, 304, 325, 403, 418,
] as const;
/** Chefe periódico: maior, mais forte, sprite fixo (todas as espécies do pacote têm as 7 animações; ver village-sprite-meta.json). */
const BOSS_DEX_ID = 95;

/**
 * A Torre ocupa a tela inteira: o lado menor da tela mostra `VIEW_SHORT` unidades do jogo e o maior acompanha o formato
 * do aparelho (celular em pé vê mais para cima e para baixo; computador, mais para os lados), sem passar da arena.
 */
const VIEW_SHORT = 360;
const view = reactive({ w: 340, h: 420 });
const stageEl = ref<HTMLElement | null>(null);
let resizer: ResizeObserver | null = null;
function fitView(): void {
  const el = stageEl.value;
  if (!el) return;
  const W = el.clientWidth;
  const H = el.clientHeight;
  if (W <= 0 || H <= 0) return;
  const k = VIEW_SHORT / Math.min(W, H);
  view.w = Math.round(Math.min(ARENA_W, W * k));
  view.h = Math.round(Math.min(ARENA_H, H * k));
  // Mudar o tamanho do canvas apaga o contexto: as configurações voltam no próximo quadro (`draw` refaz tudo).
  if (ctx) ctx.imageSmoothingEnabled = false;
}
const JOY_MAX = 42;

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

function recordRun(s: SurvivorSummary): void {
  recordEvent({ type: 'minigame', game: 'sobrevivencia', won: s.kills > 0, score: survivorScore(s) });
  const beforeInfinite = trainer.value.torre.infiniteUnlocked;
  recordEvent({ type: 'survivor', survivedMs: s.survivedMs, trainersBeaten: s.trainersBeaten, bossesBeaten: s.bossesBeaten, clearedTorre: s.finalBossBeaten, infinite: s.infinite });
  runUnlockedInfinite.value = s.finalBossBeaten && !beforeInfinite;
  const today = new Date().toISOString().slice(0, 10);
  const last = trainer.value.torre.lastClearBonusDay;
  const canClearBonus = s.finalBossBeaten && last !== today;
  if (canClearBonus) trainer.value.torre.lastClearBonusDay = today;
  const total = survivorCoins(s) + (canClearBonus ? SURVIVOR_CLEAR_BONUS : 0);
  runCoins.value = total > 0 ? addCoins(total) : 0;
  runClearBonus.value = canClearBonus ? SURVIVOR_CLEAR_BONUS : 0;
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

interface PickOption {
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
const pendingUpgrade = ref<SurvivorUpgradeOption[] | null>(null);
const summary = ref<SurvivorSummary | null>(null);
/** Tela de escolha antes de cada corrida: 3 Pokémon aleatórios da caixa do jogador, pra ele dizer quem joga
 * dessa vez. Null enquanto ainda está sorteando/carregando os retratos; [] se a caixa estiver vazia (cai pro
 * Pikachu de reserva sem tela de escolha, igual ao comportamento antigo). */
const pickOptions = ref<PickOption[] | null>(null);
const pickBusy = ref(false);
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
let bossSprite: Sprite | null = null;
let kindSprites: (Sprite | null)[] = [];
let kindCount = WILD_DEX_IDS.length;
let rafId = 0;
/**
 * A tela saiu (fechou a Torre). O carregamento da corrida espera sprites e o chão; se a pessoa sai no meio dele, nada
 * pode recomeçar o laço depois (antes o `beginRun` terminava e ligava um requestAnimationFrame que nunca parava).
 */
let disposed = false;
let lastTs = 0;
let animMs = 0;
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
  if (joystick.active || !ready.value || summary.value || pickOptions.value) return;
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
  const sprite = e.boss ? bossSprite : (kindSprites[e.kind] ?? null);
  // Grau: elite com anel dourado, chefão (do treinador) com anel vermelho — ajuda a reconhecer na correria.
  if (e.grade !== 'comum') {
    ctx.strokeStyle = e.grade === 'chefao' ? '#e8453c' : '#ffd84a';
    ctx.lineWidth = e.grade === 'chefao' ? 3 : 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, (e.grade === 'chefao' ? 22 : 18), 0, Math.PI * 2);
    ctx.stroke();
  }
  const scale = e.boss ? 1.2 : e.grade === 'chefao' ? 1.3 : e.grade === 'elite' ? 1.1 : 1;
  drawSprite(sprite, e.x, e.y, false, scale);
  // Efeitos do golpe no inimigo: um pontinho colorido em cima (queimando, lento, atordoado).
  const marks: string[] = [];
  if (e.burnMs) marks.push(state.value?.player.move.color ?? '#ff7a2f');
  if (e.slowMs) marks.push('#9fe8ff');
  if (e.stunMs) marks.push('#ffe23d');
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
  if (groundPattern) {
    ctx.fillStyle = groundPattern;
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  } else {
    ctx.fillStyle = '#4e9a62';
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  }
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
    ctx.fillStyle = move.color;
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

  // Pulsos da aura, explosões da área e o brilho da evolução.
  for (const f of s.fx) {
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

function loop(ts: number): void {
  if (disposed) {
    rafId = 0;
    return;
  }
  rafId = requestAnimationFrame(loop);
  const dt = Math.min(48, ts - lastTs || 16);
  lastTs = ts;
  if (document.hidden || !state.value) return;
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
        summary.value = ev.summary;
        recordRun(ev.summary);
      }
      else if (ev.type === 'trainerSpawn') say(ev.final ? 'CHEFAO FINAL! 6 Pokemon!' : 'Um treinador! 3 Pokemon mais fortes.');
      else if (ev.type === 'trainerDown') say(ev.final ? 'CHEFAO DERROTADO!' : 'Treinador derrotado!');
    }
  }
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

/** Sorteia 3 Pokémon distintos da caixa do jogador (cartas já guardadas) pra ele escolher quem joga dessa vez.
 * Caixa vazia (nenhuma carta ainda) não trava nada: cai pro Pikachu de reserva sem tela de escolha, como antes. */
async function rollPickOptions(): Promise<PickOption[]> {
  const cache = await getCache();
  const cards = await cache.list();
  const byDex = new Map<number, string>();
  for (const c of cards) {
    const dexId = c.dexIds[0];
    if (dexId !== undefined && !byDex.has(dexId)) byDex.set(dexId, c.name);
  }
  // Digital Pokémon entram no mesmo sorteio (Fase 6): não vêm de carta nenhuma, mas jogam igual a qualquer outro.
  for (const d of props.digital ?? []) if (!byDex.has(d.dexId)) byDex.set(d.dexId, d.name);
  const pool = [...byDex.entries()];
  if (pool.length === 0) return [];
  const chosen = shuffle(pool, seededRng((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0)).slice(0, 3);
  const thumbs = await Promise.all(
    chosen.map(([dexId]) =>
      getLocalVillageSprite(dexId, false, 'Idle')
        .then((g) => (g ? toSprite(g).frames[0]?.toDataURL() ?? null : null))
        .catch(() => null)
        // Fora do pacote local: o sprite público da espécie (o mesmo que a Torre baixa para jogar).
        .then((url) => url ?? pokemonSpriteUrl(dexId)),
    ),
  );
  return chosen.map(([dexId, name], i) => {
    const { move, profile, types } = attackOf(dexId);
    return { dexId, name, types, move, bars: profileBars(move, profile), thumb: thumbs[i] ?? null };
  });
}

async function beginRun(dexId: number, name: string, picked?: PokemonType, infinite = false): Promise<void> {
  pickBusy.value = true;
  try {
    avatarName.value = name;
    evolving.value = null;
    await loadSpriteSpecies();
    const [player, boss, ...kinds] = await Promise.all([
      loadSpriteOrNull(dexId),
      bossSprite ? Promise.resolve(bossSprite) : loadSpriteOrNull(BOSS_DEX_ID),
      ...(kindSprites.length > 0 ? kindSprites.map((s) => Promise.resolve(s)) : WILD_DEX_IDS.map((id) => loadSpriteOrNull(id))),
    ]);
    playerSprite = player;
    bossSprite = boss;
    kindSprites = kinds;
    kindCount = WILD_DEX_IDS.length;

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
    pendingUpgrade.value = null;
    const { move, profile } = attackOf(dexId, picked);
    state.value = createSurvivorState(Math.floor(Math.random() * 2 ** 31), { kindCount, move, profile, dexId, evolutions: evolutionsFor, infinite });
    ready.value = true;
    lastTs = performance.now();
    if (!rafId) rafId = requestAnimationFrame(loop);
  } catch {
    failed.value = true;
  } finally {
    pickBusy.value = false;
  }
}

function choosePlayer(opt: PickOption, picked?: PokemonType): void {
  unlockSound();
  void beginRun(opt.dexId, opt.name, picked, infiniteWanted.value && torre.value.infiniteUnlocked);
}

/** Tela "qual tipo?" aberta: a opcao clicada tem dois tipos. */
const typeChoice = ref<PickOption | null>(null);
/** Marcou "Modo infinito" na tela de escolha (so vale se ja estiver destravado). */
const infiniteWanted = ref(false);
const torre = computed(() => trainer.value.torre);
function openTypeChoice(opt: PickOption): void { typeChoice.value = opt; }
watch(() => torre.value.infiniteUnlocked, (ok) => { if (!ok) infiniteWanted.value = false; });

/** Abre a tela de escolha de novo (3 novos sorteados) antes de cada corrida, inclusive ao "Jogar de novo". */
async function openPicker(): Promise<void> {
  ready.value = false;
  try {
    const options = await rollPickOptions();
    if (disposed) return;
    if (options.length === 0) {
      // Caixa vazia: sem tela de escolha, igual ao comportamento de antes.
      await beginRun(25, 'Pikachu');
      return;
    }
    pickOptions.value = options;
  } catch {
    failed.value = true;
  }
}

function playAgain(): void {
  unlockSound();
  cancelAnimationFrame(rafId);
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
  cancelAnimationFrame(rafId);
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
            <span class="chip">⏱ {{ formatTime(state.elapsedMs) }}</span>
            <span class="chip">☠ {{ state.kills }}</span>
            <span class="chip">🌊 Onda {{ state.wave }}</span>
          </div>
        </div>

        <div v-if="ready && !summary && joystick.active" class="survivor-joy-base active" :style="{ left: `${joystick.lx}px`, top: `${joystick.ly}px` }" aria-hidden="true">
          <div class="survivor-joy-stick" :style="{ transform: `translate(${joystick.dx * JOY_MAX}px, ${joystick.dy * JOY_MAX}px)` }"></div>
        </div>
        <p v-if="ready && !summary && !joystick.active && !pickOptions && state && state.elapsedMs < 6000" class="survivor-move-hint">Arraste em qualquer lugar para andar</p>

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
            <p class="note">3 Pokémon sorteados da sua caixa.</p>
            <div v-if="torre.infiniteUnlocked" class="survivor-mode" role="group" aria-label="Modo da Torre">
              <button type="button" :class="{ active: !infiniteWanted }" @click="infiniteWanted = false">🗼 Normal<small>Chefão aos 20 min</small></button>
              <button type="button" :class="{ active: infiniteWanted }" @click="infiniteWanted = true">♾️ Infinito<small>Mais difícil, sem fim</small></button>
            </div>
            <div class="survivor-pick-grid">
              <button
                v-for="opt in pickOptions"
                :key="opt.dexId"
                type="button"
                class="survivor-pick-btn"
                :disabled="pickBusy"
                @click="opt.types.length > 1 ? openTypeChoice(opt) : choosePlayer(opt, opt.types[0])"
              >
                <img v-if="opt.thumb" :src="opt.thumb" :alt="opt.name" class="survivor-pick-thumb" />
                <span v-else class="survivor-pick-thumb placeholder" aria-hidden="true">?</span>
                <strong>{{ opt.name }}</strong>
                <small class="survivor-pick-move" :style="{ '--move': opt.move.color }">{{ opt.move.icon }} {{ opt.move.name }}</small>
                <small class="survivor-pick-kind">{{ MOVE_CATEGORY_LABELS_PT[opt.move.category] }} · {{ MOVE_EFFECT_LABELS_PT[opt.move.effect] }}</small>
                <span class="survivor-pick-bars" :style="{ '--move': opt.move.color }">
                  <span v-for="b in opt.bars" :key="b.label" class="survivor-pick-bar"><small>{{ b.label }}</small><i><b :style="{ width: Math.round(b.value * 100) + '%' }"></b></i></span>
                </span>
                <small v-if="opt.move.estimated" class="survivor-pick-kind">Sem stats desta espécie: números médios.</small>
              </button>
            </div>
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
            <p class="survivor-coins" role="status">
              {{ runCoins > 0 ? `🪙 +${runCoins} moedas` : 'Sem moedas desta vez: dure 20 segundos ou derrote alguém.' }}
              <small v-if="runClearBonus > 0"> (inclui o bônus de {{ runClearBonus }} por zerar, 1× por dia)</small>
            </p>
            <p v-if="summary.finalBossBeaten" class="survivor-cleared" role="status">🏆 Chefão final derrotado!<small v-if="runUnlockedInfinite"> Modo infinito destravado.</small></p>
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
