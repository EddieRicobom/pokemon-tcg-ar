<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';
import PvpLobby from './PvpLobby.vue';
import SurvivalPvpArena from './SurvivalPvpArena.vue';
import { pokemonSpriteUrl } from '../ar/sprite-url';
import { finishLeagueFight, finishTeamFight } from '../app/arena-fight-result';
import { readArenaRecords, saveArenaRun } from '../app/arena-records';
import type { ArenaMember } from '../app/arena-members';
import { pendingChallenge } from '../app/league-store';
import { profile } from '../app/profile-store';
import { createArenaBot } from '../core/arena-bot';
import { ARENA_LEVEL_UPS, arenaEstimated, arenaPrepDone, arenaRivalTeam, arenaSpecOf, autoFinishArenaPrep, createArenaPrep, pickArenaCard } from '../core/arena-prep';
import type { ArenaPrep } from '../core/arena-prep';
import { seededRng } from '../core/battle';
import { abandonEndlessArena, ENDLESS_ARENA_LABELS, nextEndlessOpponent, resolveEndlessBattle, startEndlessArena } from '../core/endless-arena';
import type { EndlessArenaMode, EndlessArenaRun } from '../core/endless-arena';
import type { Challenge } from '../core/league';
import { TYPE_LABELS_PT } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import { MOVE_CATEGORY_LABELS_PT } from '../core/survivor-moves';
import type { MoveCategory } from '../core/survivor-moves';
import { TYPE_GLYPHS } from '../core/type-glyphs';
import type { ArenaWinner, SvMonSpec } from '../core/survivor-pvp';
import { SURVIVOR_UPGRADE_RARITIES } from '../core/survivor-types';
import type { SurvivorUpgradeOption } from '../core/survivor-types';
import type { PvpPeer } from '../pvp/peer';
import { LOCAL_TRANSPORT, SurvivalGuestLink, SurvivalHostLink } from '../pvp/survival-link';
import type { WireMessage } from '../pvp/wire';

export type ArenaFightSetup =
  | { kind: 'treino' }
  | { kind: 'liga'; challenge: Challenge }
  | { kind: 'corrida'; mode: EndlessArenaMode }
  | { kind: 'pvp' };

/**
 * A luta da Arena, de ponta a ponta: 10 níveis para cada um dos 6 Pokémon (cartas da Torre) e a arena 6x6 em tempo real,
 * a mesma do fim do PvP do Survivor. Contra o jogo, a simulação roda aqui com o rival de `core/arena-bot.ts`; contra um
 * amigo, roda no anfitrião e o convidado desenha o que recebe, como no PvP do Survivor.
 */
const props = defineProps<{ setup: ArenaFightSetup; members: readonly ArenaMember[] }>();
const emit = defineEmits<{ close: [] }>();

type Phase = 'lobby' | 'prep' | 'waiting' | 'arena';
const phase = ref<Phase>(props.setup.kind === 'pvp' ? 'lobby' : 'prep');
const role = ref<'host' | 'guest'>('host');
const preps = shallowRef<ArenaPrep[]>([]);
/** Os preparos mudam por dentro: este contador avisa a tela. */
const version = ref(0);
const team = ref<SvMonSpec[]>([]);
const link = shallowRef<SurvivalHostLink | SurvivalGuestLink | null>(null);
/** Muda a cada luta: a arena nasce de novo, sem sobras da anterior. */
const fightKey = ref(0);
const rivalName = ref('Rival');
const friendLeft = ref(false);
const notes = ref<string[]>([]);
const nextLeader = ref<Challenge | null>(null);
const run = ref<EndlessArenaRun | null>(null);
const leaveArmed = ref(false);
const error = ref('');

let peer: PvpPeer | null = null;
let friendTeam: SvMonSpec[] | null = null;
let league: Challenge | null = props.setup.kind === 'liga' ? props.setup.challenge : null;
let recorded = false;
let leaveTimer: ReturnType<typeof setTimeout> | null = null;

const freshSeed = (): number => Math.floor(Math.random() * 2 ** 31);

function beginPrep(): void {
  error.value = '';
  const rng = seededRng(freshSeed());
  preps.value = props.members.flatMap((m) => (m.dexId === undefined ? [] : [createArenaPrep({ id: m.id, name: m.name, dexId: m.dexId, shiny: m.shiny }, Math.floor(rng() * 2 ** 31))]));
  version.value++;
  phase.value = 'prep';
  if (preps.value.length === 0) error.value = 'Nenhum Pokémon da equipe tem número da Pokédex.';
}

const current = computed(() => {
  void version.value;
  return preps.value.find((prep) => !arenaPrepDone(prep)) ?? null;
});
const currentIndex = computed(() => (current.value ? preps.value.indexOf(current.value) : -1));
const level = computed(() => {
  void version.value;
  return (current.value?.picked.length ?? 0) + 1;
});
const offer = computed<SurvivorUpgradeOption[]>(() => {
  void version.value;
  return current.value?.offer ?? [];
});
const attacks = computed(() => {
  void version.value;
  if (!current.value) return '';
  const spec = arenaSpecOf(current.value);
  const face = (type: PokemonType, category: MoveCategory | undefined, name: string): string => `${TYPE_GLYPHS[type]} ${TYPE_LABELS_PT[type]} · ${MOVE_CATEGORY_LABELS_PT[category ?? 'projetil']} · ${name}`;
  return `${face(spec.attackType, spec.moveCategory, spec.moveName ?? 'Golpe')} ⇄ ${spec.alt ? face(spec.alt.attackType, spec.alt.moveCategory, spec.alt.moveName) : 'sem segundo ataque'}`;
});
const estimated = computed(() => !!current.value && arenaEstimated(current.value.member.dexId));

function maybeFinishPrep(): void {
  version.value++;
  if (preps.value.length === 0 || preps.value.some((prep) => !arenaPrepDone(prep))) return;
  team.value = preps.value.map(arenaSpecOf);
  if (props.setup.kind === 'pvp') {
    phase.value = 'waiting';
    peer?.send({ t: 'sv-team', name: (profile.name || 'Treinador').slice(0, 16), team: team.value });
    maybeStartPvp();
    return;
  }
  if (props.setup.kind === 'corrida') run.value = startEndlessArena(props.setup.mode, team.value);
  startRivalFight();
}

function pickCard(id: string): void {
  if (current.value && pickArenaCard(current.value, id)) maybeFinishPrep();
}

function autoThis(): void {
  if (current.value) autoFinishArenaPrep(current.value);
  maybeFinishPrep();
}

function autoAll(): void {
  preps.value.forEach(autoFinishArenaPrep);
  maybeFinishPrep();
}

function startRivalFight(hp?: readonly number[]): void {
  const seed = freshSeed();
  let dexIds: readonly number[];
  let power = 1;
  let skill = 0.35;
  if (league) {
    dexIds = league.team;
    power = league.power;
    skill = Math.max(0.3, Math.min(1, (league.power - 0.8) / 0.7));
    rivalName.value = league.leader;
  } else {
    const foe = nextEndlessOpponent(seededRng(seed));
    dexIds = foe.dexIds;
    rivalName.value = foe.trainer;
    if (run.value) {
      power = Math.min(1.72, 1.2 + run.value.wins * 0.035);
      skill = Math.min(1, 0.5 + run.value.wins * 0.05);
    }
  }
  const rival = arenaRivalTeam(dexIds, power, seed);
  if (rival.length === 0) {
    error.value = 'Este rival não tem equipe.';
    return;
  }
  const mine = hp ? team.value.map((mon, i) => ({ ...mon, startHp: hp[i] ?? mon.maxHp })) : team.value;
  recorded = false;
  notes.value = [];
  nextLeader.value = null;
  link.value = new SurvivalHostLink(LOCAL_TRANSPORT, mine, rival, createArenaBot(1, skill));
  fightKey.value++;
  phase.value = 'arena';
}

function onConnected(p: PvpPeer, r: 'host' | 'guest'): void {
  peer = p;
  role.value = r;
  p.onMessage = onMessage;
  p.onState = (state) => {
    if (state === 'closed') friendLeft.value = true;
  };
  beginPrep();
}

function onMessage(msg: WireMessage): void {
  switch (msg.t) {
    case 'sv-team':
      rivalName.value = msg.name || 'Amigo';
      friendTeam = msg.team;
      maybeStartPvp();
      break;
    case 'sv-start':
      if (role.value === 'guest' && friendTeam && peer && phase.value === 'waiting') startPvpLink();
      break;
    case 'sv-input':
      if (link.value instanceof SurvivalHostLink) link.value.receive(msg);
      break;
    case 'sv-snap':
      if (link.value instanceof SurvivalGuestLink) link.value.receive(msg, performance.now());
      break;
    default:
      break;
  }
}

function startPvpLink(): void {
  if (!peer || !friendTeam) return;
  link.value = role.value === 'host' ? new SurvivalHostLink(peer, team.value, friendTeam) : new SurvivalGuestLink(peer, friendTeam, team.value);
  fightKey.value++;
  phase.value = 'arena';
}

/** O anfitrião começa quando as duas equipes estão aqui; o convidado espera o `sv-start`. */
function maybeStartPvp(): void {
  if (role.value !== 'host' || phase.value !== 'waiting' || !friendTeam) return;
  peer?.send({ t: 'sv-start' });
  startPvpLink();
}

function onFinished(winner: ArenaWinner, hpLeft: number[]): void {
  if (recorded) return;
  recorded = true;
  if (props.setup.kind === 'pvp') return;
  const won = winner === 0;
  if (league) {
    const outcome = finishLeagueFight(league, won);
    notes.value = [outcome.message];
    nextLeader.value = outcome.next;
    return;
  }
  const companions = props.members.flatMap((m) => (m.dexId === undefined ? [] : [{ id: m.id, dexId: m.dexId, name: m.name, digital: m.digital }]));
  notes.value = finishTeamFight(companions, won, hpLeft);
  if (run.value) {
    run.value = resolveEndlessBattle(run.value, team.value, { winningTeam: winner === 'draw' ? null : winner, hpLeft });
    const label = ENDLESS_ARENA_LABELS[run.value.mode].title;
    const before = readArenaRecords()[run.value.mode];
    const record = run.value.stopped && saveArenaRun(run.value.mode, { score: run.value.score, wins: run.value.wins });
    notes.value = [
      `${label}: ${run.value.wins} vitória${run.value.wins === 1 ? '' : 's'} · ${run.value.score} pontos.`,
      record ? '🏆 Novo recorde!' : before ? `Recorde: ${before.score} pontos (${before.wins} vitórias).` : '',
      ...notes.value,
    ].filter(Boolean);
  }
}

const canContinueRun = computed(() => run.value !== null && !run.value.stopped);

function continueRun(): void {
  if (run.value) startRivalFight(run.value.hp);
}

function challengeNext(): void {
  if (!nextLeader.value) return;
  league = nextLeader.value;
  pendingChallenge.value = league.id;
  beginPrep();
}

function leave(): void {
  if (run.value && !run.value.stopped) {
    run.value = abandonEndlessArena(run.value);
    saveArenaRun(run.value.mode, { score: run.value.score, wins: run.value.wins });
  }
  peer?.close();
  emit('close');
}

/** Sair no meio pede um segundo toque: a luta não fica registrada. */
function leaveMidway(): void {
  if (leaveArmed.value || phase.value !== 'arena') {
    leave();
    return;
  }
  leaveArmed.value = true;
  leaveTimer = setTimeout(() => (leaveArmed.value = false), 3000);
}

if (phase.value === 'prep') beginPrep();

onBeforeUnmount(() => {
  if (leaveTimer) clearTimeout(leaveTimer);
  peer?.close();
});
</script>

<template>
  <div class="afight" role="dialog" aria-modal="true" aria-label="Luta da Arena">
    <header class="afight-top">
      <strong>{{ setup.kind === 'liga' ? `Liga · ${rivalName}` : setup.kind === 'corrida' ? ENDLESS_ARENA_LABELS[setup.mode].title : setup.kind === 'pvp' ? 'Contra um amigo' : 'Luta 6×6' }}</strong>
      <span v-if="run && phase === 'arena'">{{ run.wins }} vitórias · {{ run.score }} pts</span>
      <button type="button" class="afight-close" @click="leaveMidway">{{ leaveArmed ? 'Toque de novo' : phase === 'arena' ? 'Desistir' : 'Fechar' }}</button>
    </header>

    <p v-if="error" class="hint" role="alert">{{ error }}</p>

    <PvpLobby v-if="phase === 'lobby'" game="box" note="Conectados, cada um prepara os 6 Pokémon e a luta abre sozinha." @connected="onConnected" />

    <section v-else-if="phase === 'prep' && current" class="afight-prep" aria-label="Níveis antes da luta">
      <div class="afight-mon">
        <img :src="pokemonSpriteUrl(current.member.dexId, current.member.shiny)" :alt="current.member.name" height="64" />
        <div>
          <strong>{{ current.member.name }}</strong>
          <small>Pokémon {{ currentIndex + 1 }} de {{ preps.length }} · nível {{ level }} de {{ ARENA_LEVEL_UPS }}</small>
          <small>{{ attacks }}</small>
          <small v-if="estimated">Sem os stats desta espécie: números médios.</small>
        </div>
      </div>
      <p class="hint">Escolha uma carta. Ela vale nos dois ataques.</p>
      <div class="afight-cards">
        <button v-for="card in offer" :key="card.id" type="button" class="afight-card" :class="card.rarity" @click="pickCard(card.id)">
          <small>{{ card.rarity ? SURVIVOR_UPGRADE_RARITIES[card.rarity].label : 'Normal' }}</small>
          <strong>{{ card.name }}</strong>
          <span>{{ card.description }}</span>
        </button>
      </div>
      <div class="actions row">
        <button type="button" @click="autoThis">Escolher por {{ current.member.name }}</button>
        <button type="button" @click="autoAll">Escolher por todos</button>
      </div>
    </section>

    <section v-else-if="phase === 'waiting'" class="afight-prep" aria-label="Esperando o amigo">
      <h3>Sua equipe está pronta</h3>
      <p class="hint" role="status">{{ friendLeft ? 'O amigo saiu da partida.' : 'Esperando o amigo terminar as cartas. A luta abre sozinha.' }}</p>
    </section>

    <SurvivalPvpArena
      v-else-if="phase === 'arena' && link"
      :key="fightKey"
      :link="link"
      :friend-name="rivalName"
      :friend-left="friendLeft"
      leave-label="Voltar ao menu"
      @finished="onFinished"
      @leave="leave"
    >
      <template #result>
        <p v-for="note in notes" :key="note" class="hint">{{ note }}</p>
        <button v-if="canContinueRun" type="button" class="primary" @click="continueRun">Próxima luta</button>
        <button v-else-if="nextLeader" type="button" class="primary" @click="challengeNext">Desafiar {{ nextLeader.leader }}</button>
        <button v-else-if="setup.kind !== 'pvp' && !run" type="button" @click="beginPrep">Nova partida</button>
      </template>
    </SurvivalPvpArena>
  </div>
</template>

<style scoped>
.afight {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding: max(8px, env(safe-area-inset-top)) 12px max(8px, env(safe-area-inset-bottom));
  background: var(--bg, #10131c);
}

.afight > * {
  width: 100%;
  max-width: 460px;
  margin-inline: auto;
}

.afight-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.afight-top strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.afight-top span {
  font-size: 0.8rem;
}

.afight-close {
  padding: 4px 10px;
}

.afight-prep {
  display: grid;
  gap: 10px;
}

.afight-mon {
  display: flex;
  align-items: center;
  gap: 10px;
}

.afight-mon img {
  object-fit: contain;
}

.afight-mon div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.afight-cards {
  display: grid;
  gap: 8px;
}

.afight-card {
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  text-align: left;
}

.afight-card.raro {
  border-color: #6aa8ff;
}

.afight-card.lendario {
  border-color: #ffd166;
}

.afight-card.ancestral {
  border-color: #ff7ad9;
}

.afight-card span {
  font-size: 0.85rem;
  font-weight: 400;
}
</style>
