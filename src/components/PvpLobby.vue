<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { PvpPeer } from '../pvp/peer';
import type { PeerState } from '../pvp/peer';
import { SignalHub } from '../pvp/signal';
import { Matchmaker, normalizeRoomCode } from '../pvp/matchmaker';
import type { OpenRoom, PvpGame } from '../pvp/matchmaker';
import { profile } from '../app/profile-store';
import { onPvpLog, pvpLogReset, pvpLogTail, pvpLogText } from '../pvp/pvp-log';

/**
 * Pareamento do PvP sem copiar código longo: o anfitrião cria uma sala com um código curto (ou a deixa na lista pública do
 * modo), o amigo toca nela ou digita o código, e a ligação abre sozinha. Os códigos longos de antes continuam como reserva
 * («códigos manuais»), para quando o ponto de encontro estiver fora do ar. Quando a ligação abre, o componente entrega o
 * canal (`connected`) e deixa de ser dono dele.
 */
const emit = defineEmits<{ connected: [peer: PvpPeer, role: 'host' | 'guest'] }>();
const props = withDefaults(defineProps<{ purpose?: 'game' | 'backup'; game?: PvpGame; note?: string }>(), { purpose: 'game', game: 'pins', note: '' });
const backupPurpose = computed(() => props.purpose === 'backup');
const lobbyTitle = computed(() => backupPurpose.value ? 'Transferir backup com um amigo' : 'Jogar contra um amigo');
const lobbyNote = computed(() => backupPurpose.value
  ? 'Crie uma sala para enviar uma cópia completa dos seus dados diretamente para outro aparelho. A sala não aparece na lista: só entra quem receber o código.'
  : 'Jogue com um amigo em tempo real. Crie uma sala e diga o código curto, ou toque numa sala aberta da lista.');
const codeLength = computed(() => (backupPurpose.value ? 6 : 4));
const gameKey = computed<PvpGame>(() => (backupPurpose.value ? 'backup' : props.game));

type Step = 'choose' | 'host' | 'join' | 'manual-host' | 'manual-guest';
const step = ref<Step>('choose');
const busy = ref('');
const error = ref('');
const status = ref('');
const roomCode = ref('');
const typedCode = ref('');
const rooms = ref<OpenRoom[]>([]);
const online = ref(0);
const copied = ref(false);
/** Últimos códigos do diário de pareamento (`pvp-log.ts`), para depurar com quem está jogando. */
const diag = ref('');
const diagCopied = ref(false);
let offLog: (() => void) | null = null;

// Reserva por códigos manuais (o jeito antigo).
const myCode = ref('');
const pasted = ref('');
const waiting = ref(false);

let hub: SignalHub | null = null;
let matchmaker: Matchmaker | null = null;
let stopWatch: (() => void) | null = null;
let hosting: { cancel(): void } | null = null;
let stopJoin: (() => void) | null = null;
let peer: PvpPeer | null = null;
let handedOver = false;
let waitTimer: ReturnType<typeof setTimeout> | null = null;

const CONNECT_TIMEOUT_MS = 30000;
const displayName = () => (profile.name || 'Treinador').slice(0, 16);

function startMeeting(): void {
  pvpLogReset();
  offLog = onPvpLog(() => (diag.value = pvpLogTail()));
  hub = new SignalHub();
  hub.onOnline = (n) => (online.value = n);
  matchmaker = new Matchmaker(hub, gameKey.value);
  hub.start();
  if (!backupPurpose.value) stopWatch = matchmaker.watchRooms((list) => (rooms.value = list));
}

function stopMeeting(): void {
  offLog?.();
  offLog = null;
  stopWatch?.();
  stopWatch = null;
  hosting?.cancel();
  hosting = null;
  stopJoin?.();
  stopJoin = null;
  hub?.close();
  hub = null;
  matchmaker = null;
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
  hosting?.cancel();
  hosting = null;
  stopJoin?.();
  stopJoin = null;
  dropPeer();
  step.value = 'choose';
  busy.value = '';
  error.value = '';
  status.value = '';
  roomCode.value = '';
  myCode.value = '';
  pasted.value = '';
  waiting.value = false;
}

function connectedWith(p: PvpPeer, role: 'host' | 'guest'): void {
  hosting = null;
  stopJoin = null;
  handedOver = true;
  emit('connected', p, role);
}

function createRoom(): void {
  if (!matchmaker) return;
  error.value = '';
  status.value = 'Aguardando um amigo entrar…';
  step.value = 'host';
  hosting = matchmaker.host(
    { listed: !backupPurpose.value, name: displayName(), note: props.note, codeLength: codeLength.value },
    {
      onCode: (code) => (roomCode.value = code),
      onGuest: (name) => (status.value = `${name} entrou. Preparando a conexão…`),
      onStatus: (text) => (status.value = text),
      onPeer: (p) => connectedWith(p, 'host'),
      onError: (message) => {
        reset();
        error.value = message;
      },
    },
  );
}

function joinCode(raw: string): void {
  if (!matchmaker) return;
  error.value = '';
  step.value = 'join';
  roomCode.value = normalizeRoomCode(raw);
  stopJoin = matchmaker.join(raw, displayName(), {
    onStatus: (text) => (status.value = text),
    onPeer: (p) => connectedWith(p, 'guest'),
    onError: (message) => {
      reset();
      error.value = message;
    },
  }, codeLength.value);
}

const typedReady = computed(() => normalizeRoomCode(typedCode.value).length === codeLength.value);

// ---- Reserva: códigos manuais
function watchManual(p: PvpPeer, role: 'host' | 'guest'): void {
  waiting.value = true;
  waitTimer = setTimeout(() => {
    if (peer !== p || p.state === 'open') return;
    dropPeer();
    reset();
    error.value = 'Não conectou. Confira se os dois estão com o app aberto e na mesma rede Wi-Fi (ou com internet boa) e tente de novo com um código novo.';
  }, CONNECT_TIMEOUT_MS);
  p.onState = (state: PeerState) => {
    if (state === 'open') {
      if (waitTimer) clearTimeout(waitTimer);
      waitTimer = null;
      p.onState = null;
      connectedWith(p, role);
    } else if (state === 'closed' && peer === p) {
      dropPeer();
      reset();
      error.value = 'A conexão caiu antes de começar. Tente de novo com um código novo.';
    }
  };
}

async function manualCreate(): Promise<void> {
  error.value = '';
  step.value = 'manual-host';
  busy.value = 'Gerando o convite…';
  try {
    const made = await PvpPeer.host();
    peer = made.peer;
    myCode.value = made.code;
  } catch {
    step.value = 'choose';
    error.value = 'Este navegador não conseguiu criar a conexão (WebRTC). Tente no Chrome ou no Safari atualizados.';
  }
  busy.value = '';
}

async function manualConnect(): Promise<void> {
  if (!peer) return;
  error.value = '';
  busy.value = 'Conectando…';
  const problem = await peer.acceptAnswer(pasted.value);
  busy.value = '';
  if (problem) {
    error.value = problem;
    return;
  }
  watchManual(peer, 'host');
}

async function manualAnswer(): Promise<void> {
  error.value = '';
  busy.value = 'Lendo o convite…';
  try {
    const made = await PvpPeer.join(pasted.value);
    if (!made.ok) {
      error.value = made.message;
    } else {
      peer = made.peer;
      myCode.value = made.code;
      watchManual(made.peer, 'guest');
    }
  } catch {
    error.value = 'Este navegador não conseguiu criar a conexão (WebRTC). Tente no Chrome ou no Safari atualizados.';
  }
  busy.value = '';
}

async function copyDiag(): Promise<void> {
  try {
    await navigator.clipboard.writeText(pvpLogText());
    diagCopied.value = true;
    setTimeout(() => (diagCopied.value = false), 1800);
  } catch {
    error.value = 'Não consegui copiar o diagnóstico sozinho.';
  }
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1800);
  } catch {
    error.value = 'Não consegui copiar sozinho. Toque no código, selecione tudo e copie.';
  }
}

const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
async function share(text: string): Promise<void> {
  try {
    await navigator.share({ text });
  } catch {
    /* o usuário fechou a folha de compartilhamento */
  }
}

onMounted(startMeeting);
onBeforeUnmount(() => {
  stopMeeting();
  dropPeer();
});
</script>

<template>
  <section class="pn-card pn-lobby" :aria-label="lobbyTitle">
    <template v-if="step === 'choose'">
      <h3>{{ lobbyTitle }}</h3>
      <p class="pn-lobby-note">{{ lobbyNote }}</p>
      <p class="pn-lobby-link" :class="{ on: online > 0 }" role="status">
        <span class="dot" aria-hidden="true"></span>
        {{ online > 0 ? 'Ponto de encontro conectado' : 'Conectando ao ponto de encontro… se demorar, use os códigos manuais lá embaixo.' }}
      </p>
      <div class="pn-lobby-actions">
        <button type="button" class="primary" :disabled="online === 0" @click="createRoom">{{ backupPurpose ? 'Criar sala de transferência' : 'Criar sala' }}</button>
      </div>

      <template v-if="!backupPurpose">
        <h4 class="pn-lobby-sub">Salas abertas</h4>
        <ul v-if="rooms.length" class="pn-rooms">
          <li v-for="room in rooms" :key="room.code">
            <button type="button" :disabled="online === 0" @click="joinCode(room.code)">
              <strong>{{ room.name }} <span class="pn-room-tag">{{ room.code }}</span></strong>
              <small>{{ room.note }}</small>
              <span class="pn-room-go">Entrar</span>
            </button>
          </li>
        </ul>
        <p v-else class="pn-lobby-note">Nenhuma sala aberta agora. Crie uma e espere um amigo, ou digite o código que ele te passou.</p>
      </template>

      <label class="pn-code-label" for="pvp-room-code">Já tem um código de sala?</label>
      <div class="pn-lobby-actions row">
        <input
          id="pvp-room-code"
          v-model="typedCode"
          class="pn-room-input"
          :maxlength="codeLength + 2"
          autocapitalize="characters"
          autocomplete="off"
          spellcheck="false"
          :placeholder="'•'.repeat(codeLength)"
          @keyup.enter="typedReady && online > 0 && joinCode(typedCode)"
        />
        <button type="button" :disabled="!typedReady || online === 0" @click="joinCode(typedCode)">Entrar na sala</button>
      </div>

      <details class="pn-lobby-note">
        <summary>Sem ponto de encontro? Usar códigos manuais</summary>
        <p>Se o ponto de encontro não conectar (rede da escola ou do trabalho, por exemplo), dá para parear trocando dois códigos longos por mensagem.</p>
        <div class="pn-lobby-actions">
          <button type="button" @click="manualCreate">Gerar convite (códigos manuais)</button>
          <button type="button" @click="step = 'manual-guest'">Tenho um convite para colar</button>
        </div>
      </details>
      <details class="pn-lobby-note">
        <summary>Como a conexão é feita e o que os servidores veem</summary>
        <p>
          O ponto de encontro usa servidores públicos gratuitos só para os dois aparelhos se acharem: eles carregam o código da sala e dados de rede,
          nunca o jogo. A partida segue direto de um celular ao outro. Para achar o caminho, o navegador consulta servidores STUN (Google, Cloudflare) e,
          se a rede bloquear a ligação direta, uma retransmissão pública cifrada. Na mesma rede Wi-Fi funciona melhor.
        </p>
      </details>
    </template>

    <template v-else-if="step === 'host'">
      <h3>{{ backupPurpose ? 'Sala de transferência' : 'Sua sala' }}</h3>
      <p class="pn-lobby-note">Diga este código ao seu amigo{{ backupPurpose ? '' : ' ou espere: a sala aparece na lista de salas abertas dele' }}.</p>
      <p class="pn-room-code" aria-live="polite">{{ roomCode }}</p>
      <div class="pn-lobby-actions row">
        <button type="button" @click="copy(roomCode)">{{ copied ? 'Copiado!' : 'Copiar código' }}</button>
        <button v-if="canShare" type="button" @click="share(`Entre na minha sala ${roomCode}`)">Compartilhar</button>
      </div>
      <p class="message" role="status">{{ status }}</p>
      <p class="pn-lobby-note">Mantenha esta tela aberta. A partida começa sozinha quando a conexão fechar.</p>
    </template>

    <template v-else-if="step === 'join'">
      <h3>Entrando na sala {{ roomCode }}</h3>
      <p class="message" role="status">{{ status }}</p>
      <p class="pn-lobby-note">Isso leva alguns segundos. Se não achar a sala, confira o código com o seu amigo.</p>
    </template>

    <template v-else-if="step === 'manual-host'">
      <h3>Códigos manuais · criar sala</h3>
      <p v-if="busy && !myCode" class="message" role="status">{{ busy }}</p>
      <template v-if="myCode">
        <ol class="pn-lobby-steps">
          <li>Mande o código abaixo para o seu amigo.</li>
          <li>Ele cola, toca em «Gerar resposta» e te devolve outro código.</li>
          <li>Cole a resposta dele aqui e toque em «Conectar».</li>
        </ol>
        <label class="pn-code-label" for="pvp-my-code">Seu código de convite</label>
        <textarea id="pvp-my-code" class="pn-code" readonly rows="3" :value="myCode" @focus="($event.target as HTMLTextAreaElement).select()"></textarea>
        <div class="pn-lobby-actions row">
          <button type="button" @click="copy(myCode)">{{ copied ? 'Copiado!' : 'Copiar' }}</button>
          <button v-if="canShare" type="button" @click="share(myCode)">Compartilhar</button>
        </div>
        <label class="pn-code-label" for="pvp-paste">Código de resposta do amigo</label>
        <textarea id="pvp-paste" v-model="pasted" class="pn-code" rows="3" placeholder="Cole aqui o código que ele devolveu" :disabled="waiting"></textarea>
        <button type="button" class="primary" :disabled="waiting || busy !== '' || pasted.trim() === ''" @click="manualConnect">{{ waiting ? 'Conectando…' : 'Conectar' }}</button>
        <p v-if="waiting" class="message" role="status">Aguardando a conexão com o amigo… os dois precisam estar com esta tela aberta.</p>
      </template>
    </template>

    <template v-else>
      <h3>Códigos manuais · entrar</h3>
      <template v-if="!myCode">
        <label class="pn-code-label" for="pvp-paste-offer">Código de convite do anfitrião</label>
        <textarea id="pvp-paste-offer" v-model="pasted" class="pn-code" rows="3" placeholder="Cole aqui o código que seu amigo mandou"></textarea>
        <button type="button" class="primary" :disabled="busy !== '' || pasted.trim() === ''" @click="manualAnswer">{{ busy || 'Gerar resposta' }}</button>
      </template>
      <template v-else>
        <ol class="pn-lobby-steps">
          <li>Mande este código de resposta para o anfitrião.</li>
          <li>Deixe esta tela aberta: a conexão abre sozinha quando ele colar.</li>
        </ol>
        <label class="pn-code-label" for="pvp-my-answer">Seu código de resposta</label>
        <textarea id="pvp-my-answer" class="pn-code" readonly rows="3" :value="myCode" @focus="($event.target as HTMLTextAreaElement).select()"></textarea>
        <div class="pn-lobby-actions row">
          <button type="button" @click="copy(myCode)">{{ copied ? 'Copiado!' : 'Copiar' }}</button>
          <button v-if="canShare" type="button" @click="share(myCode)">Compartilhar</button>
        </div>
        <p v-if="waiting" class="message" role="status">Aguardando o anfitrião conectar…</p>
      </template>
    </template>

    <p v-if="error" class="message error" role="alert">{{ error }}</p>
    <p v-if="diag && (step === 'host' || step === 'join' || error)" class="pn-diag">
      <span>Diagnóstico: <code>{{ diag }}</code></span>
      <button type="button" class="pn-link" @click="copyDiag">{{ diagCopied ? 'Copiado!' : 'Copiar diagnóstico' }}</button>
    </p>
    <button v-if="step !== 'choose'" type="button" class="pn-link" @click="reset">Cancelar e voltar</button>
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

.pn-lobby-sub {
  margin: 4px 0 0;
  font-size: 0.9rem;
}

.pn-lobby-link {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--muted);
  font-size: 0.8rem;
}

.pn-lobby-link .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #c98a2e;
  flex: none;
}

.pn-lobby-link.on .dot {
  background: #3fae5a;
}

.pn-rooms {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.pn-rooms button {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: 'name go' 'note go';
  align-items: center;
  gap: 0 10px;
  text-align: left;
}

.pn-rooms strong {
  grid-area: name;
}

.pn-rooms small {
  grid-area: note;
  color: var(--muted);
}

.pn-room-go {
  grid-area: go;
  font-weight: 700;
  color: var(--gold);
}

.pn-room-input {
  width: 100%;
  padding: 10px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font: 700 1.1rem ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  text-align: center;
}

.pn-room-tag {
  margin-left: 6px;
  font: 700 0.75rem ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.1em;
  color: var(--muted);
}

.pn-diag {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 8px;
  margin: 0;
  color: var(--muted);
  font-size: 0.72rem;
}

.pn-diag code {
  font: 0.72rem ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all;
}

.pn-room-code {
  margin: 0;
  text-align: center;
  font: 800 2.4rem ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.3em;
  padding-left: 0.3em;
}
</style>
