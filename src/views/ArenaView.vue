<script setup lang="ts">
import { computed } from 'vue';
import { pendingChallenge } from '../app/league-store';
import { routeHref } from '../app/route';
import TeamPicker from '../components/TeamPicker.vue';
import LeagueCard from '../components/LeagueCard.vue';
import { ENDLESS_ARENA_LABELS } from '../core/endless-arena';
import type { EndlessArenaMode } from '../core/endless-arena';

const MODES: readonly EndlessArenaMode[] = ['formatacao', 'restauracao'];
const waitingChallenge = computed(() => pendingChallenge.value !== null);

function enterEndless(mode: EndlessArenaMode): void {
  // A câmera só pode abrir no toque seguinte; a Caixa recebe o modo e põe a batalha no botão principal.
  window.location.hash = routeHref('caixa', undefined, [mode]);
}

function enterChallenge(): void {
  window.location.hash = routeHref('caixa');
}
</script>

<template>
  <section class="card arena-view" aria-labelledby="arena-title">
    <h2 id="arena-title">Arena Digital</h2>
    <p class="note">Aqui você prepara uma equipe e escolhe o desafio. A batalha acontece automaticamente na Caixa AR: abra a câmera, coloque a caixa no chão e toque no botão principal.</p>

    <div v-if="waitingChallenge" class="arena-ready" role="status">
      <strong>Desafio da Liga marcado</strong>
      <span>Seu oponente já está esperando. A Caixa monta o revezamento da sua equipe contra a equipe completa dele.</span>
      <button type="button" class="primary" @click="enterChallenge">Abrir a Caixa para o desafio</button>
    </div>

    <section class="arena-section" aria-labelledby="arena-team-title">
      <h3 id="arena-team-title">Equipe da Arena · 6 Pokémon</h3>
      <TeamPicker :max="6" group-label="equipe de batalha" hint="Escolha os 6 Pokémon que lutam nos modos contínuos. Essa seleção também define quem mora na Vila e aparece na Caixa em AR." />
    </section>

    <section class="arena-section" aria-labelledby="arena-continuous-title">
      <h3 id="arena-continuous-title">Modos contínuos</h3>
      <p class="note">Os adversários usam espécies em estágio final, equipes completas e treinadores sorteados. A qualquer momento, use <strong>Desistir</strong> na Caixa para encerrar a corrida e guardar o placar da sessão.</p>
      <div class="arena-mode-grid">
        <article v-for="mode in MODES" :key="mode" class="arena-mode-card">
          <h4>{{ ENDLESS_ARENA_LABELS[mode].title }}</h4>
          <p>{{ ENDLESS_ARENA_LABELS[mode].tutorial }}</p>
          <button type="button" class="primary" @click="enterEndless(mode)">Preparar {{ ENDLESS_ARENA_LABELS[mode].title }}</button>
        </article>
      </div>
    </section>

    <section class="arena-section arena-shortcuts" aria-label="Outros desafios da Arena">
      <div>
        <h3>Combate comum</h3>
        <p class="note">Escolha formato, escalação e formas Mega na Caixa, sem corrida contínua.</p>
        <a class="button" :href="routeHref('caixa')">Abrir Caixa AR</a>
      </div>
      <div>
        <h3>Batalhar com um amigo</h3>
        <p class="note">Pareie dois celulares, escolha o modo e cada jogador vê a mesma luta na própria Caixa.</p>
        <a class="button" :href="routeHref('caixa', undefined, ['pvp'])">Abrir PvP na Caixa</a>
      </div>
    </section>

    <section class="arena-section" aria-label="Liga Pokémon">
      <LeagueCard />
    </section>
  </section>
</template>

<style scoped>
.arena-view { display: grid; gap: 1rem; }
.arena-section { display: grid; gap: 0.7rem; }
.arena-section > h3, .arena-mode-card h4 { margin: 0; }
.arena-ready { display: grid; gap: 0.5rem; padding: 1rem; border: 1px solid var(--accent); border-radius: 0.85rem; background: rgba(242, 85, 75, 0.12); }
.arena-mode-grid, .arena-shortcuts { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); }
.arena-mode-card, .arena-shortcuts > div { display: grid; gap: 0.55rem; align-content: start; padding: 0.9rem; border: 1px solid var(--line); border-radius: 0.85rem; background: rgba(12, 17, 34, 0.55); }
.arena-mode-card p { margin: 0; color: var(--muted); }
</style>
