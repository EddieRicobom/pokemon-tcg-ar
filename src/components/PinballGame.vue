<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, triggerRef, watch } from 'vue';
import { activatePinballAbility, createPinballState, launchPinball, mergePinballDex, nudgePinball, pinballMissionGoal, pinballPartnerSkill, pinballReward, pinballStage, PINBALL_BOSS_CORE, PINBALL_BOSS_PHASES, PINBALL_BUMPERS, PINBALL_DEX_MAX, PINBALL_FLIPPER_LENGTH, PINBALL_FLIPPERS, PINBALL_H, PINBALL_TARGETS, PINBALL_W, stepPinball } from '../core/pinball';
import type { PinballEvent, PinballState } from '../core/pinball';
import { getLocalVillageSprite, getLocalVillageSpriteDirs } from '../app/services';
import { contentBounds } from '../village/local-sprite';
import { framesOf } from '../village/village-game-support';
import { frameIndexAt, type DecodedGif } from '../core/gif';
import { addCoins } from '../app/wallet';
import { recordEvent } from '../app/trainer-store';
import { vibrate } from '../app/haptics';

const emit = defineEmits<{ close: [] }>();
interface PinballPartner { id: string; name: string; dexId: number; thumb?: string }
const props = withDefaults(defineProps<{ partners?: PinballPartner[] }>(), { partners: () => [] });
const SETTINGS_KEY = 'tcg-ar-pinball-settings-v1';
function readSettings(): { partner: string; muted: boolean; effects: boolean } {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as Partial<{ partner: string; muted: boolean; effects: boolean }> | null;
    return { partner: typeof raw?.partner === 'string' ? raw.partner : '', muted: raw?.muted === true, effects: raw?.effects !== false };
  } catch {
    return { partner: '', muted: false, effects: true };
  }
}
const saved = readSettings();
const selectedPartnerId = ref(saved.partner);
const selectedPartner = computed(() => props.partners.find((partner) => partner.id === selectedPartnerId.value) ?? null);
const partnerSkill = computed(() => selectedPartner.value ? pinballPartnerSkill(selectedPartner.value.dexId) : null);
const BEST_KEY = 'tcg-ar-pinball-best-v1';
function savedBest(): number {
  try { return Math.max(0, Number(localStorage.getItem(BEST_KEY)) || 0); } catch { return 0; }
}
const state = shallowRef(createPinballState(savedBest()));
const canvas = ref<HTMLCanvasElement | null>(null);
const left = ref(false);
const right = ref(false);
const muted = ref(saved.muted);
const effects = ref(saved.effects);
const rewardText = ref('');
const menuOpen = ref(false);
const stage = computed(() => pinballStage(state.value.stage));
const tiltSegments = computed(() => Math.min(3, Math.ceil(state.value.tiltHeat)));
const ADVENTURE_KEY = 'tcg-ar-pinball-adventure-v1';
interface PinballAdventure { bestStage: number; completions: number; bestScore: number }
function readAdventure(): PinballAdventure {
  try {
    const raw = JSON.parse(localStorage.getItem(ADVENTURE_KEY) ?? 'null') as Partial<PinballAdventure> | null;
    return {
      bestStage: Math.max(0, Math.floor(Number(raw?.bestStage) || 0)),
      completions: Math.max(0, Math.floor(Number(raw?.completions) || 0)),
      bestScore: Math.max(0, Math.floor(Number(raw?.bestScore) || 0)),
    };
  } catch {
    return { bestStage: 0, completions: 0, bestScore: 0 };
  }
}
const adventure = ref(readAdventure());
const PINBALL_DEX_KEY = 'tcg-ar-pinball-dex-v1';
/** Pokédex do Pinball: fica no aparelho entre aventuras, para dar para completar a Pokédex aos poucos. */
function readPinballDex(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PINBALL_DEX_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? mergePinballDex(raw.filter((id): id is number => typeof id === 'number'), []) : [];
  } catch {
    return [];
  }
}
const caughtDex = ref<number[]>(readPinballDex());
/** A aventura infinita pode guardar centenas de capturas; a faixa mostra as últimas e a Pokédex fica com todas. */
const recentCaptures = computed(() => state.value.captured.slice(-18));
function syncCaughtDex(): void {
  const next = mergePinballDex(caughtDex.value, state.value.captured);
  if (next.length === caughtDex.value.length) return;
  caughtDex.value = next;
  try {
    localStorage.setItem(PINBALL_DEX_KEY, JSON.stringify(next));
  } catch {
    // Sem armazenamento: a Pokédex do Pinball vale só nesta sessão.
  }
}
watch(() => state.value.captured.length, syncCaughtDex);
const stageBanner = ref<{ title: string; subtitle: string; tint: string } | null>(null);
let bannerTimer: ReturnType<typeof setTimeout> | null = null;
function showStageBanner(): void {
  const info = pinballStage(state.value.stage);
  if (!info) return;
  stageBanner.value = { title: info.title, subtitle: info.encounter, tint: info.tint };
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => (stageBanner.value = null), 1800);
}
watch(() => state.value.stage, (next, previous) => {
  if (next !== previous && state.value.phase === 'playing') showStageBanner();
});
let rewarded = false;
watch([selectedPartnerId, muted, effects], () => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ partner: selectedPartnerId.value, muted: muted.value, effects: effects.value }));
  } catch {
    // Só não lembra das preferências.
  }
});
const boardArt = new Image();
boardArt.src = `${import.meta.env.BASE_URL}art/pinball/mesa-floresta.png`;
boardArt.onload = () => paint();
/** Sprite do Pokémon do encontro, recortado e dimensionado para a mesa (~32 px de altura real). */
interface CritterPose { gif: DecodedGif; frames: HTMLCanvasElement[]; drawW: number; drawH: number; cx: number; cy: number }
interface CritterArt { left?: CritterPose; right?: CritterPose }
const CRITTER_HEIGHT = 46;
const CRITTER_ART_LIMIT = 16;
const CRITTER_THUMB_LIMIT = 40;
const critterArts = new Map<number, CritterArt | null>();
/** Miniatura (primeiro quadro do sprite) dos capturados, só para o placar — não entra na mesa. */
const caughtSprites = ref<Record<number, string>>({});

function prepareCritterPose(gif: DecodedGif): CritterPose {
  const { top, bottom, left, right } = contentBounds(gif);
  const scale = CRITTER_HEIGHT / Math.max(0.001, (bottom - top) * gif.height);
  const drawW = gif.width * scale;
  const drawH = gif.height * scale;
  return { gif, frames: framesOf(gif), drawW, drawH, cx: drawW * (left + right) / 2, cy: drawH * (top + bottom) / 2 };
}

function rememberCaughtSprite(dexId: number, pose: CritterPose): void {
  if (caughtSprites.value[dexId]) return;
  try {
    const next = { ...caughtSprites.value, [dexId]: pose.frames[0]!.toDataURL() };
    const keys = Object.keys(next);
    for (const key of keys.slice(0, Math.max(0, keys.length - CRITTER_THUMB_LIMIT))) delete next[Number(key)];
    caughtSprites.value = next;
  } catch { /* miniatura opcional */ }
}

/** Guarda a arte com um teto: numa aventura infinita passariam centenas de espécies pela mesa. */
function rememberCritterArt(dexId: number, art: CritterArt | null): void {
  if (art) critterArts.delete(dexId);
  critterArts.set(dexId, art);
  for (const key of critterArts.keys()) {
    if (critterArts.size <= CRITTER_ART_LIMIT) break;
    if (key !== dexId) critterArts.delete(key);
  }
}

/** Carrega uma vez por espécie; enquanto não chega (ou se faltar), desenha a forma neutra. */
function critterArt(dexId: number): CritterArt | null {
  const cached = critterArts.get(dexId);
  if (cached !== undefined) { if (cached) rememberCritterArt(dexId, cached); return cached; }
  rememberCritterArt(dexId, null);
  void getLocalVillageSpriteDirs(dexId, false, 'Walk')
    .then(async (dirs) => {
      const left = dirs?.left ? prepareCritterPose(dirs.left) : undefined;
      const right = dirs?.right ? prepareCritterPose(dirs.right) : undefined;
      if (left || right) {
        rememberCritterArt(dexId, { left, right });
        rememberCaughtSprite(dexId, (left ?? right)!);
        return;
      }
      const gif = await getLocalVillageSprite(dexId, false, 'Walk');
      if (gif) {
        const pose = prepareCritterPose(gif);
        rememberCritterArt(dexId, { left: pose, right: pose });
        rememberCaughtSprite(dexId, pose);
      }
    })
    .catch(() => { /* a forma neutra continua valendo */ });
  return null;
}

function drawCritters(c: CanvasRenderingContext2D, s: PinballState, time: number): void {
  for (const critter of s.critters) {
    if (critter.hiddenMs > 0) continue;
    const bob = Math.sin(time / 240 + critter.x * 0.06) * 1.6;
    const y = critter.y + bob;
    c.beginPath(); c.ellipse(critter.x, y + 22, 14, 4.5, 0, 0, Math.PI * 2);
    c.fillStyle = '#00271966'; c.fill();
    const art = critterArt(critter.dexId);
    const pose = critter.vx < 0 ? art?.left ?? art?.right : art?.right ?? art?.left;
    const frame = pose ? pose.frames[frameIndexAt(pose.gif, time)] : undefined;
    if (pose && frame) {
      c.drawImage(frame, Math.round(critter.x - pose.cx), Math.round(y - pose.cy), pose.drawW, pose.drawH);
    } else {
      c.beginPath(); c.arc(critter.x, y, critter.r, 0, Math.PI * 2);
      c.fillStyle = '#cfe9d8'; c.fill(); c.strokeStyle = '#2f5e4c'; c.lineWidth = 2; c.stroke();
    }
    if (s.mode === 'capture') {
      c.beginPath(); c.arc(critter.x, y, critter.r + 9, 0, Math.PI * 2);
      c.setLineDash([5, 4]); c.strokeStyle = '#7dffc4'; c.lineWidth = 2; c.stroke(); c.setLineDash([]);
    }
    if (critter.flashMs > 0) {
      c.beginPath(); c.arc(critter.x, y, critter.r + 6, 0, Math.PI * 2);
      c.strokeStyle = '#fff3a6'; c.lineWidth = 3; c.stroke();
      c.fillStyle = '#071c2ad9'; c.beginPath(); c.roundRect(critter.x - 34, y - 38, 68, 16, 8); c.fill();
      c.fillStyle = '#fffbe9'; c.font = 'bold 9px system-ui'; c.textAlign = 'center';
      c.fillText(critter.name, critter.x, y - 27);
    }
  }
}

const trail: { x: number; y: number }[] = [];
let frame = 0;
let lastTime = 0;
let hudTime = 0;
/** Câmera suave: dá zoom no campo e segue a bola, mantendo a moldura da mesa fixa. */
const CAMERA_SCALE = 1.10;
const CAMERA_MIN_X = 22 + 158 / CAMERA_SCALE;
const CAMERA_MAX_X = 338 - 158 / CAMERA_SCALE;
const CAMERA_MIN_Y = 33 + 267 / CAMERA_SCALE;
const CAMERA_MAX_Y = 569 - 269 / CAMERA_SCALE;
let cameraX = 180;
let cameraY = 300;
let audio: AudioContext | null = null;
let persistedBest = state.value.best;

function sound(events: PinballEvent[]): void {
  if (muted.value || events.length === 0) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const kind = events.includes('reward') ? 'reward' : events.includes('drain') ? 'drain' : events.includes('tilt') ? 'tilt' : events.includes('flipper') ? 'flipper' : 'bump';
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.type = kind === 'reward' ? 'sine' : 'triangle';
    tone.frequency.value = kind === 'reward' ? 660 : kind === 'drain' ? 150 : kind === 'tilt' ? 110 : kind === 'flipper' ? 320 : 440;
    gain.gain.setValueAtTime(0.045, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.11);
    tone.connect(gain).connect(audio.destination);
    tone.start();
    tone.stop(audio.currentTime + 0.12);
  } catch { /* áudio opcional */ }
}

/** Clima de cada etapa: a arte da mesa é a mesma floresta, mas o banho de cor e as partículas mudam o suficiente para a etapa parecer outro lugar. */
const PINBALL_STAGE_MOODS = [
  { top: '#8dffc4', low: '#1d7a4f', spark: '#e2ffee' },
  { top: '#c2a4ff', low: '#4a2f86', spark: '#efe3ff' },
  { top: '#ff9c8c', low: '#7a1f2a', spark: '#ffe0c8' },
  { top: '#9fe8de', low: '#256d66', spark: '#d8fff7' },
  { top: '#ffc978', low: '#8a4516', spark: '#fff0bd' },
  { top: '#ffe98f', low: '#7c5c14', spark: '#fff8cf' },
] as const;

function drawStageMood(c: CanvasRenderingContext2D, stage: number, time: number): void {
  const mood = PINBALL_STAGE_MOODS[stage % PINBALL_STAGE_MOODS.length] ?? PINBALL_STAGE_MOODS[0]!;
  c.save();
  c.beginPath(); c.rect(22, 33, 316, 536); c.clip();
  if (effects.value) {
    const wash = c.createLinearGradient(0, 33, 0, 569);
    wash.addColorStop(0, `${mood.top}40`); wash.addColorStop(0.45, `${mood.top}0d`); wash.addColorStop(1, `${mood.low}66`);
    c.fillStyle = wash; c.fillRect(22, 33, 316, 536);
    c.fillStyle = mood.spark;
    for (let i = 0; i < 10; i++) {
      const rise = (time * (0.000018 + (i % 3) * 0.000008) + i * 0.137) % 1;
      const x = 42 + ((i * 71) % 276);
      const y = 552 - rise * 500;
      c.globalAlpha = 0.1 + 0.12 * (0.5 + 0.5 * Math.sin(time / 640 + i * 1.7));
      c.beginPath(); c.arc(x + Math.sin(time / 900 + i) * 3, y, 1.4 + (i % 3) * 0.7, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
  } else {
    c.fillStyle = `${mood.top}22`; c.fillRect(22, 33, 316, 536);
  }
  c.restore();
}

function paint(): void {
  const element = canvas.value;
  const c = element?.getContext('2d');
  if (!c) return;
  const s = state.value;
  c.clearRect(0, 0, PINBALL_W, PINBALL_H);
  if (boardArt.complete && boardArt.naturalWidth) c.drawImage(boardArt, 0, 0, PINBALL_W, PINBALL_H);
  else { c.fillStyle = '#144d35'; c.fillRect(0, 0, PINBALL_W, PINBALL_H); }
  const targetX = s.phase === 'playing'
    ? Math.max(CAMERA_MIN_X, Math.min(CAMERA_MAX_X, 180 + (s.ball.x - 180) * 0.4))
    : 180;
  const targetY = s.phase === 'playing'
    ? Math.max(CAMERA_MIN_Y, Math.min(CAMERA_MAX_Y, s.ball.y + 16))
    : 300;
  cameraX += (targetX - cameraX) * 0.14;
  cameraY += (targetY - cameraY) * 0.14;
  c.save();
  c.beginPath(); c.rect(22, 33, 316, 536); c.clip();
  c.translate(180 - cameraX * CAMERA_SCALE, 300 - cameraY * CAMERA_SCALE);
  c.scale(CAMERA_SCALE, CAMERA_SCALE);
  if (boardArt.complete && boardArt.naturalWidth) c.drawImage(boardArt, 0, 0, PINBALL_W, PINBALL_H);
  else { c.fillStyle = '#144d35'; c.fillRect(0, 0, PINBALL_W, PINBALL_H); }
  c.fillStyle = '#042d1a38'; c.fillRect(22, 33, 316, 536);
  drawStageMood(c, s.stage, performance.now());
  c.lineCap = 'round';
  c.strokeStyle = '#fff3aa'; c.lineWidth = 5;
  c.beginPath(); c.moveTo(29, 450); c.lineTo(29, 65); c.quadraticCurveTo(180, 7, 331, 65); c.lineTo(331, 450); c.stroke();
  c.strokeStyle = '#665727'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(300, 170); c.lineTo(300, 515); c.stroke();
  c.strokeStyle = '#ffe395'; c.lineWidth = 4;
  c.beginPath(); c.moveTo(74, 458); c.lineTo(100, 522); c.moveTo(274, 456); c.lineTo(266, 500); c.stroke();
  c.fillStyle = '#f7da77'; c.font = 'bold 11px system-ui'; c.textAlign = 'center';
  c.fillText('TRILHA', 314, 290);
  c.beginPath(); c.moveTo(76, 389); c.lineTo(119, 428); c.lineTo(91, 423); c.closePath();
  c.moveTo(284, 389); c.lineTo(241, 428); c.lineTo(269, 423); c.closePath();
  c.fillStyle = '#df5b54'; c.fill(); c.strokeStyle = '#ffe395'; c.lineWidth = 3; c.stroke();
  const modeColor = s.mode === 'capture' ? '#56e5aa' : s.mode === 'evolution' ? '#d0a5ff' : s.mode === 'bonus' ? '#ffdf6d' : '#b8f0df';
  const pulse = 1 + Math.sin(performance.now() / 220) * 0.12;
  c.fillStyle = '#092d2bdc'; c.strokeStyle = modeColor; c.lineWidth = 3;
  c.beginPath(); c.roundRect(101, 254, 158, 58, 15); c.fill(); c.stroke();
  c.fillStyle = modeColor; c.font = 'bold 15px system-ui';
  c.fillText(s.mode === 'capture' ? 'CAPTURA' : s.mode === 'evolution' ? 'EVOLUÇÃO' : s.mode === 'bonus' ? PINBALL_BOSS_PHASES[s.bossPhase]?.label.toUpperCase() ?? 'CHEFE' : 'MISSÃO', 180, 277);
  c.fillStyle = '#fff'; c.font = 'bold 11px system-ui';
  c.fillText(s.mode === 'normal' ? `${s.charge}/3 ALVOS` : `${s.progress}/${pinballMissionGoal(s.mode, s.bossPhase)} ${s.mode === 'evolution' || s.mode === 'bonus' && s.bossPhase === 0 ? 'BUMPERS' : s.mode === 'bonus' && s.bossPhase === 2 ? 'NÚCLEO' : 'ALVOS'}`, 180, 297);
  PINBALL_BUMPERS.forEach((bumper, index) => {
    c.beginPath(); c.arc(bumper.x, bumper.y, bumper.r + 5, 0, Math.PI * 2); c.fillStyle = '#592f24'; c.fill();
    c.strokeStyle = '#ffef9a'; c.lineWidth = 3; c.stroke();
    c.beginPath(); c.arc(bumper.x, bumper.y, bumper.r, 0, Math.PI * 2); c.fillStyle = index < 3 ? '#eb5953' : '#6da5e7'; c.fill();
    c.beginPath(); c.arc(bumper.x, bumper.y, bumper.r * 0.56, 0, Math.PI * 2); c.fillStyle = '#fff9d8'; c.fill();
    c.strokeStyle = '#563c32'; c.lineWidth = 2; c.beginPath(); c.moveTo(bumper.x - bumper.r + 2, bumper.y); c.lineTo(bumper.x + bumper.r - 2, bumper.y); c.stroke();
    c.beginPath(); c.arc(bumper.x, bumper.y, 3, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
    if (index === s.bonusSpot) {
      c.beginPath(); c.arc(bumper.x, bumper.y, (bumper.r + 8) * pulse, 0, Math.PI * 2);
      c.strokeStyle = '#ffe066'; c.lineWidth = 3; c.stroke();
      c.fillStyle = '#ffe066'; c.font = 'bold 12px system-ui';
      c.fillText('★', bumper.x, bumper.y + bumper.r + 12);
    }
  });
  PINBALL_TARGETS.forEach((target, index) => {
    c.beginPath(); c.arc(target.x, target.y, target.r + 5, 0, Math.PI * 2);
    const letterHit = s.letterStep > index;
    c.fillStyle = s.mode === 'bonus' && s.bossPhase === 1 && (s.bossMask & (1 << index)) !== 0 ? '#78e8af'
      : s.letterStep === index ? '#ffe066'
        : letterHit ? '#65dca6'
          : s.mode === 'normal' ? '#f9c449' : modeColor;
    c.fill();
    c.beginPath(); c.arc(target.x, target.y, target.r, 0, Math.PI * 2); c.fillStyle = '#173c34'; c.fill();
    c.fillStyle = s.letterStep === index ? '#fff3a8' : '#fff'; c.font = 'bold 12px system-ui'; c.fillText(['C', 'A', 'T'][index]!, target.x, target.y + 4);
  });
  if (s.mode === 'bonus') {
    const active = s.bossPhase === 2;
    c.beginPath(); c.arc(PINBALL_BOSS_CORE.x, PINBALL_BOSS_CORE.y, PINBALL_BOSS_CORE.r + 5, 0, Math.PI * 2);
    c.fillStyle = active ? '#f2cf68' : '#755da0'; c.fill();
    c.beginPath(); c.arc(PINBALL_BOSS_CORE.x, PINBALL_BOSS_CORE.y, PINBALL_BOSS_CORE.r, 0, Math.PI * 2);
    c.fillStyle = active ? '#bc384f' : '#313354'; c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 15px system-ui'; c.fillText(active ? '★' : '◆', PINBALL_BOSS_CORE.x, PINBALL_BOSS_CORE.y + 5);
    c.font = 'bold 10px system-ui'; c.fillText(active ? 'NÚCLEO' : 'BLOQUEADO', 180, 337);
  }
  drawCritters(c, s, performance.now());
  c.fillStyle = s.kickback ? '#fff091' : '#e0e7c2';
  c.font = 'bold 9px system-ui'; c.fillText('RESGATE', 73, 470); c.fillText('RESGATE', 270, 470);
  const ctx = c;
  function flipper(pivotX: number, angle: number, pressed: boolean): void {
    const tipX = pivotX + Math.cos(angle) * PINBALL_FLIPPER_LENGTH;
    const tipY = 525 + Math.sin(angle) * PINBALL_FLIPPER_LENGTH;
    ctx.lineCap = 'round'; ctx.lineWidth = 17; ctx.strokeStyle = '#40242c';
    ctx.beginPath(); ctx.moveTo(pivotX, 525); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.lineWidth = 12; ctx.strokeStyle = pressed ? '#ffe079' : '#f6a969'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff6d0'; ctx.stroke();
  }
  flipper(PINBALL_FLIPPERS[0].pivotX, s.flipperAngle[0], left.value && s.tiltLockMs === 0);
  flipper(PINBALL_FLIPPERS[1].pivotX, s.flipperAngle[1], right.value && s.tiltLockMs === 0);
  const trailRgb = s.bonusKind === 'fire' ? '255, 156, 70' : s.bonusKind === 'spark' ? '120, 235, 255' : '255, 245, 194';
  if (effects.value && s.phase === 'playing') {
    trail.forEach((point, index) => {
      c.beginPath(); c.arc(point.x, point.y, 2 + index * 0.48, 0, Math.PI * 2);
      c.fillStyle = `rgba(${trailRgb}, ${index * 0.055})`; c.fill();
    });
  }
  if (s.bonusKind) {
    c.beginPath(); c.arc(s.ball.x, s.ball.y, 11 + Math.sin(performance.now() / 160) * 1.5, 0, Math.PI * 2);
    c.strokeStyle = s.bonusKind === 'fire' ? '#ff9b4ac9' : '#78ebffc9'; c.lineWidth = 2.5; c.stroke();
  }
  c.beginPath(); c.ellipse(s.ball.x + 2, s.ball.y + 3, 7, 4, 0, 0, Math.PI * 2); c.fillStyle = '#00271988'; c.fill();
  c.beginPath(); c.arc(s.ball.x, s.ball.y, 7, 0, Math.PI * 2); c.fillStyle = '#f5f9ff'; c.fill();
  c.strokeStyle = '#e24f61'; c.lineWidth = 3; c.beginPath(); c.arc(s.ball.x, s.ball.y, 7, Math.PI, 2 * Math.PI); c.stroke();
  c.fillStyle = '#283954'; c.fillRect(s.ball.x - 6, s.ball.y - 1, 12, 2);
  c.beginPath(); c.arc(s.ball.x, s.ball.y, 2, 0, Math.PI * 2); c.fillStyle = '#f5f9ff'; c.fill();
  c.restore();
  if (s.phase !== 'playing') {
    c.fillStyle = '#071420cf'; c.fillRect(31, 345, 298, 93);
    c.fillStyle = '#f4f7ff'; c.font = 'bold 17px system-ui';
    c.fillText(s.phase === 'won' ? 'AVENTURA CONCLUÍDA!' : s.phase === 'over' ? 'FIM DA AVENTURA' : 'PRONTA PARA LANÇAR', 180, 383);
  }
}

/** Paga a aventura uma vez, no fim: XP/missões do Treinador e moedas pelo placar e pelas capturas. */
function grantReward(): void {
  const s = state.value;
  if (rewarded || (s.phase !== 'won' && s.phase !== 'over')) return;
  rewarded = true;
  syncCaughtDex();
  const won = s.phase === 'won';
  recordEvent({ type: 'minigame', game: 'pinball', won, score: Math.min(100, Math.round(s.score / 100)) });
  const gained = addCoins(pinballReward(s));
  rewardText.value = gained > 0 ? `+${gained} moedas` : '';
  adventure.value = {
    bestStage: Math.max(adventure.value.bestStage, s.stage),
    completions: adventure.value.completions + (won ? 1 : 0),
    bestScore: Math.max(adventure.value.bestScore, s.score),
  };
  try {
    localStorage.setItem(ADVENTURE_KEY, JSON.stringify(adventure.value));
  } catch {
    // Só não guarda o histórico da aventura.
  }
  if (effects.value) vibrate(won ? { kind: 'win' } : { kind: 'lose' });
}

function tick(time: number): void {
  const dt = lastTime ? Math.min(50, time - lastTime) : 16;
  lastTime = time;
  const events = stepPinball(state.value, { left: left.value, right: right.value }, dt);
  sound(events);
  if (effects.value) {
    if (events.includes('drain')) vibrate({ kind: 'out', mine: true });
    else if (events.includes('tilt')) vibrate({ kind: 'shrink' });
    else if (events.includes('reward') || events.includes('mode')) vibrate({ kind: 'reaction' });
    else if (events.includes('bump')) vibrate({ kind: 'bumper' });
  }
  grantReward();
  if (state.value.phase === 'playing') {
    trail.unshift({ x: state.value.ball.x, y: state.value.ball.y });
    if (trail.length > 8) trail.length = 8;
  } else trail.length = 0;
  if (state.value.best > persistedBest) {
    try { localStorage.setItem(BEST_KEY, String(state.value.best)); persistedBest = state.value.best; } catch { /* armazenamento opcional */ }
  }
  paint();
  if (time - hudTime > 70) { triggerRef(state); hudTime = time; }
  frame = requestAnimationFrame(tick);
}

function launch(): void {
  if (state.value.phase === 'over' || state.value.phase === 'won') {
    state.value = createPinballState(Math.max(savedBest(), state.value.best));
    rewarded = false;
    rewardText.value = '';
  }
  if (launchPinball(state.value)) sound(['launch']);
  triggerRef(state);
}
function nudge(direction: -1 | 1): void { sound(nudgePinball(state.value, direction)); triggerRef(state); }
function useAbility(): void {
  const skill = partnerSkill.value;
  if (skill && activatePinballAbility(state.value, skill.ability)) sound(['reward']);
  triggerRef(state);
}
function pressFlipper(event: PointerEvent, side: 'left' | 'right'): void {
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  if (side === 'left') left.value = true;
  else right.value = true;
}
function releaseFlipper(side: 'left' | 'right'): void {
  if (side === 'left') left.value = false;
  else right.value = false;
}
function releaseAllFlippers(): void { left.value = false; right.value = false; }
function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); return; }
  if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') left.value = true;
  else if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') right.value = true;
  else if (event.key === ' ' || event.key === 'Enter') { if (!event.repeat) launch(); }
  else if (event.key.toLowerCase() === 'q') { if (!event.repeat) nudge(-1); }
  else if (event.key.toLowerCase() === 'e') { if (!event.repeat) nudge(1); }
  else if (event.key.toLowerCase() === 'f') { if (!event.repeat) useAbility(); }
  else return;
  event.preventDefault();
}
function onKeyUp(event: KeyboardEvent): void {
  if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') left.value = false;
  if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') right.value = false;
}
onMounted(() => {
  const element = canvas.value;
  if (element) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    element.width = PINBALL_W * dpr; element.height = PINBALL_H * dpr;
    element.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', releaseAllFlippers);
  frame = requestAnimationFrame(tick);
});
onBeforeUnmount(() => {
  syncCaughtDex();
  cancelAnimationFrame(frame);
  if (bannerTimer) clearTimeout(bannerTimer);
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', releaseAllFlippers);
  void audio?.close();
});
</script>

<template>
  <section class="pinball-game" :style="{ '--stage-tint': stage?.tint ?? '#65dca6' }" aria-label="Poképinball da Vila">
    <header class="pinball-top">
      <div class="pinball-brand"><small>AVENTURA DA VILA</small><h2>Poképinball</h2></div>
      <div class="pinball-scores" role="status">
        <span><small>PONTOS</small><b>{{ state.score.toLocaleString('pt-BR') }}</b></span>
        <span><small>RECORDE</small><b>{{ state.best.toLocaleString('pt-BR') }}</b></span>
        <span><small>BOLAS</small><b>{{ state.balls }}</b></span>
        <span><small>COMBO</small><b>×{{ state.combo || 1 }}</b></span>
      </div>
      <button type="button" class="pinball-icon" :aria-expanded="menuOpen" aria-label="Menu do Pinball" @click="menuOpen = !menuOpen">☰</button>
      <button type="button" class="pinball-icon" aria-label="Sair do Pinball" @click="emit('close')">✕</button>
    </header>

    <div class="pinball-stagebar">
      <div class="pinball-stage-line">
        <small>ETAPA {{ state.stage + 1 }}</small>
        <strong>{{ state.phase === 'over' ? 'Fim da aventura' : stage?.title }}</strong>
      </div>
      <p v-if="state.phase === 'playing' && state.mode !== 'normal'">{{ state.mode === 'bonus' ? PINBALL_BOSS_PHASES[state.bossPhase]?.objective : stage?.objective }} · {{ state.progress }}/{{ pinballMissionGoal(state.mode, state.bossPhase) }} · {{ Math.ceil(state.modeMs / 1000) }}s</p>
      <p v-else-if="state.phase === 'playing'">{{ state.charge }}/3 toques para abrir o desafio · alvos ou {{ stage?.species }}</p>
      <p v-else>{{ stage?.encounter }} · {{ stage?.objective }}</p>
      <p v-if="state.bonusKind" class="pinball-bonus" role="status">{{ state.bonusKind === 'fire' ? '🔥 BOLA EM CHAMAS · PONTOS EM DOBRO' : '⚡ BOLA ELÉTRICA · +300 POR BUMPER' }} · {{ Math.ceil(state.bonusMs / 1000) }}s</p>
      <p class="pinball-endless">AVENTURA INFINITA · POKÉDEX {{ caughtDex.length }}/{{ PINBALL_DEX_MAX }}</p>
      <div v-if="state.captured.length" class="pinball-caught" role="status" :aria-label="`Capturados nesta aventura: ${state.captured.length}. Últimos: ${recentCaptures.slice(-6).map((entry) => entry.name).join(', ')}`">
        <small>CAPTURADOS</small>
        <ul>
          <li v-for="(entry, index) in recentCaptures" :key="`${entry.stage}-${index}`" :title="entry.name">
            <img v-if="caughtSprites[entry.dexId]" :src="caughtSprites[entry.dexId]" alt="" />
            <b v-else aria-hidden="true">◆</b>
            <span>{{ entry.name }}</span>
          </li>
        </ul>
        <small v-if="state.captured.length > recentCaptures.length" class="pinball-caught-more">+{{ state.captured.length - recentCaptures.length }}</small>
      </div>
    </div>

    <div class="pinball-board">
      <div class="pinball-table">
        <canvas ref="canvas" :width="PINBALL_W" :height="PINBALL_H" aria-label="Mesa de pinball: use os flippers esquerdo e direito para manter a Pokébola em jogo" />
        <div class="pinball-tint" aria-hidden="true"></div>
        <div v-if="stageBanner" class="pinball-banner" :style="{ '--c': stageBanner.tint }" aria-hidden="true">
          <small>ETAPA {{ state.stage + 1 }}</small>
          <strong>{{ stageBanner.title }}</strong>
          <span>{{ stageBanner.subtitle }}</span>
        </div>
        <button v-if="state.phase !== 'playing'" type="button" class="pinball-launch" @click="launch">{{ state.phase === 'over' || state.phase === 'won' ? 'Nova aventura' : 'Lançar bola' }}</button>
        <p v-if="rewardText" class="pinball-reward" role="status">Prêmio: {{ rewardText }}</p>
      </div>
    </div>

    <p class="pinball-message" role="status">{{ state.messageMs > 0 || state.phase !== 'playing' ? state.message : state.mode === 'normal' ? `Acerte os alvos no topo ou o ${stage?.species ?? 'Pokémon'} que passeia.` : `${Math.ceil(state.modeMs / 1000)}s · ${state.mode === 'bonus' ? PINBALL_BOSS_PHASES[state.bossPhase]?.objective : state.mode === 'evolution' ? 'Acerte os bumpers' : `Capture o ${stage?.species ?? 'Pokémon'} (${state.progress}/${pinballMissionGoal(state.mode, state.bossPhase)})`}` }}</p>

    <div class="pinball-controls">
      <button type="button" class="pinball-flip" aria-label="Flipper esquerdo" @pointerdown.prevent="pressFlipper($event, 'left')" @pointerup="releaseFlipper('left')" @pointercancel="releaseFlipper('left')" @lostpointercapture="releaseFlipper('left')">◀</button>
      <div class="pinball-middle">
        <button type="button" class="pinball-ability" :disabled="!partnerSkill || state.phase !== 'playing' || state.abilityUses === 0" @click="useAbility">{{ partnerSkill?.label ?? 'Habilidade' }}<small v-if="partnerSkill"> · {{ state.abilityUses }}</small></button>
        <p class="pinball-tilt" :class="{ locked: state.tiltLockMs > 0 }" :aria-label="`Sacudidas ${tiltSegments} de 3${state.tiltLockMs > 0 ? ', tilt ativo' : ''}`">
          <span v-for="i in 3" :key="i" :class="{ on: i <= tiltSegments }" />
          <b>{{ state.tiltLockMs > 0 ? 'TILT' : 'Sacudidas' }}</b>
        </p>
      </div>
      <button type="button" class="pinball-flip" aria-label="Flipper direito" @pointerdown.prevent="pressFlipper($event, 'right')" @pointerup="releaseFlipper('right')" @pointercancel="releaseFlipper('right')" @lostpointercapture="releaseFlipper('right')">▶</button>
    </div>

    <div class="pinball-actions">
      <button type="button" :disabled="state.phase !== 'playing'" @click="nudge(-1)">Sacudir ←</button>
      <button type="button" :disabled="state.phase !== 'playing'" @click="nudge(1)">Sacudir →</button>
      <button type="button" :aria-pressed="muted" @click="muted = !muted">{{ muted ? 'Som off' : 'Som on' }}</button>
    </div>

    <div v-if="menuOpen" class="pinball-sheet" role="dialog" aria-label="Menu do Pinball">
      <header><strong>Menu</strong><button type="button" aria-label="Fechar menu" @click="menuOpen = false">×</button></header>
      <div class="pinball-partner"><img v-if="selectedPartner?.thumb" :src="selectedPartner.thumb" alt="" width="34" height="34" /><label>Parceiro <select v-model="selectedPartnerId" :disabled="state.phase !== 'ready' && state.phase !== 'over' && state.phase !== 'won'"><option value="">Sem parceiro</option><option v-for="partner in props.partners" :key="partner.id" :value="partner.id">{{ partner.name }}</option></select></label></div>
      <p class="pinball-skill" role="status">{{ selectedPartner ? partnerSkill ? `${partnerSkill.typeLabel} · ${partnerSkill.description} · ${state.abilityUses} uso por bola` : 'Tipo indisponível para este parceiro; habilidade não ativada.' : props.partners.length ? 'Escolha um Pokémon da Vila ou jogue sem habilidade.' : 'Sem Pokémon disponível na Vila; jogue com a bola neutra.' }}</p>
      <p class="pinball-progress">Capturas: {{ state.caught }} · Evoluções: {{ state.evolved }} · Multiplicador: ×{{ state.multiplier }} · Bola: nível {{ state.ballLevel }} <span v-if="state.saverMs > 0">· Proteção {{ Math.ceil(state.saverMs / 1000) }}s</span><span v-if="state.kickback"> · Resgate pronto</span></p>
      <p class="pinball-progress">Melhor etapa: {{ adventure.bestStage }} · Pokédex do Pinball: {{ caughtDex.length }}/{{ PINBALL_DEX_MAX }} · Recorde: {{ adventure.bestScore.toLocaleString('pt-BR') }}</p>
      <div class="pinball-options">
        <button type="button" :aria-pressed="muted" @click="muted = !muted">{{ muted ? 'Som desligado' : 'Som ligado' }}</button>
        <button type="button" :aria-pressed="effects" @click="effects = !effects">{{ effects ? 'Efeitos ligados' : 'Efeitos desligados' }}</button>
      </div>
      <p class="pinball-help">Teclado: A/← e D/→ controlam os flippers; Espaço lança; Q/E sacodem a mesa. Três sacudidas seguidas causam TILT.</p>
      <p class="pinball-note">Encontros e capturas são desafios desta mesa. Não reconhecem cartas nem adicionam Pokémon à Caixa.</p>
    </div>
  </section>
</template>

<style scoped>
.pinball-game{position:fixed;inset:0;z-index:1000;box-sizing:border-box;display:flex;flex-direction:column;gap:5px;overflow:hidden;padding:max(6px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(6px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left));background:radial-gradient(circle at 50% 5%,#18583d,#102b29 60%,#0a2022);color:#fff7dc;font-family:system-ui,sans-serif;text-align:center;touch-action:manipulation}
.pinball-top{display:flex;align-items:center;gap:6px;text-align:left}.pinball-brand{min-width:0}.pinball-brand small{display:block;font-size:.55rem;letter-spacing:.16em;color:#f7d777;font-weight:800;white-space:nowrap}.pinball-brand h2{margin:0;font-size:1.15rem;line-height:1.1;color:#fffbe9;text-shadow:0 2px #18402d;white-space:nowrap}
.pinball-scores{display:flex;gap:4px;margin-left:auto;padding:3px 4px;border:1px solid #a88d50;border-radius:10px;background:#082b29b8}.pinball-scores span{display:grid;min-width:0;padding:0 2px}.pinball-scores small{font-size:.46rem;letter-spacing:.06em;color:#e2d9a9}.pinball-scores b{font-size:.82rem;color:#fff;font-variant-numeric:tabular-nums}
.pinball-icon{width:34px;height:34px;flex:none;padding:0;border:1px solid #d9b664;border-radius:10px;background:linear-gradient(#245646,#163c36);color:#fff8df;font:800 1rem system-ui;box-shadow:0 2px 0 #08251e}
.pinball-stagebar{display:grid;gap:3px;padding:5px 9px;border:1px solid #a88d50;border-radius:11px;background:#082b29d9;text-align:left}.pinball-stage-line{display:flex;align-items:baseline;gap:7px;min-width:0}.pinball-stage-line small{flex:none;font-size:.55rem;letter-spacing:.1em;font-weight:800;color:var(--stage-tint)}.pinball-stage-line strong{overflow:hidden;font-size:.9rem;white-space:nowrap;text-overflow:ellipsis;color:#ffe39a}.pinball-stagebar p{margin:0;font-size:.7rem;line-height:1.3;color:#fff3cd}
.pinball-bonus{color:#ffd36a!important;font-weight:800;letter-spacing:.02em}
.pinball-endless{color:#9fe8c5!important;font-size:.56rem!important;font-weight:800;letter-spacing:.08em}
.pinball-stage-track{display:flex;gap:5px;max-width:300px}.pinball-stage-track span{height:5px;flex:1;border-radius:9px;background:#395851}.pinball-stage-track span.current{background:#f9c449}.pinball-stage-track span.done{background:#65dca6}
.pinball-caught{display:flex;align-items:center;gap:6px;min-width:0}.pinball-caught>small{flex:none;font-size:.52rem;letter-spacing:.08em;font-weight:800;color:#9fe8c5}.pinball-caught ul{display:flex;gap:4px;margin:0;padding:0 1px 1px;overflow-x:auto;list-style:none;scrollbar-width:none}.pinball-caught ul::-webkit-scrollbar{display:none}.pinball-caught li{display:inline-flex;align-items:center;gap:3px;flex:none;max-width:92px;padding:1px 6px 1px 2px;border:1px solid #5f9276;border-radius:999px;background:#0b3a2ee6;color:#e9ffe9;font-size:.58rem;font-weight:800;white-space:nowrap}.pinball-caught li img{width:auto;height:22px;image-rendering:pixelated}.pinball-caught li b{display:grid;width:18px;height:18px;place-items:center;color:#ffd76a}.pinball-caught li span{overflow:hidden;text-overflow:ellipsis}
.pinball-caught-more{color:#ffd36a!important;letter-spacing:0!important}
.pinball-board{position:relative;flex:1 1 auto;min-height:0;display:grid;place-items:center}.pinball-table{position:relative;height:100%;max-width:100%;aspect-ratio:3/5;border-radius:16px;overflow:hidden;box-shadow:0 10px 38px #0009,0 0 0 3px #eabb45;background:#124d33}.pinball-table canvas{display:block;width:100%;height:100%}.pinball-tint{position:absolute;inset:0;pointer-events:none;background:var(--stage-tint);opacity:.14;mix-blend-mode:screen}.pinball-launch{position:absolute;left:18%;top:64%;width:64%;min-height:40px;border:2px solid #fff1a0;border-radius:12px;background:linear-gradient(#f9dd63,#ce9025);color:#43240e;font:900 .95rem system-ui;box-shadow:0 3px 0 #753f16;cursor:pointer}.pinball-reward{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);margin:0;padding:5px 11px;border-radius:999px;background:#08231ee8;border:1px solid #ffe39a;color:#ffe9b2;font-size:.78rem;font-weight:800;white-space:nowrap}
.pinball-message{min-height:1.1em;margin:0;color:#ffe28a;font-size:.84rem;font-weight:800;text-shadow:0 1px #0a2420;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pinball-controls{display:grid;grid-template-columns:1fr auto 1fr;align-items:stretch;gap:8px}.pinball-flip{min-height:58px;border:2px solid #ffe39a;border-radius:15px;background:linear-gradient(#ed7566,#bc3e43);color:white;font:800 1.4rem system-ui;box-shadow:0 4px 0 #67232b;touch-action:none;user-select:none}.pinball-flip:active{background:#ffa268;transform:translateY(3px);box-shadow:0 1px 0 #67232b}
.pinball-middle{display:grid;grid-template-rows:1fr auto;gap:3px;min-width:96px}.pinball-ability{min-height:34px;padding:3px 6px;border:1px solid #ffe39a;border-radius:9px;background:#a83e43;color:#fff;font:800 .66rem system-ui}.pinball-ability:disabled{opacity:.5}.pinball-ability small{font-weight:700;opacity:.9}.pinball-tilt{display:flex;align-items:center;justify-content:center;gap:3px;margin:0;color:#ffdda1;font-size:.55rem;font-weight:800}.pinball-tilt span{width:7px;height:7px;border-radius:50%;background:#395851}.pinball-tilt span.on{background:#f9c449;box-shadow:0 0 5px #f9c449}.pinball-tilt.locked{color:#ff9d9d}.pinball-tilt.locked span{background:#bc3e43}.pinball-tilt b{margin-left:3px;font-size:.55rem;font-weight:800}
.pinball-actions{display:flex;justify-content:center;flex-wrap:wrap;gap:6px}.pinball-actions button{min-height:32px;padding:4px 10px;border:1px solid #d9b664;border-radius:9px;background:linear-gradient(#245646,#163c36);color:#fff8df;font:700 .7rem system-ui;box-shadow:0 2px 0 #08251e}.pinball-actions button:disabled{opacity:.45;box-shadow:none}
.pinball-sheet{position:absolute;inset:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left));z-index:5;display:grid;align-content:start;gap:8px;overflow-y:auto;padding:12px;border:1px solid #a88d50;border-radius:16px;background:#082b29;box-shadow:0 18px 50px #000c;text-align:left}.pinball-sheet header{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:1.1rem}.pinball-sheet header button{width:38px;height:38px;border:1px solid #d9b664;border-radius:10px;background:#173f36;color:#fff;font:800 1.2rem system-ui}.pinball-partner{display:flex;align-items:center;gap:7px}.pinball-partner img{object-fit:contain;image-rendering:pixelated}.pinball-partner label{display:flex;align-items:center;gap:5px;font-size:.78rem;font-weight:800}.pinball-partner select{max-width:150px;padding:5px;border:1px solid #d9b664;border-radius:8px;background:#102f2b;color:#fff}.pinball-skill,.pinball-progress,.pinball-help,.pinball-note{margin:0;color:#c9ddcd;font-size:.76rem;line-height:1.4}.pinball-skill{color:#ffdda1}.pinball-progress{color:#ffe5a7;font-weight:700}.pinball-options{display:flex;gap:6px;flex-wrap:wrap}.pinball-options button{min-height:34px;padding:5px 9px;border:1px solid #d9b664;border-radius:9px;background:#173f36;color:#fff;font:700 .72rem system-ui}
.pinball-banner{position:absolute;inset:0;z-index:2;display:grid;place-content:center;gap:3px;pointer-events:none;background:linear-gradient(transparent,#061e1bd9 28% 72%,transparent);animation:pinball-banner 1.8s ease-out both;text-align:center}.pinball-banner small{font-size:.66rem;letter-spacing:.18em;font-weight:900;color:var(--c)}.pinball-banner strong{font-size:1.45rem;line-height:1.1;color:#fff;text-shadow:0 2px 0 #0009}.pinball-banner span{font-size:.78rem;color:#ffe9b2}
@keyframes pinball-banner{0%{opacity:0;transform:scale(.94)}14%,76%{opacity:1;transform:scale(1)}100%{opacity:0}}
@media(prefers-reduced-motion:reduce){.pinball-banner{animation:none}}
@media(max-height:700px){.pinball-message{display:none}.pinball-brand small{display:none}.pinball-flip{min-height:50px}.pinball-actions button{min-height:28px;padding:2px 8px}}
@media(max-width:380px){.pinball-brand{display:none}.pinball-scores{flex:1 1 auto;margin-left:0;justify-content:space-around}.pinball-icon{width:30px;height:30px}}
@media(min-width:700px){.pinball-game{max-width:560px;margin:auto;border-radius:18px}}
</style>
