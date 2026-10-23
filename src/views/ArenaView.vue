<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { pendingChallenge } from '../app/league-store';
import { arenaFlags, routeHref } from '../app/route';
import TeamPicker from '../components/TeamPicker.vue';
import LeagueCard from '../components/LeagueCard.vue';
import { ENDLESS_ARENA_LABELS } from '../core/endless-arena';
import type { EndlessArenaMode } from '../core/endless-arena';

const MODES: readonly EndlessArenaMode[] = ['formatacao', 'restauracao'];
/** Onde as lutas acontecem: a Arena 3D (sem câmera, padrão) ou a Caixa em AR (câmera). A escolha fica guardada neste aparelho. */
const FUNDO_KEY = 'tcg-ar-arena-fundo-v1';
function storedBackdropIsVirtual(): boolean {
  try {
    return localStorage.getItem(FUNDO_KEY) !== 'camera';
  } catch {
    return true;
  }
}
const virtual = ref(storedBackdropIsVirtual());
watch(virtual, (on) => {
  try {
    localStorage.setItem(FUNDO_KEY, on ? 'virtual' : 'camera');
  } catch {
    // Só não lembra da escolha na próxima vez.
  }
});
const waitingChallenge = computed(() => pendingChallenge.value !== null);
const selectedCount = ref<number | null>(null);
const teamReady = computed(() => selectedCount.value === 6);
function updateTeam(ids: string[]): void { selectedCount.value = ids.length; }

function enterEndless(mode: EndlessArenaMode): void {
  if (!teamReady.value) return;
  // A câmera (se for o caso) só pode abrir no toque seguinte; a Caixa recebe o modo e põe a batalha no botão principal.
  window.location.hash = routeHref('caixa', undefined, arenaFlags([mode], virtual.value));
}

function enterChallenge(): void {
  window.location.hash = routeHref('caixa', undefined, arenaFlags([], virtual.value));
}
</script>

<template>
  <section class="card arena-view" aria-labelledby="arena-title">
    <h2 id="arena-title">Arena Digital</h2>
    <p class="note">Prepare a equipe, escolha o desafio e entre na arena. A batalha é automática; você acompanha e pode encerrar quando quiser.</p>
    <ol class="arena-steps" aria-label="Etapas para batalhar"><li :class="{ done: teamReady }">{{ teamReady ? '✓' : '1' }} Equipe · {{ selectedCount ?? '…' }}/6</li><li>2 · Escolher desafio</li><li>{{ virtual ? '3 · Entrar na Arena 3D' : '3 · Abrir câmera e colocar a Caixa' }}</li></ol>
    <div class="box-backdrop" role="group" aria-label="Onde lutar">
      <button type="button" :class="{ active: virtual }" :aria-pressed="virtual" @click="virtual = true">🏟️ Arena 3D (sem câmera)</button>
      <button type="button" :class="{ active: !virtual }" :aria-pressed="!virtual" @click="virtual = false">📷 Caixa em AR (câmera)</button>
    </div>

    <div v-if="waitingChallenge" class="arena-ready" role="status">
      <strong>Desafio da Liga marcado</strong>
      <span>Seu oponente já está esperando. A Caixa monta o revezamento da sua equipe contra a equipe completa dele.</span>
      <button type="button" class="primary" @click="enterChallenge">{{ virtual ? 'Entrar na Arena 3D para o desafio' : 'Abrir a Caixa para o desafio' }}</button>
    </div>

    <section class="arena-section" aria-labelledby="arena-team-title">
      <h3 id="arena-team-title">Equipe da Arena · 6 Pokémon</h3>
      <TeamPicker :max="6" group-label="equipe de batalha" hint="Escolha os 6 Pokémon que lutam nos modos contínuos. Essa seleção também define quem mora na Vila e aparece na Caixa em AR." @ready="updateTeam" @change="updateTeam" />
    </section>

    <section v-if="selectedCount === 0" class="arena-first-run" aria-labelledby="arena-first-run-title">
      <span>ANTES DA ARENA</span>
      <h3 id="arena-first-run-title">Você precisa de Pokémon para formar uma equipe</h3>
      <p>Escaneie cartas físicas ou entre na Vila para receber um companheiro digital. Depois, volte aqui e escolha até 6 Pokémon.</p>
      <div class="actions row">
        <a class="button primary" :href="routeHref('escanear')">Escanear uma carta</a>
        <a class="button" :href="routeHref('vila')">Ir para a Vila</a>
      </div>
    </section>

    <section class="arena-section" aria-labelledby="arena-continuous-title">
      <h3 id="arena-continuous-title">Modos contínuos</h3>
      <p v-if="!teamReady" class="hint" role="status">{{ selectedCount === null ? 'Lendo a equipe…' : `Escolha 6 Pokémon acima para preparar uma corrida (atualmente ${selectedCount}/6).` }}</p>
      <p class="note">Os adversários usam espécies em estágio final, equipes completas e treinadores sorteados. A qualquer momento, use <strong>Desistir</strong> na Caixa para encerrar a corrida e guardar o placar da sessão.</p>
      <div class="arena-mode-grid">
        <article v-for="mode in MODES" :key="mode" class="arena-mode-card">
          <h4>{{ ENDLESS_ARENA_LABELS[mode].title }}</h4>
          <p>{{ ENDLESS_ARENA_LABELS[mode].tutorial }}</p>
          <button type="button" class="primary" :disabled="!teamReady" @click="enterEndless(mode)">Preparar {{ ENDLESS_ARENA_LABELS[mode].title }}</button>
        </article>
      </div>
    </section>

    <section class="arena-section arena-shortcuts" aria-label="Outros desafios da Arena">
      <div>
        <h3>Combate comum</h3>
        <p class="note">Escolha formato, escalação e formas Mega na Caixa, sem corrida contínua.</p>
        <a class="button" :href="routeHref('caixa', undefined, arenaFlags([], virtual))">{{ virtual ? 'Abrir a Arena 3D' : 'Abrir Caixa AR' }}</a>
      </div>
      <div>
        <h3>Batalhar com um amigo</h3>
        <p class="note">Pareie dois celulares, escolha o modo e cada jogador vê a mesma luta na própria Caixa (com câmera; na tela inicial da Caixa dá para trocar o fundo).</p>
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
.arena-steps { display: flex; flex-wrap: wrap; gap: .5rem; margin: 0; padding: 0; list-style: none; }
.arena-steps li { padding: .5rem .7rem; border: 1px solid var(--line); border-radius: .7rem; font-size: .85rem; }
.arena-steps .done { border-color: #68bd91; color: #a7ebc3; }
.arena-section { display: grid; gap: 0.7rem; }
.arena-section > h3, .arena-mode-card h4 { margin: 0; }
.arena-ready { display: grid; gap: 0.5rem; padding: 1rem; border: 1px solid var(--accent); border-radius: 0.85rem; background: rgba(242, 85, 75, 0.12); }
.arena-first-run { display: grid; gap: .7rem; padding: 1rem; border: 1px solid color-mix(in srgb, var(--gold) 55%, var(--line)); border-radius: .85rem; background: linear-gradient(135deg, rgba(255, 216, 74, .12), rgba(12, 17, 34, .55)); }
.arena-first-run > * { margin: 0; }
.arena-first-run > span { color: var(--gold); font-size: .72rem; font-weight: 800; letter-spacing: .08em; }
.arena-mode-grid, .arena-shortcuts { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); }
.arena-mode-card, .arena-shortcuts > div { display: grid; gap: 0.55rem; align-content: start; padding: 0.9rem; border: 1px solid var(--line); border-radius: 0.85rem; background: rgba(12, 17, 34, 0.55); }
.arena-mode-card p { margin: 0; color: var(--muted); }
</style>
