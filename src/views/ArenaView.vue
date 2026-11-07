<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { loadArenaMembers } from '../app/arena-members';
import { readArenaRecords } from '../app/arena-records';
import type { ArenaMember } from '../app/arena-members';
import { league, pendingChallenge } from '../app/league-store';
import { routeFlags, routeHref } from '../app/route';
import { loadVillage } from '../app/village-store';
import ArenaFight from '../components/ArenaFight.vue';
import type { ArenaFightSetup } from '../components/ArenaFight.vue';
import LeagueCard from '../components/LeagueCard.vue';
import TeamPicker from '../components/TeamPicker.vue';
import { ARENA_CHOICES, ARENA_TEAM, arenaPlan, choiceFromFlags, endlessFromFlags } from '../core/arena-menu';
import type { ArenaChoice } from '../core/arena-menu';
import { ENDLESS_ARENA_LABELS } from '../core/endless-arena';
import type { EndlessArenaMode } from '../core/endless-arena';
import { challengeById, statusOf } from '../core/league';
import { BATTLE_REWARDS_PER_DAY, battleRewardsLeft } from '../core/village/life';
import { dayKey } from '../core/trainer';

/**
 * O menu único da Arena: escolher o que fazer e a equipe, e aí a luta 6x6 em tempo real abre aqui mesmo (`ArenaFight`).
 * Quem vem da Vila, do Fliperama, do PvP ou da Liga cai aqui já na opção certa (`choiceFromFlags`).
 */
const ENDLESS_MODES: readonly EndlessArenaMode[] = ['formatacao', 'restauracao'];

const arrival = routeFlags(window.location.hash);
const fromVila = arrival.has('vila');
const fromFliperama = arrival.has('batalha');
const choice = ref<ArenaChoice | null>(choiceFromFlags(arrival, pendingChallenge.value !== null));
const endless = ref<EndlessArenaMode>(endlessFromFlags(arrival) ?? 'formatacao');
// Os sinalizadores já foram lidos: o endereço fica limpo (só «veio da Vila» sobrevive, para o ✕ da Vila).
if (arrival.size > 0) window.history.replaceState(null, '', routeHref('arena', undefined, fromVila ? ['vila'] : []));

const teamCount = ref<number | null>(null);
const members = ref<ArenaMember[]>([]);
const membersError = ref('');
const selectedChallenge = computed(() => (pendingChallenge.value ? challengeById(pendingChallenge.value) : null));
const leaderLocked = computed(() => !!selectedChallenge.value && statusOf(league.value, selectedChallenge.value) === 'locked');
const fight = ref<ArenaFightSetup | null>(null);
/** Recordes das corridas, relidos quando a luta fecha. */
const records = ref(readArenaRecords());
watch(fight, (open) => { if (!open) records.value = readArenaRecords(); });

const noDex = computed(() => members.value.filter((m) => m.dexId === undefined));
const plan = computed(() => arenaPlan({
  choice: choice.value,
  teamCount: teamCount.value ?? 0,
  teamBlocker: membersError.value || (noDex.value.length > 0 ? `Sem número da Pokédex, não dá para lutar: ${noDex.value.map((m) => m.name).join(', ')}.` : null),
  endless: endless.value,
  leader: selectedChallenge.value?.leader ?? null,
  leaderLocked: leaderLocked.value,
}));
const chosen = computed(() => ARENA_CHOICES.find((c) => c.id === choice.value) ?? null);
const rewardNote = computed(() => {
  if (!fromFliperama || choice.value !== 'treino') return '';
  const left = battleRewardsLeft(loadVillage(), dayKey(new Date()));
  return left > 0 ? `Fliperama: +100 moedas por luta (${left} de ${BATTLE_REWARDS_PER_DAY} hoje).` : 'Fliperama: as moedas de hoje já saíram.';
});

let membersToken = 0;
async function refreshMembers(ids: string[]): Promise<void> {
  const token = ++membersToken;
  try {
    const list = await loadArenaMembers(ids);
    if (token !== membersToken) return;
    members.value = list;
    membersError.value = '';
  } catch (error) {
    if (token !== membersToken) return;
    members.value = [];
    membersError.value = `Não consegui abrir a equipe: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function updateTeam(ids: string[]): void {
  teamCount.value = ids.length;
  void refreshMembers(ids);
}

const reduceMotion = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function scrollTo(id: string): void {
  void nextTick(() => document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }));
}

function pick(next: ArenaChoice): void {
  choice.value = next;
  scrollTo('arena-step-2');
}

/** Abre a luta com tudo já escolhido aqui. */
function enter(): void {
  if (!plan.value.ready || !choice.value) return;
  if (choice.value === 'liga') {
    if (selectedChallenge.value) fight.value = { kind: 'liga', challenge: selectedChallenge.value };
  } else if (choice.value === 'corridas') fight.value = { kind: 'corrida', mode: endless.value };
  else if (choice.value === 'pvp') fight.value = { kind: 'pvp' };
  else fight.value = { kind: 'treino' };
}

// Escolher um líder na Liga marca o desafio: leva para o passo seguinte.
watch(() => pendingChallenge.value, (id) => { if (id && choice.value === 'liga') scrollTo('arena-step-4'); });

onMounted(() => {
  if (choice.value) scrollTo(choice.value === 'liga' && selectedChallenge.value ? 'arena-step-4' : 'arena-step-2');
});
</script>

<template>
  <section class="card arena-view" aria-labelledby="arena-title">
    <header class="arena-head">
      <h2 id="arena-title">Arena</h2>
      <a v-if="fromVila" class="button" :href="routeHref('vila')">Voltar à Vila</a>
    </header>
    <p class="note">Luta 6×6 em tempo real, a mesma do fim do PvP do Survivor: você anda e desvia, o Pokémon ataca sozinho, e dá para trocar de Pokémon e de ataque com um toque.</p>

    <ol class="arena-steps" aria-label="Passos da Arena">
      <li :class="{ done: choice !== null, now: plan.step === 1 }"><b>{{ choice ? '✓' : '1' }}</b>O que fazer</li>
      <li :class="{ done: plan.step > 2, now: plan.step === 2 }"><b>{{ plan.step > 2 ? '✓' : '2' }}</b>Equipe</li>
      <li :class="{ done: plan.step > 3, now: plan.step === 3 }"><b>{{ plan.step > 3 ? '✓' : '3' }}</b>{{ choice === 'liga' ? 'Líder' : 'Opções' }}</li>
      <li :class="{ now: plan.step === 4 }"><b>4</b>Entrar</li>
    </ol>
    <p class="arena-guide" :class="{ ready: plan.ready }" role="status" aria-live="polite">
      <strong>{{ plan.ready ? 'Tudo pronto.' : 'Agora:' }}</strong> {{ plan.ready ? 'Toque no botão grande lá embaixo para entrar.' : plan.blocker }}
    </p>

    <section id="arena-step-1" class="arena-section" aria-labelledby="arena-step-1-title">
      <h3 id="arena-step-1-title">1 · O que você quer fazer?</h3>
      <div class="arena-choices" role="group" aria-label="O que fazer na Arena">
        <button
          v-for="c in ARENA_CHOICES"
          :key="c.id"
          type="button"
          class="arena-choice"
          :class="{ on: choice === c.id }"
          :aria-pressed="choice === c.id"
          @click="pick(c.id)"
        >
          <span aria-hidden="true">{{ c.icon }}</span>
          <strong>{{ c.title }}</strong>
          <small>{{ c.hint }}</small>
        </button>
      </div>
      <p v-if="rewardNote" class="hint">{{ rewardNote }}</p>
    </section>

    <template v-if="choice">
      <section id="arena-step-2" class="arena-section" aria-labelledby="arena-step-2-title">
        <h3 id="arena-step-2-title">2 · Sua equipe</h3>
        <p class="note">A luta pede exatamente {{ ARENA_TEAM }} Pokémon. Equipe atual: <strong>{{ teamCount ?? '…' }}/{{ ARENA_TEAM }}</strong>.</p>
        <TeamPicker :max="6" group-label="time de batalha" hint="Toque num Pokémon para colocar ou tirar da equipe. Tirar daqui não apaga o Pokémon da coleção." @ready="updateTeam" @change="updateTeam" />
        <p v-if="membersError" class="hint" role="alert">{{ membersError }}</p>
        <div v-if="teamCount === 0" class="arena-first-run" role="status">
          <strong>Você ainda não tem Pokémon para formar uma equipe.</strong>
          <p>Escaneie cartas, abra Minhas cartas para carregar um Pokémon salvo ou entre na Vila para receber um companheiro digital.</p>
          <div class="actions row">
            <a class="button primary" :href="routeHref('escanear')">Escanear uma carta</a>
            <a class="button" :href="routeHref('cartas')">Minhas cartas</a>
            <a class="button" :href="routeHref('vila')">Ir para a Vila</a>
          </div>
        </div>
      </section>

      <section v-if="choice === 'liga'" id="arena-step-3" class="arena-section arena-league" aria-labelledby="arena-step-3-title">
        <h3 id="arena-step-3-title">3 · Escolha o líder</h3>
        <p class="note">Por região e em ordem. O próximo desafio aberto vem destacado e cada bloqueio diz o que falta.</p>
        <p v-if="selectedChallenge" class="hint" role="status">Líder escolhido: <strong>{{ selectedChallenge.leader }}</strong> ({{ selectedChallenge.role }}).</p>
        <LeagueCard embedded />
      </section>

      <section v-else-if="choice === 'corridas'" id="arena-step-3" class="arena-section" aria-labelledby="arena-step-3-title">
        <h3 id="arena-step-3-title">3 · Qual corrida</h3>
        <div class="arena-modes" role="group" aria-label="Tipo de corrida">
          <button
            v-for="m in ENDLESS_MODES"
            :key="m"
            type="button"
            class="arena-mode"
            :class="{ on: endless === m }"
            :aria-pressed="endless === m"
            @click="endless = m"
          >
            <strong>{{ ENDLESS_ARENA_LABELS[m].title }}</strong>
            <small>{{ ENDLESS_ARENA_LABELS[m].tutorial }}</small>
            <small v-if="records[m]" class="arena-record">🏆 Recorde: {{ records[m]!.score }} pontos · {{ records[m]!.wins }} vitórias</small>
          </button>
        </div>
        <p class="hint">Os adversários usam espécies em estágio final e treinadores sorteados, e ficam mais fortes a cada vitória.</p>
      </section>
    </template>

    <!-- Passo 4: o resumo e o botão principal ficam sempre à mão, no pé da tela. -->
    <section id="arena-step-4" class="arena-enter" :class="{ waiting: !chosen }" aria-labelledby="arena-step-4-title">
      <h3 id="arena-step-4-title">4 · Entrar</h3>
      <p v-if="chosen" class="arena-summary"><span aria-hidden="true">{{ chosen.icon }}</span> {{ plan.summary }}</p>
      <p v-if="!plan.ready && plan.blocker" class="arena-blocker" role="status">{{ plan.blocker }}</p>
      <button type="button" class="primary arena-go" :disabled="!plan.ready" @click="enter">{{ plan.cta }}</button>
      <a class="arena-stroll" :href="routeHref('caixa', undefined, ['arena'])">Ver os Pokémon passeando no Coliseu</a>
    </section>

    <ArenaFight v-if="fight" :setup="fight" :members="members" @close="fight = null" />
  </section>
</template>

<style scoped>
.arena-view { display: grid; gap: 1rem; }
.arena-head { display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
.arena-head h2 { margin: 0; }
.arena-steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .5rem; margin: 0; padding: 0; list-style: none; }
.arena-steps li { display: grid; justify-items: center; align-content: center; gap: .25rem; min-height: 3.9rem; padding: .5rem .25rem; border: 1px solid var(--line); border-radius: .8rem; font-size: .84rem; font-weight: 600; line-height: 1.15; text-align: center; color: var(--muted); }
.arena-steps b { display: grid; place-items: center; width: 1.65rem; height: 1.65rem; border-radius: 50%; background: var(--line); color: var(--text); font-size: .85rem; }
.arena-steps .done b { background: #68bd91; color: #0c1122; }
.arena-steps .done { border-color: #68bd91; color: #a7ebc3; }
.arena-steps .now { border-color: var(--accent); color: var(--text); background: rgba(242, 85, 75, .1); }
.arena-steps .now b { background: var(--accent); color: var(--on-accent); }
.arena-guide { margin: 0; padding: .7rem .85rem; border: 1px solid var(--accent); border-radius: .8rem; background: rgba(242, 85, 75, .12); }
.arena-guide.ready { border-color: #68bd91; background: rgba(104, 189, 145, .14); }
.arena-section { display: grid; gap: .7rem; scroll-margin-top: .75rem; }
.arena-section > h3 { margin: 0; }
.arena-choices { display: grid; gap: .6rem; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); }
.arena-choice, .arena-mode { display: grid; gap: .25rem; justify-items: start; align-content: start; min-height: 4.8rem; padding: .95rem 1rem; border: 1px solid var(--line); border-radius: .85rem; color: inherit; font: inherit; text-align: left; background: rgba(12, 17, 34, .55); cursor: pointer; }
/* Ícone grande à esquerda, título e explicação à direita: lê-se de relance. */
.arena-choice { grid-template-columns: 2.8rem 1fr; column-gap: .85rem; align-items: center; }
.arena-choice > span { grid-row: span 2; display: grid; place-items: center; width: 2.8rem; height: 2.8rem; border-radius: .75rem; background: rgba(255, 255, 255, .06); font-size: 1.75rem; }
.arena-choice strong, .arena-mode strong { font-size: 1.05rem; }
.arena-choice small, .arena-mode small { color: color-mix(in srgb, var(--muted) 70%, var(--text)); font-size: .9rem; font-weight: 500; line-height: 1.35; }
.arena-choice:hover, .arena-mode:hover, .arena-choice:focus-visible, .arena-mode:focus-visible { border-color: var(--accent); }
.arena-choice.on, .arena-mode.on { border-color: var(--gold); background: linear-gradient(135deg, rgba(255, 216, 74, .14), rgba(12, 17, 34, .6)); }
.arena-modes { display: grid; gap: .6rem; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); }
.arena-league { padding-top: .5rem; border-top: 1px solid var(--line); }
.arena-first-run { display: grid; gap: .6rem; padding: 1rem; border: 1px solid color-mix(in srgb, var(--gold) 55%, var(--line)); border-radius: .85rem; background: linear-gradient(135deg, rgba(255, 216, 74, .12), rgba(12, 17, 34, .55)); }
.arena-first-run > * { margin: 0; }
.arena-advanced, .arena-more { padding: .6rem .8rem; border: 1px solid var(--line); border-radius: .85rem; }
.arena-advanced summary, .arena-more summary { min-height: 2.75rem; display: flex; align-items: center; cursor: pointer; font-weight: 700; }
.arena-toggle { display: flex; align-items: center; gap: .7rem; min-height: 2.75rem; }
.arena-toggle input { width: 1.4rem; height: 1.4rem; flex: none; }
.arena-toggle small { display: block; color: var(--muted); }
.arena-enter { position: sticky; bottom: calc(var(--nav-height) + 18px + env(safe-area-inset-bottom)); z-index: 5; display: grid; gap: .5rem; padding: .85rem; border: 1px solid var(--gold); border-radius: .95rem; background: rgba(12, 17, 34, .96); box-shadow: 0 -6px 24px rgba(0, 0, 0, .45); scroll-margin-top: .75rem; }
.arena-enter > * { margin: 0; }
.arena-blocker { color: var(--gold); }
.arena-duel-alt { min-height: 2.75rem; font-size: .92rem; font-weight: 700; }
.arena-go { min-height: 3.4rem; font-size: 1.05rem; font-weight: 800; }
.arena-go:disabled { opacity: .55; }
/* Antes de escolher o modo, o pé fica fino: só o botão, sem cobrir as opções. */
.arena-enter.waiting { gap: 0; padding: .45rem; border-color: var(--line); }
.arena-enter.waiting h3, .arena-enter.waiting .arena-blocker { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.arena-enter.waiting .arena-go { min-height: 2.8rem; font-size: .95rem; }
@media (prefers-reduced-motion: reduce) {
  .arena-view * { transition: none !important; animation: none !important; scroll-behavior: auto !important; }
}
</style>
