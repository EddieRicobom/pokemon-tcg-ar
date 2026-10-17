<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue';
import { badgePolish, polishOf } from '../app/badge-polish-store';
import { league, pendingChallenge } from '../app/league-store';
import { routeHref } from '../app/route';
import { CHAMPION, ELITE, GYMS, nextChallenge, statusOf } from '../core/league';
import type { Challenge } from '../core/league';
import { TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import { trainerSpriteUrl } from '../core/trainer-sprites';
import { BADGE_DESIGNS } from '../core/badges';
import BadgeIcon from './BadgeIcon.vue';

// A maleta 3D (e o Three.js) só carrega quando o jogador abre.
const BadgeCaseView = defineAsyncComponent(() => import('./BadgeCaseView.vue'));
const caseOpen = ref(false);

const shortName = (name: string): string => name.replace(/^Insígnia /, '');
const polishFor = (order: number): number => {
  void badgePolish.value;
  return polishOf(order);
};

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
      <li v-for="d in BADGE_DESIGNS" :key="d.order" :class="{ won: league.badges.includes(d.order) }" :title="d.name">
        <BadgeIcon :order="d.order" :won="league.badges.includes(d.order)" :polish="polishFor(d.order)" />
        <small aria-hidden="true">{{ shortName(d.name) }}</small>
        <span class="sr-only">{{ d.name }} ({{ d.leader }}, {{ d.motif }}): {{ league.badges.includes(d.order) ? 'conquistada' : 'ainda não' }}</span>
      </li>
    </ul>
    <button type="button" class="case-open" @click="caseOpen = true">Abrir a maleta 3D</button>
    <BadgeCaseView v-if="caseOpen" @close="caseOpen = false" />
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
