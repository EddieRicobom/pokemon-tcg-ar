<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { PvpPeer } from '../pvp/peer';
import type { PeerState } from '../pvp/peer';

/**
 * Pareamento do PvP sem servidor: o anfitrião gera um código de convite, o amigo cola e devolve um código de resposta, e a
 * ligação abre sozinha. Quando abre, o componente entrega a ligação (`connected`) e deixa de ser dono dela.
 */
const emit = defineEmits<{ connected: [peer: PvpPeer, role: 'host' | 'guest'] }>();
const props = withDefaults(defineProps<{ purpose?: 'game' | 'backup' }>(), { purpose: 'game' });
const backupPurpose = computed(() => props.purpose === 'backup');
const lobbyTitle = computed(() => backupPurpose.value ? 'Transferir backup com um amigo' : 'Jogar contra um amigo');
const lobbyNote = computed(() => backupPurpose.value
  ? 'Crie uma sala para enviar uma cópia completa dos seus dados diretamente para outro aparelho. A conexão não usa servidor do app.'
  : '{{ lobbyNote }}');

type Step = 'choose' | 'host' | 'guest';
const step = ref<Step>('choose');
const busy = ref('');
const error = ref('');
const myCode = ref('');
const pasted = ref('');
const waiting = ref(false);
const copied = ref(false);

let peer: PvpPeer | null = null;
let handedOver = false;
let waitTimer: ReturnType<typeof setTimeout> | null = null;

const CONNECT_TIMEOUT_MS = 30000;

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
  dropPeer();
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

onBeforeUnmount(dropPeer);
</script>

<template>
  <section class="pn-card pn-lobby" :aria-label="lobbyTitle">
    <template v-if="step === 'choose'">
      <h3>{{ lobbyTitle }}</h3>
      <p class="pn-lobby-note">{{ lobbyNote }}</p>
      <p class="pn-lobby-note">
        Para achar o caminho entre os celulares, o navegador consulta servidores públicos do Google (STUN), que só veem o endereço de rede de vocês, não o jogo.
        Na mesma rede Wi-Fi funciona melhor; em algumas operadoras a conexão pode não fechar.
      </p>
      <div class="pn-lobby-actions">
        <button type="button" class="primary" @click="createRoom">Criar sala</button>
        <button type="button" @click="joinRoom">Entrar na sala de um amigo</button>
      </div>
    </template>

    <template v-else-if="step === 'host'">
      <h3>{{ backupPurpose ? 'Criar sala de transferência' : 'Criar sala' }}</h3>
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
          <button type="button" @click="copy">{{ copied ? 'Copiado!' : 'Copiar' }}</button>
          <button v-if="canShare" type="button" @click="share">Compartilhar</button>
        </div>
        <label class="pn-code-label" for="pvp-paste">Código de resposta do amigo</label>
        <textarea id="pvp-paste" v-model="pasted" class="pn-code" rows="3" placeholder="Cole aqui o código que ele devolveu" :disabled="waiting"></textarea>
        <button type="button" class="primary" :disabled="waiting || busy !== '' || pasted.trim() === ''" @click="connectHost">{{ waiting ? 'Conectando…' : 'Conectar' }}</button>
        <p v-if="waiting" class="message" role="status">Aguardando a conexão com o amigo… os dois precisam estar com esta tela aberta.</p>
      </template>
    </template>

    <template v-else>
      <h3>{{ backupPurpose ? 'Entrar na sala de transferência' : 'Entrar na sala' }}</h3>
      <template v-if="!myCode">
        <label class="pn-code-label" for="pvp-paste-offer">Código de convite do anfitrião</label>
        <textarea id="pvp-paste-offer" v-model="pasted" class="pn-code" rows="3" placeholder="Cole aqui o código que seu amigo mandou"></textarea>
        <button type="button" class="primary" :disabled="busy !== '' || pasted.trim() === ''" @click="makeAnswer">{{ busy || 'Gerar resposta' }}</button>
      </template>
      <template v-else>
        <ol class="pn-lobby-steps">
          <li>Mande este código de resposta para o anfitrião.</li>
          <li>Deixe esta tela aberta: a conexão abre sozinha quando ele colar.</li>
        </ol>
        <label class="pn-code-label" for="pvp-my-answer">Seu código de resposta</label>
        <textarea id="pvp-my-answer" class="pn-code" readonly rows="3" :value="myCode" @focus="($event.target as HTMLTextAreaElement).select()"></textarea>
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
