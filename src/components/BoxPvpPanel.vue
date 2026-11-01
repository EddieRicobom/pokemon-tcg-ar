<script setup lang="ts">
import { boxPvp, connectBoxPvp, leaveBoxPvp } from '../app/box-pvp-store';
import { BOX_PVP_LABELS_PT, BOX_PVP_MODES } from '../pvp/box-wire';
import { trainerSpriteUrl } from '../core/trainer-sprites';
import type { PvpPeer } from '../pvp/peer';
import PvpLobby from './PvpLobby.vue';

/** PvP da Caixa: pareamento por códigos, modo (o anfitrião escolhe) e as duas equipes. A luta acontece no visor. */
function onConnected(peer: PvpPeer, role: 'host' | 'guest'): void {
  connectBoxPvp(peer, role);
}
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
      <p class="hint">Os dois entram na Arena. {{ boxPvp.role === 'host' ? 'Depois toque em Batalhar.' : 'Quando o anfitrião começar, a luta aparece na sua Arena.' }}</p>
      <button type="button" class="link" @click="leaveBoxPvp">Sair do PvP</button>
    </template>
    <p v-if="boxPvp.notice" class="message error" role="alert">{{ boxPvp.notice }}</p>
  </div>
</template>
