<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { seededRng } from '../core/battle';
import { gradeMemory, makeMemoryBoard } from '../core/minigames';
import type { Grade, Piece } from '../core/minigames';
import MinigameReward from './MinigameReward.vue';

const props = defineProps<{ pieces: Piece[]; urls: Map<string, string>; rewardCoins: number }>();
const emit = defineEmits<{ finished: [grade: Grade]; leave: [] }>();

const newBoard = () => makeMemoryBoard(props.pieces, seededRng((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0));
const board = ref(newBoard());
const open = ref<number[]>([]);
const matched = ref<Set<string>>(new Set());
const moves = ref(0);
const grade = ref<Grade | null>(null);
const locked = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

const pairs = computed(() => board.value.pieces.length);

function isUp(slot: number): boolean {
  return open.value.includes(slot) || matched.value.has(board.value.tiles[slot]!.pieceId);
}

function flip(slot: number): void {
  if (locked.value || isUp(slot) || grade.value) return;
  open.value = [...open.value, slot];
  if (open.value.length < 2) return;
  moves.value++;
  const [a, b] = open.value.map((s) => board.value.tiles[s]!.pieceId) as [string, string];
  if (a === b) {
    matched.value = new Set([...matched.value, a]);
    open.value = [];
    if (matched.value.size === pairs.value) {
      grade.value = gradeMemory(moves.value, pairs.value);
      emit('finished', grade.value);
    }
    return;
  }
  locked.value = true;
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
  grade.value = null;
  locked.value = false;
}

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <div class="game">
    <p class="game-step">Jogadas: {{ moves }} · Pares: {{ matched.size }} de {{ pairs }}</p>
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
      <p class="note">{{ grade.won ? 'Boa memória!' : 'Deu trabalho, né?' }} Pontuação: {{ grade.score }} (o mínimo possível é {{ pairs }} jogadas).</p>
      <MinigameReward :won="grade.won" :coins="props.rewardCoins" />
      <div class="game-actions">
        <button type="button" class="primary" @click="again">Jogar de novo</button>
        <button type="button" @click="emit('leave')">Voltar</button>
      </div>
    </template>
  </div>
</template>
