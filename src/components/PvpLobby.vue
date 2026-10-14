<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { PvpPeer } from '../pvp/peer';
import type { PeerState } from '../pvp/peer';
import { hostRoom, joinRoom as joinByCode } from '../pvp/room';
import type { RoomCallbacks, RoomHandle, RoomPhase } from '../pvp/room';
import { normalizeRoomCode } from '../pvp/signal';

/**
 * Pareamento do PvP. Caminho principal: um código de 5 dígitos (a sala), que os dois celulares usam para se achar num
 * serviço público de mensagens e abrir a ligação direta (`pvp/room.ts`). Plano B, sem esse serviço: o anfitrião gera um
 * código longo de convite, o amigo cola e devolve um código de resposta. Quando a ligação abre, o componente a entrega
 * (`connected`) e deixa de ser dono dela.
 */
const emit = defineEmits<{ connected: [peer: PvpPeer, role: 'host' | 'guest'] }>();

type Step = 'choose' | 'room' | 'enter' | 'host' | 'guest';
const step = ref<Step>('choose');
const busy = ref('');
const error = ref('');
const myCode = ref('');
const pasted = ref('');
const waiting = ref(false);
const copied = ref(false);
const roomCode = ref('');
const typed = ref('');
const phase = ref<RoomPhase | ''>('');
const roomRole = ref<'host' | 'guest'>('host');
let room: RoomHandle | null = null;

let peer: PvpPeer | null = null;
let handedOver = false;
let waitTimer: ReturnType<typeof setTimeout> | null = null;

const CONNECT_TIMEOUT_MS = 30000;

function dropRoom(): void {
  room?.cancel();
  room = null;
  phase.value = '';
}

function dropPeer(): void {
  if (waitTimer) clearTimeout(waitTimer);
  waitTimer = null;
  if (peer && !handedOver) {
    peer.onState = null;
    peer.close();
  }
  peer = null;
  handedOver = false;
}

function reset(): void {
  dropRoom();
  dropPeer();
  roomCode.value = '';
  typed.value = '';
  step.value = 'choose';
  busy.value = '';
  error.value = '';
  myCode.value = '';
  pasted.value = '';
  waiting.value = false;
}

function watch(p: PvpPeer, role: 'host' | 'guest'): void {
  waiting.value = true;
  waitTimer = setTimeout(() => {
    if (peer !== p || p.state === 'open') return;
    error.value =
      'Não conectou. Confira se os dois estão com o app aberto e na mesma rede Wi-Fi (ou com internet boa) e tente de novo com um código novo.';
    dropPeer();
    waiting.value = false;
    myCode.value = '';
    pasted.value = '';
    step.value = 'choose';
  }, CONNECT_TIMEOUT_MS);
  p.onState = (state: PeerState) => {
    if (state === 'open') {
      if (waitTimer) clearTimeout(waitTimer);
      waitTimer = null;
      handedOver = true;
      p.onState = null;
      emit('connected', p, role);
    } else if (state === 'closed' && peer === p) {
      error.value = 'A conexão caiu antes de começar. Tente de novo com um código novo.';
      dropPeer();
      waiting.value = false;
      step.value = 'choose';
    }
  };
}

function roomCallbacks(role: 'host' | 'guest'): RoomCallbacks {
  return {
    onPhase: (p) => (phase.value = p),
    onConnected: (p) => {
      room = null;
      phase.value = '';
      emit('connected', p, role);
    },
    onFail: (message) => {
      room = null;
      phase.value = '';
      error.value = message;
      step.value = 'choose';
      roomCode.value = '';
    },
  };
}

function createShortRoom(): void {
  error.value = '';
  roomRole.value = 'host';
  step.value = 'room';
  room = hostRoom(roomCallbacks('host'));
  roomCode.value = room.code;
}

function openEnter(): void {
  error.value = '';
  typed.value = '';
  step.value = 'enter';
}

function enterShortRoom(): void {
  const code = normalizeRoomCode(typed.value);
  if (!code) {
    error.value = 'O código da sala tem 5 números.';
    return;
  }
  error.value = '';
  roomRole.value = 'guest';
  roomCode.value = code;
  step.value = 'room';
  room = joinByCode(code, roomCallbacks('guest'));
}

const roomStatus = computed(() => {
  switch (phase.value) {
    case 'service':
      return 'Conectando ao serviço de salas…';
    case 'waiting':
      return 'Sala aberta. Aguardando o seu amigo digitar o código…';
    case 'looking':
      return 'Procurando a sala…';
    case 'linking':
      return 'Achei! Abrindo a ligação direta entre os celulares…';
    default:
      return '';
  }
});

const shownCode = computed(() => `${roomCode.value.slice(0, 2)} ${roomCode.value.slice(2)}`);

async function copyRoomCode(): Promise<void> {
  try {
    await navigator.clipboard.writeText(roomCode.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1800);
  } catch {
    error.value = 'Não consegui copiar sozinho. Anote o código na tela.';
  }
}

async function shareRoomCode(): Promise<void> {
  try {
    await navigator.share({ text: `Vem jogar Pins comigo! No app, toque em «Contra um amigo» > «Entrar com um código» e digite ${roomCode.value}.` });
  } catch {
    /* o usuário fechou a folha de compartilhamento */
  }
}

async function createRoom(): Promise<void> {
  error.value = '';
  step.value = 'host';
  busy.value = 'Gerando o convite…';
  try {
    const made = await PvpPeer.host();
    peer = made.peer;
    myCode.value = made.code;
  } catch {
    error.value = 'Este navegador não conseguiu criar a conexão (WebRTC). Tente no Chrome ou no Safari atualizados.';
    step.value = 'choose';
  }
  busy.value = '';
}

async function connectHost(): Promise<void> {
  if (!peer) return;
  error.value = '';
  busy.value = 'Conectando…';
  const problem = await peer.acceptAnswer(pasted.value);
  busy.value = '';
  if (problem) {
    error.value = problem;
    return;
  }
  watch(peer, 'host');
}

function joinRoom(): void {
  error.value = '';
  step.value = 'guest';
}

async function makeAnswer(): Promise<void> {
  error.value = '';
  busy.value = 'Lendo o convite…';
  try {
    const made = await PvpPeer.join(pasted.value);
    if (!made.ok) {
      error.value = made.message;
    } else {
      peer = made.peer;
      myCode.value = made.code;
      watch(made.peer, 'guest');
    }
  } catch {
    error.value = 'Este navegador não conseguiu criar a conexão (WebRTC). Tente no Chrome ou no Safari atualizados.';
  }
  busy.value = '';
}

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(myCode.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1800);
  } catch {
    error.value = 'Não consegui copiar sozinho. Toque no código, selecione tudo e copie.';
  }
}

const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
async function share(): Promise<void> {
  try {
    await navigator.share({ text: myCode.value });
  } catch {
    /* o usuário fechou a folha de compartilhamento */
  }
}

onBeforeUnmount(() => {
  dropRoom();
  dropPeer();
});
</script>

<template>
  <section class="pn-card pn-lobby" aria-label="Jogar contra um amigo">
    <template v-if="step === 'choose'">
      <h3>Jogar contra um amigo</h3>
      <p class="pn-lobby-note">
        Cada um joga no seu celular. Um cria a sala e passa o código de 5 números; o outro digita e a partida começa.
      </p>
      <div class="pn-lobby-actions">
        <button type="button" class="primary" @click="createShortRoom">Criar sala</button>
        <button type="button" @click="openEnter">Entrar com um código</button>
      </div>
      <details class="pn-lobby-more">
        <summary>Como funciona e privacidade</summary>
        <p class="pn-lobby-note">
          O código serve só para os dois celulares se acharem: eles trocam o convite da ligação por servidores públicos e gratuitos de mensagens (EMQX, HiveMQ, Mosquitto). Depois a partida vai direto de um celular ao outro, sem servidor do app.
          Esses serviços não veem o jogo, mas quem souber o código enquanto a sala estiver aberta poderia entrar nela.
        </p>
        <p class="pn-lobby-note">
          Para abrir o caminho entre os celulares, o navegador consulta servidores públicos do Google (STUN), que só veem o endereço de rede. Na mesma rede Wi-Fi funciona melhor; em algumas operadoras a conexão pode não fechar.
        </p>
        <p class="pn-lobby-note">Não conecta? Os códigos longos não dependem do serviço de salas:</p>
        <div class="pn-lobby-actions row">
          <button type="button" @click="createRoom">Criar com código longo</button>
          <button type="button" @click="joinRoom">Entrar com código longo</button>
        </div>
      </details>
    </template>

    <template v-else-if="step === 'room'">
      <h3>{{ roomRole === 'host' ? 'Sua sala' : 'Entrando na sala' }}</h3>
      <template v-if="roomRole === 'host'">
        <p class="pn-lobby-note">Passe este código para o seu amigo:</p>
        <output class="pn-room-code" aria-label="Código da sala">{{ shownCode }}</output>
        <div class="pn-lobby-actions row">
          <button type="button" @click="copyRoomCode">{{ copied ? 'Copiado!' : 'Copiar' }}</button>
          <button v-if="canShare" type="button" @click="shareRoomCode">Compartilhar</button>
        </div>
      </template>
      <output v-else class="pn-room-code" aria-label="Código da sala">{{ shownCode }}</output>
      <p class="message" role="status">
        <span class="pn-spin" aria-hidden="true"></span>
        {{ roomStatus }}
      </p>
    </template>

    <template v-else-if="step === 'enter'">
      <h3>Entrar com um código</h3>
      <label class="pn-code-label" for="pvp-room-input">Código da sala (5 números)</label>
      <input
        id="pvp-room-input"
        v-model="typed"
        class="pn-room-input"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        maxlength="8"
        placeholder="00 000"
        @keyup.enter="enterShortRoom"
      />
      <button type="button" class="primary" :disabled="typed.trim() === ''" @click="enterShortRoom">Entrar na sala</button>
    </template>

    <template v-else-if="step === 'host'">
      <h3>Criar sala (código longo)</h3>
      <p v-if="busy && !myCode" class="message" role="status">{{ busy }}</p>
      <template v-if="myCode">
        <ol class="pn-lobby-steps">
          <li>Mande o código abaixo para o seu amigo.</li>
          <li>Ele cola, toca em «Gerar resposta» e te devolve outro código.</li>
          <li>Cole a resposta dele aqui e toque em «Conectar».</li>
        </ol>
        <label class="pn-code-label" for="pvp-my-code">Seu código de convite</label>
        <textarea id="pvp-my-code" class="pn-code" readonly rows="4" :value="myCode" @focus="($event.target as HTMLTextAreaElement).select()"></textarea>
        <div class="pn-lobby-actions row">
          <button type="button" @click="copy">{{ copied ? 'Copiado!' : 'Copiar' }}</button>
          <button v-if="canShare" type="button" @click="share">Compartilhar</button>
        </div>
        <label class="pn-code-label" for="pvp-paste">Código de resposta do amigo</label>
        <textarea id="pvp-paste" v-model="pasted" class="pn-code" rows="4" placeholder="Cole aqui o código que ele devolveu" :disabled="waiting"></textarea>
        <button type="button" class="primary" :disabled="waiting || busy !== '' || pasted.trim() === ''" @click="connectHost">{{ waiting ? 'Conectando…' : 'Conectar' }}</button>
        <p v-if="waiting" class="message" role="status">Aguardando a conexão com o amigo… os dois precisam estar com esta tela aberta.</p>
      </template>
    </template>

    <template v-else>
      <h3>Entrar na sala (código longo)</h3>
      <template v-if="!myCode">
        <label class="pn-code-label" for="pvp-paste-offer">Código de convite do anfitrião</label>
        <textarea id="pvp-paste-offer" v-model="pasted" class="pn-code" rows="4" placeholder="Cole aqui o código que seu amigo mandou"></textarea>
        <button type="button" class="primary" :disabled="busy !== '' || pasted.trim() === ''" @click="makeAnswer">{{ busy || 'Gerar resposta' }}</button>
      </template>
      <template v-else>
        <ol class="pn-lobby-steps">
          <li>Mande este código de resposta para o anfitrião.</li>
          <li>Deixe esta tela aberta: a conexão abre sozinha quando ele colar.</li>
        </ol>
        <label class="pn-code-label" for="pvp-my-answer">Seu código de resposta</label>
        <textarea id="pvp-my-answer" class="pn-code" readonly rows="4" :value="myCode" @focus="($event.target as HTMLTextAreaElement).select()"></textarea>
        <div class="pn-lobby-actions row">
          <button type="button" @click="copy">{{ copied ? 'Copiado!' : 'Copiar' }}</button>
          <button v-if="canShare" type="button" @click="share">Compartilhar</button>
        </div>
        <p v-if="waiting" class="message" role="status">Aguardando o anfitrião conectar…</p>
      </template>
    </template>

    <p v-if="error" class="message error" role="alert">{{ error }}</p>
    <button v-if="step !== 'choose'" type="button" class="pn-link" @click="reset">Cancelar</button>
  </section>
</template>

<style scoped>
.pn-lobby {
  display: grid;
  gap: 10px;
}

.pn-lobby h3 {
  margin: 0;
}

.pn-lobby-note {
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
}

.pn-lobby-actions {
  display: grid;
  gap: 8px;
}

.pn-lobby-actions.row {
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
}

.pn-lobby-steps {
  margin: 0;
  padding-left: 1.2em;
  color: var(--muted);
  font-size: 0.86rem;
  display: grid;
  gap: 2px;
}

.pn-code-label {
  font-size: 0.82rem;
  font-weight: 700;
}

.pn-code {
  width: 100%;
  resize: none;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font: 0.72rem/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all;
}

.pn-room-code {
  display: block;
  padding: 10px 8px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1.5px solid var(--line);
  color: var(--gold);
  font: 800 2.6rem/1.1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.16em;
  text-align: center;
  user-select: all;
}

.pn-room-input {
  width: 100%;
  padding: 10px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font: 800 2rem/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.16em;
  text-align: center;
}

.pn-lobby-more {
  display: grid;
  gap: 8px;
  font-size: 0.86rem;
}

.pn-lobby-more summary {
  cursor: pointer;
  color: var(--gold);
  font-weight: 700;
  padding: 6px 0;
}

.pn-spin {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 6px;
  vertical-align: -1px;
  border-radius: 50%;
  border: 2px solid rgba(255, 203, 5, 0.3);
  border-top-color: var(--gold);
  animation: pn-spin 0.8s linear infinite;
}

@keyframes pn-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pn-spin {
    animation: none;
  }
}

.pn-link {
  justify-self: start;
  padding: 8px 4px;
  border: 0;
  background: none;
  color: var(--gold);
  font: inherit;
  font-weight: 700;
  font-size: 0.85rem;
}
</style>
