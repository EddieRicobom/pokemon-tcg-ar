<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { seededRng } from '../core/battle';
import { ARCADE_DIFFICULTIES, ARCADE_DIFFICULTY_LABELS_PT, gradeTypeDuel, makeTypeQuestions, multiplierLabel, TYPE_RULES } from '../core/minigames';
import type { ArcadeDifficulty, Grade } from '../core/minigames';
import { TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import MinigameReward from './MinigameReward.vue';
import { SoundEngine } from '../box/sound';
import { visual } from '../app/visual-settings';

const props = defineProps<{ rewardCoins: number }>();
const emit = defineEmits<{ finished: [grade: Grade]; leave: [] }>();

const difficulty = ref<ArcadeDifficulty>('normal');
const questions = ref(makeTypeQuestions(seededRng((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0), TYPE_RULES.normal.rounds));
const index = ref(0);
const picked = ref<number | null>(null);
const correct = ref(0);
const combo = ref(0);
const bestCombo = ref(0);
const grade = ref<Grade | null>(null);
const secondsLeft = ref(TYPE_RULES.normal.secondsPerQuestion);
let timer: ReturnType<typeof setInterval> | null = null;
const sound = new SoundEngine();

const q = computed(() => questions.value[index.value]);
const revealed = computed(() => picked.value !== null);
const rules = computed(() => TYPE_RULES[difficulty.value]);

function play(cue: 'minigame-pick' | 'minigame-right' | 'minigame-wrong' | 'minigame-combo' | 'minigame-timeout' | 'minigame-record'): void {
  sound.setEnabled(visual.sound); sound.unlock(); sound.play({ kind: 'ui', cue });
}
function stopTimer(): void { if (timer) clearInterval(timer); timer = null; }
function armTimer(): void {
  stopTimer(); secondsLeft.value = rules.value.secondsPerQuestion;
  timer = setInterval(() => {
    if (secondsLeft.value <= 1) { stopTimer(); timeout(); }
    else secondsLeft.value--;
  }, 1000);
}
function timeout(): void {
  if (picked.value !== null || !q.value) return;
  picked.value = -1; combo.value = 0; play('minigame-timeout');
}

function choose(i: number): void {
  if (picked.value !== null || !q.value) return;
  picked.value = i;
  stopTimer(); play('minigame-pick');
  if (i === q.value.correct) {
    correct.value++; combo.value++; bestCombo.value = Math.max(bestCombo.value, combo.value);
    play(combo.value >= 3 ? 'minigame-combo' : 'minigame-right');
  } else { combo.value = 0; play('minigame-wrong'); }
}

function next(): void {
  if (index.value + 1 < questions.value.length) {
    index.value++;
    picked.value = null;
    armTimer();
    return;
  }
  stopTimer();
  grade.value = gradeTypeDuel(correct.value, questions.value.length, bestCombo.value, secondsLeft.value, difficulty.value);
  if (grade.value.score >= 90) play('minigame-record');
  emit('finished', grade.value);
}

function again(): void {
  questions.value = makeTypeQuestions(seededRng((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0), rules.value.rounds);
  index.value = 0;
  picked.value = null;
  correct.value = 0;
  combo.value = 0;
  bestCombo.value = 0;
  grade.value = null;
  armTimer();
}
armTimer();
onBeforeUnmount(() => { stopTimer(); sound.dispose(); });
</script>

<template>
  <div class="game">
    <template v-if="!grade && q">
      <p class="game-step">Pergunta {{ index + 1 }} de {{ questions.length }} · ⏱ {{ secondsLeft }}s · Combo ×{{ combo }} · {{ correct }} certa{{ correct === 1 ? '' : 's' }}</p>
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
      <p v-if="revealed" class="game-feedback" role="status">{{ picked === q.correct ? (combo >= 3 ? `Certo! Combo ×${combo}!` : 'Certo!') : picked === -1 ? `Tempo esgotado. Era ${multiplierLabel(q.options[q.correct]!)}.` : `Era ${multiplierLabel(q.options[q.correct]!)}.` }}</p>
      <button v-if="revealed" type="button" class="primary" @click="next">{{ index + 1 < questions.length ? 'Próxima' : 'Ver resultado' }}</button>
    </template>
    <template v-else-if="grade">
      <p class="game-result"><strong>{{ correct }} de {{ questions.length }}</strong></p>
      <p class="note">{{ grade.won ? 'Você manja de tipos!' : 'Quase lá. Tente de novo.' }} Pontuação: {{ grade.score }} · maior combo ×{{ bestCombo }}. É a mesma tabela usada nas batalhas da Caixa.</p>
      <MinigameReward :won="grade.won" :coins="props.rewardCoins" />
      <div class="source-grid" role="group" aria-label="Dificuldade do duelo de tipos">
        <button v-for="item in ARCADE_DIFFICULTIES" :key="item" type="button" class="source" :class="{ on: difficulty === item }" @click="difficulty = item; again()"><strong>{{ ARCADE_DIFFICULTY_LABELS_PT[item] }}</strong><small>{{ TYPE_RULES[item].rounds }} perguntas · {{ TYPE_RULES[item].secondsPerQuestion }} s cada</small></button>
      </div>
      <div class="game-actions">
        <button type="button" class="primary" @click="again">Jogar de novo</button>
        <button type="button" @click="emit('leave')">Voltar</button>
      </div>
    </template>
  </div>
</template>
