<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { assetUrl, getCache, getLocalVillageSprite } from '../app/services';
import { recordEvent } from '../app/trainer-store';
import { addCoins } from '../app/wallet';
import { seededRng } from '../core/battle';
import { shuffle } from '../core/minigames';
import {
  applyUpgrade,
  ARENA_H,
  ARENA_W,
  createSurvivorState,
  stepSurvivor,
} from '../core/survivor';
import type { SurvivorEnemy, SurvivorState, SurvivorSummary, SurvivorUpgradeOption } from '../core/survivor';
import type { DecodedGif } from '../core/gif';
import { speciesTiles } from '../core/size-scale';
import { contentBounds } from '../village/local-sprite';
import type { ContentBounds } from '../village/local-sprite';

/** Ícone por upgrade, só pra ficar mais fácil de reconhecer na hora do susto do nível — não muda a lógica. */
const UPGRADE_ICON: Record<string, string> = {
  power: '💥', haste: '⏳', legs: '👟', vigor: '❤️', range: '📏', multishot: '🎯', pierce: '🏹', magnet: '🧲',
};

/**
 * Zona de Sobrevivência: um modo próprio da Vila (como a Arena e a Pista de Pins), aberto pela Torre — não é um
 * minigame do Fliperama. Você anda com o analógico (ou WASD/setas), seu Pokémon ataca sozinho quem chegar perto,
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
const WILD_DEX_IDS = [16, 19, 21, 23, 41, 74, 129, 161, 165, 261, 265, 27] as const;
/** Chefe periódico: maior, mais forte, sprite fixo (todas as espécies do pacote têm as 7 animações; ver village-sprite-meta.json). */
const BOSS_DEX_ID = 95;

const VIEW_W = 340;
const VIEW_H = 420;
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

async function loadSpriteOrNull(dexId: number): Promise<Sprite | null> {
  try {
    const gif = await getLocalVillageSprite(dexId, false, 'Walk');
    return gif ? toSprite(gif, dexId) : null;
  } catch {
    return null;
  }
}

function recordRun(s: SurvivorSummary): void {
  const score = clamp(Math.round(s.survivedMs / 1000 + s.kills * 2 + s.level * 5), 0, 100);
  recordEvent({ type: 'minigame', game: 'sobrevivencia', won: s.kills > 0, score });
  // Bônus de moedas (saldo único, `app/wallet.ts`) proporcional à pontuação da corrida, além das moedas do XP.
  if (s.kills > 0) addCoins(Math.max(5, Math.round(score / 2)));
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

let ctx: CanvasRenderingContext2D | null = null;
let groundPattern: CanvasPattern | null = null;
let playerSprite: Sprite | null = null;
let bossSprite: Sprite | null = null;
let kindSprites: (Sprite | null)[] = [];
let kindCount = WILD_DEX_IDS.length;
let rafId = 0;
let lastTs = 0;
let animMs = 0;
const heldKeys = new Set<string>();
const joystick = { active: false, pointerId: null as number | null, cx: 0, cy: 0, dx: 0, dy: 0 };

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
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  joystick.active = true;
  joystick.pointerId = e.pointerId;
  joystick.cx = rect.left + rect.width / 2;
  joystick.cy = rect.top + rect.height / 2;
  el.setPointerCapture(e.pointerId);
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
  // O chefe (Onix, 8,8 m) já sai no tamanho máximo pela altura real; o extra só destaca quem é o chefe.
  drawSprite(sprite, e.x, e.y, false, e.boss ? 1.2 : 1);
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

  for (const e of s.enemies) drawEnemy(e);

  const blink = s.player.invulnMs > 0 && Math.floor(animMs / 80) % 2 === 0;
  if (!blink) drawSprite(playerSprite, s.player.x, s.player.y, s.player.facing < 0, 1);

  ctx.fillStyle = '#fffbe0';
  for (const proj of s.projectiles) {
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function loop(ts: number): void {
  rafId = requestAnimationFrame(loop);
  const dt = Math.min(48, ts - lastTs || 16);
  lastTs = ts;
  if (document.hidden || !state.value) return;
  animMs += dt;
  const s = state.value;
  if (!s.over && !s.pendingUpgrade) {
    const kx = (heldKeys.has('right') ? 1 : 0) - (heldKeys.has('left') ? 1 : 0);
    const ky = (heldKeys.has('down') ? 1 : 0) - (heldKeys.has('up') ? 1 : 0);
    const dx = kx + (joystick.active ? joystick.dx : 0);
    const dy = ky + (joystick.active ? joystick.dy : 0);
    const events = stepSurvivor(s, { dx, dy }, dt);
    for (const ev of events) {
      if (ev.type === 'gameover') {
        summary.value = ev.summary;
        recordRun(ev.summary);
      }
    }
  }
  pendingUpgrade.value = s.pendingUpgrade;
  draw();
}

function chooseUpgrade(id: string): void {
  if (!state.value) return;
  applyUpgrade(state.value, id);
  pendingUpgrade.value = null;
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
        .catch(() => null),
    ),
  );
  return chosen.map(([dexId, name], i) => ({ dexId, name, thumb: thumbs[i] ?? null }));
}

async function beginRun(dexId: number, name: string): Promise<void> {
  pickBusy.value = true;
  try {
    avatarName.value = name;
    const [player, boss, ...kinds] = await Promise.all([
      loadSpriteOrNull(dexId),
      bossSprite ? Promise.resolve(bossSprite) : loadSpriteOrNull(BOSS_DEX_ID),
      ...(kindSprites.length > 0 ? kindSprites.map((s) => Promise.resolve(s)) : WILD_DEX_IDS.map((id) => loadSpriteOrNull(id))),
    ]);
    playerSprite = player;
    bossSprite = boss;
    kindSprites = kinds;
    kindCount = WILD_DEX_IDS.length;

    if (!groundPattern) {
      const groundImg = new Image();
      groundImg.src = assetUrl('tilesets/survivor-grass.png');
      await new Promise<void>((resolve) => {
        groundImg.onload = () => resolve();
        groundImg.onerror = () => resolve();
      });
      if (ctx && groundImg.naturalWidth > 0) groundPattern = ctx.createPattern(groundImg, 'repeat');
    }

    pickOptions.value = null;
    summary.value = null;
    pendingUpgrade.value = null;
    state.value = createSurvivorState(Math.floor(Math.random() * 2 ** 31), { kindCount });
    ready.value = true;
    lastTs = performance.now();
    if (!rafId) rafId = requestAnimationFrame(loop);
  } catch {
    failed.value = true;
  } finally {
    pickBusy.value = false;
  }
}

function choosePlayer(opt: PickOption): void {
  void beginRun(opt.dexId, opt.name);
}

/** Abre a tela de escolha de novo (3 novos sorteados) antes de cada corrida, inclusive ao "Jogar de novo". */
async function openPicker(): Promise<void> {
  ready.value = false;
  try {
    const options = await rollPickOptions();
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
  cancelAnimationFrame(rafId);
  rafId = 0;
  void openPicker();
}

onMounted(() => {
  ctx = canvasEl.value?.getContext('2d') ?? null;
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  void openPicker();
});
onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
});
</script>

<template>
  <div class="survivor">
    <p v-if="failed" class="hint">Não deu para carregar a Zona de Sobrevivência agora. Tente de novo mais tarde.</p>
    <template v-else>
      <div class="survivor-stage" :style="{ width: VIEW_W + 'px', height: VIEW_H + 'px' }">
        <canvas ref="canvasEl" :width="VIEW_W" :height="VIEW_H" class="survivor-canvas"></canvas>

        <div class="survivor-vignette" aria-hidden="true"></div>

        <div v-if="ready && state" class="survivor-hud">
          <div class="survivor-hp" :class="{ low: state.player.hp / state.player.maxHp < 0.3 }">
            <div class="survivor-hp-fill" :style="{ width: Math.max(0, (state.player.hp / state.player.maxHp) * 100) + '%' }"></div>
            <span>{{ avatarName }} · Nv {{ state.player.level }}</span>
          </div>
          <div class="survivor-stats">
            <span class="chip">⏱ {{ formatTime(state.elapsedMs) }}</span>
            <span class="chip">☠ {{ state.kills }}</span>
            <span class="chip">🌊 Onda {{ state.wave }}</span>
          </div>
        </div>

        <div
          v-if="ready && !summary"
          class="survivor-joy-base"
          :class="{ active: joystick.active }"
          @pointerdown.prevent="joyDown"
          @pointermove.prevent="joyMove"
          @pointerup.prevent="joyUp"
          @pointercancel.prevent="joyUp"
        >
          <div class="survivor-joy-stick" :style="{ transform: `translate(${joystick.dx * JOY_MAX}px, ${joystick.dy * JOY_MAX}px)` }"></div>
        </div>

        <div v-if="pickOptions" class="survivor-overlay" role="dialog" aria-label="Escolha quem joga">
          <div class="card survivor-pick">
            <h2>Quem vai pra Torre dessa vez?</h2>
            <p class="note">3 Pokémon sorteados da sua caixa.</p>
            <div class="survivor-pick-grid">
              <button
                v-for="opt in pickOptions"
                :key="opt.dexId"
                type="button"
                class="survivor-pick-btn"
                :disabled="pickBusy"
                @click="choosePlayer(opt)"
              >
                <img v-if="opt.thumb" :src="opt.thumb" :alt="opt.name" class="survivor-pick-thumb" />
                <span v-else class="survivor-pick-thumb placeholder" aria-hidden="true">?</span>
                <strong>{{ opt.name }}</strong>
              </button>
            </div>
            <p v-if="pickBusy" class="note" role="status">Preparando a corrida…</p>
          </div>
        </div>

        <div v-if="pendingUpgrade" class="survivor-overlay" role="dialog" aria-label="Escolha um upgrade">
          <div class="card survivor-upgrades">
            <h2>Subiu de nível!</h2>
            <button v-for="u in pendingUpgrade" :key="u.id" type="button" class="survivor-upgrade-btn" @click="chooseUpgrade(u.id)">
              <span class="survivor-upgrade-icon" aria-hidden="true">{{ UPGRADE_ICON[u.id] ?? '✨' }}</span>
              <span class="survivor-upgrade-text"><strong>{{ u.name }}</strong><small>{{ u.description }}</small></span>
            </button>
          </div>
        </div>

        <div v-if="summary" class="survivor-overlay" role="dialog" aria-label="Fim da corrida">
          <div class="card survivor-summary">
            <h2>Fim de jogo</h2>
            <div class="survivor-summary-grid">
              <div><strong>{{ formatTime(summary.survivedMs) }}</strong><small>Tempo</small></div>
              <div><strong>Nv {{ summary.level }}</strong><small>Nível</small></div>
              <div><strong>{{ summary.kills }}</strong><small>Derrotas</small></div>
              <div><strong>{{ summary.wave }}</strong><small>Onda</small></div>
            </div>
            <button type="button" class="primary" @click="playAgain">Jogar de novo</button>
            <button type="button" class="link" @click="leaveNow">Voltar aos jogos</button>
          </div>
        </div>

        <p v-if="!ready && !pickOptions" class="hint survivor-loading">Carregando a Zona de Sobrevivência…</p>
      </div>
      <p class="note">Ande com o analógico (ou WASD/setas); seu Pokémon ataca sozinho quem chegar perto. Ondas cada vez maiores e um chefe de tempos em tempos. Chão e inimigos: créditos no rodapé do app.</p>
    </template>
  </div>
</template>
