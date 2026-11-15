<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { KartFinish, KartRaceHandle } from '../box/start-kart-race';
import { kartAbilityOfTypes, kartCupScores, kartPosition, kartProfileOfDex, KART_CUP_POINTS, KART_CUP_ROUNDS, KART_CUP_TRAINERS, KART_LAPS, TRACK_HALF_WIDTH, trackDistance, type KartRaceState } from '../core/kart-race';
import { TYPE_LABELS_PT } from '../core/pokemon-data';

const props = withDefaults(defineProps<{ playerDexId: number; opponentDexIds?: number[] }>(), { opponentDexIds: () => [25, 133, 4] });
const emit = defineEmits<{ close: []; finish: [result: KartFinish] }>();
const host = ref<HTMLElement | null>(null);
const race = ref<KartRaceState | null>(null);
const result = ref<KartFinish | null>(null);
const error = ref('');
const showKartDetails = ref(false);
const mode = ref<'menu' | 'quick' | 'cup'>('menu');
const cupRound = ref(0);
const cupScores = ref<number[]>([0, 0, 0, 0]);
const cupLastOrder = ref<number[]>([]);
const abilityAnnouncement = ref('');
const pressed = new Set<string>();
let handle: KartRaceHandle | null = null;
let cancelled = false;
let generation = 0;
const touch = { left: false, right: false, accelerate: false, brake: false };
const lap = computed(() => Math.min(KART_LAPS, (race.value?.cars[0]?.lap ?? 0) + 1));
const position = computed(() => race.value ? kartPosition(race.value, 0) : 1);
const elapsed = computed(() => (race.value?.elapsed ?? 0).toFixed(1));
const speed = computed(() => Math.round(Math.abs(race.value?.cars[0]?.speed ?? 0)));
const profile = computed(() => race.value?.cars[0]?.profile ?? kartProfileOfDex(props.playerDexId));
const ability = computed(() => profile.value ? kartAbilityOfTypes(profile.value.types) : null);
const abilityCooldown = computed(() => Math.max(0, Math.ceil((race.value?.cars[0]?.abilityReadyAt ?? 0) - (race.value?.elapsed ?? 0))));
const abilityReady = computed(() => !!race.value && !!ability.value && abilityCooldown.value === 0 && !result.value);
const cupRanking = computed(() => KART_CUP_TRAINERS.map((trainer, id) => ({ ...trainer, points: cupScores.value[id] ?? 0, id })).sort((a, b) => b.points - a.points || cupLastOrder.value.indexOf(a.id) - cupLastOrder.value.indexOf(b.id)));
const roundTitle = computed(() => KART_CUP_ROUNDS[cupRound.value]?.title ?? 'Copa de Treinadores');
const trainerPortrait = (name: string): string => `${import.meta.env.BASE_URL}art/trainers/${name}.png`;
const kartType = computed(() => profile.value?.types.map((type) => TYPE_LABELS_PT[type]).join(' / ') ?? '');
const performanceBars = computed(() => {
  const p = profile.value?.performance;
  if (!p) return [];
  const bar = (label: string, value: number, low: number, high: number) => ({
    label, width: `${Math.round(Math.max(0, Math.min(100, (value - low) / (high - low) * 100)))}%`,
  });
  return [
    bar('Aceleração', p.acceleration, 20.5, 27.5),
    bar('Velocidade', p.topSpeed, 29, 35),
    bar('Direção', p.handling, 2.05, 2.65),
    bar('Pista', p.roadGrip, 0.97, 1.04),
    bar('Fora da pista', p.offroadGrip, 0.91, 1.22),
    bar('Freio', p.braking, 18, 23),
  ];
});
const bodyDescription: Record<'leve' | 'equilibrado' | 'pesado' | 'aero', string> = {
  leve: 'Chassi compacto para arrancadas e curvas ágeis.',
  equilibrado: 'Chassi versátil, com resposta estável na pista.',
  pesado: 'Estrutura robusta, com mais velocidade em linha reta e curvas amplas.',
  aero: 'Carroceria baixa e asa traseira para velocidade final.',
};
const wheelDescription: Record<'asfalto' | 'misto' | 'tracao', string> = {
  asfalto: 'Pneus lisos favorecem a aderência no asfalto.',
  misto: 'Pneus versáteis equilibram pista e acostamento.',
  tracao: 'Pneus largos ajudam a recuperar controle fora da pista.',
};
const offroad = computed(() => {
  const car = race.value?.cars[0];
  return car ? trackDistance(car.x, car.z) > TRACK_HALF_WIDTH : false;
});

function syncInput(): void {
  handle?.setInput({
    throttle: pressed.has('ArrowUp') || pressed.has('KeyW') || touch.accelerate ? 1 : pressed.has('ArrowDown') || pressed.has('KeyS') ? -0.5 : 0,
    steer: (pressed.has('ArrowRight') || pressed.has('KeyD') || touch.right ? 1 : 0) - (pressed.has('ArrowLeft') || pressed.has('KeyA') || touch.left ? 1 : 0),
    brake: pressed.has('Space') || touch.brake,
  });
}
function keyDown(event: KeyboardEvent): void {
  if (mode.value === 'menu' || result.value) return;
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyE'].includes(event.code)) return;
  event.preventDefault();
  if (event.code === 'KeyE') { if (!event.repeat) useAbility(); return; }
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
function useAbility(): void {
  if (!abilityReady.value || !handle?.useAbility()) return;
  abilityAnnouncement.value = `${ability.value!.label} ativado`;
}
async function launchRace(kind: 'quick' | 'cup', round = 0): Promise<void> {
  generation++;
  const thisGeneration = generation;
  handle?.dispose();
  handle = null;
  releaseControls();
  mode.value = kind;
  cupRound.value = round;
  result.value = null;
  race.value = null;
  error.value = '';
  abilityAnnouncement.value = '';
  const opponents = kind === 'cup' ? [...KART_CUP_ROUNDS[round]!.opponents] : props.opponentDexIds;
  try {
    if (!host.value) return;
    const { startKartRace } = await import('../box/start-kart-race');
    if (cancelled || thisGeneration !== generation) return;
    const running = await startKartRace(host.value, props.playerDexId, opponents, (state) => {
      race.value = { ...state, cars: state.cars.map((car) => ({ ...car })) };
    }, (finish) => {
      result.value = finish;
      if (kind === 'cup') {
        cupScores.value = kartCupScores(cupScores.value, finish.order);
        cupLastOrder.value = finish.order;
        if (round === KART_CUP_ROUNDS.length - 1) emit('finish', finish);
      } else emit('finish', finish);
      releaseControls();
    }, kind === 'cup' && round === KART_CUP_ROUNDS.length - 1 ? 1 : null, kind === 'cup' ? round : 0);
    if (cancelled || thisGeneration !== generation) running.dispose();
    else { handle = running; syncInput(); }
  } catch {
    error.value = 'Não foi possível iniciar a pista 3D neste navegador.';
  }
}
function startCup(): void {
  cupScores.value = [0, 0, 0, 0];
  cupLastOrder.value = [];
  void launchRace('cup', 0);
}
function nextCupRound(): void { void launchRace('cup', cupRound.value + 1); }
function backToMenu(): void {
  generation++;
  handle?.dispose();
  handle = null;
  releaseControls();
  mode.value = 'menu';
  result.value = null;
  race.value = null;
  error.value = '';
}
onMounted(() => {
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', releaseControls);
});
onBeforeUnmount(() => {
  cancelled = true;
  generation++;
  handle?.dispose();
  window.removeEventListener('keydown', keyDown);
  window.removeEventListener('keyup', keyUp);
  window.removeEventListener('blur', releaseControls);
});
</script>

<template>
  <section class="kart-racer" aria-label="Kart Racer">
    <div ref="host" class="kart-racer-scene"></div>
    <div v-if="mode === 'menu'" class="kart-racer-menu">
      <button type="button" class="kart-racer-menu-close" aria-label="Voltar à Vila" @click="emit('close')">✕</button>
      <h2>Copa de Treinadores</h2>
      <p>Três corridas. Blue, Silver e May trocam de parceiro a cada etapa; Blue espera no duelo final.</p>
      <div class="kart-racer-trainers" aria-label="Treinadores da Copa">
        <div v-for="trainer in KART_CUP_TRAINERS.slice(1)" :key="trainer.id">
          <img :src="trainerPortrait(trainer.portrait)" :alt="`Treinador ${trainer.name}`" loading="lazy" />
          <span>{{ trainer.name }}</span>
        </div>
      </div>
      <p v-if="ability" class="kart-racer-menu-ability"><b>{{ ability.label }}</b><br>{{ ability.description }} Recarga: {{ ability.cooldown }} s.</p>
      <p v-else>Habilidade indisponível: faltam os tipos reais deste Pokémon.</p>
      <div class="kart-racer-menu-actions">
        <button type="button" @click="startCup">Iniciar Copa</button>
        <button type="button" @click="launchRace('quick')">Corrida rápida</button>
      </div>
      <small>Você corre com o Pokémon escolhido na Vila. Efeitos duram poucos segundos; o escudo bloqueia pulsos e a distância evita ataques.</small>
    </div>
    <div v-if="mode !== 'menu'" class="kart-racer-hud">
      <strong>{{ mode === 'cup' ? `Copa ${cupRound + 1}/3` : 'Kart Racer' }}</strong>
      <span>Volta {{ lap }}/{{ KART_LAPS }}</span>
      <span>{{ position }}º de {{ race?.cars.length ?? 4 }}</span>
      <span>{{ elapsed }} s</span>
      <span>Ritmo {{ speed }}</span>
      <span v-if="mode === 'cup'">{{ cupScores[0] }} pts</span>
      <button type="button" class="kart-racer-close" aria-label="Sair da corrida" @click="emit('close')">✕</button>
    </div>
    <div v-if="race && !error && !result" class="kart-racer-specs">
      <button type="button" class="kart-racer-specs-toggle" :aria-expanded="showKartDetails" aria-controls="kart-racer-specs-details" @click="showKartDetails = !showKartDetails">
        <template v-if="profile">{{ profile.body.label }} · {{ profile.wheels.label }} <span aria-hidden="true">{{ showKartDetails ? '▴' : '▾' }}</span></template>
        <template v-else>Dados do kart indisponíveis <span aria-hidden="true">{{ showKartDetails ? '▴' : '▾' }}</span></template>
      </button>
      <div v-if="showKartDetails" id="kart-racer-specs-details" class="kart-racer-specs-details">
        <template v-if="profile">
          <strong>Seu kart · {{ kartType }}</strong>
          <p><b>{{ profile.body.label }}:</b> {{ bodyDescription[profile.body.id] }}</p>
          <p><b>{{ profile.wheels.label }}:</b> {{ wheelDescription[profile.wheels.id] }}</p>
          <dl class="kart-racer-performance">
            <div v-for="bar in performanceBars" :key="bar.label"><dt>{{ bar.label }}</dt><dd><span :style="{ width: bar.width }"></span></dd></div>
          </dl>
          <small>Barras comparam as configurações possíveis. Peças e desempenho vêm dos tipos e atributos-base do Pokémon.</small>
        </template>
        <p v-else>Não há tipos ou atributos-base disponíveis para este Pokémon. O kart usa configuração padrão.</p>
      </div>
    </div>
    <div v-if="mode === 'cup' && cupRound === 2 && race && race.elapsed < 5 && !result" class="kart-racer-rival" role="status">
      <img :src="trainerPortrait('blue')" alt="Blue" />
      <span><b>Duelo final</b><br>Blue e Blastoise</span>
    </div>
    <p v-if="offroad && !result" class="kart-racer-offroad">Fora da pista · volte ao asfalto!</p>
    <p v-if="error" class="kart-racer-message">{{ error }}</p>
    <div v-if="result && mode === 'quick'" class="kart-racer-result" role="status">
      <strong>{{ result.completed ? 'Chegada!' : 'Prova encerrada' }}</strong>
      <span>{{ result.completed ? `${result.position}º lugar · ${(result.elapsedMs / 1000).toFixed(1)} s` : 'Os oponentes terminaram antes de você.' }}</span>
      <button type="button" @click="backToMenu">Nova corrida</button>
      <button type="button" @click="emit('close')">Voltar à Vila</button>
    </div>
    <div v-if="result && mode === 'cup'" class="kart-racer-result kart-racer-cup-result" role="status">
      <strong>{{ cupRound === KART_CUP_ROUNDS.length - 1 ? 'Copa encerrada!' : 'Etapa concluída!' }}</strong>
      <span>{{ roundTitle }} · {{ result.position }}º lugar · +{{ KART_CUP_POINTS[result.position - 1] ?? 0 }} pts</span>
      <ol class="kart-racer-scoreboard" aria-label="Classificação da Copa">
        <li v-for="trainer in cupRanking" :key="trainer.id"><span>{{ trainer.name }}</span><b>{{ trainer.points }} pts</b></li>
      </ol>
      <button v-if="cupRound < KART_CUP_ROUNDS.length - 1" type="button" @click="nextCupRound">Próxima etapa</button>
      <button v-else type="button" @click="backToMenu">Voltar ao menu</button>
    </div>
    <button v-if="mode !== 'menu' && !result && !error && ability" type="button" class="kart-racer-ability" :disabled="!abilityReady" :aria-label="`${ability.label}${abilityCooldown ? `, disponível em ${abilityCooldown} segundos` : ', pronta'}`" @click="useAbility">
      {{ abilityCooldown ? `${ability.label} · ${abilityCooldown}s` : `${ability.label} · E` }}
    </button>
    <span class="kart-racer-sr" role="status" aria-live="polite">{{ abilityAnnouncement }}</span>
    <div v-if="mode !== 'menu' && !result && !error" class="kart-racer-controls" aria-label="Controles da corrida">
      <div class="kart-racer-steering">
        <button type="button" aria-label="Virar à esquerda" @pointerdown.prevent="setTouch('left', true)" @pointerup="setTouch('left', false)" @pointercancel="setTouch('left', false)" @pointerleave="setTouch('left', false)">◀</button>
        <button type="button" aria-label="Virar à direita" @pointerdown.prevent="setTouch('right', true)" @pointerup="setTouch('right', false)" @pointercancel="setTouch('right', false)" @pointerleave="setTouch('right', false)">▶</button>
      </div>
      <div class="kart-racer-pedals">
        <button type="button" class="brake" aria-label="Frear" @pointerdown.prevent="setTouch('brake', true)" @pointerup="setTouch('brake', false)" @pointercancel="setTouch('brake', false)" @pointerleave="setTouch('brake', false)">Freio</button>
        <button type="button" class="accelerate" aria-label="Acelerar" @pointerdown.prevent="setTouch('accelerate', true)" @pointerup="setTouch('accelerate', false)" @pointercancel="setTouch('accelerate', false)" @pointerleave="setTouch('accelerate', false)">Acelerar</button>
      </div>
    </div>
    <p v-if="mode !== 'menu'" class="kart-racer-help">Setas ou WASD · Espaço freia · E usa habilidade</p>
  </section>
</template>

<style scoped>
.kart-racer { position: fixed; inset: 0; z-index: 1000; overflow: hidden; background: #151c29; color: #fff; touch-action: none; font-family: inherit; }
.kart-racer-scene { position: absolute; inset: 0; }
.kart-racer-menu { position: absolute; inset: 0; z-index: 2; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; gap: 12px; overflow-y: auto; padding: max(42px, env(safe-area-inset-top)) 18px max(24px, env(safe-area-inset-bottom)); background: linear-gradient(150deg, #132a43, #191c35 62%, #3a243b); text-align: center; }
.kart-racer-menu > * { width: min(100%, 430px); }
.kart-racer-menu h2 { margin: 0; font-size: clamp(24px, 7vw, 34px); }
.kart-racer-menu p { margin: 0; line-height: 1.4; }
.kart-racer-menu small { color: #d5ddea; line-height: 1.35; }
.kart-racer-menu-close { position: fixed; top: max(8px, env(safe-area-inset-top)); right: 12px; width: 40px !important; height: 40px; }
.kart-racer-trainers { display: flex; justify-content: center; gap: 9px; }
.kart-racer-trainers > div { display: grid; gap: 3px; width: min(28vw, 100px); padding: 6px 3px; border: 1px solid #ffffff5a; border-radius: 10px; background: #ffffff16; }
.kart-racer-trainers img { width: 64px; height: 64px; margin: auto; object-fit: none; object-position: left top; image-rendering: pixelated; }
.kart-racer-trainers span { font-weight: 800; }
.kart-racer-menu-ability { padding: 10px; box-sizing: border-box; border-radius: 10px; background: #ffffff18; font-size: 13px; }
.kart-racer-menu-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.kart-racer-menu-actions button { min-height: 48px; padding: 5px; font-size: 13px; }
.kart-racer-hud { position: absolute; top: max(12px, env(safe-area-inset-top)); left: 12px; right: 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
.kart-racer-hud > :not(button) { padding: 6px 9px; border: 1px solid #ffffff4d; border-radius: 8px; background: #131d2bc9; text-shadow: 0 1px 2px #000; }
.kart-racer-close { margin-left: auto; }
.kart-racer button { border: 1px solid #ffffff7a; border-radius: 12px; background: #182235df; color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
.kart-racer-close { min-width: 40px; min-height: 38px; }
.kart-racer-specs { position: absolute; top: max(62px, calc(env(safe-area-inset-top) + 50px)); left: 12px; width: min(300px, calc(100vw - 24px)); z-index: 1; }
.kart-racer-specs-toggle { min-height: 36px; padding: 6px 10px; background: #132b42e8 !important; font-size: 12px !important; text-align: left; }
.kart-racer-specs-toggle span { margin-left: 4px; }
.kart-racer-specs-details { margin-top: 5px; padding: 11px 13px; border: 1px solid #ffffff61; border-radius: 12px; background: #121e30ee; box-shadow: 0 8px 22px #0007; font-size: 12px; line-height: 1.35; }
.kart-racer-specs-details strong { display: block; margin-bottom: 8px; font-size: 14px; }
.kart-racer-specs-details p { margin: 5px 0; }
.kart-racer-performance { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 12px; margin: 9px 0; }
.kart-racer-performance dt { margin-bottom: 2px; }
.kart-racer-performance dd { height: 5px; margin: 0; border-radius: 5px; background: #ffffff36; overflow: hidden; }
.kart-racer-performance dd span { display: block; height: 100%; border-radius: inherit; background: #f3bf6d; }
.kart-racer-specs-details small { display: block; color: #d8e0ea; }
.kart-racer-rival { position: absolute; top: max(142px, calc(env(safe-area-inset-top) + 130px)); right: 10px; display: flex; align-items: center; gap: 5px; padding: 5px 7px; border: 1px solid #c1d9ff; border-radius: 10px; background: #182e55e8; font-size: 11px; }
.kart-racer-rival img { width: 64px; height: 64px; object-fit: none; object-position: left top; image-rendering: pixelated; }
.kart-racer-controls { position: absolute; bottom: max(38px, env(safe-area-inset-bottom)); left: clamp(8px, 3vw, 15px); right: clamp(8px, 3vw, 15px); display: flex; justify-content: space-between; pointer-events: none; }
.kart-racer-steering, .kart-racer-pedals { display: flex; align-items: end; gap: clamp(4px, 1.5vw, 10px); pointer-events: auto; }
.kart-racer-controls button { width: clamp(64px, 16vw, 84px); height: clamp(58px, 15vw, 84px); padding: 0 3px; font-size: 13px; white-space: nowrap; user-select: none; -webkit-user-select: none; }
.kart-racer-controls button:active { background: #e8a941; color: #172033; }
.kart-racer-controls .accelerate { background: #278e63e8; }
.kart-racer-controls .brake { background: #b95656e8; }
.kart-racer-ability { position: absolute; left: 50%; bottom: max(112px, calc(env(safe-area-inset-bottom) + 112px)); transform: translateX(-50%); width: min(190px, calc(100vw - 80px)); min-height: 43px; padding: 5px 8px; background: #4d66a9e8 !important; font-size: 12px !important; }
.kart-racer-ability:disabled { opacity: 0.65; cursor: default; }
.kart-racer-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.kart-racer-help { position: absolute; bottom: 0; left: 0; right: 0; margin: 0; padding: 4px; background: #121b2bd9; font-size: 12px; text-align: center; }
.kart-racer-message, .kart-racer-result { position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%); width: min(80vw, 340px); padding: 24px; border-radius: 18px; background: #172234ef; text-align: center; }
.kart-racer-result { display: grid; gap: 14px; }
.kart-racer-result strong { font-size: 25px; }
.kart-racer-result button { padding: 12px; }
.kart-racer-cup-result { max-height: calc(100vh - 100px); overflow-y: auto; }
.kart-racer-scoreboard { display: grid; gap: 5px; margin: 0; padding-left: 22px; text-align: left; }
.kart-racer-scoreboard li { padding: 5px 7px; border-radius: 7px; background: #ffffff18; }
.kart-racer-scoreboard li b { float: right; }
.kart-racer-offroad { position: absolute; top: max(65px, calc(env(safe-area-inset-top) + 53px)); left: 50%; transform: translateX(-50%); margin: 0; padding: 6px 10px; border-radius: 9px; background: #a64036de; font-size: 13px; font-weight: 800; white-space: nowrap; }
@media (max-width: 600px) {
  .kart-racer-hud { gap: 4px; }
  .kart-racer-hud > :not(button) { padding: 4px 6px; font-size: 11px; }
  .kart-racer-specs { top: max(98px, calc(env(safe-area-inset-top) + 86px)); }
  .kart-racer-offroad { top: max(137px, calc(env(safe-area-inset-top) + 125px)); font-size: 11px; }
}
</style>
