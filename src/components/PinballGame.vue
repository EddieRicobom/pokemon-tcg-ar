<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, triggerRef } from 'vue';
import { createPinballState, launchPinball, nudgePinball, PINBALL_BUMPERS, PINBALL_H, PINBALL_TARGETS, PINBALL_W, stepPinball } from '../core/pinball';
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
let frame = 0;
let lastTime = 0;
let hudTime = 0;
let audio: AudioContext | null = null;

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
  const bg = c.createLinearGradient(0, 0, 0, PINBALL_H);
  bg.addColorStop(0, '#142244'); bg.addColorStop(0.58, '#182f4d'); bg.addColorStop(1, '#101729');
  c.fillStyle = bg; c.fillRect(0, 0, PINBALL_W, PINBALL_H);
  c.strokeStyle = '#6ec9d9'; c.lineWidth = 5;
  c.beginPath(); c.moveTo(28, 585); c.lineTo(28, 68); c.quadraticCurveTo(180, -12, 332, 68); c.lineTo(332, 585); c.stroke();
  c.strokeStyle = '#396784'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(42, 490); c.lineTo(108, 547); c.moveTo(318, 490); c.lineTo(252, 547); c.stroke();
  // Círculos geométricos e indicadores são elementos funcionais da mesa original deste minijogo.
  c.strokeStyle = '#335a76'; c.lineWidth = 1;
  for (let radius = 62; radius <= 130; radius += 34) {
    c.beginPath(); c.arc(180, 268, radius, 0, Math.PI * 2); c.stroke();
  }
  c.fillStyle = s.mode === 'capture' ? '#4bcb9a' : s.mode === 'evolution' ? '#c5a0ff' : s.mode === 'bonus' ? '#ffd973' : '#86aac6';
  c.font = 'bold 15px system-ui'; c.textAlign = 'center';
  c.fillText(s.mode === 'capture' ? 'CAPTURA' : s.mode === 'evolution' ? 'EVOLUÇÃO' : s.mode === 'bonus' ? 'BÔNUS' : 'ZONA DE CAPTURA', 180, 273);
  c.font = '11px system-ui';
  c.fillText(s.mode === 'normal' ? `${s.charge}/3 ALVOS` : `${s.progress}/${s.mode === 'capture' ? 5 : s.mode === 'evolution' ? 4 : 6} ACERTOS`, 180, 291);
  PINBALL_BUMPERS.forEach((bumper, index) => {
    c.beginPath(); c.arc(bumper.x, bumper.y, bumper.r + 4, 0, Math.PI * 2); c.fillStyle = '#254c71'; c.fill();
    c.beginPath(); c.arc(bumper.x, bumper.y, bumper.r, 0, Math.PI * 2); c.fillStyle = index < 3 ? '#f4ac71' : '#df85ac'; c.fill();
    c.beginPath(); c.arc(bumper.x, bumper.y, bumper.r * 0.57, 0, Math.PI * 2); c.fillStyle = '#fff2cc'; c.fill();
  });
  PINBALL_TARGETS.forEach((target, index) => {
    c.beginPath(); c.arc(target.x, target.y, target.r + 5, 0, Math.PI * 2);
    c.fillStyle = s.mode === 'normal' ? '#247080' : '#36aa8f'; c.fill();
    c.beginPath(); c.arc(target.x, target.y, target.r, 0, Math.PI * 2); c.fillStyle = '#b9f7e7'; c.fill();
    c.fillStyle = '#143e50'; c.font = 'bold 12px system-ui'; c.fillText(String(index + 1), target.x, target.y + 4);
  });
  c.fillStyle = s.kickback ? '#83f2aa' : '#52788a';
  c.font = 'bold 11px system-ui'; c.fillText('RESGATE', 70, 475); c.fillText('RESGATE', 290, 475);
  const ctx = c;
  function flipper(pivotX: number, tipX: number, pressed: boolean): void {
    ctx.lineCap = 'round'; ctx.lineWidth = 14; ctx.strokeStyle = pressed ? '#ffe388' : '#f0ad77';
    ctx.beginPath(); ctx.moveTo(pivotX, 529); ctx.lineTo(tipX, pressed ? 496 : 544); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff2d4'; ctx.stroke();
  }
  flipper(119, 183, left.value && s.tiltLockMs === 0);
  flipper(241, 177, right.value && s.tiltLockMs === 0);
  c.beginPath(); c.arc(s.ball.x, s.ball.y, 7, 0, Math.PI * 2); c.fillStyle = '#f5f9ff'; c.fill();
  c.strokeStyle = '#e24f61'; c.lineWidth = 3; c.beginPath(); c.arc(s.ball.x, s.ball.y, 7, Math.PI, 2 * Math.PI); c.stroke();
  c.fillStyle = '#283954'; c.fillRect(s.ball.x - 6, s.ball.y - 1, 12, 2);
  c.beginPath(); c.arc(s.ball.x, s.ball.y, 2, 0, Math.PI * 2); c.fillStyle = '#f5f9ff'; c.fill();
  if (s.phase !== 'playing') {
    c.fillStyle = '#071420cf'; c.fillRect(31, 345, 298, 93);
    c.fillStyle = '#f4f7ff'; c.font = 'bold 17px system-ui';
    c.fillText(s.phase === 'over' ? 'FIM DA PARTIDA' : 'PRONTA PARA LANÇAR', 180, 383);
    c.font = '12px system-ui'; c.fillText(s.phase === 'over' ? 'Tente outra partida!' : 'Toque em Lançar ou pressione Espaço', 180, 408);
  }
}

function tick(time: number): void {
  const dt = lastTime ? Math.min(50, time - lastTime) : 16;
  lastTime = time;
  sound(stepPinball(state.value, { left: left.value, right: right.value }, dt));
  if (state.value.phase === 'over') {
    try { localStorage.setItem(BEST_KEY, String(state.value.best)); } catch { /* armazenamento opcional */ }
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
    <div class="pinball-stats" role="status"><span>PONTOS <b>{{ state.score.toLocaleString('pt-BR') }}</b></span><span>RECORDE <b>{{ state.best.toLocaleString('pt-BR') }}</b></span><span>BOLAS <b>{{ state.balls }}</b></span></div>
    <div class="pinball-board"><canvas ref="canvas" :width="PINBALL_W" :height="PINBALL_H" aria-label="Mesa de pinball: use os flippers esquerdo e direito para manter a Pokébola em jogo" /></div>
    <p class="pinball-message" role="status">{{ state.messageMs > 0 || state.phase !== 'playing' ? state.message : state.mode === 'normal' ? 'Acerte os alvos para iniciar uma missão.' : `${Math.ceil(state.modeMs / 1000)}s para concluir a missão` }}</p>
    <div class="pinball-controls"><button type="button" class="pinball-flip" aria-label="Flipper esquerdo" @pointerdown.prevent="left = true" @pointerup="left = false" @pointercancel="left = false" @pointerleave="left = false">◀ ESQUERDO</button><button type="button" class="pinball-flip" aria-label="Flipper direito" @pointerdown.prevent="right = true" @pointerup="right = false" @pointercancel="right = false" @pointerleave="right = false">DIREITO ▶</button></div>
    <div class="pinball-actions"><button type="button" :disabled="state.phase === 'playing'" @click="launch">{{ state.phase === 'over' ? 'Jogar novamente' : 'Lançar bola' }}</button><button type="button" :disabled="state.phase !== 'playing'" @click="nudge(-1)">Sacudir ←</button><button type="button" :disabled="state.phase !== 'playing'" @click="nudge(1)">Sacudir →</button><button type="button" :aria-pressed="muted" @click="muted = !muted">{{ muted ? 'Som desligado' : 'Som ligado' }}</button></div>
    <p class="pinball-help">Teclado: A/← e D/→ controlam os flippers; Espaço lança; Q/E sacodem a mesa. Três sacudidas seguidas causam TILT.</p>
    <p class="pinball-progress">Capturas na mesa: {{ state.caught }} · Evoluções na mesa: {{ state.evolved }} · Multiplicador: ×{{ state.multiplier }} · Bola: nível {{ state.ballLevel }}</p>
    <p class="pinball-note">As missões valem pontos apenas nesta partida. Elas não adicionam Pokémon à Caixa nem reconhecem cartas.</p>
  </section>
</template>

<style scoped>
.pinball-game{box-sizing:border-box;min-height:100%;padding:12px 12px 24px;background:radial-gradient(circle at 50% 8%,#22446b,#0e1d34 65%,#091423);color:#f4f7ff;font-family:system-ui,sans-serif;text-align:center;touch-action:manipulation}
.pinball-header{max-width:620px;margin:0 auto 8px;display:flex;justify-content:space-between;align-items:center;text-align:left}.pinball-header small{font-size:.66rem;letter-spacing:.18em;color:#99d9e9}.pinball-header h2{margin:2px 0;font-size:1.3rem}.pinball-header button,.pinball-actions button{border:1px solid #7db9cf;background:#173b59;color:#f4f7ff;border-radius:10px;padding:9px 13px;font:inherit;font-weight:700}.pinball-header button{min-width:68px}
.pinball-stats{max-width:620px;margin:0 auto 8px;display:flex;justify-content:space-around;gap:8px}.pinball-stats span{font-size:.65rem;letter-spacing:.08em;color:#a8cad9}.pinball-stats b{display:block;color:#fff;font-size:1rem;letter-spacing:0}
.pinball-board{width:min(100%,360px);margin:auto;border-radius:21px;overflow:hidden;box-shadow:0 10px 38px #0008,0 0 0 3px #6ec9d9;background:#142244}.pinball-board canvas{display:block;width:100%;height:auto;aspect-ratio:3/5}
.pinball-message{min-height:1.4em;margin:10px 0;color:#ffe3a1;font-size:.9rem;font-weight:700}.pinball-controls{max-width:440px;margin:0 auto;display:flex;gap:12px}.pinball-flip{flex:1;min-height:64px;border:2px solid #ffdf9a;border-radius:16px;background:linear-gradient(#d37972,#9d495d);color:white;font:700 1rem system-ui;touch-action:none;user-select:none}.pinball-flip:active{background:#f3a56f;transform:translateY(2px)}
.pinball-actions{max-width:620px;margin:10px auto;display:flex;justify-content:center;flex-wrap:wrap;gap:6px}.pinball-actions button:disabled{opacity:.45}.pinball-help,.pinball-progress,.pinball-note{max-width:620px;margin:6px auto;color:#aac6d5;font-size:.76rem;line-height:1.35}.pinball-progress{color:#f5dcac}.pinball-note{color:#d5e0e8}
@media(max-height:780px){.pinball-board{width:min(100%,285px)}.pinball-help{display:none}.pinball-flip{min-height:50px}}
</style>
