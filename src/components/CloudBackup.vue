<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { buildFullBackup, parseBackupBytes, serializeBackupZip } from '../app/backup';
import type { BackupFile } from '../app/backup';
import { DriveBackup } from '../app/drive-backup';
import type { CloudCopy } from '../app/drive-backup';
import { connectDrive, prepareDriveLogin, revokeDrive } from '../app/drive-login';
const emit = defineEmits<{ restore: [file: BackupFile] }>();
const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? '';
const ready = ref(false), connected = ref(false), busy = ref(''), status = ref(''), error = ref('');
const copies = ref<CloudCopy[]>([]);
let credentials: { token: string; expiresAt: number } | null = null;
const abort = new AbortController();
let active = true;
onBeforeUnmount(() => { active = false; credentials = null; abort.abort(); });
async function run(label: string, action: () => Promise<void>): Promise<void> {
  if (busy.value) return;
  busy.value = label; error.value = ''; status.value = '';
  try { await action(); } catch (cause) { if (active) error.value = cause instanceof Error ? cause.message : 'Não consegui acessar o Google Drive.'; }
  finally { if (active) busy.value = ''; }
}
function service(): DriveBackup {
  if (!credentials || Date.now() >= credentials.expiresAt) { connected.value = false; credentials = null; throw new Error('Conecte ao Google Drive novamente para continuar.'); }
  return new DriveBackup(credentials.token, fetch, abort.signal);
}
function prepare(): void { void run('Preparando login…', async () => { await prepareDriveLogin(); if (active) ready.value = true; }); }
function connect(): void {
  // A chamada do SDK começa no próprio gesto, antes de qualquer await.
  if (busy.value) return;
  const pending = connectDrive(clientId);
  void run('Conectando…', async () => { const result = await pending; if (!active) return; credentials = result; connected.value = true; copies.value = await service().list(); });
}
function refresh(): void { void run('Buscando cópias…', async () => { copies.value = await service().list(); }); }
function send(): void {
  void run('Preparando e enviando backup…', async () => {
    const drive = service();
    const bytes = serializeBackupZip(await buildFullBackup());
    await drive.upload(bytes);
    if (!active) return;
    status.value = 'Backup enviado. As cópias anteriores foram mantidas.';
    copies.value = await drive.list();
  });
}
function restore(copy: CloudCopy): void {
  void run('Baixando e validando backup…', async () => {
    const parsed = parseBackupBytes(await service().download(copy.id));
    if (typeof parsed === 'string') throw new Error('O arquivo na nuvem está corrompido, incompleto ou é incompatível. Nada foi restaurado.');
    if (active) { emit('restore', parsed); status.value = 'Arquivo validado. Confira a confirmação de restauração abaixo.'; }
  });
}
function disconnect(): void { if (credentials) revokeDrive(credentials.token); credentials = null; connected.value = false; copies.value = []; status.value = 'Desconectado neste aparelho.'; }
function date(iso: string): string { const value = new Date(iso); return Number.isNaN(value.getTime()) ? 'Data não informada' : value.toLocaleString('pt-BR'); }
</script>

<template>
  <section class="cloud-backup" aria-labelledby="cloud-backup-title">
    <h3 id="cloud-backup-title">Backup no Google Drive</h3>
    <p class="note">Guarde uma cópia completa na sua conta e restaure em outro aparelho. Cada envio cria uma cópia por data; não há sincronização automática nem substituição silenciosa.</p>
    <p v-if="!clientId" class="note">O backup em nuvem ainda precisa ser habilitado pelo responsável pelo app. Baixar e importar backups locais continua disponível.</p>
    <template v-else>
      <p class="note">O Google recebe seu backup. A permissão permite acessar somente a pasta privada deste app no Drive. A autorização fica apenas nesta sessão.</p>
      <div class="cloud-actions">
        <button v-if="!ready" type="button" :disabled="!!busy" @click="prepare">Preparar login Google</button>
        <button v-else-if="!connected" type="button" :disabled="!!busy" @click="connect">Conectar ao Google Drive</button>
        <template v-else>
          <button type="button" :disabled="!!busy" @click="send">Enviar backup agora</button>
          <button type="button" :disabled="!!busy" @click="refresh">Atualizar lista</button>
          <button type="button" :disabled="!!busy" @click="disconnect">Desconectar Google Drive</button>
        </template>
      </div>
      <p v-if="busy" role="status">{{ busy }}</p>
      <p v-if="status" role="status">{{ status }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <template v-if="connected">
        <p class="note">Até 20 cópias recentes. Cópias antigas permanecem na conta e usam seu espaço do Drive.</p>
        <ul v-if="copies.length" class="cloud-copies">
          <li v-for="copy in copies" :key="copy.id">
            <span><strong>{{ date(copy.modifiedTime) }}</strong><small>{{ (copy.size / 1024 / 1024).toFixed(2) }} MB</small></span>
            <button type="button" :disabled="!!busy" :aria-label="`Restaurar backup de ${date(copy.modifiedTime)}`" @click="restore(copy)">Restaurar…</button>
          </li>
        </ul>
        <p v-else-if="!busy" class="note">Nenhum backup completo encontrado nesta conta. Envie sua primeira cópia.</p>
      </template>
    </template>
  </section>
</template>

<style scoped>
.cloud-backup { margin-top: 1.2rem; padding-top: 1rem; border-top: 1px solid var(--line); }
.cloud-backup h3 { margin: 0 0 .6rem; }
.cloud-actions { display: flex; flex-wrap: wrap; gap: .6rem; }
.cloud-copies { list-style: none; padding: 0; display: grid; gap: .65rem; max-height: min(45dvh, 24rem); overflow-y: auto; overscroll-behavior: contain; }
.cloud-copies li { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .5rem; padding: .7rem; border: 1px solid var(--line); border-radius: var(--radius-sm); }
.cloud-copies span { display: grid; gap: .3rem; }
.cloud-copies small { color: var(--muted); }
</style>
