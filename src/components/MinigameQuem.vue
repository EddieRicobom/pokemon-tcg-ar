<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { loadDexNames } from '../app/dex-names';
import { prepareDexRound } from '../app/dex-quiz';
import { seededRng } from '../core/battle';
import { dexIdsFor, dexPieces, GENERATIONS, sourceLabel } from '../core/dex';
import type { WhoSource } from '../core/dex';
import { cardsBlocker, gradeQuiz, makeWhoQuestions, WHO_DIFFICULTIES, WHO_DIFFICULTY_LABELS_PT } from '../core/minigames';
import type { Grade, Piece, WhoDifficulty, WhoQuestion } from '../core/minigames';

const props = defineProps<{ pieces: Piece[]; urls: Map<string, string> }>();
const emit = defineEmits<{ finished: [grade: Grade]; leave: [] }>();

type Phase = 'setup' | 'loading' | 'playing' | 'done';

const freshRng = () => seededRng((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);
const blocker = computed(() => cardsBlocker(props.pieces));
const source = ref<WhoSource>({ kind: 'random' });
const difficulty = ref<WhoDifficulty>('normal');
const phase = ref<Phase>('setup');
const error = ref('');
const questions = ref<WhoQuestion[]>([]);
/** Imagens da rodada: as das cartas guardadas ou as baixadas do sorteio. */
const images = ref<Map<string, string>>(new Map());
let release: (() => void) | null = null;

const index = ref(0);
const picked = ref<number | null>(null);
const correct = ref(0);
const grade = ref<Grade | null>(null);

const q = computed(() => questions.value[index.value]);
const revealed = computed(() => picked.value !== null);

const choices = computed<{ source: WhoSource; label: string; hint: string; disabled: boolean }[]>(() => [
  { source: { kind: 'random' }, label: 'Aleatório', hint: 'Todas as gerações', disabled: false },
  ...GENERATIONS.map((g) => ({ source: { kind: 'gen', gen: g.gen } as WhoSource, label: `Geração ${g.roman}`, hint: g.region, disabled: false })),
  { source: { kind: 'cards' }, label: 'Minhas cartas', hint: blocker.value ? `Faltam cartas` : 'As que você escaneou', disabled: blocker.value !== null },
]);
const same = (a: WhoSource, b: WhoSource) => a.kind === b.kind && (a.kind !== 'gen' || (b.kind === 'gen' && a.gen === b.gen));

function dropImages(): void {
  release?.();
  release = null;
  images.value = new Map();
}
onBeforeUnmount(dropImages);

async function start(): Promise<void> {
  error.value = '';
  dropImages();
  index.value = 0;
  picked.value = null;
  correct.value = 0;
  grade.value = null;
  if (source.value.kind === 'cards') {
    questions.value = makeWhoQuestions(props.pieces, freshRng());
    images.value = props.urls;
    phase.value = questions.value.length > 0 ? 'playing' : 'setup';
    return;
  }
  phase.value = 'loading';
  try {
    const names = await loadDexNames();
    const ids = dexIdsFor(source.value, names);
    const round = await prepareDexRound(dexPieces(ids, names), freshRng());
    questions.value = round.questions;
    images.value = round.urls;
    release = round.release;
    phase.value = 'playing';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Não foi possível sortear os Pokémon.';
    phase.value = 'setup';
  }
}

function choose(i: number): void {
  if (picked.value !== null || !q.value) return;
  picked.value = i;
  if (i === q.value.correct) correct.value++;
}

function next(): void {
  if (index.value + 1 < questions.value.length) {
    index.value++;
    picked.value = null;
    return;
  }
  grade.value = gradeQuiz(correct.value, questions.value.length);
  phase.value = 'done';
  emit('finished', grade.value);
}

function changeSource(): void {
  dropImages();
  phase.value = 'setup';
}
</script>

<template>
  <div class="game">
    <template v-if="phase === 'setup'">
      <p class="game-step">De onde vêm os Pokémon?</p>
      <div class="source-grid" role="group" aria-label="Origem dos Pokémon sorteados">
        <button
          v-for="c in choices"
          :key="c.label"
          type="button"
          class="source"
          :class="{ on: same(c.source, source) }"
          :aria-pressed="same(c.source, source)"
          :disabled="c.disabled"
          @click="source = c.source"
        ><strong>{{ c.label }}</strong><small>{{ c.hint }}</small></button>
      </div>
      <p v-if="blocker" class="note">{{ blocker }}</p>
      <p class="game-step">Dificuldade</p>
      <div class="source-grid" role="group" aria-label="Dificuldade da silhueta">
        <button
          v-for="d in WHO_DIFFICULTIES"
          :key="d"
          type="button"
          class="source"
          :class="{ on: difficulty === d }"
          :aria-pressed="difficulty === d"
          @click="difficulty = d"
        ><strong>{{ WHO_DIFFICULTY_LABELS_PT[d] }}</strong><small>{{ d === 'dificil' ? 'Silhueta distorcida' : 'Silhueta preta normal' }}</small></button>
      </div>
      <p v-if="error" class="game-error" role="alert">{{ error }}</p>
      <button type="button" class="primary" @click="start">{{ error ? 'Tentar de novo' : 'Sortear 5 Pokémon' }}</button>
    </template>

    <p v-else-if="phase === 'loading'" class="game-step" role="status">Sorteando Pokémon…</p>

    <template v-else-if="phase === 'playing' && q">
      <p class="game-step">{{ sourceLabel(source) }} · Pergunta {{ index + 1 }} de {{ questions.length }} · {{ correct }} certa{{ correct === 1 ? '' : 's' }}</p>
      <div class="silhouette-stage">
        <!-- Filtro SVG do modo Difícil: distorce o contorno da silhueta (ver .silhouette.hard no CSS). Sem
             tamanho na tela (width/height 0): só define o efeito, não é desenhado por si. -->
        <svg width="0" height="0" style="position: absolute" aria-hidden="true">
          <filter id="who-quiz-swirl">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="22" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
        <img :src="images.get(q.piece.id)" alt="Silhueta de um Pokémon" class="silhouette" :class="{ shown: revealed, hard: difficulty === 'dificil' }" />
      </div>
      <p v-if="difficulty === 'dificil' && !revealed" class="silhouette-hint">🌀 Difícil: contorno distorcido de propósito</p>
      <div class="game-options">
        <button
          v-for="(name, i) in q.options"
          :key="name"
          type="button"
          :disabled="revealed"
          :class="{ right: revealed && i === q.correct, wrong: picked === i && i !== q.correct }"
          @click="choose(i)"
        >{{ name }}</button>
      </div>
      <p v-if="revealed" class="game-feedback" role="status">{{ picked === q.correct ? 'Certo!' : `Era ${q.piece.name}.` }}</p>
      <button v-if="revealed" type="button" class="primary" @click="next">{{ index + 1 < questions.length ? 'Próxima' : 'Ver resultado' }}</button>
    </template>

    <template v-else-if="phase === 'done' && grade">
      <p class="game-result"><strong>{{ correct }} de {{ questions.length }}</strong></p>
      <p class="note">{{ grade.won ? 'Mandou bem!' : 'Quase lá. Tente de novo.' }} Pontuação: {{ grade.score }}. Origem: {{ sourceLabel(source) }}.</p>
      <div class="game-actions">
        <button type="button" class="primary" @click="start">Sortear outros 5</button>
        <button type="button" @click="changeSource">Trocar origem</button>
        <button type="button" @click="emit('leave')">Voltar</button>
      </div>
    </template>
  </div>
</template>
