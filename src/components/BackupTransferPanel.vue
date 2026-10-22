<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';
import PvpLobby from './PvpLobby.vue';
import type { PvpPeer } from '../pvp/peer';
import type { WireMessage } from '../pvp/wire';
import { decodeBackupChunk, joinBackupChunks, splitBackupBytes } from '../pvp/backup-transfer';
import { applyFullBackup, backupFileName, buildFullBackup, parseBackupBytes, serializeBackupZip } from '../app/backup';
import type { BackupFile, BackupProgress } from '../app/backup';

type TransferRole = 'host' | 'guest';
type TransferProgress = { value: number; label: string };
type IncomingTransfer = {
  id: string;
  name: string;
  bytes: number;
  chunks: number;
  data: (string | undefined)[];
  receivedBytes: number;
};

const peer = shallowRef<PvpPeer | null>(null);
const role = ref<TransferRole | null>(null);
const status = ref('');
const error = ref('');
const busy = ref(false);
const progress = ref<TransferProgress | null>(null);
const pendingImport = shallowRef<BackupFile | null>(null);
const connected = computed(() => peer.value?.state === 'open');
const incomingProgress = computed(() => incoming.value ? Math.round((incoming.value.receivedBytes / incoming.value.bytes) * 100) : 0);

let incoming: IncomingTransfer | null = null;
let outgoingId = '';

function makeTransferId(): string {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  return uuid.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 70);
}

function yieldToScreen(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setBackupProgress(value: number, label: string): void {
  progress.value = { value: Math.max(0, Math.min(100, Math.round(value))), label };
}

function updateBuildProgress(item: BackupProgress): void {
  const ratio = item.total > 0 ? Math.min(1, item.current / item.total) : 0;
  const value = item.phase === 'storage' ? 5
    : item.phase === 'cards' ? 12
    : item.phase === 'records' ? 20
    : item.phase === 'metadata' ? 28
    : item.phase === 'assets' ? 30 + Math.round(ratio * 30)
    : item.phase === 'complete' ? 62
    : 5;
  const label = item.phase === 'assets' ? 'Lendo arquivos locais…' : item.phase === 'cards' ? 'Lendo cartas reconhecidas…' : 'Preparando o backup…';
  setBackupProgress(value, label);
}

function updateRestoreProgress(item: BackupProgress): void {
  const ratio = item.total > 0 ? Math.min(1, item.current / item.total) : 0;
  const value = item.phase === 'writing' ? 10 + Math.round(ratio * 85) : item.phase === 'complete' ? 98 : 8;
  setBackupProgress(value, item.phase === 'writing' ? 'Restaurando os dados recebidos…' : 'Verificando o backup recebido…');
}

function detachPeer(): void {
  if (!peer.value) return;
  peer.value.onMessage = null;
  peer.value.onState = null;
  peer.value.close();
  peer.value = null;
}

function onConnected(next: PvpPeer, nextRole: TransferRole): void {
  detachPeer();
  peer.value = next;
  role.value = nextRole;
  error.value = '';
  status.value = 'Sala conectada. Você pode enviar um backup completo para o outro aparelho.';
  next.onMessage = (message) => { void handleMessage(message); };
  next.onState = (state) => {
    if (state === 'closed') {
      status.value = '';
      error.value = 'A conexão foi encerrada. Crie uma sala nova para transferir outro backup.';
      incoming = null;
      progress.value = null;
    }
  };
}

function failIncoming(message: string): void {
  const id = incoming?.id;
  if (id) peer.value?.send({ t: 'backup-failed', id, reason: message });
  incoming = null;
  progress.value = null;
  error.value = message;
}

function receiveOffer(message: Extract<WireMessage, { t: 'backup-offer' }>): void {
  if (incoming || pendingImport.value || busy.value) {
    peer.value?.send({ t: 'backup-failed', id: message.id, reason: 'Este aparelho já está processando outro backup.' });
    return;
  }
  incoming = { id: message.id, name: message.name, bytes: message.bytes, chunks: message.chunks, data: Array.from({ length: message.chunks }), receivedBytes: 0 };
  error.value = '';
  setBackupProgress(0, 'Recebendo ' + message.name + '…');
  status.value = 'O backup está sendo transferido. Seus dados atuais continuam intactos até a confirmação.';
}

function receiveChunk(message: Extract<WireMessage, { t: 'backup-chunk' }>): void {
  if (!incoming || message.id !== incoming.id || message.total !== incoming.chunks || message.index >= incoming.chunks) return;
  if (incoming.data[message.index] !== undefined) return;
  const decoded = decodeBackupChunk(message.data);
  if (!decoded || incoming.receivedBytes + decoded.byteLength > incoming.bytes) {
    failIncoming('O backup recebido está corrompido ou excede o tamanho permitido.');
    return;
  }
  incoming.data[message.index] = message.data;
  incoming.receivedBytes += decoded.byteLength;
  setBackupProgress(incomingProgress.value * 0.9, 'Recebendo backup… ' + incomingProgress.value + '%');
}

function finishIncoming(message: Extract<WireMessage, { t: 'backup-end' }>): void {
  if (!incoming || message.id !== incoming.id) return;
  const current = incoming;
  const bytes = joinBackupChunks(current.data, current.bytes, current.chunks);
  if (!bytes) {
    failIncoming('Não foi possível remontar todos os fragmentos do backup.');
    return;
  }
  const parsed = parseBackupBytes(bytes);
  if (typeof parsed === 'string') {
    failIncoming('O backup chegou, mas falhou na verificação de integridade.');
    return;
  }
  incoming = null;
  pendingImport.value = parsed;
  setBackupProgress(100, 'Backup recebido e conferido.');
  status.value = 'Backup recebido. Confirme a substituição somente se este for o aparelho de destino.';
  peer.value?.send({ t: 'backup-received', id: current.id });
}

function handleMessage(message: WireMessage): void {
  switch (message.t) {
    case 'backup-offer': receiveOffer(message); break;
    case 'backup-chunk': receiveChunk(message); break;
    case 'backup-end': finishIncoming(message); break;
    case 'backup-received':
      if (message.id === outgoingId) {
        busy.value = false;
        setBackupProgress(100, 'Backup recebido e validado pelo outro aparelho.');
        status.value = 'O outro aparelho recebeu e validou o backup. Ele ainda precisa confirmar a substituição.';
      }
      break;
    case 'backup-failed':
      if (message.id === outgoingId) {
        busy.value = false;
        progress.value = null;
        error.value = 'O outro aparelho recusou o backup: ' + message.reason;
      }
      break;
    default: break;
  }
}

async function sendBackup(): Promise<void> {
  const currentPeer = peer.value;
  if (!currentPeer || currentPeer.state !== 'open' || busy.value) return;
  busy.value = true;
  error.value = '';
  setBackupProgress(2, 'Lendo o progresso deste aparelho…');
  await yieldToScreen();
  try {
    const file = await buildFullBackup(localStorage, undefined, updateBuildProgress);
    setBackupProgress(66, 'Compactando o backup…');
    await yieldToScreen();
    const zip = serializeBackupZip(file);
    const chunks = splitBackupBytes(zip);
    const id = makeTransferId();
    outgoingId = id;
    if (!currentPeer.send({ t: 'backup-offer', id, name: backupFileName(), bytes: zip.byteLength, chunks: chunks.length })) throw new Error('conexão fechada');
    for (const [index, data] of chunks.entries()) {
      await currentPeer.waitForBuffer();
      if (!currentPeer.send({ t: 'backup-chunk', id, index, total: chunks.length, data })) throw new Error('conexão fechada');
      setBackupProgress(66 + Math.round(((index + 1) / chunks.length) * 31), 'Enviando backup… ' + (index + 1) + '/' + chunks.length);
      await yieldToScreen();
    }
    if (!currentPeer.send({ t: 'backup-end', id })) throw new Error('conexão fechada');
    setBackupProgress(98, 'Aguardando conferência do outro aparelho…');
    status.value = 'Backup enviado. A outra pessoa precisa conferir e confirmar a substituição.';
  } catch {
    progress.value = null;
    error.value = 'Não consegui enviar o backup. Confira a conexão e tente novamente.';
  } finally {
    busy.value = false;
  }
}

function backupDateLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'data desconhecida' : date.toLocaleString('pt-BR');
}

async function confirmImport(): Promise<void> {
  const file = pendingImport.value;
  if (!file || busy.value) return;
  busy.value = true;
  error.value = '';
  setBackupProgress(3, 'Preparando a substituição…');
  await yieldToScreen();
  try {
    await applyFullBackup(file, localStorage, updateRestoreProgress);
    pendingImport.value = null;
    status.value = 'Dados substituídos com sucesso. Recarregando o app…';
    window.location.reload();
  } catch {
    busy.value = false;
    progress.value = null;
    error.value = 'Não consegui restaurar todos os dados. Os dados anteriores foram preservados.';
  }
}

function cancelImport(): void {
  pendingImport.value = null;
  progress.value = null;
  status.value = 'Transferência cancelada. Seus dados atuais foram mantidos.';
}

onBeforeUnmount(detachPeer);
</script>

<template>
  <section class="backup-transfer" aria-labelledby="backup-transfer-title">
    <h3 id="backup-transfer-title">Sala de transferência P2P</h3>
    <p class="note">Transfira um backup completo diretamente entre dois aparelhos. Nada é enviado para um servidor do app. A substituição só acontece depois da confirmação no aparelho que recebe.</p>
    <PvpLobby v-if="!connected" purpose="backup" @connected="onConnected" />
    <div v-else class="backup-transfer-connected">
      <p class="note" role="status">Conectado como {{ role === 'host' ? 'anfitrião' : 'convidado' }}.</p>
      <button type="button" class="primary" :disabled="busy" @click="sendBackup">{{ busy ? 'Enviando…' : 'Enviar backup para o outro aparelho' }}</button>
    </div>
    <div v-if="progress" class="backup-transfer-progress" role="status" aria-live="polite">
      <progress max="100" :value="progress.value">{{ progress.value }}%</progress>
      <span>{{ progress.label }} {{ progress.value }}%</span>
    </div>
    <p v-if="status" class="note" role="status">{{ status }}</p>
    <p v-if="error" class="note erro" role="alert">{{ error }}</p>
    <div v-if="pendingImport" class="card backup-transfer-confirm">
      <strong>Backup recebido: substituir os dados deste aparelho?</strong>
      <p class="note">Arquivo de {{ backupDateLabel(pendingImport.exportedAt) }}. Esta ação substitui progresso, ajustes, coleção e arquivos locais pelo conteúdo recebido.</p>
      <div class="backup-transfer-actions">
        <button type="button" class="primary" :disabled="busy" @click="confirmImport">Confirmar e substituir</button>
        <button type="button" :disabled="busy" @click="cancelImport">Manter meus dados</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.backup-transfer { display: grid; gap: 10px; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--line); }
.backup-transfer h3 { margin: 0; }
.backup-transfer-connected { display: grid; gap: 8px; }
.backup-transfer-progress { display: grid; gap: 5px; }
.backup-transfer-progress progress { width: 100%; height: 10px; accent-color: #3976c9; }
.backup-transfer-progress span { color: var(--muted); font-size: .78rem; }
.backup-transfer-confirm { display: grid; gap: 8px; border: 2px solid #c9782e; background: #fff9ed; }
.backup-transfer-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
</style>
