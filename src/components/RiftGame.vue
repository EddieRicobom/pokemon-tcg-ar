<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, triggerRef } from 'vue';
import {
  createRiftState, createRiftWorld, RIFT_MAX_ALLIES, RIFT_TILE, RIFT_WEAPONS, RIFT_W, RIFT_H, RIFT_SANCTUARY,
  riftCapture, riftRespawn, riftSpawnBoss, riftSpawnEnemy, riftTile, riftUsePotion, riftWalkable, riftZone,
  stepRift, toggleRiftWeapon, riftToggleAlly, type RiftEvent, type RiftWorld,
} from '../core/rift';
import { applyRiftSave, clearRiftSave, readRiftSave, riftSaveOf, writeRiftSave } from '../app/rift-store';
import { addCoins } from '../app/wallet';
import { vibrate } from '../app/haptics';
import { pokemonSpriteUrl } from '../ar/sprite-url';
import { profile } from '../app/profile-store';
import { trainerSpriteUrl } from '../core/trainer-sprites';

const emit = defineEmits<{ close: [] }>();

const world: RiftWorld = createRiftWorld();
const state = shallowRef(createRiftState(world.seed));
const loaded = readRiftSave();
if (loaded) {
  applyRiftSave(state.value, loaded);
  if (!riftWalkable(world, state.value.player.x, state.value.player.y)) {
    state.value.player.x = RIFT_SANCTUARY.x * RIFT_TILE + 16;
    state.value.player.y = (RIFT_SANCTUARY.y + 2) * RIFT_TILE + 16;
  }
}

let rngSeed = ((state.value.seed ^ Date.now()) >>> 0) || 1;
const rng = (): number => { rngSeed = (Math.imul(rngSeed, 1664525) + 1013904223) >>> 0; return rngSeed / 4294967296; };

const canvas = ref<HTMLCanvasElement | null>(null);
const mini = ref<HTMLCanvasElement | null>(null);
const padEl = ref<HTMLElement | null>(null);
const menuOpen = ref(false);
const attackHeld = ref(false);
const toast = ref('');
const toastMs = ref(0);
const damageFlash = ref(0);
const resetArmed = ref(false);
const pad = reactive({ active: false, dx: 0, dy: 0, cx: 0, cy: 0 });
const keys = new Set<string>();
let dodgeRequested = false;
let camX = state.value.player.x;
let camY = state.value.player.y;
let raf = 0;
let last = 0;
let savedAt = 0;
let spawnAt = 0;
let bossAt = 0;
let minimapAt = 0;
let hudAt = 0;
let mapLayer: HTMLCanvasElement | null = null;
let resetTimer: ReturnType<typeof setTimeout> | null = null;
const floaters: { x: number; y: number; text: string; color: string; born: number }[] = [];
const swings: { x: number; y: number; angle: number; range: number; arc: number; color: string; born: number }[] = [];
const sprites = new Map<number, HTMLImageElement>();
const trainer = new Image();
trainer.src = trainerSpriteUrl(profile.sprite);

const player = computed(() => ({ ...state.value.player }));
const hpPct = computed(() => Math.max(0, Math.min(100, (player.value.hp / player.value.maxHp) * 100)));
const xpPct = computed(() => Math.max(0, Math.min(100, (player.value.xp / Math.max(1, player.value.xpNext)) * 100)));
const zone = computed(() => riftZone(player.value.x, player.value.y));
const weapon = computed(() => RIFT_WEAPONS[player.value.weapon] ?? RIFT_WEAPONS.espada!);
const captureTarget = computed(() => {
  const p = state.value.player;
  return state.value.enemies.find((enemy) => !enemy.boss && enemy.hp / enemy.maxHp <= 0.35 && Math.hypot(enemy.x - p.x, enemy.y - p.y) <= 160) ?? null;
});
const attackFill = computed(() => Math.min(100, (player.value.attackMs / Math.max(1, weapon.value.cooldownMs)) * 100));
const dodgeFill = computed(() => Math.min(100, (player.value.dodgeCdMs / 1300) * 100));

function say(text: string): void {
  toast.value = text;
  toastMs.value = 2600;
}

function spriteFor(dexId: number): HTMLImageElement {
  let image = sprites.get(dexId);
  if (!image) {
    image = new Image();
    image.src = pokemonSpriteUrl(dexId);
    sprites.set(dexId, image);
  }
  return image;
}

function save(): void {
  if (writeRiftSave(riftSaveOf(state.value))) savedAt = performance.now();
}

function handleEvents(events: RiftEvent[], now: number): void {
  for (const event of events) {
    if (event.kind === 'swing') swings.push({ ...event, born: now });
    else if (event.kind === 'hit') floaters.push({ x: event.x, y: event.y - 18, text: `${event.damage}${event.crit ? '!' : ''}`, color: event.crit ? '#ffe066' : '#fff', born: now });
    else if (event.kind === 'down') floaters.push({ x: event.x, y: event.y - 34, text: `+${event.xp} XP`, color: '#9ff5d0', born: now });
    else if (event.kind === 'hurt') { damageFlash.value = 220; vibrate({ kind: 'hit', strength: 0.5 }, true); }
    else if (event.kind === 'level') { say(`Nível ${event.level}! Vida restaurada.`); vibrate({ kind: 'win' }, true); save(); }
    else if (event.kind === 'captured') { say(`${event.name} entrou na sua equipe!`); vibrate({ kind: 'reaction' }, true); save(); }
    else if (event.kind === 'loot') say(event.text);
    else if (event.kind === 'message') say(event.text);
    else if (event.kind === 'dead') { say('Você caiu na Fenda. Volte à clareira.'); vibrate({ kind: 'lose' }, true); }
  }
}

function movement(): { x: number; y: number } {
  let x = pad.active ? pad.dx : 0;
  let y = pad.active ? pad.dy : 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) x -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) x += 1;
  if (keys.has('ArrowUp') || keys.has('KeyW')) y -= 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) y += 1;
  const length = Math.hypot(x, y);
  return length > 1 ? { x: x / length, y: y / length } : { x, y };
}

function spawn(now: number): void {
  if (now < spawnAt || state.value.dead) return;
  spawnAt = now + 1400;
  state.value.enemies = state.value.enemies.filter((enemy) => enemy.boss || Math.hypot(enemy.x - state.value.player.x, enemy.y - state.value.player.y) < 2200);
  if (state.value.enemies.length >= 24) return;
  const enemy = riftSpawnEnemy(world, state.value, rng);
  if (enemy) state.value.enemies.push(enemy);
  if (now >= bossAt) {
    bossAt = now + 2600;
    const boss = riftSpawnBoss(state.value, zone.value);
    if (boss) { state.value.enemies.push(boss); say(`${boss.name} bloqueia o caminho!`); }
  }
}

function frame(now: number): void {
  raf = requestAnimationFrame(frame);
  const dt = last ? Math.min(50, now - last) : 16;
  last = now;
  if (toastMs.value > 0) toastMs.value = Math.max(0, toastMs.value - dt);
  if (damageFlash.value > 0) damageFlash.value = Math.max(0, damageFlash.value - dt);
  if (!menuOpen.value && !state.value.dead) {
    const move = movement();
    const defeated = state.value.defeated.length;
    const events = stepRift(world, state.value, {
      moveX: move.x, moveY: move.y,
      attack: attackHeld.value || keys.has('Space') || keys.has('KeyJ'),
      dodge: dodgeRequested,
    }, dt, []);
    dodgeRequested = false;
    handleEvents(events, now);
    if (state.value.defeated.length > defeated) {
      addCoins(40);
      say(`Chefe derrotado! +40 moedas.`);
      save();
    }
    spawn(now);
    if (now - savedAt > 4000) save();
  }
  if (now - hudAt > 90) { hudAt = now; triggerRef(state); }
  draw(now);
}

const TILE_COLORS = ['#2e6b47', '#b9a373', '#2b6c96', '#4b5058', '#5a5566', '#b0432c', '#2e6b47', '#2e6b47', '#5a5566', '#2c2238', '#8a6136', '#2e6b47', '#2e6b47', '#5a5148'] as const;
const MAP_COLORS = ['#2e6b47', '#b9a373', '#2b6c96', '#4b5058', '#5a5566', '#b0432c', '#1f4a32', '#26573a', '#3d4048', '#201a2b', '#8a6136', '#3a7a4f', '#3a7a4f', '#5a5148'] as const;

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, n: number): void {
  const sway = Math.sin((n % 100) + x * 0.02) * 1.5;
  const dark = ['#1f5736', '#245c3c', '#1d5133'][n % 3]!;
  const light = ['#2f7a48', '#357f4e', '#2b7044'][n % 3]!;
  ctx.fillStyle = '#00000030';
  ctx.beginPath(); ctx.ellipse(x + 18, y + 29, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5a3a26';
  ctx.fillRect(x + 14, y + 14, 5, 16);
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.arc(x + 16 + sway, y + 3, 11, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 8 + sway, y + 9, 8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 24 + sway, y + 9, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = light;
  ctx.beginPath(); ctx.arc(x + 12 + sway, y + 1, 6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 21 + sway, y + 4, 4, 0, Math.PI * 2); ctx.fill();
}
function drawBush(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#00000024';
  ctx.beginPath(); ctx.ellipse(x + 16, y + 27, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2d7047';
  ctx.beginPath(); ctx.arc(x + 11, y + 22, 7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 21, y + 22, 7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 16, y + 18, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3d8a57';
  ctx.beginPath(); ctx.arc(x + 14, y + 18, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b84a4a';
  ctx.beginPath(); ctx.arc(x + 20, y + 23, 1.6, 0, Math.PI * 2); ctx.fill();
}
function drawFlower(ctx: CanvasRenderingContext2D, x: number, y: number, n: number): void {
  const colors = ['#ffe066', '#ff9db1', '#b9a5ff', '#ffffff'];
  ctx.fillStyle = '#2a6b45';
  ctx.fillRect(x + 15, y + 22, 2, 6);
  ctx.fillStyle = colors[n % colors.length]!;
  ctx.beginPath(); ctx.arc(x + 16, y + 20, 3, 0, Math.PI * 2); ctx.fill();
  if (n % 3 === 0) { ctx.fillStyle = '#ffffffaa'; ctx.beginPath(); ctx.arc(x + 13, y + 24, 2, 0, Math.PI * 2); ctx.fill(); }
}
function drawMushroom(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#00000020';
  ctx.beginPath(); ctx.ellipse(x + 16, y + 27, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f2e6c8';
  ctx.fillRect(x + 14, y + 20, 4, 7);
  ctx.fillStyle = '#b84a4a';
  ctx.beginPath(); ctx.arc(x + 16, y + 19, 7, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#ffffffcc';
  ctx.beginPath(); ctx.arc(x + 13, y + 16, 1.4, 0, Math.PI * 2); ctx.fill();
}
function drawColumn(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#00000030';
  ctx.beginPath(); ctx.ellipse(x + 20, y + 28, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6f6a78';
  ctx.fillRect(x + 12, y + 8, 12, 20);
  ctx.fillStyle = '#8d8798';
  ctx.fillRect(x + 10, y + 5, 16, 4);
  ctx.fillRect(x + 9, y + 26, 18, 4);
  ctx.fillStyle = '#4a4552';
  ctx.fillRect(x + 14, y + 12, 3, 12);
}
function drawObsidian(ctx: CanvasRenderingContext2D, x: number, y: number, n: number): void {
  ctx.fillStyle = '#00000030';
  ctx.beginPath(); ctx.ellipse(x + 16, y + 27, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2b1f3d';
  ctx.beginPath(); ctx.moveTo(x + 8, y + 27); ctx.lineTo(x + 13, y + 10 + (n % 5)); ctx.lineTo(x + 19, y + 27); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#4b3570';
  ctx.beginPath(); ctx.moveTo(x + 17, y + 27); ctx.lineTo(x + 23, y + 15 + (n % 4)); ctx.lineTo(x + 27, y + 27); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#a37bd6aa'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + 13, y + 12); ctx.lineTo(x + 16, y + 26); ctx.stroke();
}
function drawBridge(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#8a6136';
  ctx.fillRect(x, y, RIFT_TILE, RIFT_TILE);
  ctx.fillStyle = '#a87b45';
  for (let i = 0; i < 4; i++) ctx.fillRect(x + 1, y + 3 + i * 8, RIFT_TILE - 2, 5);
  ctx.fillStyle = '#5a3f25';
  for (let i = 0; i < 4; i++) ctx.fillRect(x + 1, y + 8 + i * 8, RIFT_TILE - 2, 1.5);
}
function drawBoulder(ctx: CanvasRenderingContext2D, x: number, y: number, n: number): void {
  ctx.fillStyle = '#00000030';
  ctx.beginPath(); ctx.ellipse(x + 17, y + 27, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#565b63';
  ctx.beginPath(); ctx.ellipse(x + 16, y + 19, 13, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#767d86';
  ctx.beginPath(); ctx.ellipse(x + 12 + (n % 3), y + 15, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
}
function drawAsh(ctx: CanvasRenderingContext2D, x: number, y: number, n: number): void {
  ctx.fillStyle = '#5a5148';
  ctx.fillRect(x, y, RIFT_TILE, RIFT_TILE);
  ctx.fillStyle = '#6b6055';
  if (n % 4 === 0) ctx.fillRect(x + (n % 24), y + (n % 20), 3, 2);
  if (n % 17 === 0) { ctx.fillStyle = '#ff8b3d'; ctx.fillRect(x + 8, y + 9, 2, 2); }
}
function drawSlab(ctx: CanvasRenderingContext2D, x: number, y: number, n: number): void {
  ctx.strokeStyle = '#0000002a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 2, y + 2, RIFT_TILE - 4, RIFT_TILE - 4);
  ctx.strokeStyle = '#ffffff10';
  ctx.beginPath(); ctx.moveTo(x + 5, y + 8); ctx.lineTo(x + 12, y + 5); ctx.stroke();
  if (n % 13 === 0) {
    ctx.fillStyle = '#6e6878';
    ctx.fillRect(x + 6 + (n % 14), y + 20, 4, 2.5);
    ctx.fillRect(x + 18, y + 11, 3, 2);
  }
  if (n % 29 === 0) {
    ctx.strokeStyle = '#00000030';
    ctx.beginPath(); ctx.moveTo(x + 8, y + 9); ctx.lineTo(x + 14, y + 16); ctx.lineTo(x + 11, y + 24); ctx.stroke();
  }
}
function drawWater(ctx: CanvasRenderingContext2D, x: number, y: number, tx: number, ty: number, now: number): void {
  const wave = Math.sin(now / 420 + tx * 0.7 + ty) * 2;
  ctx.fillStyle = '#ffffff24';
  ctx.fillRect(x + 4, y + 12 + wave, 22, 1.5);
  ctx.fillRect(x + 10, y + 22 - wave, 16, 1.2);
  ctx.fillStyle = '#5fb4d644';
  ctx.fillRect(x + 6, y + 5, 8, 1.5);
}
function drawHouse(ctx: CanvasRenderingContext2D, x: number, y: number, wall: string, roof: string): void {
  ctx.fillStyle = '#00000040';
  ctx.beginPath(); ctx.ellipse(x + 24, y + 38, 28, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = wall;
  ctx.fillRect(x, y + 12, 48, 26);
  ctx.fillStyle = roof;
  ctx.beginPath(); ctx.moveTo(x - 5, y + 13); ctx.lineTo(x + 24, y - 8); ctx.lineTo(x + 53, y + 13); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5a3a2a';
  ctx.fillRect(x + 19, y + 22, 10, 16);
  ctx.fillStyle = '#ffe9a6';
  ctx.fillRect(x + 6, y + 18, 8, 8);
  ctx.fillRect(x + 34, y + 18, 8, 8);
  ctx.fillStyle = '#00000055';
  ctx.fillRect(x + 9, y + 21, 2, 5);
  ctx.fillRect(x + 37, y + 21, 2, 5);
}
function drawFountain(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#00000035';
  ctx.beginPath(); ctx.ellipse(x, y + 12, 34, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8b8377';
  ctx.beginPath(); ctx.ellipse(x, y + 6, 30, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4b8fb3';
  ctx.beginPath(); ctx.ellipse(x, y + 5, 24, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#bfe8ff';
  ctx.beginPath(); ctx.arc(x - 6, y + 3, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8b8377';
  ctx.fillRect(x - 3, y - 18, 6, 18);
  ctx.fillStyle = '#6c665d';
  ctx.beginPath(); ctx.ellipse(x, y - 18, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
}

function draw(now: number): void {
  const element = canvas.value;
  const ctx = element?.getContext('2d');
  if (!element || !ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = element.clientWidth;
  const h = element.clientHeight;
  if (element.width !== Math.round(w * dpr) || element.height !== Math.round(h * dpr)) {
    element.width = Math.round(w * dpr);
    element.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const p = state.value.player;
  camX += (p.x - camX) * 0.16;
  camY += (p.y - camY) * 0.16;
  const worldW = RIFT_W * RIFT_TILE;
  const worldH = RIFT_H * RIFT_TILE;
  camX = Math.max(w / 2, Math.min(worldW - w / 2, camX));
  camY = Math.max(h / 2, Math.min(worldH - h / 2, camY));
  const ox = Math.round(w / 2 - camX);
  const oy = Math.round(h / 2 - camY);
  const fromX = Math.max(0, Math.floor((-ox) / RIFT_TILE));
  const fromY = Math.max(0, Math.floor((-oy) / RIFT_TILE));
  const toX = Math.min(RIFT_W - 1, Math.ceil((w - ox) / RIFT_TILE));
  const toY = Math.min(RIFT_H - 1, Math.ceil((h - oy) / RIFT_TILE));
  for (let ty = fromY; ty <= toY; ty++) for (let tx = fromX; tx <= toX; tx++) {
    const tile = riftTile(world, tx, ty);
    const x = tx * RIFT_TILE + ox;
    const y = ty * RIFT_TILE + oy;
    ctx.fillStyle = TILE_COLORS[tile] ?? TILE_COLORS[0];
    ctx.fillRect(x, y, RIFT_TILE + 1, RIFT_TILE + 1);
    const n = (tx * 73856093 ^ ty * 19349663) >>> 0;
    if (tile === 6) drawTree(ctx, x, y, n);
    else if (tile === 7) drawBush(ctx, x, y);
    else if (tile === 8) drawColumn(ctx, x, y);
    else if (tile === 9) drawObsidian(ctx, x, y, n);
    else if (tile === 10) drawBridge(ctx, x, y);
    else if (tile === 11) drawFlower(ctx, x, y, n);
    else if (tile === 12) drawMushroom(ctx, x, y);
    else if (tile === 13) drawAsh(ctx, x, y, n);
    else if (tile === 3) drawBoulder(ctx, x, y, n);
    else if (tile === 4) drawSlab(ctx, x, y, n);
    else if (tile === 2) drawWater(ctx, x, y, tx, ty, now);
    else if (tile === 5) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 700 + (tx + ty) * 0.6);
      ctx.fillStyle = `rgba(255, 176, 74, ${0.08 + 0.1 * pulse})`;
      ctx.fillRect(x + 3, y + 3, RIFT_TILE - 6, RIFT_TILE - 6);
      if (n % 7 === 0) {
        ctx.strokeStyle = '#6b1e12';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + 4, y + 8); ctx.lineTo(x + 14, y + 13); ctx.lineTo(x + 10, y + 24); ctx.stroke();
      }
      if (n % 11 === 0) { ctx.fillStyle = '#ffcf6a'; ctx.fillRect(x + (n % 20), y + (n % 22), 6, 2); }
    } else if (tile === 1) {
      if (n % 3 === 0) { ctx.fillStyle = '#00000010'; ctx.fillRect(x + (n % 20), y + 8 + (n % 14), 6, 3); }
      if (n % 4 === 0) { ctx.fillStyle = '#00000012'; ctx.fillRect(x + (n % 24), y + 10, 4, 2); }
      if (n % 7 === 0) { ctx.fillStyle = '#00000010'; ctx.beginPath(); ctx.arc(x + 8 + (n % 16), y + 20 + (n % 6), 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#00000020';
      if (![1, 4, 10].includes(riftTile(world, tx, ty - 1))) ctx.fillRect(x, y, RIFT_TILE, 2);
      if (![1, 4, 10].includes(riftTile(world, tx, ty + 1))) ctx.fillRect(x, y + RIFT_TILE - 2, RIFT_TILE, 2);
      if (![1, 4, 10].includes(riftTile(world, tx - 1, ty))) ctx.fillRect(x, y, 2, RIFT_TILE);
      if (![1, 4, 10].includes(riftTile(world, tx + 1, ty))) ctx.fillRect(x + RIFT_TILE - 2, y, 2, RIFT_TILE);
    } else if (tile === 0) {
      if (n % 9 === 0) { ctx.fillStyle = '#00000018'; ctx.fillRect(x + (n % 22), y + (n % 26), 3, 3); }
      if (n % 4 === 0) {
        ctx.strokeStyle = '#1f5736';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 7, y + 26); ctx.lineTo(x + 8, y + 20);
        ctx.moveTo(x + 23, y + 27); ctx.lineTo(x + 24, y + 21);
        ctx.stroke();
      }
    }
  }
  // Clareira da Vila.
  const sx = RIFT_SANCTUARY.x * RIFT_TILE + ox;
  const sy = RIFT_SANCTUARY.y * RIFT_TILE + oy;
  const glow = ctx.createRadialGradient(sx, sy, 10, sx, sy, 140);
  glow.addColorStop(0, '#ffe9a640');
  glow.addColorStop(1, '#ffe9a600');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(sx, sy, 140, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffe9a6aa';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(sx, sy, 54, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#08231ecc';
  ctx.fillRect(sx - 34, sy - 78, 68, 22);
  ctx.fillStyle = '#ffe9a6';
  ctx.font = 'bold 11px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('VILA', sx, sy - 63);
  ctx.textAlign = 'left';
  // Casinhas e fonte da clareira.
  drawHouse(ctx, sx - 146, sy - 104, '#d9c7a6', '#8a3f36');
  drawHouse(ctx, sx + 98, sy - 112, '#c9d6c2', '#3f6a8a');
  drawHouse(ctx, sx - 136, sy + 26, '#d8c09a', '#7a4a2a');
  drawHouse(ctx, sx + 86, sy + 16, '#cfc3d8', '#5a3f7a');
  drawFountain(ctx, sx, sy);

  // Itens no chão.
  for (const item of state.value.loot) {
    const x = item.x + ox;
    const y = item.y + oy;
    ctx.fillStyle = item.kind === 'potion' ? '#ff8fa3' : item.kind === 'ball' ? '#ffffff' : '#ffe066';
    ctx.beginPath(); ctx.arc(x, y - 6, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0d1a14'; ctx.lineWidth = 2; ctx.stroke();
  }

  // Entidades ordenadas por Y.
  type Drawable = { y: number; kind: 'player' | 'enemy' | 'ally'; ref?: unknown };
  const list: Drawable[] = [{ y: p.y, kind: 'player' }];
  for (const enemy of state.value.enemies) list.push({ y: enemy.y, kind: 'enemy', ref: enemy });
  for (const ally of state.value.allies) list.push({ y: ally.y, kind: 'ally', ref: ally });
  list.sort((a, b) => a.y - b.y);
  for (const item of list) {
    if (item.kind === 'player') {
      const x = p.x + ox;
      const y = p.y + oy;
      ctx.fillStyle = '#00000055';
      ctx.beginPath(); ctx.ellipse(x, y + 2, 16, 6, 0, 0, Math.PI * 2); ctx.fill();
      if (trainer.complete && trainer.naturalWidth) {
        const size = 48;
        ctx.save();
        ctx.translate(x, y);
        if (Math.cos(p.facing) < -0.1) ctx.scale(-1, 1);
        ctx.drawImage(trainer, -size / 2, -size, size, size);
        ctx.restore();
      } else {
        ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(x, y - 20, 14, 0, Math.PI * 2); ctx.fill();
      }
      if (p.invulnMs > 0) { ctx.strokeStyle = '#9ff5d0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y - 18, 26, 0, Math.PI * 2); ctx.stroke(); }
    } else if (item.kind === 'enemy') {
      const enemy = item.ref as (typeof state.value.enemies)[number];
      const x = enemy.x + ox;
      const y = enemy.y + oy;
      const size = enemy.boss ? 76 : enemy.elite ? 48 : 40;
      ctx.fillStyle = '#00000055';
      ctx.beginPath(); ctx.ellipse(x, y + 2, size * 0.3, size * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      const img = spriteFor(enemy.dexId);
      if (img.complete && img.naturalWidth) ctx.drawImage(img, x - size / 2, y - size, size, size);
      else { ctx.fillStyle = enemy.boss ? '#b05cff' : '#d05c5c'; ctx.beginPath(); ctx.arc(x, y - size / 2, size * 0.34, 0, Math.PI * 2); ctx.fill(); }
      if (enemy.hp < enemy.maxHp || enemy.boss) {
        const bw = size * 0.72;
        ctx.fillStyle = '#0b1114aa'; ctx.fillRect(x - bw / 2, y - size - 8, bw, 4);
        ctx.fillStyle = enemy.boss ? '#ffd166' : '#ff6b63'; ctx.fillRect(x - bw / 2, y - size - 8, bw * Math.max(0, enemy.hp / enemy.maxHp), 4);
      }
      if (enemy.boss) { ctx.fillStyle = '#ffe9a6'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(enemy.name, x, y - size - 14); ctx.textAlign = 'left'; }
    } else {
      const ally = item.ref as (typeof state.value.allies)[number];
      const x = ally.x + ox;
      const y = ally.y + oy;
      const size = 36;
      ctx.strokeStyle = '#78b7ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y + 2, 14, 5, 0, 0, Math.PI * 2); ctx.stroke();
      const img = spriteFor(ally.dexId);
      if (img.complete && img.naturalWidth) ctx.drawImage(img, x - size / 2, y - size, size, size);
      else { ctx.fillStyle = '#78b7ff'; ctx.beginPath(); ctx.arc(x, y - size / 2, size * 0.34, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  // Projéteis.
  for (const shot of state.value.projectiles) {
    const x = shot.x + ox;
    const y = shot.y + oy;
    ctx.fillStyle = shot.color;
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff88';
    ctx.beginPath(); ctx.arc(x - 1, y - 1, 2.5, 0, Math.PI * 2); ctx.fill();
  }

  // Golpes corpo a corpo.
  for (const swing of swings) {
    if (now - swing.born > 220) continue;
    const t = (now - swing.born) / 220;
    const x = swing.x + ox;
    const y = swing.y + oy;
    ctx.save();
    ctx.globalAlpha = 0.7 * (1 - t);
    ctx.strokeStyle = swing.color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y - 12, swing.range, swing.angle - swing.arc / 2, swing.angle + swing.arc / 2);
    ctx.stroke();
    ctx.restore();
  }

  // Números flutuantes.
  for (const floater of floaters) {
    if (now - floater.born > 750) continue;
    const t = (now - floater.born) / 750;
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = floater.color;
    ctx.font = 'bold 14px system-ui';
    ctx.fillText(floater.text, floater.x + ox - 10, floater.y + oy - t * 26);
    ctx.globalAlpha = 1;
  }

  if (damageFlash.value > 0 && state.value.player.hp / state.value.player.maxHp < 0.35) {
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
    grad.addColorStop(0, '#ff000000');
    grad.addColorStop(1, '#b21f2d66');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // Atmosfera por zona: vaga-lumes no bosque/Vila, brasas na brasa e poeira nas ruínas.
  const zoneNow = zone.value;
  ctx.save();
  if (zoneNow === 'Brasa') {
    for (let i = 0; i < 18; i++) {
      const px = (i * 73 + Math.sin(now / 900 + i) * 24 + now * 0.02) % w;
      const py = h - ((now * 0.06 + i * 97) % h);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#ff9a4a';
      ctx.beginPath(); ctx.arc(px, py, 1.8, 0, Math.PI * 2); ctx.fill();
    }
  } else if (zoneNow === 'Bosque' || zoneNow === 'Vila') {
    for (let i = 0; i < 14; i++) {
      const px = (i * 111 + Math.sin(now / 1400 + i) * 40) % w;
      const py = (i * 67 + Math.cos(now / 1700 + i) * 30) % h;
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(now / 500 + i);
      ctx.fillStyle = '#ffe066';
      ctx.beginPath(); ctx.arc(px, py, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.12;
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    for (let i = 0; i < 12; i++) {
      const px = (i * 97 + now * 0.01) % w;
      const py = (i * 53 + Math.sin(now / 1100 + i) * 26) % h;
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = zoneNow === 'Ruínas' ? '#d8d2e6' : '#bff0c9';
      ctx.fillRect(px, py, 2, 2);
    }
  }
  ctx.restore();
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.34, w / 2, h / 2, Math.max(w, h) * 0.72);
  vg.addColorStop(0, '#00000000');
  vg.addColorStop(1, zoneNow === 'Brasa' ? '#2a0d0470' : '#00000066');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  // Minimapa.
  const map = mini.value;
  const mctx = map?.getContext('2d');
  if (map && mctx) {
    if (!mapLayer) {
      mapLayer = document.createElement('canvas');
      mapLayer.width = RIFT_W; mapLayer.height = RIFT_H;
      const lctx = mapLayer.getContext('2d');
      if (lctx) {
        for (let ty = 0; ty < RIFT_H; ty++) for (let tx = 0; tx < RIFT_W; tx++) {
          lctx.fillStyle = MAP_COLORS[riftTile(world, tx, ty)] ?? MAP_COLORS[0];
          lctx.fillRect(tx, ty, 1, 1);
        }
      }
    }
    if (now - minimapAt > 200) {
      minimapAt = now;
      if (map.width !== RIFT_W) { map.width = RIFT_W; map.height = RIFT_H; }
      if (mapLayer) mctx.drawImage(mapLayer, 0, 0);
      mctx.fillStyle = '#ffe9a6';
      mctx.fillRect(RIFT_SANCTUARY.x - 2, RIFT_SANCTUARY.y - 2, 5, 5);
      for (const enemy of state.value.enemies) {
        mctx.fillStyle = enemy.boss ? '#ffd166' : '#ff6b63';
        mctx.fillRect(Math.floor(enemy.x / RIFT_TILE), Math.floor(enemy.y / RIFT_TILE), enemy.boss ? 3 : 2, enemy.boss ? 3 : 2);
      }
      mctx.fillStyle = '#ffffff';
      mctx.fillRect(Math.floor(p.x / RIFT_TILE) - 1, Math.floor(p.y / RIFT_TILE) - 1, 3, 3);
    }
  }
}

function attackDown(event: PointerEvent): void {
  event.currentTarget instanceof HTMLElement && event.currentTarget.setPointerCapture(event.pointerId);
  attackHeld.value = true;
}
function attackUp(): void { attackHeld.value = false; }
function dodge(): void { dodgeRequested = true; }
function capture(): void {
  const events: RiftEvent[] = [];
  riftCapture(state.value, rng, events);
  handleEvents(events, performance.now());
  save();
}
function potion(): void {
  const events: RiftEvent[] = [];
  if (riftUsePotion(state.value, events)) save();
  handleEvents(events, performance.now());
}
function chooseWeapon(id: string): void {
  if (toggleRiftWeapon(state.value, id)) { say(`${RIFT_WEAPONS[id]?.name} equipada.`); save(); }
}
function toggleAlly(id: string): void {
  const result = riftToggleAlly(state.value, id);
  if (!result) return;
  say(result === 'active' ? 'Pokémon entrou na equipe.' : 'Pokémon foi para a reserva.');
  triggerRef(state);
  save();
}
function respawn(): void {
  riftRespawn(state.value);
  state.value.enemies = state.value.enemies.filter((enemy) => Math.hypot(enemy.x - state.value.player.x, enemy.y - state.value.player.y) > 420);
  save();
}

function padDown(event: PointerEvent): void {
  event.preventDefault();
  pad.active = true;
  const rect = padEl.value?.getBoundingClientRect();
  pad.cx = rect ? rect.left + rect.width / 2 : event.clientX;
  pad.cy = rect ? rect.top + rect.height / 2 : event.clientY;
  padMove(event);
}
function padMove(event: PointerEvent): void {
  if (!pad.active) return;
  const dx = event.clientX - pad.cx;
  const dy = event.clientY - pad.cy;
  const length = Math.hypot(dx, dy);
  const scale = length > 44 ? 44 / length : 1;
  pad.dx = (dx * scale) / 44;
  pad.dy = (dy * scale) / 44;
}
function padUp(): void { pad.active = false; pad.dx = 0; pad.dy = 0; }

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') { event.preventDefault(); if (menuOpen.value) menuOpen.value = false; else { save(); emit('close'); } return; }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.key)) event.preventDefault();
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') { dodgeRequested = true; return; }
  if (event.code === 'KeyC') { capture(); return; }
  if (event.code === 'KeyQ') { potion(); return; }
  if (event.code === 'KeyM') { menuOpen.value = !menuOpen.value; return; }
  keys.add(event.code);
  if (event.key === ' ') keys.add(event.code);
}
function onKeyUp(event: KeyboardEvent): void {
  keys.delete(event.code);
}

function resetProgress(): void {
  if (!resetArmed.value) {
    resetArmed.value = true;
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => (resetArmed.value = false), 3200);
    return;
  }
  clearRiftSave();
  Object.assign(state.value, createRiftState(world.seed));
  resetArmed.value = false;
  say('Progresso da Fenda apagado.');
  save();
}

function close(): void { save(); emit('close'); }

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  raf = requestAnimationFrame(frame);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  save();
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
});
</script>

<template>
  <section class="rift" aria-label="Fenda do Mew">
    <canvas ref="canvas" class="rift-canvas" aria-label="Mapa da Fenda: ande com o direcional, ataque e capture Pokémon enfraquecidos" />

    <header class="rift-top">
      <div class="rift-portrait"><img :src="trainer.src" alt="" width="34" height="34" /></div>
      <div class="rift-bars">
        <div class="rift-line"><strong>Nv {{ player.level }}</strong><span>{{ zone }}</span><span class="rift-weapon">{{ weapon.name }}</span></div>
        <div class="rift-hp"><i :style="{ width: `${hpPct}%` }" /></div>
        <div class="rift-xp"><i :style="{ width: `${xpPct}%` }" /></div>
        <small>{{ Math.ceil(player.hp) }}/{{ player.maxHp }} · XP {{ player.xp }}/{{ player.xpNext }}</small>
      </div>
      <button type="button" class="rift-icon" aria-label="Menu da Fenda" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">☰</button>
    </header>

    <div class="rift-pills">
      <span>🧪 {{ player.potions }}</span>
      <span>⚪ {{ player.balls }}</span>
      <span>🐾 {{ state.allies.length }}/{{ RIFT_MAX_ALLIES }}<template v-if="state.reserve.length"> · 📦 {{ state.reserve.length }}/5</template></span>
      <span v-if="state.defeated.length">🏆 {{ state.defeated.length }}/2</span>
    </div>

    <div class="rift-allies" v-if="state.allies.length">
      <span v-for="ally in state.allies" :key="ally.id" :title="`${ally.name} · Nv ${ally.level}`">
        <img :src="spriteFor(ally.dexId).src" alt="" />
      </span>
    </div>

    <canvas ref="mini" class="rift-minimap" width="120" height="90" aria-hidden="true" />

    <p v-if="toastMs > 0" class="rift-toast" role="status">{{ toast }}</p>

    <div class="rift-pad" ref="padEl" @pointerdown.prevent="padDown" @pointermove.prevent="padMove" @pointerup="padUp" @pointercancel="padUp" @lostpointercapture="padUp">
      <span class="rift-pad-knob" :style="{ transform: `translate(${pad.dx * 40}px, ${pad.dy * 40}px)` }" />
    </div>

    <p v-if="captureTarget && !menuOpen && !state.dead" class="rift-capture" role="status">⚪ {{ captureTarget.name }} está fraco · pode capturar!</p>

    <div class="rift-actions">
      <button type="button" class="rift-attack" aria-label="Atacar" @pointerdown.prevent="attackDown" @pointerup="attackUp" @pointercancel="attackUp" @lostpointercapture="attackUp"><i class="rift-cd" :style="{ height: `${attackFill}%` }" />⚔</button>
      <button type="button" aria-label="Esquivar" @click="dodge"><i class="rift-cd" :style="{ height: `${dodgeFill}%` }" />💨</button>
      <button type="button" :class="{ ready: !!captureTarget }" :aria-label="captureTarget ? `Capturar ${captureTarget.name}` : 'Capturar Pokémon enfraquecido'" @click="capture">⚪</button>
      <button type="button" aria-label="Usar poção" @click="potion">🧪</button>
    </div>

    <div v-if="state.dead" class="rift-overlay">
      <div class="rift-card">
        <small>FENDA DO MEW</small>
        <h2>Você caiu.</h2>
        <p>A clareira da Vila ainda está ali. Você perdeu um pouco de XP, mas mantém nível, arma, itens e Pokémon.</p>
        <button type="button" class="primary" @click="respawn">Voltar à clareira</button>
        <button type="button" @click="close">Sair da Fenda</button>
      </div>
    </div>

    <div v-if="menuOpen" class="rift-overlay menu">
      <div class="rift-card rift-menu">
        <header><strong>Fenda do Mew</strong><button type="button" aria-label="Fechar menu" @click="menuOpen = false">×</button></header>
        <p class="rift-note">Um mapa imenso além da Vila. Chefes ficam nas Ruínas ao norte e na Brasa a leste.</p>
        <section>
          <h3>Arma</h3>
          <div class="rift-weapons">
            <button v-for="id in player.unlocked" :key="id" type="button" :class="{ on: player.weapon === id }" @click="chooseWeapon(id)">
              <b>{{ RIFT_WEAPONS[id]?.name }}</b><small>{{ RIFT_WEAPONS[id]?.note }}</small>
            </button>
          </div>
        </section>
        <section>
          <h3>Inventário</h3>
          <div class="rift-bag">
            <div><span>🧪</span><b>{{ player.potions }}</b><small>Poções</small><button type="button" :disabled="player.potions <= 0 || player.hp >= player.maxHp" @click="potion">Usar</button></div>
            <div><span>⚪</span><b>{{ player.balls }}</b><small>Pokébolas</small><button type="button" :disabled="!captureTarget" @click="capture">Capturar</button></div>
          </div>
        </section>
        <section>
          <h3>Equipe · {{ state.allies.length }}/{{ RIFT_MAX_ALLIES }}</h3>
          <p v-if="!state.allies.length && !state.reserve.length" class="rift-note">Enfraqueça um Pokémon selvagem (abaixo de 35%) e use ⚪ para capturar. São 3 ativos e até 5 na reserva.</p>
          <div class="rift-roster">
            <div v-for="ally in state.allies" :key="ally.id" class="rift-member">
              <img :src="spriteFor(ally.dexId).src" alt="" />
              <span><b>{{ ally.name }}</b><small>Nv {{ ally.level }} · {{ Math.ceil(ally.hp) }}/{{ ally.maxHp }}</small></span>
              <button type="button" @click="toggleAlly(ally.id)">Reservar</button>
            </div>
            <div v-for="ally in state.reserve" :key="ally.id" class="rift-member reserve">
              <img :src="spriteFor(ally.dexId).src" alt="" />
              <span><b>{{ ally.name }}</b><small>Reserva · Nv {{ ally.level }}</small></span>
              <button type="button" @click="toggleAlly(ally.id)">Ativar</button>
            </div>
          </div>
        </section>
        <section>
          <h3>Progresso</h3>
          <p class="rift-note">{{ state.defeated.length }}/2 chefes · Nv {{ player.level }} · {{ player.unlocked.length }} armas · {{ state.allies.length }} ativos · {{ state.reserve.length }} na reserva</p>
          <p class="rift-note">WASD/setas andam · Espaço/J ataca · Shift esquiva · C captura · Q poção · M menu</p>
        </section>
        <div class="rift-menu-actions">
          <button type="button" @click="save">Salvar agora</button>
          <button type="button" class="danger" :aria-pressed="resetArmed" @click="resetProgress">{{ resetArmed ? 'Confirmar apagar' : 'Apagar progresso' }}</button>
          <button type="button" @click="close">Sair da Fenda</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.rift{position:fixed;inset:0;z-index:1000;overflow:hidden;background:#0b1a15;color:#fff7e6;font-family:system-ui,sans-serif;touch-action:none;user-select:none}
.rift-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;image-rendering:pixelated}
.rift-top{position:absolute;top:max(6px,env(safe-area-inset-top));left:max(6px,env(safe-area-inset-left));right:max(6px,env(safe-area-inset-right));display:flex;align-items:center;gap:7px;padding:6px 8px;border:1px solid #ffffff40;border-radius:12px;background:#08120ec9;box-shadow:0 4px 16px #0006}
.rift-portrait img{display:block;width:34px;height:34px;object-fit:contain;image-rendering:pixelated}
.rift-bars{flex:1;min-width:0;display:grid;gap:2px}
.rift-line{display:flex;align-items:baseline;gap:6px;font-size:.72rem;min-width:0}
.rift-line strong{color:#ffe066}.rift-line span{color:#b9d9cb;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.rift-line .rift-weapon{color:#ffe9a6;font-weight:700}
.rift-hp,.rift-xp{height:8px;border-radius:9px;background:#102620;overflow:hidden;border:1px solid #ffffff22}
.rift-hp i{display:block;height:100%;background:linear-gradient(90deg,#e05c5c,#ff9d6e)}
.rift-xp{height:5px}.rift-xp i{display:block;height:100%;background:#65dca6}
.rift-bars small{font-size:.58rem;color:#b9d9cb}
.rift-icon{width:36px;height:36px;flex:none;border:1px solid #ffffff55;border-radius:10px;background:#173f36;color:#fff;font:800 1rem system-ui}
.rift-pills{position:absolute;top:max(84px,calc(env(safe-area-inset-top) + 72px));left:max(6px,env(safe-area-inset-left));display:flex;gap:5px;flex-wrap:wrap;font-size:.7rem}
.rift-pills span{padding:3px 8px;border:1px solid #ffffff33;border-radius:999px;background:#08120ec9}
.rift-allies{position:absolute;top:max(84px,calc(env(safe-area-inset-top) + 72px));right:max(6px,env(safe-area-inset-right));display:flex;gap:3px}
.rift-allies img{width:30px;height:30px;object-fit:contain;image-rendering:pixelated;filter:drop-shadow(0 1px 2px #000)}
.rift-minimap{position:absolute;right:max(8px,env(safe-area-inset-right));bottom:calc(max(8px,env(safe-area-inset-bottom)) + 210px);width:96px;height:72px;border:1px solid #ffe9a666;border-radius:8px;background:#08120e;image-rendering:pixelated}
.rift-toast{position:absolute;left:50%;top:max(118px,calc(env(safe-area-inset-top) + 106px));bottom:auto;transform:translateX(-50%);margin:0;padding:6px 12px;border-radius:999px;background:#08120ee8;border:1px solid #ffe9a6aa;color:#ffe9a6;font-size:.76rem;font-weight:700;white-space:nowrap;max-width:90vw;overflow:hidden;text-overflow:ellipsis}
.rift-pad{position:absolute;left:max(14px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));width:112px;height:112px;border-radius:50%;border:2px solid #ffffff38;background:#08120e99;display:grid;place-items:center;touch-action:none}
.rift-pad-knob{width:48px;height:48px;border-radius:50%;background:#e9f5ee55;border:2px solid #fff9;pointer-events:none}
.rift-actions{position:absolute;right:max(12px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));display:grid;grid-template-columns:56px 56px;gap:8px}
.rift-actions button{position:relative;overflow:hidden;width:56px;height:56px;border:2px solid #ffe9a6aa;border-radius:16px;background:#173f36e8;color:#fff;font:800 1.2rem system-ui;box-shadow:0 3px 0 #071c17;touch-action:none}
.rift-actions .rift-attack{grid-row:span 2;width:56px;height:120px;background:#a83e43e8;font-size:1.6rem}
.rift-actions button:active{transform:translateY(2px);box-shadow:0 1px 0 #071c17}
.rift-overlay{position:absolute;inset:0;z-index:5;display:grid;place-items:center;padding:16px;background:#04100cd9}
.rift-overlay.menu{background:#04100cf2;align-items:start;overflow-y:auto;padding-top:max(14px,env(safe-area-inset-top))}
.rift-card{width:min(100%,480px);box-sizing:border-box;padding:18px;border:1px solid #ffe9a6aa;border-radius:16px;background:linear-gradient(160deg,#123429,#0a1d17);box-shadow:0 18px 50px #000c;text-align:left}
.rift-card small{color:#ffe066;font-weight:800;letter-spacing:.1em;font-size:.62rem}
.rift-card h2{margin:4px 0 8px;font-size:1.5rem}
.rift-card p{margin:0 0 10px;line-height:1.4;color:#d8e8df;font-size:.86rem}
.rift-card button{min-height:44px;margin:0 0 8px;padding:8px 12px;border:1px solid #ffffff55;border-radius:11px;background:#1b4a3b;color:#fff;font:700 .82rem system-ui}
.rift-card button.primary{width:100%;background:#b95656;border-color:#ffb3a8}
.rift-menu{display:grid;gap:10px}
.rift-menu header{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:1.05rem}
.rift-menu h3{margin:0 0 5px;font-size:.86rem;color:#ffe066}
.rift-menu-actions{display:flex;flex-wrap:wrap;gap:6px}
.rift-menu-actions button{flex:1 1 120px;margin:0}
.rift-menu-actions .danger{background:#5a2328}
.rift-weapons{display:grid;gap:5px}
.rift-weapons button{display:grid;gap:1px;text-align:left;background:#0e2a20}
.rift-weapons button b{font-size:.8rem}.rift-weapons button small{color:#b9d9cb;font-size:.66rem;font-weight:400}
.rift-weapons button.on{border-color:#ffe066;background:#2a4a2f;box-shadow:inset 3px 0 #ffe066}
.rift-team{display:grid;gap:4px;margin:0;padding:0;list-style:none}
.rift-team li{display:flex;align-items:baseline;gap:6px;padding:5px 7px;border-radius:8px;background:#ffffff10;font-size:.76rem}
.rift-team b{color:#ffe066}.rift-team small{margin-left:auto;color:#b9d9cb}
.rift-bag{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.rift-bag > div{display:grid;grid-template-columns:auto 1fr;gap:1px 6px;align-items:center;padding:8px;border:1px solid #ffffff20;border-radius:10px;background:#ffffff0d;font-size:.8rem}
.rift-bag span{grid-row:span 2;font-size:1.4rem}
.rift-bag b{font-size:1rem;color:#ffe066}
.rift-bag small{color:#b9d9cb;font-size:.64rem}
.rift-bag button{grid-column:1/-1;margin-top:4px;min-height:32px;padding:4px;font-size:.7rem}
.rift-roster{display:grid;gap:5px}
.rift-member{display:flex;align-items:center;gap:7px;padding:6px 8px;border:1px solid #ffffff20;border-radius:10px;background:#ffffff0d}
.rift-member img{width:34px;height:34px;object-fit:contain;image-rendering:pixelated}
.rift-member span{display:grid;min-width:0}.rift-member b{font-size:.8rem}.rift-member small{color:#b9d9cb;font-size:.64rem}
.rift-member button{margin-left:auto;min-height:32px;padding:4px 8px;font-size:.66rem}
.rift-member.reserve{opacity:.8}
.rift-capture{position:absolute;left:50%;top:max(150px,calc(env(safe-area-inset-top) + 138px));transform:translateX(-50%);margin:0;padding:5px 11px;border-radius:999px;background:#ffe066;color:#2a1c00;font-size:.7rem;font-weight:800;white-space:nowrap;box-shadow:0 0 14px #ffe06688;animation:rift-capture .8s ease-in-out infinite alternate}
@keyframes rift-capture{to{box-shadow:0 0 22px #ffe066cc}}
.rift-actions button.ready{border-color:#ffe066;box-shadow:0 0 0 2px #ffe06688,0 0 16px #ffe066aa;animation:rift-ready .8s ease-in-out infinite alternate}
@keyframes rift-ready{to{box-shadow:0 0 0 3px #ffe066cc,0 0 22px #ffe066}}
.rift-cd{position:absolute;left:0;right:0;bottom:0;background:#00000066;pointer-events:none}
@media(prefers-reduced-motion:reduce){.rift-capture,.rift-actions button.ready{animation:none}}
.rift-note{color:#b9d9cb;font-size:.74rem;line-height:1.4}
@media (max-width:380px){.rift-minimap{width:80px;height:60px;bottom:calc(max(8px,env(safe-area-inset-bottom)) + 190px)}.rift-pad{width:96px;height:96px}.rift-actions{grid-template-columns:50px 50px}.rift-actions button{width:50px;height:50px}.rift-actions .rift-attack{height:108px;width:50px}}
</style>
