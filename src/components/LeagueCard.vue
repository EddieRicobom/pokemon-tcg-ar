<script setup lang="ts">
import { computed } from 'vue';
import { league, pendingChallenge } from '../app/league-store';
import { routeHref } from '../app/route';
import { CHAMPION, ELITE, GYMS, nextChallenge, statusOf } from '../core/league';
import type { Challenge } from '../core/league';
import { TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import { trainerSpriteUrl } from '../core/trainer-sprites';

/** Liga: estojo de insígnias, os Ginásios em ordem, a Elite 4 e a Campeã. O desafio acontece na Caixa. */
const next = computed(() => nextChallenge(league.value));
const rows = computed(() => [...GYMS, ...ELITE, CHAMPION].map((c) => ({ c, status: statusOf(league.value, c) })));
const badgeCount = computed(() => league.value.badges.length);

/** `challenge` avisa que o desafio foi marcado (a Arena da Vila fecha a Vila, que mora dentro da Caixa, para a luta aparecer). */
const emit = defineEmits<{ challenge: [] }>();

function challenge(c: Challenge): void {
  pendingChallenge.value = c.id;
  window.location.hash = routeHref('caixa');
  emit('challenge');
}

const STATUS_PT = { locked: 'Bloqueado', open: 'Aberto', beaten: 'Vencido' } as const;
</script>

<template>
  <div class="card league">
    <h2>Liga Pokémon <small class="count">{{ badgeCount }} de 8 insígnias</small></h2>
    <ul class="badge-case" aria-label="Estojo de insígnias">
      <li v-for="g in GYMS" :key="g.id" :class="{ won: league.badges.includes(g.order) }" :title="g.badge?.name">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M16 2 27 8v16l-11 6-11-6V8z" :fill="league.badges.includes(g.order) ? g.badge?.color : 'none'" />
          <path d="M16 7 22 10.5v11L16 25l-6-3.5v-11z" class="badge-gem" />
        </svg>
        <span class="sr-only">{{ g.badge?.name }}: {{ league.badges.includes(g.order) ? 'conquistada' : 'ainda não' }}</span>
      </li>
    </ul>
    <p v-if="league.championWins > 0" class="note champion-note">Campeão da Liga {{ league.championWins }} {{ league.championWins === 1 ? 'vez' : 'vezes' }}! Seu nome está no Hall da Fama.</p>
    <p v-else-if="next" class="note">Próximo desafio: <strong>{{ next.leader }}</strong> ({{ next.role }}). A batalha é na Caixa, em revezamento, com a sua equipe contra a do líder.</p>
    <ul class="league-list">
      <li v-for="{ c, status } in rows" :key="c.id" :class="status">
        <img :src="trainerSpriteUrl(c.sprite)" alt="" width="48" height="48" loading="lazy" />
        <span class="l-text">
          <strong>{{ c.leader }}</strong>
          <small>
            {{ c.role }}<template v-if="c.type"> · <span class="type-dot" :style="{ background: TYPE_COLORS[c.type] }"></span>{{ TYPE_LABELS_PT[c.type] }}</template>
            · {{ c.team.length }} Pokémon
          </small>
          <small v-if="c.kind === 'elite' && status === 'open' && c.order > 0">Corrida: perder volta ao começo da Elite 4</small>
        </span>
        <button v-if="status !== 'locked'" type="button" :class="status === 'open' ? 'primary' : ''" @click="challenge(c)">{{ status === 'open' ? 'Desafiar' : 'Revanche' }}</button>
        <span v-else class="l-status">{{ STATUS_PT[status] }}</span>
      </li>
    </ul>
  </div>
</template>
