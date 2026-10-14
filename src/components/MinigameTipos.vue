<script setup lang="ts">
import { computed, ref } from 'vue';
import { seededRng } from '../core/battle';
import { gradeQuiz, makeTypeQuestions, multiplierLabel } from '../core/minigames';
import type { Grade } from '../core/minigames';
import { TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';

const emit = defineEmits<{ finished: [grade: Grade]; leave: [] }>();

const newRound = () => makeTypeQuestions(seededRng((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0));
const questions = ref(newRound());
const index = ref(0);
const picked = ref<number | null>(null);
const correct = ref(0);
const grade = ref<Grade | null>(null);

const q = computed(() => questions.value[index.value]);
const revealed = computed(() => picked.value !== null);

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
  emit('finished', grade.value);
}

function again(): void {
  questions.value = newRound();
  index.value = 0;
  picked.value = null;
  correct.value = 0;
  grade.value = null;
}
</script>

<template>
  <div class="game">
    <template v-if="!grade && q">
      <p class="game-step">Pergunta {{ index + 1 }} de {{ questions.length }} · {{ correct }} certa{{ correct === 1 ? '' : 's' }}</p>
      <p class="type-duel">
        Um golpe de
        <b class="type-chip" :style="{ background: TYPE_COLORS[q.attack] }">{{ TYPE_LABELS_PT[q.attack] }}</b>
        contra um Pokémon de
        <template v-for="(t, i) in q.defend" :key="t">
          <template v-if="i > 0"> e </template>
          <b class="type-chip" :style="{ background: TYPE_COLORS[t] }">{{ TYPE_LABELS_PT[t] }}</b>
        </template>
        causa:
      </p>
      <div class="game-options">
        <button
          v-for="(m, i) in q.options"
          :key="m"
          type="button"
          :disabled="revealed"
          :class="{ right: revealed && i === q.correct, wrong: picked === i && i !== q.correct }"
          @click="choose(i)"
        >{{ multiplierLabel(m) }}</button>
      </div>
      <p v-if="revealed" class="game-feedback" role="status">{{ picked === q.correct ? 'Certo!' : `Era ${multiplierLabel(q.options[q.correct]!)}.` }}</p>
      <button v-if="revealed" type="button" class="primary" @click="next">{{ index + 1 < questions.length ? 'Próxima' : 'Ver resultado' }}</button>
    </template>
    <template v-else-if="grade">
      <p class="game-result"><strong>{{ correct }} de {{ questions.length }}</strong></p>
      <p class="note">{{ grade.won ? 'Você manja de tipos!' : 'Quase lá. Tente de novo.' }} Pontuação: {{ grade.score }}. É a mesma tabela usada nas batalhas da Caixa.</p>
      <div class="game-actions">
        <button type="button" class="primary" @click="again">Jogar de novo</button>
        <button type="button" @click="emit('leave')">Voltar</button>
      </div>
    </template>
  </div>
</template>
