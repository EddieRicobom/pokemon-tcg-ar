<script setup lang="ts">
import { computed, ref } from 'vue';
import { badgePolish, polishOf } from '../app/badge-polish-store';
import { league, pendingChallenge } from '../app/league-store';
import { routeHref } from '../app/route';
import { challengeById, LEAGUE_REGIONS, leaguePerks, regionalProgress, nextChallenge, statusOf } from '../core/league';
import type { Challenge, RegionId } from '../core/league';
import { TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import { trainerSpriteUrl } from '../core/trainer-sprites';
import { ALL_BADGE_DESIGNS } from '../core/badges';
import BadgeCaseView from './BadgeCaseView.vue';
import BadgeIcon from './BadgeIcon.vue';

// A maleta 3D só carrega o Three.js quando o jogador abre (import dinâmico dentro de BadgeCaseView).
const caseOpen = ref(false);
// Quem chega com um desafio marcado vê a região dele, não Sinnoh.
const selected = ref<RegionId>((pendingChallenge.value ? challengeById(pendingChallenge.value)?.region : undefined) ?? 'sinnoh');
const region = computed(() => LEAGUE_REGIONS.find((r) => r.id === selected.value)!);
const progress = computed(() => regionalProgress(league.value, selected.value));
const designs = computed(() => ALL_BADGE_DESIGNS.filter((d) => d.order >= region.value.badgeOffset && d.order < region.value.badgeOffset + 8));

const shortName = (name: string): string => name.replace(/^Insígnia /, '');
const polishFor = (order: number): number => {
  void badgePolish.value;
  return polishOf(order);
};

/** Liga: estojo de insígnias, os Ginásios em ordem, a Elite 4 e a Campeã. O desafio é preparado e lutado na Arena. */
const next = computed(() => nextChallenge(league.value, selected.value));
// Ordem cronológica, sem alterar os índices persistidos de Sinnoh.
const regionTabs = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'paldea'].map((id) => LEAGUE_REGIONS.find((r) => r.id === id)!);
const sections = computed(() => [
  { title: 'Ginásios', challenges: region.value.gyms },
  { title: 'Elite 4', challenges: region.value.elite },
  { title: region.value.champion.role, challenges: [region.value.champion] },
].map((section) => ({ ...section, rows: section.challenges.map((c) => ({ c, status: statusOf(league.value, c) })) })));
const badgeCount = computed(() => progress.value.badges.length);
const perks = computed(() => leaguePerks(league.value));

/** `challenge` avisa que o desafio foi marcado: dentro da Arena, a tela leva ao passo de entrar. */
const emit = defineEmits<{ challenge: [] }>();
/** Dentro da Arena o título e o cartão vêm da própria seção; no Treinador a Liga é um cartão. */
const props = defineProps<{ embedded?: boolean }>();
/** Dentro da Arena, insígnias e bônus ficam a um toque: o que importa ali é escolher o líder. */
const extrasOpen = ref(!props.embedded);

/** Fora da Arena, leva para ela já na Liga; dentro, fica onde está (e preserva o «Voltar à Vila» do endereço). */
function challenge(c: Challenge): void {
  pendingChallenge.value = c.id;
  if (!props.embedded) window.location.hash = routeHref('arena', undefined, ['liga']);
  emit('challenge');
}

const STATUS_PT = { locked: '🔒 Bloqueado', open: 'Aberto', beaten: '✓ Vencido' } as const;

/** Diz por que um desafio ainda está fechado, em vez de só repetir «Bloqueado». */
function lockReason(c: Challenge): string {
  if (c.kind === 'gym') return `Vença ${region.value.gyms[c.order - 1]?.leader ?? 'o ginásio anterior'} primeiro`;
  if (c.kind === 'elite') return c.order === 0 ? 'Exige as 8 insígnias' : 'Vença o membro anterior da Elite 4';
  return 'Exige vencer a Elite 4';
}
const doneOf = (rows: { status: string }[]): number => rows.filter((r) => r.status === 'beaten').length;
</script>

<template>
  <div :class="['league', { card: !embedded, embedded }]">
    <h2 v-if="!embedded">Liga Pokémon <small class="count">{{ badgeCount }} de 8 insígnias</small></h2>
    <p v-else class="league-count" role="status">{{ badgeCount }} de 8 insígnias de {{ region.name }}</p>
    <nav class="league-regions" aria-label="Regiões da Liga">
      <button v-for="r in regionTabs" :key="r.id" type="button" :aria-pressed="selected === r.id" :class="{ primary: selected === r.id }" @click="selected = r.id">{{ r.name }} · {{ r.generation }}</button>
    </nav>
    <h3>{{ region.name }} · Geração {{ region.generation }}</h3>
    <button v-if="embedded" type="button" class="league-extras" :aria-expanded="extrasOpen" @click="extrasOpen = !extrasOpen">{{ extrasOpen ? 'Esconder insígnias e bônus' : 'Ver insígnias e bônus' }}</button>
    <template v-if="extrasOpen">
    <p class="note">Equipes de exibição inspiradas nos jogos da região, com dificuldade própria do app.</p>
    <p class="note league-perk" role="status">
      <template v-if="perks.pinShotDiscount > 0">🎳 Bônus da Liga: -{{ perks.pinShotDiscount }} moeda{{ perks.pinShotDiscount === 1 ? '' : 's' }} por disparo no Pins. </template>
      <template v-else>🎳 Conquiste 4 insígnias para reduzir o custo de cada disparo no Pins. </template>
      Campos liberados: {{ perks.pinFields.map((field) => ({ natural: 'Jardim', ice: 'Geleira', toxic: 'Pântano', psy: 'Salão psíquico' })[field]).join(', ') }}.
    </p>
    <ul class="badge-case" aria-label="Estojo de insígnias">
      <li v-for="d in designs" :key="d.order" :class="{ won: league.badges.includes(d.order) }" :title="d.name">
        <BadgeIcon :order="d.order" :won="league.badges.includes(d.order)" :polish="polishFor(d.order)" />
        <small aria-hidden="true">{{ shortName(d.name) }}</small>
        <span class="sr-only">{{ d.name }} ({{ d.leader }}, {{ d.motif }}): {{ league.badges.includes(d.order) ? 'conquistada' : 'ainda não' }}</span>
      </li>
    </ul>
    <button type="button" class="case-open" @click="caseOpen = true">Abrir a maleta 3D de {{ region.name }}</button>
    <BadgeCaseView v-if="caseOpen" :key="selected" :region="selected" @close="caseOpen = false" />
    </template>
    <p v-if="progress.championWins > 0" class="note champion-note">Campeão da Liga de {{ region.name }} {{ progress.championWins }} {{ progress.championWins === 1 ? 'vez' : 'vezes' }}! Seu nome está no Hall da Fama.</p>
    <p v-else-if="next" class="note">Próximo desafio: <strong>{{ next.leader }}</strong> ({{ next.role }}). A luta é na Arena, 6×6 em tempo real, com a sua equipe contra a do líder.</p>
    <section v-for="section in sections" :key="section.title" :aria-label="`${section.title} de ${region.name}`">
    <h3 class="league-heading">{{ section.title }} <small v-if="section.rows.length > 1" class="count">{{ doneOf(section.rows) }}/{{ section.rows.length }}</small></h3>
    <ul class="league-list">
      <li v-for="{ c, status } in section.rows" :key="c.id" :class="[status, { next: next?.id === c.id }]" :aria-current="next?.id === c.id ? 'step' : undefined">
        <img :src="trainerSpriteUrl(c.sprite)" alt="" width="48" height="48" loading="lazy" />
        <span class="l-text">
          <span class="l-name"><strong>{{ c.leader }}</strong> <em v-if="next?.id === c.id" class="l-next">Próximo</em></span>
          <small class="l-meta">
            <span v-if="c.type" class="l-type"><span class="type-dot" :style="{ background: TYPE_COLORS[c.type] }"></span>{{ TYPE_LABELS_PT[c.type] }}</span>
            <span>{{ c.team.length }} Pokémon</span>
          </small>
          <small v-if="status === 'locked'" class="l-lock">{{ lockReason(c) }}</small>
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
.league-regions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; margin-block: 1rem; }
.league-regions button { padding-inline: 0.4rem; white-space: nowrap; }
.league-extras { justify-self: start; }
.league-count { margin: 0; color: var(--gold); font-weight: 700; }
.embedded { display: grid; gap: 0.6rem; }
.embedded > * { margin-block: 0; }
.league-heading { display: flex; align-items: baseline; gap: 0.5rem; }
.l-meta { display: flex; flex-wrap: wrap; gap: 0.2rem 0.6rem; }
.l-type { white-space: nowrap; }
.l-lock { font-style: italic; }
.l-next { padding: 0.05rem 0.4rem; border-radius: 99px; background: var(--accent-fill); color: var(--on-accent); font-size: 0.74rem; font-style: normal; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; vertical-align: 0.1em; }
.league-list li.next { box-shadow: inset 0 0 0 2px var(--accent); }
/* A classe global .locked é a cor do livro, feita para fundo claro; aqui o fundo é escuro. */
.league-list li.locked { color: var(--muted); }
.l-status { white-space: nowrap; }
@media (max-width: 340px) { .league-regions { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
