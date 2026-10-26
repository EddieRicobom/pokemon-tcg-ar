<script setup lang="ts">
import type { Moment } from '../core/village/social-state';

/** Um momento do Diário ou do Álbum: quem estava, o que disseram, o que você decidiu e o que mudou. */
const props = defineProps<{ moment: Moment; pinHint?: string; /** Troca ids de moradores por nomes em registros antigos. */ fix?: (text: string) => string }>();
const t = (text: string): string => props.fix ? props.fix(text) : text;
defineEmits<{ toggle: [] }>();

function whenLabel(m: Moment): string {
  const [, mo, d] = m.day.split('-');
  return `${d}/${mo} · ${String(m.hour).padStart(2, '0')}h`;
}
</script>

<template>
  <article class="moment" :class="['k-' + moment.kind, { pinned: moment.fav }]">
    <header>
      <strong>{{ moment.emoji }} {{ t(moment.title) }}</strong>
      <button type="button" class="fav" :aria-pressed="!!moment.fav" :aria-label="moment.fav ? 'Soltar do Álbum' : 'Guardar no Álbum para sempre'" :title="moment.fav ? 'Guardado no Álbum' : 'Guardar no Álbum'" @click="$emit('toggle')">
        {{ moment.fav ? '📌' : '📍' }}
      </button>
    </header>
    <small>{{ moment.cast.map((c) => t(c.name)).join(' · ') }} · {{ whenLabel(moment) }}{{ moment.away ? ' · enquanto você estava fora' : '' }}</small>
    <ol class="chat">
      <li v-for="(l, i) in moment.lines" :key="i" :class="'who-' + (l.who % 3)"><b>{{ t(moment.cast[l.who]?.name ?? '') }}:</b> {{ t(l.text) }}</li>
    </ol>
    <p v-if="moment.choice" class="choice">Você decidiu: <em>{{ t(moment.choice) }}</em></p>
    <ul v-if="moment.result.length" class="result"><li v-for="r in moment.result" :key="r">{{ t(r) }}</li></ul>
    <p v-if="pinHint && !moment.fav" class="pin-hint">{{ pinHint }}</p>
  </article>
</template>
