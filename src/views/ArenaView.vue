<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { pendingChallenge } from '../app/league-store';
import { league } from '../app/league-store';
import { arenaFlags, routeHref } from '../app/route';
import TeamPicker from '../components/TeamPicker.vue';
import LeagueCard from '../components/LeagueCard.vue';
import { ENDLESS_ARENA_LABELS } from '../core/endless-arena';
import type { EndlessArenaMode } from '../core/endless-arena';
import { challengeById, LEAGUE_REGIONS, nextChallenge } from '../core/league';
import { TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';

const MODES: readonly EndlessArenaMode[] = ['formatacao', 'restauracao'];
const waitingChallenge = computed(() => pendingChallenge.value !== null);
const selectedCount = ref<number | null>(null);
const teamReady = computed(() => selectedCount.value === 6);
/** A Liga aceita uma equipe incompleta; as corridas continuam pedindo os seis espaços. */
const hasBattleTeam = computed(() => (selectedCount.value ?? 0) > 0);
const selectedChallenge = computed(() => pendingChallenge.value ? challengeById(pendingChallenge.value) : null);
function updateTeam(ids: string[]): void {
  const wasComplete = selectedCount.value === 6;
  selectedCount.value = ids.length;
  // Uma seleção de seis confirma que a equipe do desafio está fechada: segue sem pedir mais um botão.
  if (waitingChallenge.value && ids.length === 6 && !wasComplete) void nextTick(enterChallenge);
}
const leagueRegion = computed(() => LEAGUE_REGIONS.find((region) => nextChallenge(league.value, region.id) !== null) ?? LEAGUE_REGIONS[0]!);
const nextLeader = computed(() => nextChallenge(league.value, leagueRegion.value.id));
function goToLeague(): void { document.getElementById('arena-league')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function goToTeam(): void { document.getElementById('arena-team')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

function arenaBoxFlags(extra: Parameters<typeof arenaFlags>[0] = []): ReturnType<typeof arenaFlags> { return ['arena', ...arenaFlags(extra)]; }
function enterEndless(mode: EndlessArenaMode): void {
  if (!teamReady.value) return;
  // A Arena abre no toque seguinte e põe a batalha no botão principal.
  window.location.hash = routeHref('caixa', undefined, arenaBoxFlags([mode, 'autoiniciar']));
}

function enterChallenge(): void {
  if (!hasBattleTeam.value) {
    goToTeam();
    return;
  }
  window.location.hash = routeHref('caixa', undefined, arenaBoxFlags(['autoiniciar']));
}
onMounted(() => { if (waitingChallenge.value) void nextTick(goToTeam); });
</script>

<template>
  <section class="card arena-view" aria-labelledby="arena-title">
    <h2 id="arena-title">Arena Digital</h2>
    <p class="note">Escolha uma rota abaixo. A batalha é automática: você prepara a equipe, assiste ao combate e pode encerrar quando quiser.</p>
    <section class="arena-route" aria-label="Próximo passo na Arena">
      <template v-if="nextLeader">
        <span class="arena-kicker">ROTA DA LIGA · {{ leagueRegion.name }}</span>
        <h3>Próximo líder: {{ nextLeader.leader }}</h3>
        <p><span v-if="nextLeader.type" class="arena-type" :style="{ '--type': TYPE_COLORS[nextLeader.type] }">{{ TYPE_LABELS_PT[nextLeader.type] }}</span> {{ nextLeader.role }} · equipe de {{ nextLeader.team.length }} Pokémon</p>
        <button type="button" class="primary" @click="goToLeague">Ver {{ nextLeader.leader }} e desafiar</button>
      </template>
      <template v-else>
        <span class="arena-kicker">LIGA CONCLUÍDA</span><h3>Escolha uma revanche ou uma corrida 6×6</h3>
      </template>
    </section>
    <nav class="arena-paths" aria-label="Rotas da Arena">
      <button type="button" @click="goToLeague">🏅 Liga · líderes e insígnias</button>
      <button type="button" @click="goToTeam">👥 Corridas · monte um time de 6</button>
      <a :href="routeHref('caixa', undefined, arenaBoxFlags())">⚔️ Batalha livre</a>
    </nav>
    <ol class="arena-steps" aria-label="Etapas para desafio da Liga"><li :class="{ done: waitingChallenge }">{{ waitingChallenge ? '✓' : '1' }} Escolha o líder na Liga</li><li :class="{ done: hasBattleTeam }">{{ hasBattleTeam ? '✓' : '2' }} Monte até 6 Pokémon · {{ selectedCount ?? '…' }}/6</li><li>3 · Entrar na Arena 3D</li></ol>

    <section id="arena-league" class="arena-section arena-league" aria-label="Liga Pokémon e líderes de ginásio">
      <header><span class="arena-kicker">1 · ENCONTRE UM LÍDER</span><h3>Liga Pokémon</h3><p class="note">Os líderes estão organizados por região e por ordem. O próximo desafio aberto aparece destacado; os demais mostram claramente o que falta.</p></header>
      <LeagueCard @challenge="goToTeam" />
    </section>

    <section id="arena-team" class="arena-section" aria-labelledby="arena-team-title">
      <h3 id="arena-team-title">2 · Monte seu time de batalha</h3>
      <p class="note">Use até 6 Pokémon. Para a Liga, qualquer seleção disponível participa; para as corridas 6×6, complete exatamente 6.</p>
      <TeamPicker :max="6" group-label="time de batalha" hint="Este é o time de batalha da Arena e da Liga. Os moradores da Vila continuam sendo uma coleção separada." @ready="updateTeam" @change="updateTeam" />
      <div v-if="waitingChallenge" class="arena-ready" role="status">
        <strong>{{ selectedChallenge ? `Desafio contra ${selectedChallenge.leader} pronto` : 'Desafio da Liga pronto' }}</strong>
        <span>Seu oponente espera esta equipe. Selecione pelo menos um Pokémon acima e comece quando estiver pronto.</span>
        <button type="button" class="primary" :disabled="!hasBattleTeam" @click="enterChallenge">Começar desafio na Arena 3D</button>
        <small v-if="!hasBattleTeam" class="hint">Escolha ao menos um Pokémon para começar.</small>
      </div>
    </section>

    <section v-if="selectedCount === 0" class="arena-first-run" aria-labelledby="arena-first-run-title">
      <span>ANTES DA ARENA</span>
      <h3 id="arena-first-run-title">Você precisa de Pokémon prontos para formar uma equipe</h3>
      <p>Escaneie cartas físicas, abra <a :href="routeHref('cartas')">Minhas Cartas</a> para carregar um Pokémon salvo, ou entre na Vila para receber um companheiro digital.</p>
      <div class="actions row">
        <a class="button primary" :href="routeHref('escanear')">Escanear uma carta</a>
        <a class="button" :href="routeHref('cartas')">Minhas Cartas</a>
        <a class="button" :href="routeHref('vila')">Ir para a Vila</a>
      </div>
    </section>

    <section class="arena-section" aria-labelledby="arena-continuous-title">
      <h3 id="arena-continuous-title">Modos contínuos</h3>
      <p v-if="!teamReady" class="hint" role="status">{{ selectedCount === null ? 'Lendo a equipe…' : `Escolha 6 Pokémon acima para preparar uma corrida (atualmente ${selectedCount}/6).` }}</p>
      <p class="note">Os adversários usam espécies em estágio final, equipes completas e treinadores sorteados. Ao preparar uma corrida, ela começa assim que a Arena estiver montada; use <strong>Desistir</strong> para encerrar e guardar o placar da sessão.</p>
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
        <a class="button" :href="routeHref('caixa', undefined, arenaBoxFlags())">Abrir a Arena 3D</a>
      </div>
      <div>
        <h3>Batalhar com um amigo</h3>
        <p class="note">PvP acontece na Arena 3D; prepare sua equipe antes de convidar um amigo.</p>
        <a class="button" :href="routeHref('caixa', undefined, ['pvp', 'arena', 'virtual'])">Abrir PvP na Arena 3D</a>
      </div>
    </section>

  </section>
</template>

<style scoped>
.arena-view { display: grid; gap: 1rem; }
.arena-route { display: grid; gap: .45rem; padding: 1rem; border: 1px solid color-mix(in srgb, var(--accent) 75%, var(--line)); border-radius: .9rem; background: linear-gradient(135deg, rgba(242, 85, 75, .18), rgba(12, 17, 34, .72)); }
.arena-route > * { margin: 0; }
.arena-kicker { color: var(--gold); font-size: .73rem; font-weight: 800; letter-spacing: .08em; }
.arena-type { display: inline-block; padding: .12rem .42rem; border: 1px solid var(--type); border-radius: 99px; color: var(--type); font-size: .8rem; font-weight: 750; }
.arena-paths { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .5rem; }
.arena-paths > * { display: grid; place-items: center; min-height: 3rem; padding: .5rem; border: 1px solid var(--line); border-radius: .7rem; color: inherit; font: inherit; text-align: center; text-decoration: none; background: rgba(12, 17, 34, .55); }
.arena-paths > *:hover, .arena-paths > *:focus-visible { border-color: var(--accent); }
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
@media (max-width: 520px) { .arena-paths { grid-template-columns: 1fr; } }
</style>
