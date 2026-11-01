<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';
import MinigameSobrevivencia from './MinigameSobrevivencia.vue';
import PvpLobby from './PvpLobby.vue';
import SurvivalPvpArena from './SurvivalPvpArena.vue';
import { pokemonSpriteUrl } from '../ar/sprite-url';
import { profile } from '../app/profile-store';
import { TYPE_LABELS_PT } from '../core/pokemon-data';
import { SV_RUN_MS, SV_RUNS, svMonFromRun } from '../core/survivor-pvp';
import type { SvMonSpec, SvRunResult } from '../core/survivor-pvp';
import type { PvpPeer } from '../pvp/peer';
import { SurvivalGuestLink, SurvivalHostLink } from '../pvp/survival-link';
import type { WireMessage } from '../pvp/wire';

/**
 * PvP do Survival, do começo ao fim: sala (lobby) → 3 runs de 2 minutos, cada uma rende um Pokémon → as duas equipes 3x3
 * se encontram na arena em tempo real. As runs são solo (cada um no seu celular, sem nada da Vila e sem gravar nada);
 * só a equipe pronta vai pelo fio. A luta roda no anfitrião (`SurvivalHostLink`) e o convidado desenha o que recebe.
 */
defineProps<{
  digital?: { instanceId?: string; dexId: number; name: string; shiny?: boolean; accessory?: string | null }[];
  accessories?: Record<string, string | null | undefined>;
}>();
const emit = defineEmits<{ leave: [] }>();

type Phase = 'lobby' | 'runs' | 'between' | 'waiting' | 'loading' | 'arena';
const phase = ref<Phase>('lobby');
const role = ref<'host' | 'guest'>('host');
const runIndex = ref(0);
const team = ref<SvMonSpec[]>([]);
const usedIds = ref<string[]>([]);
const friend = ref<{ name: string; team: SvMonSpec[] | null; done: number }>({ name: '', team: null, done: 0 });
const link = shallowRef<SurvivalHostLink | SurvivalGuestLink | null>(null);
const missing = ref<number[]>([]);
const closed = ref(false);
const notice = ref('');
const leaveArmed = ref(false);

let peer: PvpPeer | null = null;
let guestReady = false;
let myPreloadDone = false;
let started = false;
let leaveTimer: ReturnType<typeof setTimeout> | null = null;
let hostWait: ReturnType<typeof setTimeout> | null = null;
const GUEST_WAIT_MS = 15_000;
const PRELOAD_MS = 9_000;

const friendName = computed(() => friend.value.name || 'Amigo');
const lastMon = computed(() => team.value[team.value.length - 1] ?? null);
const lastTypes = computed(() => lastMon.value?.types.map((t) => TYPE_LABELS_PT[t]).join(' / ') || 'tipo desconhecido');
/** Um objeto só por run: o jogo não é redesenhado a cada mudança no progresso do amigo. */
const pvpRunProp = computed(() => ({ index: runIndex.value, total: SV_RUNS, limitMs: SV_RUN_MS, excludeIds: usedIds.value }));
const progress = computed(() => {
  if (phase.value === 'runs' || phase.value === 'between') return `Sua run ${Math.min(runIndex.value + 1, SV_RUNS)}/${SV_RUNS} · ${friendName.value}: ${friend.value.done}/${SV_RUNS} prontas`;
  if (phase.value === 'waiting') return `Equipe pronta · ${friendName.value}: ${friend.value.done}/${SV_RUNS} runs`;
  if (phase.value === 'loading') return 'Preparando a arena…';
  return `Contra ${friendName.value}`;
});

const send = (msg: WireMessage): void => {
  peer?.send(msg);
};

function onConnected(p: PvpPeer, r: 'host' | 'guest'): void {
  peer = p;
  role.value = r;
  p.onMessage = onMessage;
  p.onState = (state) => {
    if (state === 'closed') {
      closed.value = true;
      if (phase.value !== 'arena') notice.value = `${friendName.value} saiu da partida.`;
    }
  };
  phase.value = 'runs';
  send({ t: 'sv-progress', done: 0 });
}

function onMessage(msg: WireMessage): void {
  switch (msg.t) {
    case 'sv-progress':
      friend.value = { ...friend.value, done: msg.done };
      break;
    case 'sv-team':
      friend.value = { ...friend.value, name: msg.name || friend.value.name, team: msg.team, done: SV_RUNS };
      maybeStart();
      break;
    case 'sv-start':
      // Só o convidado recebe: o anfitrião já tem as duas equipes e só manda depois que o convidado terminou as runs.
      if (role.value === 'guest' && phase.value === 'waiting') void beginLoading();
      break;
    case 'sv-ready':
      if (role.value === 'host') {
        guestReady = true;
        tryGo();
      }
      break;
    case 'sv-go':
      if (role.value === 'guest' && phase.value === 'loading' && link.value) phase.value = 'arena';
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

function onRunDone(result: SvRunResult): void {
  const mon = svMonFromRun(result, `r${runIndex.value}`);
  team.value = [...team.value, mon];
  usedIds.value = [...usedIds.value, result.id];
  send({ t: 'sv-progress', done: team.value.length });
  if (team.value.length < SV_RUNS) {
    phase.value = 'between';
    return;
  }
  phase.value = 'waiting';
  send({ t: 'sv-team', name: (profile.name || 'Treinador').slice(0, 16), team: team.value });
  maybeStart();
}

function nextRun(): void {
  runIndex.value++;
  phase.value = 'runs';
}

/** O anfitrião começa quando as duas equipes estão aqui. */
function maybeStart(): void {
  if (role.value !== 'host' || phase.value !== 'waiting' || !friend.value.team || team.value.length === 0 || started) return;
  started = true;
  send({ t: 'sv-start' });
  void beginLoading();
}

function preload(specs: readonly SvMonSpec[]): Promise<number[]> {
  const lost: number[] = [];
  return Promise.all(specs.map((s) => new Promise<void>((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => {
      lost.push(s.dexId);
      resolve();
    }, PRELOAD_MS);
    img.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    img.onerror = () => {
      clearTimeout(timer);
      lost.push(s.dexId);
      resolve();
    };
    img.src = pokemonSpriteUrl(s.dexId, s.shiny);
  }))).then(() => lost);
}

async function beginLoading(): Promise<void> {
  const other = friend.value.team;
  if (!peer || !other) return;
  phase.value = 'loading';
  link.value = role.value === 'host' ? new SurvivalHostLink(peer, team.value, other) : new SurvivalGuestLink(peer, other, team.value);
  const lost = await preload([...team.value, ...other]);
  missing.value = lost;
  myPreloadDone = true;
  if (role.value === 'guest') {
    send({ t: 'sv-ready', ok: lost.length === 0 });
    return;
  }
  // O convidado costuma avisar logo; se não avisar, a luta começa mesmo assim depois de um tempo.
  hostWait = setTimeout(() => {
    guestReady = true;
    tryGo();
  }, GUEST_WAIT_MS);
  tryGo();
}

function tryGo(): void {
  if (role.value !== 'host' || phase.value !== 'loading' || !myPreloadDone || !guestReady) return;
  if (hostWait) clearTimeout(hostWait);
  hostWait = null;
  send({ t: 'sv-go' });
  phase.value = 'arena';
}

function leaveNow(): void {
  if (leaveTimer) clearTimeout(leaveTimer);
  detach();
  emit('leave');
}

/** Dois toques para sair no meio da partida (um toque sem querer não derruba a luta). */
function askLeave(): void {
  if (phase.value === 'lobby' || closed.value || leaveArmed.value) {
    leaveNow();
    return;
  }
  leaveArmed.value = true;
  leaveTimer = setTimeout(() => (leaveArmed.value = false), 3000);
}

function detach(): void {
  if (hostWait) clearTimeout(hostWait);
  hostWait = null;
  if (peer) {
    peer.onMessage = null;
    peer.onState = null;
    peer.close();
    peer = null;
  }
}

onBeforeUnmount(() => {
  if (leaveTimer) clearTimeout(leaveTimer);
  detach();
});
</script>

<template>
  <div class="svpvp">
    <PvpLobby v-if="phase === 'lobby'" game="survival" note="Survival · 3 runs e arena 3x3" @connected="onConnected" />
    <template v-else>
      <header class="svpvp-strip">
        <span class="svpvp-progress" role="status">⚔ {{ progress }}</span>
        <button type="button" class="link svpvp-leave" @click="askLeave">{{ leaveArmed ? 'Toque de novo para sair' : 'Sair do PvP' }}</button>
      </header>

      <MinigameSobrevivencia
        v-if="phase === 'runs' && !closed"
        :key="runIndex"
        :digital="digital"
        :accessories="accessories"
        :pvp-run="pvpRunProp"
        @pvp-run-done="onRunDone"
        @leave="leaveNow"
      />

      <section v-else-if="phase === 'between' && lastMon && !closed" class="card svpvp-card" aria-label="Run concluída">
        <h3>Run {{ runIndex + 1 }} concluída</h3>
        <div class="svpvp-earned">
          <img :src="pokemonSpriteUrl(lastMon.dexId, lastMon.shiny)" :alt="lastMon.name" height="64" />
          <div>
            <strong>{{ lastMon.name }} entrou na sua equipe</strong>
            <small>{{ lastTypes }} · nota da run {{ lastMon.score }}/100</small>
            <small>Vida {{ lastMon.maxHp }} · golpe {{ lastMon.power }} · velocidade {{ lastMon.speed }}</small>
            <small v-if="lastMon.estimated">Sem os stats desta espécie: números médios.</small>
          </div>
        </div>
        <p class="hint">Equipe até agora: {{ team.map((m) => m.name).join(', ') }}. {{ friendName }} já fez {{ friend.done }} de {{ SV_RUNS }} runs.</p>
        <button type="button" class="primary" @click="nextRun">Run {{ runIndex + 2 }} de {{ SV_RUNS }}</button>
      </section>

      <section v-else-if="phase === 'waiting' && !closed" class="card svpvp-card" aria-label="Equipe pronta">
        <h3>Sua equipe está pronta</h3>
        <ul class="svpvp-roster">
          <li v-for="m in team" :key="m.id">
            <img :src="pokemonSpriteUrl(m.dexId, m.shiny)" :alt="m.name" height="48" />
            <span><strong>{{ m.name }}</strong><small>Vida {{ m.maxHp }} · golpe {{ m.power }}</small></span>
          </li>
        </ul>
        <p class="hint" role="status">{{ friend.done >= SV_RUNS ? 'Conectando as duas equipes…' : `Esperando ${friendName} terminar as runs (${friend.done}/${SV_RUNS}).` }}</p>
      </section>

      <section v-else-if="phase === 'loading' && !closed" class="card svpvp-card" aria-label="Preparando a arena">
        <h3>Preparando a arena</h3>
        <p class="hint" role="status">Baixando os sprites das duas equipes e esperando {{ friendName }}…</p>
      </section>

      <SurvivalPvpArena v-else-if="phase === 'arena' && link" :link="link" :friend-name="friendName" :friend-left="closed" @leave="leaveNow" />

      <section v-if="closed && phase !== 'arena'" class="card svpvp-card" role="alert">
        <h3>{{ notice || 'A conexão caiu' }}</h3>
        <p class="hint">Nada foi gravado: as runs do PvP não contam para a Torre.</p>
        <button type="button" class="primary" @click="leaveNow">Voltar</button>
      </section>
      <p v-if="missing.length && phase === 'arena'" class="hint svpvp-missing" role="status">Sem sprite de {{ missing.length }} Pokémon: aparecem como círculos com a sigla.</p>
    </template>
  </div>
</template>

<style scoped>
.svpvp {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 8px;
  padding: 6px 12px 12px;
  overflow-y: auto;
}

.svpvp-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.82rem;
  font-weight: 700;
}

.svpvp-leave {
  min-height: 36px;
  color: inherit;
}

.svpvp-card {
  display: grid;
  gap: 10px;
  max-width: 420px;
  margin: 0 auto;
  width: 100%;
}

.svpvp-card h3,
.svpvp-card p {
  margin: 0;
}

.svpvp-earned {
  display: flex;
  align-items: center;
  gap: 12px;
}

.svpvp-earned div {
  display: grid;
  gap: 2px;
}

.svpvp-earned small {
  color: var(--muted);
}

.svpvp-roster {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.svpvp-roster li {
  display: flex;
  align-items: center;
  gap: 10px;
}

.svpvp-roster span {
  display: grid;
}

.svpvp-roster small {
  color: var(--muted);
}

.svpvp-missing {
  margin: 0;
  text-align: center;
}
</style>
