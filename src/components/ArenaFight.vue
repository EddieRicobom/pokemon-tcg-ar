<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import PvpLobby from './PvpLobby.vue';
import SurvivalPvpArena from './SurvivalPvpArena.vue';
import { pokemonSpriteUrl } from '../ar/sprite-url';
import { finishLeagueFight, finishTeamFight } from '../app/arena-fight-result';
import { readArenaRecords, saveArenaRun } from '../app/arena-records';
import type { ArenaMember } from '../app/arena-members';
import { pendingChallenge } from '../app/league-store';
import { profile } from '../app/profile-store';
import { createArenaBot } from '../core/arena-bot';
import { ARENA_LEVEL_UPS, arenaCardChanges, arenaCoreStats, arenaEstimated, arenaPrepDone, arenaRivalTeam, arenaSpecOf, autoFinishArenaPrep, createArenaPrep, pickArenaCard } from '../core/arena-prep';
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
import { SURVIVOR_UPGRADE_FAMILIES, SURVIVOR_UPGRADE_RARITIES } from '../core/survivor-types';
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
const rivalName = ref(props.setup.kind === 'liga' ? props.setup.challenge.leader : 'Rival');
const friendLeft = ref(false);
const notes = ref<string[]>([]);
const nextLeader = ref<Challenge | null>(null);
const run = ref<EndlessArenaRun | null>(null);
const leaveArmed = ref(false);
/** A luta acabou e a tela já mostra o resultado: sair não é mais desistir. */
const finished = ref(false);
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
/** A oferta com o que cada carta muda em números, já com os limites da luta. */
const cards = computed(() => {
  const prep = current.value;
  return offer.value.map((card) => {
    const rarity = SURVIVOR_UPGRADE_RARITIES[card.rarity ?? 'normal'];
    return {
      card,
      rarity,
      icon: card.icon ?? (card.family ? SURVIVOR_UPGRADE_FAMILIES[card.family].icon : rarity.icon),
      changes: prep ? arenaCardChanges(prep, card) : [],
    };
  });
});
const coreStats = computed(() => {
  void version.value;
  return current.value ? arenaCoreStats(current.value) : [];
});
/** Muda a cada carta: a mão nova entra animada. */
const handKey = computed(() => `${currentIndex.value}-${level.value}`);
const prepDots = computed(() => {
  void version.value;
  return preps.value.map((prep, index) => ({ id: prep.member.id, name: prep.member.name, done: arenaPrepDone(prep), now: index === currentIndex.value }));
});
const attacks = computed(() => {
  void version.value;
  if (!current.value) return [];
  const spec = arenaSpecOf(current.value);
  const face = (type: PokemonType, category: MoveCategory | undefined, name: string): string => `${TYPE_GLYPHS[type]} ${TYPE_LABELS_PT[type]} · ${MOVE_CATEGORY_LABELS_PT[category ?? 'projetil']} · ${name}`;
  return [face(spec.attackType, spec.moveCategory, spec.moveName ?? 'Golpe'), spec.alt ? face(spec.alt.attackType, spec.alt.moveCategory, spec.alt.moveName) : 'Sem segundo ataque'];
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

/** A mão seguinte aparece no mesmo lugar: sem esta folga, um toque duplo gasta duas cartas. */
const PICK_GUARD_MS = 220;
let pickLockedUntil = 0;

function pickCard(id: string): void {
  const now = performance.now();
  if (now < pickLockedUntil) return;
  if (current.value && pickArenaCard(current.value, id)) {
    pickLockedUntil = now + PICK_GUARD_MS;
    maybeFinishPrep();
  }
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
  finished.value = false;
  disarmLeave();
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
  finished.value = false;
  disarmLeave();
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
  finished.value = true;
  disarmLeave();
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
  rivalName.value = league.leader;
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

function disarmLeave(): void {
  if (leaveTimer) clearTimeout(leaveTimer);
  leaveTimer = null;
  leaveArmed.value = false;
}

/** O que se perde ao sair agora: a luta, as cartas já escolhidas ou a sala com o amigo. */
const leaveCosts = computed(() => {
  void version.value;
  if (finished.value) return false;
  if (phase.value === 'arena') return true;
  if (phase.value !== 'prep' && phase.value !== 'waiting') return false;
  return (props.setup.kind === 'pvp' && !friendLeft.value) || preps.value.some((prep) => prep.picked.length > 0);
});
const leaveLabel = computed(() => {
  if (leaveArmed.value) return 'Toque de novo';
  if (phase.value === 'arena' && !finished.value) return 'Desistir';
  return leaveCosts.value ? 'Sair' : 'Fechar';
});

/** Sair quando há algo a perder pede um segundo toque. */
function leaveMidway(): void {
  if (leaveArmed.value || !leaveCosts.value) {
    leave();
    return;
  }
  leaveArmed.value = true;
  leaveTimer = setTimeout(() => (leaveArmed.value = false), 3000);
}

function onGamepadBack(event: Event): void {
  const detail = (event as CustomEvent<{ handled: boolean }>).detail;
  if (detail.handled) return;
  detail.handled = true;
  leaveMidway();
}

if (phase.value === 'prep') beginPrep();

onMounted(() => window.addEventListener('tcg-gamepad-back', onGamepadBack));

onBeforeUnmount(() => {
  window.removeEventListener('tcg-gamepad-back', onGamepadBack);
  if (leaveTimer) clearTimeout(leaveTimer);
  peer?.close();
});
</script>

<template>
  <div class="afight" role="dialog" aria-modal="true" aria-label="Luta da Arena">
    <header class="afight-top">
      <strong>{{ setup.kind === 'liga' ? `Liga · ${rivalName}` : setup.kind === 'corrida' ? ENDLESS_ARENA_LABELS[setup.mode].title : setup.kind === 'pvp' ? 'Contra um amigo' : 'Luta 6×6' }}</strong>
      <span v-if="run && phase === 'arena'">{{ run.wins }} vitórias · {{ run.score }} pts</span>
      <button type="button" class="afight-close" @click="leaveMidway">{{ leaveLabel }} <small class="gamepad-hint" aria-hidden="true">B</small></button>
    </header>

    <p v-if="error" class="hint" role="alert">{{ error }}</p>

    <PvpLobby v-if="phase === 'lobby'" game="box" note="Conectados, cada um prepara os 6 Pokémon e a luta abre sozinha." @connected="onConnected" />

    <section v-else-if="phase === 'prep' && current" class="afight-prep" aria-label="Níveis antes da luta">
      <p v-if="friendLeft" class="afight-gone" role="alert">O amigo saiu da partida. Use «Sair» para voltar ao menu.</p>
      <ol class="afight-dots" :aria-label="`Pokémon ${currentIndex + 1} de ${preps.length}`">
        <li v-for="dot in prepDots" :key="dot.id" :class="{ done: dot.done, now: dot.now }" :title="dot.name"></li>
      </ol>
      <div class="afight-mon">
        <img :src="pokemonSpriteUrl(current.member.dexId, current.member.shiny)" :alt="current.member.name" width="64" height="64" decoding="async" />
        <div>
          <strong>{{ current.member.name }}</strong>
          <small v-for="line in attacks" :key="line">{{ line }}</small>
        </div>
      </div>
      <div class="afight-level" role="status">
        <span>Nível {{ level }} de {{ ARENA_LEVEL_UPS }}</span>
        <i aria-hidden="true"><b :style="{ width: `${(level - 1) * 10}%` }"></b></i>
      </div>
      <ul class="afight-stats" aria-label="Como este Pokémon entra na luta agora">
        <li v-for="stat in coreStats" :key="stat.label"><small>{{ stat.label }}</small><strong>{{ stat.value }}</strong></li>
      </ul>
      <p v-if="estimated" class="afight-warn" role="note">Sem os stats desta espécie: números médios.</p>
      <div :key="handKey" class="afight-cards">
        <button v-for="({ card, rarity, icon, changes }, index) in cards" :key="card.id" type="button" class="afight-card" :class="card.rarity ?? 'normal'" :data-gamepad-default="index === 0 ? '' : null" @click="pickCard(card.id)">
          <span class="afight-card-gem" aria-hidden="true">{{ icon }}</span>
          <span class="afight-card-body">
            <span class="afight-card-rarity">{{ rarity.icon }} {{ rarity.label }}</span>
            <strong>{{ card.name }}</strong>
            <span class="afight-card-desc">{{ card.description }}</span>
            <span v-if="changes.length" class="afight-card-changes">
              <span v-for="change in changes" :key="change.label" :class="{ worse: !change.better }">{{ change.label }} {{ change.before }} → <b>{{ change.after }}</b></span>
            </span>
            <span v-else class="afight-card-changes none">Agora, não muda os números da ficha.</span>
          </span>
        </button>
      </div>
      <div class="afight-auto">
        <button type="button" @click="autoThis">Auto: só este</button>
        <button type="button" @click="autoAll">Auto: todos</button>
      </div>
      <p class="afight-note">A carta vale nos dois ataques. O automático pega a carta de maior raridade de cada mão.</p>
    </section>

    <section v-else-if="phase === 'waiting'" class="afight-prep" aria-label="Esperando o amigo">
      <h3>Sua equipe está pronta</h3>
      <ul class="afight-ready">
        <li v-for="mon in team" :key="mon.id">
          <img :src="pokemonSpriteUrl(mon.dexId, mon.shiny)" :alt="mon.name" width="56" height="56" decoding="async" />
          <small>{{ mon.name }}</small>
        </li>
      </ul>
      <p :class="friendLeft ? 'afight-gone' : 'hint'" role="status">{{ friendLeft ? 'O amigo saiu da partida. Use «Sair» para voltar ao menu.' : 'Esperando o amigo terminar as cartas. A luta abre sozinha.' }}</p>
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
  overflow-x: hidden;
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
  min-width: 44px;
  min-height: 44px;
  padding: 4px 12px;
}

.afight button:focus-visible {
  outline: 3px solid #ffffff;
  outline-offset: 2px;
}

.afight-prep {
  display: grid;
  gap: 8px;
}

.afight-prep h3 {
  margin: 0;
}

.afight-gone {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--warn);
  border-radius: 10px;
  color: var(--warn);
  font-size: 0.86rem;
}

.afight-dots {
  display: flex;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.afight-dots li {
  flex: 1;
  height: 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.14);
}

.afight-dots li.done {
  background: #68bd91;
}

.afight-dots li.now {
  background: var(--gold);
}

.afight-mon {
  display: flex;
  align-items: center;
  gap: 10px;
}

.afight-mon img {
  flex: none;
  object-fit: contain;
  image-rendering: var(--game-image-rendering, pixelated);
}

.afight-mon small {
  overflow-wrap: anywhere;
  line-height: 1.2;
}

.afight-mon div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.afight-level {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  font-weight: 700;
}

.afight-level i {
  height: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.12);
}

.afight-level b {
  display: block;
  height: 100%;
  background: var(--gold);
  transition: width 160ms ease-out;
}

.afight-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.afight-stats li {
  display: grid;
  justify-items: center;
  padding: 3px 2px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 0.9rem;
}

.afight-stats small {
  font-size: 0.68rem;
}

.afight-warn,
.afight-note {
  margin: 0;
  color: var(--muted);
  font-size: 0.76rem;
}

.afight-cards {
  display: grid;
  gap: 7px;
}

.afight-card {
  --rarity: #a9b4c4;
  position: relative;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 8px 10px;
  overflow: hidden;
  border: 1.5px solid var(--rarity);
  border-radius: 12px;
  background: linear-gradient(120deg, color-mix(in srgb, var(--rarity) 20%, var(--surface, #151a2b)), var(--surface, #151a2b) 62%);
  text-align: left;
  animation: afight-deal 170ms ease-out backwards;
}

.afight-card:nth-child(2) {
  animation-delay: 45ms;
}

.afight-card:nth-child(3) {
  animation-delay: 90ms;
}

@keyframes afight-deal {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

.afight-card.raro {
  --rarity: #6aa8ff;
}

.afight-card.lendario {
  --rarity: #ffd166;
  box-shadow: 0 0 12px rgba(255, 209, 102, 0.28);
}

.afight-card.ancestral {
  --rarity: #ff7ad9;
  box-shadow: 0 0 14px rgba(255, 122, 217, 0.32);
}

.afight-card-gem {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--rarity) 26%, transparent);
  font-size: 1.35rem;
}

.afight-card-body {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.afight-card-rarity {
  color: var(--rarity);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.afight-card-desc {
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 400;
  line-height: 1.22;
}

.afight-card-changes {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  margin-top: 2px;
  color: #a7ebc3;
  font-size: 0.76rem;
  font-weight: 600;
}

.afight-card-changes .worse {
  color: #ff9d94;
}

.afight-card-changes.none {
  color: var(--muted);
  font-weight: 400;
}

.afight-auto {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.afight-ready {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.afight-ready li {
  display: grid;
  justify-items: center;
  min-width: 0;
}

.afight-ready img {
  object-fit: contain;
  image-rendering: var(--game-image-rendering, pixelated);
}

.afight-ready small {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .afight-card {
    animation: none;
  }

  .afight-level b {
    transition: none;
  }
}
</style>
