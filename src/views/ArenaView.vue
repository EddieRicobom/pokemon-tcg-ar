<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { loadArenaMembers } from '../app/arena-members';
import type { ArenaMember } from '../app/arena-members';
import { movesetBook, savedMoves } from '../app/moveset-store';
import type { DuelOpponentSpec } from '../app/turn-duel-setup';
import { pendingChallenge } from '../app/league-store';
import { arenaFlags, routeFlags, routeHref } from '../app/route';
import type { RouteFlag } from '../app/route';
import { battleMode, setBattleMode } from '../app/battle-mode-store';
import { boxPvp } from '../app/box-pvp-store';
import { visual } from '../app/visual-settings';
import { loadVillage } from '../app/village-store';
import TeamPicker from '../components/TeamPicker.vue';
import LeagueCard from '../components/LeagueCard.vue';
import ArenaMovesetEditor from '../components/ArenaMovesetEditor.vue';
import BoxPvpPanel from '../components/BoxPvpPanel.vue';
import TurnDuel from '../components/TurnDuel.vue';
import { ARENA_CHOICES, arenaPlan, choiceFromFlags, endlessFromFlags } from '../core/arena-menu';
import type { ArenaChoice } from '../core/arena-menu';
import { BATTLE_MODE_HINTS_PT, BATTLE_MODE_LABELS_PT, BATTLE_MODES, battleModeBlocker, seededRng } from '../core/battle';
import { ENDLESS_ARENA_LABELS, nextEndlessOpponent } from '../core/endless-arena';
import type { EndlessArenaMode } from '../core/endless-arena';
import { challengeById } from '../core/league';
import { BATTLE_REWARDS_PER_DAY, battleRewardsLeft } from '../core/village/life';
import { dayKey } from '../core/trainer';

/**
 * O menu único da Arena: escolher o que fazer, a equipe e as opções, tudo antes de entrar no palco (`#/caixa`).
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
const modeBlocker = computed(() => battleModeBlocker(battleMode.value, teamCount.value ?? 0));
const pvpConnected = computed(() => boxPvp.peer !== null);

const plan = computed(() => arenaPlan({
  choice: choice.value,
  teamCount: teamCount.value ?? 0,
  mode: battleMode.value,
  endless: endless.value,
  leader: selectedChallenge.value?.leader ?? null,
  pvpConnected: pvpConnected.value,
  friend: boxPvp.friend?.name ?? null,
  modeBlocker: modeBlocker.value,
}));
const chosen = computed(() => ARENA_CHOICES.find((c) => c.id === choice.value) ?? null);
const rewardNote = computed(() => {
  if (!fromFliperama || choice.value !== 'livre') return '';
  const left = battleRewardsLeft(loadVillage(), dayKey(new Date()));
  return left > 0 ? `Fliperama: +100 moedas por batalha (${left} de ${BATTLE_REWARDS_PER_DAY} hoje).` : 'Fliperama: as moedas de hoje já saíram.';
});
/** Nos passos 2 e 3 o PvP primeiro conecta e só depois pede a equipe; nos outros a equipe vem primeiro. */
const pvpFirst = computed(() => choice.value === 'pvp');

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

/** Quem já tem golpes montados (o duelo por turnos usa só esses). */
const armed = computed(() => {
  void movesetBook.value;
  return members.value.filter((m) => savedMoves(m.id, m.dexId).length > 0);
});
const unarmed = computed(() => members.value.filter((m) => !armed.value.includes(m)));
const duelOpponent = ref<DuelOpponentSpec | null>(null);
const moreOpen = ref(arrival.has('golpes'));

function startTraining(): void {
  if (armed.value.length === 0) return;
  const foe = nextEndlessOpponent(seededRng((Math.random() * 2 ** 32) >>> 0));
  duelOpponent.value = { trainer: foe.trainer, role: 'Treino', dexIds: foe.dexIds.slice(0, Math.min(6, armed.value.length)), power: 1 };
}
function startLeagueDuel(): void {
  const ch = selectedChallenge.value;
  if (!ch || armed.value.length === 0) return;
  duelOpponent.value = { trainer: ch.leader, role: ch.role, dexIds: ch.team, power: ch.power, challengeId: ch.id };
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

/** Entra no palco com tudo já escolhido aqui. PvP não começa sozinho: o anfitrião toca em Batalhar lá dentro. */
function enter(): void {
  if (!plan.value.ready || !choice.value) return;
  const extra: RouteFlag[] = choice.value === 'pvp' ? ['pvp'] : choice.value === 'corridas' ? [endless.value, 'autoiniciar'] : ['autoiniciar'];
  window.location.hash = routeHref('caixa', undefined, ['arena', ...arenaFlags(extra)]);
}

// Quem já está conectado e vê o anfitrião começar na hora vai para o palco, onde a luta é encenada.
watch(() => boxPvp.pending, (pending) => {
  if (pending && boxPvp.peer && choice.value === 'pvp') window.location.hash = routeHref('caixa', undefined, ['arena', ...arenaFlags(['pvp'])]);
});
// Escolher um líder na Liga marca o desafio: leva para o passo seguinte.
watch(() => pendingChallenge.value, (id) => { if (id && choice.value === 'liga') scrollTo('arena-step-4'); });

onMounted(() => {
  if (arrival.has('golpes')) scrollTo('arena-moves');
  else if (choice.value) scrollTo('arena-step-2');
});
</script>

<template>
  <section class="card arena-view" aria-labelledby="arena-title">
    <header class="arena-head">
      <h2 id="arena-title">Arena</h2>
      <a v-if="fromVila" class="button" :href="routeHref('vila')">Voltar à Vila</a>
    </header>
    <p class="note">Prepare tudo aqui, em quatro passos, e só então entre no Coliseu. Sem câmera e sem sensores: dentro da luta é só tocar em Batalhar.</p>

    <ol class="arena-steps" aria-label="Passos da Arena">
      <li :class="{ done: choice !== null, now: plan.step === 1 }"><b>{{ choice ? '✓' : '1' }}</b>O que fazer</li>
      <li :class="{ done: plan.step > 2, now: plan.step === 2 }"><b>{{ plan.step > 2 ? '✓' : '2' }}</b>{{ pvpFirst ? 'Amigo' : 'Equipe' }}</li>
      <li :class="{ done: plan.step > 3, now: plan.step === 3 }"><b>{{ plan.step > 3 ? '✓' : '3' }}</b>{{ pvpFirst ? 'Equipe' : choice === 'liga' ? 'Líder' : 'Opções' }}</li>
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
      <!-- PvP: conecta com o amigo (o lobby novo, com o passo a passo) antes de pedir a equipe. -->
      <section v-if="pvpFirst" id="arena-step-2" class="arena-section" aria-labelledby="arena-step-2-title">
        <h3 id="arena-step-2-title">2 · Conecte com o amigo</h3>
        <p class="note">Um de vocês cria a sala e o outro entra com o código. Conectados, o anfitrião escolhe o modo (1x1, 3x3 ou 6x6).</p>
        <BoxPvpPanel />
      </section>

      <section :id="pvpFirst ? 'arena-step-team' : 'arena-step-2'" class="arena-section" :aria-labelledby="pvpFirst ? 'arena-step-3-title' : 'arena-step-2-title'" :data-step="pvpFirst ? 3 : 2">
        <h3 :id="pvpFirst ? 'arena-step-3-title' : 'arena-step-2-title'">{{ pvpFirst ? '3' : '2' }} · Sua equipe</h3>
        <p class="note">
          <template v-if="choice === 'corridas'">A corrida pede exatamente 6 Pokémon.</template>
          <template v-else-if="choice === 'liga'">Use até 6 Pokémon; qualquer seleção disponível participa do desafio.</template>
          <template v-else-if="choice === 'pvp'">Até 6 Pokémon; no modo 1x1 só o primeiro de cada equipe entra.</template>
          <template v-else>Escolha de 2 a 6 Pokémon. Quem sobrar fica de fora da luta.</template>
          Equipe atual: <strong>{{ teamCount ?? '…' }}/6</strong>.
        </p>
        <TeamPicker :max="6" group-label="time de batalha" hint="Toque num Pokémon para colocar ou tirar da equipe. Tirar daqui não apaga o Pokémon da coleção." @ready="updateTeam" @change="updateTeam" />
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

      <!-- Passo 3 (opções) conforme a escolha. -->
      <section v-if="choice === 'livre'" id="arena-step-3" class="arena-section" aria-labelledby="arena-step-3-title">
        <h3 id="arena-step-3-title">3 · Como será a luta</h3>
        <div class="arena-modes" role="group" aria-label="Formato da batalha">
          <button
            v-for="m in BATTLE_MODES"
            :key="m"
            type="button"
            class="arena-mode"
            :class="{ on: battleMode === m }"
            :aria-pressed="battleMode === m"
            @click="setBattleMode(m)"
          >
            <strong>{{ BATTLE_MODE_LABELS_PT[m] }}</strong>
            <small>{{ BATTLE_MODE_HINTS_PT[m] }}</small>
          </button>
        </div>
        <p v-if="modeBlocker" class="hint" role="status">{{ modeBlocker }}</p>
        <p class="hint">Dentro da Arena ainda dá para escalar quem fica no lado Vermelho ou Azul.</p>
      </section>

      <section v-else-if="choice === 'liga'" id="arena-step-3" class="arena-section arena-league" aria-labelledby="arena-step-3-title">
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
          </button>
        </div>
        <p class="hint">Os adversários usam espécies em estágio final e treinadores sorteados. Use <strong>Desistir</strong> dentro da luta para encerrar e guardar o placar.</p>
      </section>

      <section class="arena-section" aria-labelledby="arena-effects-title">
        <details class="arena-advanced">
          <summary id="arena-effects-title">Opções avançadas · luz, som e cenário</summary>
          <label class="arena-toggle"><input v-model="visual.lighting" type="checkbox" /><span>Luz dos golpes <small>poupa a GPU se desligar</small></span></label>
          <label class="arena-toggle"><input v-model="visual.impactFx" type="checkbox" /><span>Faíscas e ondas nos golpes fortes <small>desligado, a tela fica mais calma</small></span></label>
          <label class="arena-toggle"><input v-model="visual.sound" type="checkbox" /><span>Som dos golpes e da vitória</span></label>
          <label class="arena-toggle"><input v-model="visual.scenery" type="checkbox" /><span>Muro, arquibancada e tochas do Coliseu <small>desligado, só a areia</small></span></label>
          <p class="hint">Dentro da luta ainda dá para ajustar a suavização dos pixels.</p>
        </details>
      </section>
    </template>

    <details id="arena-moves" class="arena-section arena-more" :open="moreOpen" @toggle="(e: Event) => (moreOpen = (e.target as HTMLDetailsElement).open)">
      <summary>Mais opções · golpes e duelo por turnos</summary>
      <p class="note">Escolha até 4 golpes para cada Pokémon da equipe (só os que a espécie aprende de verdade, pela PokéAPI). Na batalha automática eles também valem. No <strong>duelo por turnos</strong> você escolhe o golpe a cada turno, como nos jogos.</p>
      <p v-if="membersError" class="hint" role="alert">{{ membersError }}</p>
      <ArenaMovesetEditor :members="members" />
      <p v-if="unarmed.length > 0 && armed.length > 0" class="hint">Sem golpes, ficam de fora do duelo: {{ unarmed.map((m) => m.name).join(', ') }}.</p>
      <div class="actions row">
        <button type="button" class="primary" :disabled="armed.length === 0" @click="startTraining">Treinar contra um treinador sorteado</button>
        <button v-if="selectedChallenge" type="button" :disabled="armed.length === 0" @click="startLeagueDuel">Desafiar {{ selectedChallenge.leader }} por turnos</button>
      </div>
      <p v-if="armed.length === 0" class="hint">Escolha os golpes de pelo menos um Pokémon para liberar o duelo por turnos.</p>
    </details>

    <TurnDuel v-if="duelOpponent" :members="armed" :opponent="duelOpponent" @close="duelOpponent = null" />

    <!-- Passo 4: o resumo e o botão principal ficam sempre à mão, no pé da tela. -->
    <section id="arena-step-4" class="arena-enter" aria-labelledby="arena-step-4-title">
      <h3 id="arena-step-4-title">4 · Entrar</h3>
      <p v-if="chosen" class="arena-summary"><span aria-hidden="true">{{ chosen.icon }}</span> {{ plan.summary }}</p>
      <p v-if="!plan.ready && plan.blocker" class="arena-blocker" role="status">{{ plan.blocker }}</p>
      <button type="button" class="primary arena-go" :disabled="!plan.ready" @click="enter">{{ plan.cta }}</button>
      <p v-if="plan.ready" class="hint">Você pode parar a luta a qualquer momento com o botão Parar, e fechar a Arena para voltar aqui.</p>
    </section>
  </section>
</template>

<style scoped>
.arena-view { display: grid; gap: 1rem; }
.arena-head { display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
.arena-head h2 { margin: 0; }
.arena-steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .5rem; margin: 0; padding: 0; list-style: none; }
.arena-steps li { display: grid; justify-items: center; gap: .15rem; padding: .45rem .3rem; border: 1px solid var(--line); border-radius: .7rem; font-size: .78rem; line-height: 1.2; text-align: center; color: var(--muted); }
.arena-steps b { display: grid; place-items: center; width: 1.4rem; height: 1.4rem; border-radius: 50%; background: var(--line); color: var(--text); font-size: .75rem; }
.arena-steps .done b { background: #68bd91; color: #0c1122; }
.arena-steps .done { border-color: #68bd91; color: #a7ebc3; }
.arena-steps .now { border-color: var(--accent); color: var(--text); }
.arena-guide { margin: 0; padding: .7rem .85rem; border: 1px solid var(--accent); border-radius: .8rem; background: rgba(242, 85, 75, .12); }
.arena-guide.ready { border-color: #68bd91; background: rgba(104, 189, 145, .14); }
.arena-section { display: grid; gap: .7rem; scroll-margin-top: .75rem; }
.arena-section > h3 { margin: 0; }
.arena-choices { display: grid; gap: .6rem; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); }
.arena-choice, .arena-mode { display: grid; gap: .25rem; justify-items: start; align-content: start; min-height: 4.5rem; padding: .8rem .9rem; border: 1px solid var(--line); border-radius: .85rem; color: inherit; font: inherit; text-align: left; background: rgba(12, 17, 34, .55); cursor: pointer; }
.arena-choice > span { font-size: 1.5rem; }
.arena-choice small, .arena-mode small { color: var(--muted); font-size: .8rem; font-weight: 500; line-height: 1.3; }
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
.arena-enter { position: sticky; bottom: .5rem; z-index: 5; display: grid; gap: .5rem; padding: .85rem; border: 1px solid var(--gold); border-radius: .95rem; background: rgba(12, 17, 34, .96); box-shadow: 0 -6px 24px rgba(0, 0, 0, .45); scroll-margin-top: .75rem; }
.arena-enter > * { margin: 0; }
.arena-blocker { color: var(--gold); }
.arena-go { min-height: 3.4rem; font-size: 1.05rem; font-weight: 800; }
.arena-go:disabled { opacity: .55; }
@media (prefers-reduced-motion: reduce) {
  .arena-view * { transition: none !important; animation: none !important; scroll-behavior: auto !important; }
}
</style>
