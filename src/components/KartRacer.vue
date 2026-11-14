<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { KartFinish, KartRaceHandle } from '../box/start-kart-race';
import { kartPosition, KART_LAPS, type KartRaceState } from '../core/kart-race';

const props = withDefaults(defineProps<{ playerDexId: number; opponentDexIds?: number[] }>(), { opponentDexIds: () => [25, 133, 4] });
const emit = defineEmits<{ close: []; finish: [result: KartFinish] }>();
const host = ref<HTMLElement | null>(null);
const race = ref<KartRaceState | null>(null);
const result = ref<KartFinish | null>(null);
const error = ref('');
const pressed = new Set<string>();
let handle: KartRaceHandle | null = null;
let cancelled = false;
const touch = { left: false, right: false, accelerate: false, brake: false };
const lap = computed(() => Math.min(KART_LAPS, (race.value?.cars[0]?.lap ?? 0) + 1));
const position = computed(() => race.value ? kartPosition(race.value, 0) : 1);
const elapsed = computed(() => (race.value?.elapsed ?? 0).toFixed(1));

function syncInput(): void {
  handle?.setInput({
    throttle: pressed.has('ArrowUp') || pressed.has('KeyW') || touch.accelerate ? 1 : pressed.has('ArrowDown') || pressed.has('KeyS') ? -0.5 : 0,
    steer: (pressed.has('ArrowRight') || pressed.has('KeyD') || touch.right ? 1 : 0) - (pressed.has('ArrowLeft') || pressed.has('KeyA') || touch.left ? 1 : 0),
    brake: pressed.has('Space') || touch.brake,
  });
}
function keyDown(event: KeyboardEvent): void {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(event.code)) return;
  event.preventDefault();
  pressed.add(event.code);
  syncInput();
}
function keyUp(event: KeyboardEvent): void { pressed.delete(event.code); syncInput(); }
function setTouch(control: keyof typeof touch, value: boolean): void { touch[control] = value; syncInput(); }
function releaseControls(): void {
  pressed.clear();
  touch.left = touch.right = touch.accelerate = touch.brake = false;
  syncInput();
}
onMounted(async () => {
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', releaseControls);
  try {
    if (!host.value) return;
    const { startKartRace } = await import('../box/start-kart-race');
    if (cancelled) return;
    const running = await startKartRace(host.value, props.playerDexId, props.opponentDexIds, (state) => { race.value = { ...state, cars: state.cars.map((car) => ({ ...car })) }; }, (finish) => {
      result.value = finish;
      emit('finish', finish);
      releaseControls();
    });
    if (cancelled) running.dispose();
    else { handle = running; syncInput(); }
  } catch {
    error.value = 'Não foi possível iniciar a pista 3D neste navegador.';
  }
});
onBeforeUnmount(() => {
  cancelled = true;
  handle?.dispose();
  window.removeEventListener('keydown', keyDown);
  window.removeEventListener('keyup', keyUp);
  window.removeEventListener('blur', releaseControls);
});
</script>

<template>
  <section class="kart-racer" aria-label="Kart Racer">
    <div ref="host" class="kart-racer-scene"></div>
    <div class="kart-racer-hud">
      <strong>Kart Racer</strong>
      <span>Volta {{ lap }}/{{ KART_LAPS }}</span>
      <span>{{ position }}º de {{ race?.cars.length ?? 4 }}</span>
      <span>{{ elapsed }} s</span>
      <button type="button" class="kart-racer-close" aria-label="Sair da corrida" @click="emit('close')">✕</button>
    </div>
    <p v-if="error" class="kart-racer-message">{{ error }}</p>
    <div v-if="result" class="kart-racer-result" role="status">
      <strong>{{ result.completed ? 'Chegada!' : 'Prova encerrada' }}</strong>
      <span>{{ result.completed ? `${result.position}º lugar · ${(result.elapsedMs / 1000).toFixed(1)} s` : 'Os oponentes terminaram antes de você.' }}</span>
      <button type="button" @click="emit('close')">Voltar à Vila</button>
    </div>
    <div v-if="!result && !error" class="kart-racer-controls" aria-label="Controles da corrida">
      <div class="kart-racer-steering">
        <button type="button" aria-label="Virar à esquerda" @pointerdown.prevent="setTouch('left', true)" @pointerup="setTouch('left', false)" @pointercancel="setTouch('left', false)" @pointerleave="setTouch('left', false)">◀</button>
        <button type="button" aria-label="Virar à direita" @pointerdown.prevent="setTouch('right', true)" @pointerup="setTouch('right', false)" @pointercancel="setTouch('right', false)" @pointerleave="setTouch('right', false)">▶</button>
      </div>
      <div class="kart-racer-pedals">
        <button type="button" class="brake" aria-label="Frear" @pointerdown.prevent="setTouch('brake', true)" @pointerup="setTouch('brake', false)" @pointercancel="setTouch('brake', false)" @pointerleave="setTouch('brake', false)">Freio</button>
        <button type="button" class="accelerate" aria-label="Acelerar" @pointerdown.prevent="setTouch('accelerate', true)" @pointerup="setTouch('accelerate', false)" @pointercancel="setTouch('accelerate', false)" @pointerleave="setTouch('accelerate', false)">Acelerar</button>
      </div>
    </div>
    <p class="kart-racer-help">Setas ou WASD para dirigir · Espaço para frear</p>
  </section>
</template>

<style scoped>
.kart-racer { position: fixed; inset: 0; z-index: 1000; overflow: hidden; background: #151c29; color: #fff; touch-action: none; font-family: inherit; }
.kart-racer-scene { position: absolute; inset: 0; }
.kart-racer-hud { position: absolute; top: max(12px, env(safe-area-inset-top)); left: 12px; right: 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
.kart-racer-hud > :not(button) { padding: 6px 9px; border: 1px solid #ffffff4d; border-radius: 8px; background: #131d2bc9; text-shadow: 0 1px 2px #000; }
.kart-racer-close { margin-left: auto; }
.kart-racer button { border: 1px solid #ffffff7a; border-radius: 12px; background: #182235df; color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
.kart-racer-close { min-width: 40px; min-height: 38px; }
.kart-racer-controls { position: absolute; bottom: max(38px, env(safe-area-inset-bottom)); left: 15px; right: 15px; display: flex; justify-content: space-between; pointer-events: none; }
.kart-racer-steering, .kart-racer-pedals { display: flex; align-items: end; gap: 10px; pointer-events: auto; }
.kart-racer-controls button { width: clamp(58px, 15vw, 84px); height: clamp(58px, 15vw, 84px); font-size: 18px; user-select: none; -webkit-user-select: none; }
.kart-racer-controls button:active { background: #e8a941; color: #172033; }
.kart-racer-controls .accelerate { background: #278e63e8; }
.kart-racer-controls .brake { background: #b95656e8; }
.kart-racer-help { position: absolute; bottom: 0; left: 0; right: 0; margin: 0; padding: 4px; background: #121b2bd9; font-size: 12px; text-align: center; }
.kart-racer-message, .kart-racer-result { position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%); width: min(80vw, 340px); padding: 24px; border-radius: 18px; background: #172234ef; text-align: center; }
.kart-racer-result { display: grid; gap: 14px; }
.kart-racer-result strong { font-size: 25px; }
.kart-racer-result button { padding: 12px; }
</style>
