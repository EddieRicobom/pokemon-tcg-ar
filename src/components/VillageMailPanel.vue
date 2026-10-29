<script setup lang="ts">
import { mailActionLabel, mailKindLabel } from '../core/village/mail';
import type { MailAction, MailState } from '../core/village/mail';

defineProps<{ mail: MailState; unread: number; nameOf: (id: string) => string }>();
const emit = defineEmits<{ read: [id: string]; readAll: []; answer: [id: string, action: MailAction] }>();
</script>

<template>
  <div class="diary village-mail-panel">
    <p class="hint">Cartas ligadas a momentos que realmente aconteceram. Os nomes abaixo são os Pokémon envolvidos no Diário; responder pode criar um novo compromisso social.</p>
    <section aria-labelledby="mail-inbox-title">
      <div class="mail-inbox-head"><h4 id="mail-inbox-title">📬 Caixa de entrada <small v-if="unread">· {{ unread }} nova(s)</small></h4><button type="button" :disabled="unread === 0" @click="emit('readAll')">Marcar todas como lidas</button></div>
      <ul v-if="mail.inbox.length" class="village-list mail-list">
        <li v-for="mail in mail.inbox.slice().reverse()" :key="mail.id" class="mail-card" :class="{ unread: !mail.read }">
          <div class="mail-card-head"><span>{{ mailKindLabel[mail.kind] }} · {{ mail.day }}</span><b v-if="!mail.read">NOVA</b></div>
          <strong>{{ mail.subject }}</strong>
          <small>De {{ mail.fromName }}<span v-if="mail.involvedIds.length"> · envolvidos: {{ mail.involvedIds.map(nameOf).join(', ') }}</span></small>
          <p>{{ mail.body }}</p>
          <div class="summary-actions mail-actions">
            <button v-if="!mail.read" type="button" @click="emit('read', mail.id)">Marcar como lida</button>
            <button v-if="mail.fromId && !mail.responded" type="button" @click="emit('answer', mail.id, 'responder')">{{ mailActionLabel('responder', mail.kind) }}</button>
            <button v-if="mail.fromId && mail.involvedIds.length > 1 && !mail.responded" type="button" @click="emit('answer', mail.id, 'ajudar')">{{ mailActionLabel('ajudar', mail.kind) }}</button>
            <button type="button" @click="emit('answer', mail.id, 'arquivar')">Guardar</button>
          </div>
        </li>
      </ul>
      <p v-else class="hint">Nenhuma carta esperando. Um momento novo entre moradores fará o carteiro voltar.</p>
    </section>
    <section v-if="mail.archive.length" aria-labelledby="mail-archive-title">
      <h4 id="mail-archive-title">🗄️ Arquivo</h4>
      <ul class="village-list mail-list archived"><li v-for="mail in mail.archive.slice().reverse().slice(0, 12)" :key="mail.id"><span><strong>{{ mail.subject }}</strong><small>{{ mail.fromName }} · {{ mail.day }}<span v-if="mail.responded"> · resposta enviada</span></small></span></li></ul>
    </section>
  </div>
</template>
