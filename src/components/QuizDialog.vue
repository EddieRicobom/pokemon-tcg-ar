<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { MAX_ANSWER_LEN } from '../core/village/social-state';
import { useDialogFocus } from '../composables/useDialogFocus';

/**
 * A conversa em que um Pokémon pergunta uma coisa a você: você digita a resposta (ou toca numa sugestão), ele reage, faz uma
 * segunda pergunta de volta com opções e, no fim, comenta. Só mostra e devolve o que foi escolhido; a lógica fica em `quiz.ts`.
 */
const props = defineProps<{
  name: string;
  text: string;
  /** 'ask' = campo para digitar; 'follow' = opções; 'reply' = só a fala final. */
  stage: 'ask' | 'follow' | 'reply';
  placeholder?: string;
  chips?: readonly string[];
  options?: readonly string[];
  /** Rótulos dos botões do campo de texto (o padrão serve às perguntas; o apelido usa «Salvar» e «Cancelar»). */
  submitLabel?: string;
  cancelLabel?: string;
}>();
const emit = defineEmits<{ answer: [text: string]; choose: [index: number]; close: [] }>();

const draft = ref('');
const inputEl = ref<HTMLInputElement | null>(null);
const dialogEl = ref<HTMLElement | null>(null);
useDialogFocus(dialogEl);

function send(): void {
  const t = draft.value.trim();
  if (t) emit('answer', t);
}

onMounted(() => {
  if (props.stage === 'ask') void nextTick(() => inputEl.value?.focus({ preventScroll: true }));
});
</script>

<template>
  <div ref="dialogEl" class="speech in-stage village-dialog quiz-dialog" role="dialog" tabindex="-1" :aria-label="`${name} pergunta`" @keydown.esc.stop.prevent="emit('close')">
    <div class="speech-box">
      <strong>{{ name }}</strong>
      <p>{{ text }}</p>
      <form v-if="stage === 'ask'" class="quiz-form" @submit.prevent="send">
        <input ref="inputEl" v-model="draft" type="text" class="quiz-input" :maxlength="MAX_ANSWER_LEN" :placeholder="placeholder ?? 'Escreva a sua resposta…'" autocomplete="off" enterkeyhint="send" aria-label="Sua resposta" />
        <small class="quiz-count">{{ draft.length }}/{{ MAX_ANSWER_LEN }}</small>
        <div class="village-choices quiz-chips" role="group" aria-label="Sugestões de resposta">
          <button v-for="c in chips" :key="c" type="button" @click="emit('answer', c)">{{ c }}</button>
        </div>
        <div class="village-choices">
          <button type="submit" class="primary" :disabled="draft.trim() === ''">{{ submitLabel ?? 'Responder' }}</button>
          <button type="button" @click="emit('close')">{{ cancelLabel ?? 'Deixa pra lá' }}</button>
        </div>
      </form>
      <div v-else-if="stage === 'follow'" class="village-choices">
        <button v-for="(o, i) in options" :key="o" type="button" @click="emit('choose', i)">{{ o }}</button>
        <button type="button" @click="emit('close')">Deixa pra lá</button>
      </div>
      <div v-else class="village-choices">
        <button type="button" class="primary" @click="emit('close')">Valeu!</button>
      </div>
    </div>
  </div>
</template>
