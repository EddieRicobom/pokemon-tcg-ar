<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { bookPage } from '../core/village/book';
import type { BookMon } from '../core/village/book';
import { friendLevel } from '../core/village/life';
import type { Friendship } from '../core/village/life';
import { MAX_NICK_LEN, NICK_MIN_LEVEL } from '../core/village/nickname';
import { dayKey } from '../core/trainer';

/** O Livro dos Pokémon: uma página por Pokémon da caixa, com humor, jeito, gostos, opiniões e o que a intimidade abre. */
const props = defineProps<{
  mons: readonly (BookMon & { thumb?: string; accessory?: string | null })[];
  friends: Readonly<Record<string, Friendship>>;
  /** Mostra o botão de dar acessório (na Vila). */
  canDress?: boolean;
  /** O que cada Pokémon é dos colegas (casal, rivais, amigos…), pela vida social da Vila. */
  relations?: Readonly<Record<string, readonly { name: string; label: string; emoji: string; met: number }[]>>;
  /** O bordão de cada Pokémon (o que ele repete no fim das falas). */
  words?: Readonly<Record<string, string>>;
  /** O que você respondeu às perguntas de cada Pokémon (as mais recentes). */
  told?: Readonly<Record<string, readonly { q: string; a: string }[]>>;
  /** Memórias importantes registradas para cada Pokémon. */
  memories?: Readonly<Record<string, readonly { kind: string; text: string; day: string }[]>>;
  /** Os apelidos dados (quando vem, a página mostra o campo de apelido). */
  nicks?: Readonly<Record<string, string>>;
  /** O recado da última tentativa de dar apelido (deu certo, já existe, falta amizade…). */
  nickNote?: string;
  /** Id interno da página que deve ser aberta ao entrar no Livro. */
  initialId?: string;
}>();
const emit = defineEmits<{ accessory: [id: string]; nickname: [id: string, text: string] }>();

const index = ref(0);
const day = dayKey(new Date());
const hour = new Date().getHours();
const current = computed(() => {
  const mon = props.mons[Math.min(index.value, props.mons.length - 1)];
  return mon ? { mon, page: bookPage(mon, props.mons, props.friends[mon.id], day, hour) } : null;
});

function selectById(id: string | undefined): void {
  if (!id) return;
  const found = props.mons.findIndex((mon) => mon.id === id);
  if (found >= 0) index.value = found;
}

watch(() => props.initialId, (id) => selectById(id), { immediate: true });

const nickDraft = ref('');
const canNick = computed(() => (current.value ? friendLevel(props.friends[current.value.mon.id]?.points ?? 0).level >= NICK_MIN_LEVEL : false));
const nickNow = computed(() => (current.value ? (props.nicks?.[current.value.mon.id] ?? '') : ''));
watch(() => [current.value?.mon.id, nickNow.value] as const, () => (nickDraft.value = nickNow.value), { immediate: true });

function saveNick(clear = false): void {
  if (current.value) emit('nickname', current.value.mon.id, clear ? '' : nickDraft.value);
}

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
            <p v-if="current.mon.real && current.mon.real !== current.page.name" class="hint">Na carta: {{ current.mon.real }}</p>
            <p class="book-hearts" :aria-label="`${current.page.levelName}, ${current.page.hearts} de 5 corações`">
              <span v-for="k in 5" :key="k" :class="{ on: k <= current.page.hearts }">♥</span>
              <small>{{ current.page.levelName }} · {{ current.page.points }}/100 · {{ current.page.progress }}</small>
            </p>
          </div>
        </header>
        <section v-if="nicks" class="book-nick">
          <h4>Apelido</h4>
          <form v-if="canNick" class="book-nick-form" @submit.prevent="saveNick()">
            <input v-model="nickDraft" type="text" :maxlength="MAX_NICK_LEN" placeholder="Como você quer chamar?" autocomplete="off" aria-label="Apelido" />
            <button type="submit" :disabled="nickDraft.trim() === '' || nickDraft.trim() === nickNow">Salvar</button>
            <button v-if="nickNow" type="button" @click="saveNick(true)">Tirar</button>
          </form>
          <p v-else class="hint">Ainda não aceita apelido.</p>
          <p v-if="nickNote" class="hint" role="status">{{ nickNote }}</p>
        </section>
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
        <section v-if="words">
          <h4>Bordão e conversas</h4>
          <p v-if="words[current.mon.id]">Sempre diz: <strong>“{{ words[current.mon.id] }}”</strong></p>
          <ul v-if="(told?.[current.mon.id] ?? []).length" class="book-opinions">
            <li v-for="(t, k) in told?.[current.mon.id]" :key="k">💬 {{ t.q }} <strong>{{ t.a }}</strong></li>
          </ul>
          <p v-else class="hint">Ele ainda não te perguntou nada. Quando aparecer um ❗ sobre ele, converse!</p>
        </section>
        <section v-if="relations">
          <h4>Vida social</h4>
          <ul v-if="(relations[current.mon.id] ?? []).length" class="book-opinions">
            <li v-for="r in relations[current.mon.id]" :key="r.name">{{ r.emoji }} {{ r.label }} de {{ r.name }} <small>({{ r.met }} {{ r.met === 1 ? 'momento' : 'momentos' }})</small></li>
          </ul>
          <p v-else class="hint">Ainda não viveu nada com os colegas. Dê tempo à Vila!</p>
        </section>
        <section v-if="memories">
          <h4>Memórias importantes</h4>
          <ul v-if="(memories[current.mon.id] ?? []).length" class="book-opinions">
            <li v-for="memory in memories[current.mon.id]" :key="`${memory.day}:${memory.text}`">🧠 {{ memory.text }} <small>({{ memory.day }})</small></li>
          </ul>
          <p v-else class="hint">Ainda não há uma memória marcante registrada.</p>
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
