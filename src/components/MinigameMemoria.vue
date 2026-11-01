<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { seededRng } from '../core/battle';
import { ARCADE_DIFFICULTIES, ARCADE_DIFFICULTY_LABELS_PT, gradeMemoryChallenge, makeMemoryBoard, MEMORY_RULES } from '../core/minigames';
import type { ArcadeDifficulty, Grade, Piece } from '../core/minigames';
import MinigameReward from './MinigameReward.vue';
import { SoundEngine } from '../box/sound';
import { visual } from '../app/visual-settings';

const props = defineProps<{ pieces: Piece[]; urls: Map<string, string>; rewardCoins: number }>();
const emit = defineEmits<{ finished: [grade: Grade]; leave: [] }>();

const difficulty = ref<ArcadeDifficulty>('normal');
const newBoard = () => makeMemoryBoard(props.pieces, seededRng((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0), MEMORY_RULES[difficulty.value].pairs);
const board = ref(newBoard());
const open = ref<number[]>([]);
const matched = ref<Set<string>>(new Set());
const moves = ref(0);
const combo = ref(0);
const bestCombo = ref(0);
const grade = ref<Grade | null>(null);
const locked = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;
let clock: ReturnType<typeof setInterval> | null = null;
const secondsLeft = ref(MEMORY_RULES.normal.seconds);
const sound = new SoundEngine();

const pairs = computed(() => board.value.pieces.length);
function play(cue: 'minigame-pick' | 'minigame-right' | 'minigame-wrong' | 'minigame-combo' | 'minigame-timeout' | 'minigame-record'): void {
  sound.setEnabled(visual.sound); sound.unlock(); sound.play({ kind: 'ui', cue });
}
function stopClock(): void { if (clock) clearInterval(clock); clock = null; }
function armClock(): void {
  stopClock(); secondsLeft.value = MEMORY_RULES[difficulty.value].seconds;
  clock = setInterval(() => {
    if (secondsLeft.value <= 1) {
      stopClock(); locked.value = true; grade.value = gradeMemoryChallenge(moves.value + pairs.value * 2, pairs.value, bestCombo.value, 0, difficulty.value); play('minigame-timeout'); emit('finished', grade.value);
    } else secondsLeft.value--;
  }, 1000);
}

function isUp(slot: number): boolean {
  return open.value.includes(slot) || matched.value.has(board.value.tiles[slot]!.pieceId);
}

function flip(slot: number): void {
  if (locked.value || isUp(slot) || grade.value) return;
  play('minigame-pick');
  open.value = [...open.value, slot];
  if (open.value.length < 2) return;
  moves.value++;
  const [a, b] = open.value.map((s) => board.value.tiles[s]!.pieceId) as [string, string];
  if (a === b) {
    matched.value = new Set([...matched.value, a]);
    open.value = [];
    combo.value++; bestCombo.value = Math.max(bestCombo.value, combo.value);
    play(combo.value >= 3 ? 'minigame-combo' : 'minigame-right');
    if (matched.value.size === pairs.value) {
      stopClock(); grade.value = gradeMemoryChallenge(moves.value, pairs.value, bestCombo.value, secondsLeft.value, difficulty.value);
      if (grade.value.score >= 90) play('minigame-record');
      emit('finished', grade.value);
    }
    return;
  }
  locked.value = true;
  combo.value = 0; play('minigame-wrong');
  timer = setTimeout(() => {
    open.value = [];
    locked.value = false;
    timer = null;
  }, 800);
}

function again(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  board.value = newBoard();
  open.value = [];
  matched.value = new Set();
  moves.value = 0;
  combo.value = 0;
  bestCombo.value = 0;
  grade.value = null;
  locked.value = false;
  armClock();
}

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
  stopClock();
  sound.dispose();
});
armClock();
</script>

<template>
  <div class="game">
    <p class="game-step">⏱ {{ secondsLeft }}s · Jogadas: {{ moves }} · Pares: {{ matched.size }} de {{ pairs }} · Combo ×{{ combo }}</p>
    <div class="memory-grid" role="group" aria-label="Tabuleiro da memória">
      <button
        v-for="tile in board.tiles"
        :key="tile.slot"
        type="button"
        class="memory-tile"
        :class="{ up: isUp(tile.slot), found: matched.has(tile.pieceId) }"
        :aria-label="isUp(tile.slot) ? board.pieces.find((p) => p.id === tile.pieceId)?.name : 'Carta virada para baixo'"
        @click="flip(tile.slot)"
      >
        <img v-if="isUp(tile.slot)" :src="urls.get(tile.pieceId)" alt="" />
        <span v-else aria-hidden="true"></span>
      </button>
    </div>
    <template v-if="grade">
      <p class="game-result"><strong>{{ moves }} jogadas</strong></p>
      <p class="note">{{ grade.won ? 'Boa memória!' : 'Deu trabalho, né?' }} Pontuação: {{ grade.score }} · maior combo ×{{ bestCombo }} (o mínimo possível é {{ pairs }} jogadas).</p>
      <MinigameReward :won="grade.won" :coins="props.rewardCoins" />
      <div class="source-grid" role="group" aria-label="Dificuldade da memória">
        <button v-for="item in ARCADE_DIFFICULTIES" :key="item" type="button" class="source" :class="{ on: difficulty === item }" @click="difficulty = item; again()"><strong>{{ ARCADE_DIFFICULTY_LABELS_PT[item] }}</strong><small>{{ MEMORY_RULES[item].pairs }} pares · {{ MEMORY_RULES[item].seconds }} s</small></button>
      </div>
      <div class="game-actions">
        <button type="button" class="primary" @click="again">Jogar de novo</button>
        <button type="button" @click="emit('leave')">Voltar</button>
      </div>
    </template>
  </div>
</template>
