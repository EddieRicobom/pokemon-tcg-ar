<script setup lang="ts">
import { computed, ref } from 'vue';
import { bookPage } from '../core/village/book';
import type { BookMon } from '../core/village/book';
import type { Friendship } from '../core/village/life';
import { dayKey } from '../core/trainer';

/** O Livro dos Pokémon: uma página por Pokémon da caixa, com humor, jeito, gostos, opiniões e o que a intimidade abre. */
const props = defineProps<{
  mons: readonly (BookMon & { thumb?: string; accessory?: string | null })[];
  friends: Readonly<Record<string, Friendship>>;
  /** Mostra o botão de dar acessório (na Vila). */
  canDress?: boolean;
  /** O que cada Pokémon é dos colegas (casal, rivais, amigos…), pela vida social da Vila. */
  relations?: Readonly<Record<string, readonly { name: string; label: string; emoji: string; met: number }[]>>;
}>();
const emit = defineEmits<{ accessory: [id: string] }>();

const index = ref(0);
const day = dayKey(new Date());
const hour = new Date().getHours();
const current = computed(() => {
  const mon = props.mons[Math.min(index.value, props.mons.length - 1)];
  return mon ? { mon, page: bookPage(mon, props.mons, props.friends[mon.id], day, hour) } : null;
});

function go(step: number): void {
  const n = props.mons.length;
  if (n > 0) index.value = (index.value + step + n) % n;
}
</script>

<template>
  <div class="poke-book">
    <p v-if="!current" class="hint">Nenhum Pokémon na caixa ainda. Escaneie cartas para começar o livro.</p>
    <template v-else>
      <nav class="book-nav">
        <button type="button" aria-label="Página anterior" @click="go(-1)">◀</button>
        <span>{{ index + 1 }} / {{ mons.length }}</span>
        <button type="button" aria-label="Próxima página" @click="go(1)">▶</button>
      </nav>
      <article class="book-page">
        <header class="book-head">
          <img v-if="current.mon.thumb" :src="current.mon.thumb" alt="" width="72" height="72" />
          <div>
            <h3>{{ current.page.name }}</h3>
            <p class="book-hearts" :aria-label="`${current.page.levelName}, ${current.page.hearts} de 5 corações`">
              <span v-for="k in 5" :key="k" :class="{ on: k <= current.page.hearts }">♥</span>
              <small>{{ current.page.levelName }} · {{ current.page.points }}/100</small>
            </p>
          </div>
        </header>
        <section>
          <h4>Hoje</h4>
          <p><span class="book-emoji">{{ current.page.mood.emoji }}</span> <strong>{{ current.page.mood.name }}</strong> — {{ current.page.mood.why }}</p>
        </section>
        <section>
          <h4>Jeito</h4>
          <p><strong>{{ current.page.personality.name }}.</strong> {{ current.page.personality.about }}</p>
        </section>
        <section>
          <h4>Sobre você</h4>
          <p>{{ current.page.aboutYou }}</p>
        </section>
        <section>
          <h4>Gostos</h4>
          <p v-if="current.page.likes">Adora ganhar <strong>{{ current.page.likes }}</strong>. Não gosta muito de <strong>{{ current.page.dislikes }}</strong>.</p>
          <p v-else class="locked">🔒 Fique Colega dele para descobrir.</p>
        </section>
        <section>
          <h4>O que pensa dos colegas</h4>
          <ul v-if="current.page.opinions && current.page.opinions.length" class="book-opinions">
            <li v-for="o in current.page.opinions" :key="o.name">{{ o.emoji }} {{ current.page.name }} {{ o.feeling }}.</li>
          </ul>
          <p v-else-if="current.page.opinions" class="hint">Ainda não há colegas na caixa.</p>
          <p v-else class="locked">🔒 Fique Amigo dele para ele contar.</p>
        </section>
        <section v-if="relations">
          <h4>Vida social</h4>
          <ul v-if="(relations[current.mon.id] ?? []).length" class="book-opinions">
            <li v-for="r in relations[current.mon.id]" :key="r.name">{{ r.emoji }} {{ r.label }} de {{ r.name }} <small>({{ r.met }} {{ r.met === 1 ? 'momento' : 'momentos' }})</small></li>
          </ul>
          <p v-else class="hint">Ainda não viveu nada com os colegas. Dê tempo à Vila!</p>
        </section>
        <section>
          <h4>Intimidade</h4>
          <ul class="book-unlocks">
            <li v-for="(u, k) in current.page.unlocks" :key="k" :class="{ open: u.open }">
              <span>{{ u.open ? '✓' : '🔒' }}</span>
              <span><small>{{ u.levelName }}</small> {{ u.text }}</span>
            </li>
          </ul>
        </section>
        <button v-if="canDress" type="button" class="book-acc" @click="emit('accessory', current.mon.id)">
          {{ current.mon.accessory ? 'Trocar o acessório' : 'Dar um acessório' }}
        </button>
      </article>
    </template>
  </div>
</template>
