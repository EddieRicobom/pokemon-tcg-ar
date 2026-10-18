<script setup lang="ts">
import { computed, ref } from 'vue';
import { badgePolish, polishOf } from '../app/badge-polish-store';
import { league, pendingChallenge } from '../app/league-store';
import { routeHref } from '../app/route';
import { LEAGUE_REGIONS, regionalProgress, nextChallenge, statusOf } from '../core/league';
import type { Challenge, RegionId } from '../core/league';
import { TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import { trainerSpriteUrl } from '../core/trainer-sprites';
import { ALL_BADGE_DESIGNS } from '../core/badges';
import BadgeCaseView from './BadgeCaseView.vue';
import BadgeIcon from './BadgeIcon.vue';

// A maleta 3D só carrega o Three.js quando o jogador abre (import dinâmico dentro de BadgeCaseView).
const caseOpen = ref(false);
const selected = ref<RegionId>('sinnoh');
const region = computed(() => LEAGUE_REGIONS.find((r) => r.id === selected.value)!);
const progress = computed(() => regionalProgress(league.value, selected.value));
const designs = computed(() => ALL_BADGE_DESIGNS.filter((d) => d.order >= region.value.badgeOffset && d.order < region.value.badgeOffset + 8));

const shortName = (name: string): string => name.replace(/^Insígnia /, '');
const polishFor = (order: number): number => {
  void badgePolish.value;
  return polishOf(order);
};

/** Liga: estojo de insígnias, os Ginásios em ordem, a Elite 4 e a Campeã. O desafio acontece na Caixa. */
const next = computed(() => nextChallenge(league.value, selected.value));
// Ordem cronológica, sem alterar os índices persistidos de Sinnoh.
const regionTabs = ['kanto', 'johto', 'hoenn', 'sinnoh'].map((id) => LEAGUE_REGIONS.find((r) => r.id === id)!);
const sections = computed(() => [
  { title: 'Ginásios', challenges: region.value.gyms },
  { title: 'Elite 4', challenges: region.value.elite },
  { title: region.value.champion.role, challenges: [region.value.champion] },
].map((section) => ({ ...section, rows: section.challenges.map((c) => ({ c, status: statusOf(league.value, c) })) })));
const badgeCount = computed(() => progress.value.badges.length);

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
    <nav class="league-regions" aria-label="Regiões da Liga">
      <button v-for="r in regionTabs" :key="r.id" type="button" :aria-pressed="selected === r.id" :class="{ primary: selected === r.id }" @click="selected = r.id">{{ r.name }} · {{ r.generation }}</button>
    </nav>
    <h3>{{ region.name }} · Geração {{ region.generation }}</h3>
    <p class="note">Equipes de exibição inspiradas nos jogos da região, com dificuldade própria do app.</p>
    <ul class="badge-case" aria-label="Estojo de insígnias">
      <li v-for="d in designs" :key="d.order" :class="{ won: league.badges.includes(d.order) }" :title="d.name">
        <BadgeIcon :order="d.order" :won="league.badges.includes(d.order)" :polish="polishFor(d.order)" />
        <small aria-hidden="true">{{ shortName(d.name) }}</small>
        <span class="sr-only">{{ d.name }} ({{ d.leader }}, {{ d.motif }}): {{ league.badges.includes(d.order) ? 'conquistada' : 'ainda não' }}</span>
      </li>
    </ul>
    <button type="button" class="case-open" @click="caseOpen = true">Abrir a maleta 3D de {{ region.name }}</button>
    <BadgeCaseView v-if="caseOpen" :key="selected" :region="selected" @close="caseOpen = false" />
    <p v-if="progress.championWins > 0" class="note champion-note">Campeão da Liga de {{ region.name }} {{ progress.championWins }} {{ progress.championWins === 1 ? 'vez' : 'vezes' }}! Seu nome está no Hall da Fama.</p>
    <p v-else-if="next" class="note">Próximo desafio: <strong>{{ next.leader }}</strong> ({{ next.role }}). A batalha é na Caixa, em revezamento, com a sua equipe contra a do líder.</p>
    <section v-for="section in sections" :key="section.title" :aria-label="`${section.title} de ${region.name}`">
    <h3>{{ section.title }}</h3>
    <ul class="league-list">
      <li v-for="{ c, status } in section.rows" :key="c.id" :class="status">
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
    </section>
  </div>
</template>

<style scoped>
.league-regions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-block: 1rem; }
.league-regions button { flex: 1 1 7rem; }
</style>
