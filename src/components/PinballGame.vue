<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, triggerRef } from 'vue';
import { createPinballState, launchPinball, nudgePinball, pinballMissionGoal, PINBALL_BUMPERS, PINBALL_H, PINBALL_TARGETS, PINBALL_W, stepPinball } from '../core/pinball';
import type { PinballEvent } from '../core/pinball';

const emit = defineEmits<{ close: [] }>();
const BEST_KEY = 'tcg-ar-pinball-best-v1';
function savedBest(): number {
  try { return Math.max(0, Number(localStorage.getItem(BEST_KEY)) || 0); } catch { return 0; }
}
const state = shallowRef(createPinballState(savedBest()));
const canvas = ref<HTMLCanvasElement | null>(null);
const left = ref(false);
const right = ref(false);
const muted = ref(false);
const effects = ref(true);
const boardArt = new Image();
boardArt.src = `${import.meta.env.BASE_URL}art/pinball/mesa-floresta.png`;
boardArt.onload = () => paint();
const trail: { x: number; y: number }[] = [];
let frame = 0;
let lastTime = 0;
let hudTime = 0;
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

function paint(): void {
  const element = canvas.value;
  const c = element?.getContext('2d');
  if (!c) return;
  const s = state.value;
  c.clearRect(0, 0, PINBALL_W, PINBALL_H);
  if (boardArt.complete && boardArt.naturalWidth) c.drawImage(boardArt, 0, 0, PINBALL_W, PINBALL_H);
  else { c.fillStyle = '#144d35'; c.fillRect(0, 0, PINBALL_W, PINBALL_H); }
  c.fillStyle = '#042d1a38'; c.fillRect(22, 33, 316, 536);
  c.lineCap = 'round';
  c.strokeStyle = '#fff3aa'; c.lineWidth = 5;
  c.beginPath(); c.moveTo(29, 450); c.lineTo(29, 65); c.quadraticCurveTo(180, 7, 331, 65); c.lineTo(331, 450); c.stroke();
  c.strokeStyle = '#665727'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(300, 170); c.lineTo(300, 515); c.stroke();
  c.strokeStyle = '#ffe395'; c.lineWidth = 4;
  c.beginPath(); c.moveTo(74, 458); c.lineTo(100, 522); c.moveTo(286, 458); c.lineTo(260, 522); c.stroke();
  c.fillStyle = '#f7da77'; c.font = 'bold 11px system-ui'; c.textAlign = 'center';
  c.fillText('TRILHA', 314, 290);
  c.beginPath(); c.moveTo(76, 389); c.lineTo(119, 428); c.lineTo(91, 423); c.closePath();
  c.moveTo(284, 389); c.lineTo(241, 428); c.lineTo(269, 423); c.closePath();
  c.fillStyle = '#df5b54'; c.fill(); c.strokeStyle = '#ffe395'; c.lineWidth = 3; c.stroke();
  const modeColor = s.mode === 'capture' ? '#56e5aa' : s.mode === 'evolution' ? '#d0a5ff' : s.mode === 'bonus' ? '#ffdf6d' : '#b8f0df';
  c.fillStyle = '#092d2bdc'; c.strokeStyle = modeColor; c.lineWidth = 3;
  c.beginPath(); c.roundRect(101, 254, 158, 58, 15); c.fill(); c.stroke();
  c.fillStyle = modeColor; c.font = 'bold 15px system-ui';
  c.fillText(s.mode === 'capture' ? 'CAPTURA' : s.mode === 'evolution' ? 'EVOLUÇÃO' : s.mode === 'bonus' ? 'BÔNUS' : 'MISSÃO', 180, 277);
  c.fillStyle = '#fff'; c.font = 'bold 11px system-ui';
  c.fillText(s.mode === 'normal' ? `${s.charge}/3 ALVOS` : `${s.progress}/${pinballMissionGoal(s.mode)} ${s.mode === 'evolution' ? 'BUMPERS' : 'ALVOS'}`, 180, 297);
  PINBALL_BUMPERS.forEach((bumper, index) => {
    c.beginPath(); c.arc(bumper.x, bumper.y, bumper.r + 5, 0, Math.PI * 2); c.fillStyle = '#592f24'; c.fill();
    c.strokeStyle = '#ffef9a'; c.lineWidth = 3; c.stroke();
    c.beginPath(); c.arc(bumper.x, bumper.y, bumper.r, 0, Math.PI * 2); c.fillStyle = index < 3 ? '#eb5953' : '#6da5e7'; c.fill();
    c.beginPath(); c.arc(bumper.x, bumper.y, bumper.r * 0.56, 0, Math.PI * 2); c.fillStyle = '#fff9d8'; c.fill();
    c.strokeStyle = '#563c32'; c.lineWidth = 2; c.beginPath(); c.moveTo(bumper.x - bumper.r + 2, bumper.y); c.lineTo(bumper.x + bumper.r - 2, bumper.y); c.stroke();
    c.beginPath(); c.arc(bumper.x, bumper.y, 3, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
  });
  PINBALL_TARGETS.forEach((target, index) => {
    c.beginPath(); c.arc(target.x, target.y, target.r + 5, 0, Math.PI * 2);
    c.fillStyle = s.mode === 'normal' ? '#f9c449' : modeColor; c.fill();
    c.beginPath(); c.arc(target.x, target.y, target.r, 0, Math.PI * 2); c.fillStyle = '#173c34'; c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 12px system-ui'; c.fillText(['C', 'A', 'T'][index]!, target.x, target.y + 4);
  });
  c.fillStyle = s.kickback ? '#fff091' : '#e0e7c2';
  c.font = 'bold 9px system-ui'; c.fillText('RESGATE', 73, 470); c.fillText('RESGATE', 270, 470);
  const ctx = c;
  function flipper(pivotX: number, tipX: number, pressed: boolean): void {
    ctx.lineCap = 'round'; ctx.lineWidth = 17; ctx.strokeStyle = '#40242c';
    ctx.beginPath(); ctx.moveTo(pivotX, 525); ctx.lineTo(tipX, pressed ? 497 : 542); ctx.stroke();
    ctx.lineWidth = 12; ctx.strokeStyle = pressed ? '#ffe079' : '#f6a969'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff6d0'; ctx.stroke();
  }
  flipper(112, 179, left.value && s.tiltLockMs === 0);
  flipper(248, 181, right.value && s.tiltLockMs === 0);
  if (effects.value && s.phase === 'playing') {
    trail.forEach((point, index) => {
      c.beginPath(); c.arc(point.x, point.y, 2 + index * 0.48, 0, Math.PI * 2);
      c.fillStyle = `rgba(255, 245, 194, ${index * 0.055})`; c.fill();
    });
  }
  c.beginPath(); c.ellipse(s.ball.x + 2, s.ball.y + 3, 7, 4, 0, 0, Math.PI * 2); c.fillStyle = '#00271988'; c.fill();
  c.beginPath(); c.arc(s.ball.x, s.ball.y, 7, 0, Math.PI * 2); c.fillStyle = '#f5f9ff'; c.fill();
  c.strokeStyle = '#e24f61'; c.lineWidth = 3; c.beginPath(); c.arc(s.ball.x, s.ball.y, 7, Math.PI, 2 * Math.PI); c.stroke();
  c.fillStyle = '#283954'; c.fillRect(s.ball.x - 6, s.ball.y - 1, 12, 2);
  c.beginPath(); c.arc(s.ball.x, s.ball.y, 2, 0, Math.PI * 2); c.fillStyle = '#f5f9ff'; c.fill();
  if (s.phase !== 'playing') {
    c.fillStyle = '#071420cf'; c.fillRect(31, 345, 298, 93);
    c.fillStyle = '#f4f7ff'; c.font = 'bold 17px system-ui';
    c.fillText(s.phase === 'over' ? 'FIM DA PARTIDA' : 'PRONTA PARA LANÇAR', 180, 383);
  }
}

function tick(time: number): void {
  const dt = lastTime ? Math.min(50, time - lastTime) : 16;
  lastTime = time;
  sound(stepPinball(state.value, { left: left.value, right: right.value }, dt));
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
  if (state.value.phase === 'over') state.value = createPinballState(Math.max(savedBest(), state.value.best));
  if (launchPinball(state.value)) sound(['launch']);
  triggerRef(state);
}
function nudge(direction: -1 | 1): void { sound(nudgePinball(state.value, direction)); triggerRef(state); }
function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); return; }
  if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') left.value = true;
  else if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') right.value = true;
  else if (event.key === ' ' || event.key === 'Enter') { if (!event.repeat) launch(); }
  else if (event.key.toLowerCase() === 'q') { if (!event.repeat) nudge(-1); }
  else if (event.key.toLowerCase() === 'e') { if (!event.repeat) nudge(1); }
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
  frame = requestAnimationFrame(tick);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  void audio?.close();
});
</script>

<template>
  <section class="pinball-game" aria-label="Poképinball da Vila">
    <header class="pinball-header"><div><small>MINIJOGO DA VILA</small><h2>Poképinball</h2></div><button type="button" @click="emit('close')">Sair</button></header>
    <div class="pinball-stats" role="status"><span>PONTOS <b>{{ state.score.toLocaleString('pt-BR') }}</b></span><span>RECORDE <b>{{ state.best.toLocaleString('pt-BR') }}</b></span><span>BOLAS <b>{{ state.balls }}</b></span><span>COMBO <b>×{{ state.combo || 1 }}</b></span></div>
    <div class="pinball-board"><canvas ref="canvas" :width="PINBALL_W" :height="PINBALL_H" aria-label="Mesa de pinball: use os flippers esquerdo e direito para manter a Pokébola em jogo" /><button v-if="state.phase !== 'playing'" type="button" class="pinball-board-launch" @click="launch">{{ state.phase === 'over' ? 'Jogar novamente' : 'Lançar bola' }}</button></div>
    <p class="pinball-message" role="status">{{ state.messageMs > 0 || state.phase !== 'playing' ? state.message : state.mode === 'normal' ? 'Acerte 3 alvos para abrir uma missão.' : `${Math.ceil(state.modeMs / 1000)}s · ${state.mode === 'evolution' ? 'Acerte os bumpers' : 'Acerte os alvos'}` }}</p>
    <div class="pinball-controls"><button type="button" class="pinball-flip" aria-label="Flipper esquerdo" @pointerdown.prevent="left = true" @pointerup="left = false" @pointercancel="left = false" @pointerleave="left = false">◀ ESQUERDO</button><button type="button" class="pinball-flip" aria-label="Flipper direito" @pointerdown.prevent="right = true" @pointerup="right = false" @pointercancel="right = false" @pointerleave="right = false">DIREITO ▶</button></div>
    <div class="pinball-actions"><button type="button" :disabled="state.phase !== 'playing'" @click="nudge(-1)">Sacudir ←</button><button type="button" :disabled="state.phase !== 'playing'" @click="nudge(1)">Sacudir →</button><button type="button" :aria-pressed="muted" @click="muted = !muted">{{ muted ? 'Som desligado' : 'Som ligado' }}</button><button type="button" :aria-pressed="effects" @click="effects = !effects">{{ effects ? 'Efeitos ligados' : 'Efeitos desligados' }}</button></div>
    <p class="pinball-help">Teclado: A/← e D/→ controlam os flippers; Espaço lança; Q/E sacodem a mesa. Três sacudidas seguidas causam TILT.</p>
    <p class="pinball-progress">Capturas: {{ state.caught }} · Evoluções: {{ state.evolved }} · Multiplicador: ×{{ state.multiplier }} · Bola: nível {{ state.ballLevel }} <span v-if="state.saverMs > 0">· Proteção {{ Math.ceil(state.saverMs / 1000) }}s</span><span v-if="state.kickback"> · Resgate pronto</span></p>
    <p class="pinball-note">As missões valem pontos apenas nesta partida. Elas não adicionam Pokémon à Caixa nem reconhecem cartas.</p>
  </section>
</template>

<style scoped>
.pinball-game{box-sizing:border-box;min-height:100%;padding:12px 12px 24px;background:radial-gradient(circle at 50% 5%,#18583d,#102b29 60%,#0a2022);color:#fff7dc;font-family:system-ui,sans-serif;text-align:center;touch-action:manipulation}
.pinball-header{max-width:620px;margin:0 auto 9px;display:flex;justify-content:space-between;align-items:center;text-align:left}.pinball-header small{font-size:.65rem;letter-spacing:.18em;color:#f7d777;font-weight:800}.pinball-header h2{margin:2px 0;font-size:1.42rem;color:#fffbe9;text-shadow:0 2px #18402d}.pinball-header button,.pinball-actions button{border:1px solid #d9b664;background:linear-gradient(#245646,#163c36);color:#fff8df;border-radius:11px;padding:9px 13px;font:inherit;font-weight:700;box-shadow:0 2px 0 #08251e}.pinball-header button{min-width:68px}
.pinball-stats{max-width:620px;margin:0 auto 10px;display:flex;justify-content:space-around;gap:5px;padding:6px 5px;background:#082b29a8;border:1px solid #a88d50;border-radius:13px}.pinball-stats span{font-size:.62rem;letter-spacing:.08em;color:#e2d9a9}.pinball-stats b{display:block;color:#fff;font-size:1rem;letter-spacing:0;font-variant-numeric:tabular-nums}
.pinball-board{position:relative;width:min(100%,360px,max(235px,calc((100dvh - 255px)*.6)));margin:auto;border-radius:18px;overflow:hidden;box-shadow:0 10px 38px #0009,0 0 0 3px #eabb45;background:#124d33}.pinball-board canvas{display:block;width:100%;height:auto;aspect-ratio:3/5}.pinball-board-launch{position:absolute;left:20%;top:66%;width:60%;min-height:37px;border:2px solid #fff1a0;border-radius:12px;background:linear-gradient(#f9dd63,#ce9025);color:#43240e;font:900 .9rem system-ui;box-shadow:0 3px 0 #753f16;cursor:pointer}
.pinball-message{min-height:1.4em;margin:10px 0;color:#ffe28a;font-size:.92rem;font-weight:800;text-shadow:0 1px #0a2420}.pinball-controls{max-width:440px;margin:0 auto;display:flex;gap:12px}.pinball-flip{flex:1;min-height:64px;border:2px solid #ffe39a;border-radius:17px;background:linear-gradient(#ed7566,#bc3e43);color:white;font:800 1rem system-ui;box-shadow:0 4px 0 #67232b;touch-action:none;user-select:none}.pinball-flip:active{background:#ffa268;transform:translateY(3px);box-shadow:0 1px 0 #67232b}
.pinball-actions{max-width:620px;margin:12px auto;display:flex;justify-content:center;flex-wrap:wrap;gap:7px}.pinball-actions button:disabled{opacity:.48;box-shadow:none}.pinball-help,.pinball-progress,.pinball-note{max-width:620px;margin:7px auto;color:#c9ddcd;font-size:.76rem;line-height:1.4}.pinball-progress{color:#ffe5a7;font-weight:700}.pinball-note{color:#d7e3d3}
@media(max-height:780px){.pinball-help{display:none}.pinball-flip{min-height:50px}}
</style>
