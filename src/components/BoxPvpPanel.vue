<script setup lang="ts">
import { computed } from 'vue';
import { boxPvp, connectBoxPvp, leaveBoxPvp } from '../app/box-pvp-store';
import { BOX_PVP_LABELS_PT, BOX_PVP_MODES } from '../pvp/box-wire';
import { trainerSpriteUrl } from '../core/trainer-sprites';
import type { PvpPeer } from '../pvp/peer';
import PvpLobby from './PvpLobby.vue';

/** PvP da Caixa: pareamento por códigos, modo (o anfitrião escolhe) e as duas equipes. A luta acontece no visor. */
function onConnected(peer: PvpPeer, role: 'host' | 'guest'): void {
  connectBoxPvp(peer, role);
}

/** O que fazer agora, por papel: quem precisa agir e quem só espera (e o que o outro precisa fazer). */
const nextStep = computed<{ text: string; mine: boolean }>(() => {
  const friend = boxPvp.friend?.name ?? 'O amigo';
  if (boxPvp.role === 'host') {
    if (!boxPvp.mine) return { text: 'a sua equipe ainda está sendo montada na Arena. Entre na Arena 3D (botão de voltar à Arena) e ela aparece aqui.', mine: true };
    if (!boxPvp.friend) return { text: `${friend} ainda não mandou a equipe: ele precisa abrir a Arena. Você não precisa fazer nada agora.`, mine: false };
    return { text: 'as duas equipes estão prontas. Escolha o modo acima e toque em «Batalhar» na Arena: a luta começa nos dois celulares ao mesmo tempo.', mine: true };
  }
  if (!boxPvp.mine) return { text: 'a sua equipe ainda está sendo montada na Arena. Entre na Arena 3D e ela aparece aqui.', mine: true };
  if (!boxPvp.friend) return { text: 'o anfitrião ainda não mandou a equipe dele. Você não precisa fazer nada agora.', mine: false };
  return { text: 'tudo pronto. Fique na Arena: o anfitrião toca em «Batalhar» e a luta começa sozinha na sua tela, junto com a dele.', mine: false };
});
</script>

<template>
  <div class="box-pvp">
    <PvpLobby v-if="!boxPvp.peer" game="box" note="Arena · batalha 1x1, 3x3 ou 6x6" @connected="onConnected" />
    <template v-else>
      <p class="box-pvp-state">
        <strong>Conectado com {{ boxPvp.friend?.name ?? 'o amigo' }}</strong>
        ({{ boxPvp.role === 'host' ? 'você é o anfitrião e escolhe o modo' : 'o anfitrião escolhe o modo e começa' }})
      </p>
      <div class="chips" role="group" aria-label="Modo do PvP">
        <button
          v-for="m in BOX_PVP_MODES"
          :key="m"
          type="button"
          :class="{ active: boxPvp.mode === m }"
          :aria-pressed="boxPvp.mode === m"
          :disabled="boxPvp.role !== 'host'"
          @click="boxPvp.mode = m"
        >{{ BOX_PVP_LABELS_PT[m].title }}</button>
      </div>
      <p class="hint">{{ BOX_PVP_LABELS_PT[boxPvp.mode].hint }}</p>
      <div class="box-pvp-teams">
        <div v-for="(side, k) in (boxPvp.role === 'host' ? [boxPvp.mine, boxPvp.friend] : [boxPvp.friend, boxPvp.mine])" :key="k" class="box-pvp-team">
          <template v-if="side">
            <img :src="trainerSpriteUrl(side.trainer)" alt="" width="56" height="56" />
            <strong>{{ side.name }}</strong>
            <small>{{ side.mons.map((m) => m.name).join(', ') }}</small>
          </template>
          <small v-else>Esperando a equipe…</small>
        </div>
      </div>
      <p class="hint box-pvp-next" role="status" aria-live="polite">
        <strong>{{ nextStep.mine ? 'Sua vez de agir:' : 'Aguarde um instante:' }}</strong> {{ nextStep.text }}
      </p>
      <button type="button" class="link" @click="leaveBoxPvp">Sair do PvP</button>
    </template>
    <p v-if="boxPvp.notice" class="message error" role="alert">{{ boxPvp.notice }}</p>
  </div>
</template>
