<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { addCoins } from '../app/wallet';
import { getOrientationFeed, requestOrientationPermission } from '../sensors/orientation-feed';
import { Quaternion, Vector3 } from 'three';

const emit = defineEmits<{ leave: [] }>();

const feed = getOrientationFeed();
const phase = ref<'idle' | 'starting' | 'playing' | 'ended'>('idle');
const message = ref('Incline o celular devagar para manter a Pokébola na ponta da Honedge.');
const elapsed = ref(0);
const reward = ref(0);
const tilt = ref({ x: 0, y: 0 });
const ball = ref({ x: 0, y: 0 });
let frame = 0;
let last = 0;
let startedAt = 0;
let base: Quaternion | null = null;
let velocity = { x: 0, y: 0 };
let sensorWaitTimer = 0;

function stopLoop(): void {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  if (sensorWaitTimer) window.clearTimeout(sensorWaitTimer);
  sensorWaitTimer = 0;
  feed.release();
}

function finish(text: string): void {
  if (phase.value !== 'playing' && phase.value !== 'starting') return;
  phase.value = 'ended';
  const seconds = Math.floor(elapsed.value);
  reward.value = Math.max(0, Math.floor(seconds / 5));
  if (reward.value > 0) addCoins(reward.value);
  message.value = `${text} Você segurou por ${seconds}s e ganhou ${reward.value} moeda${reward.value === 1 ? '' : 's'}.`;
  stopLoop();
}

function tick(now: number): void {
  if (phase.value !== 'playing') return;
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  elapsed.value = (now - startedAt) / 1000;
  const sample = feed.latest();
  if (sample) {
    if (sensorWaitTimer) {
      window.clearTimeout(sensorWaitTimer);
      sensorWaitTimer = 0;
    }
    if (!base) base = sample.q.clone();
    const relative = base.clone().invert().multiply(sample.q);
    const up = new Vector3(0, 1, 0).applyQuaternion(relative);
    // Aumenta a resposta: movimentos pequenos precisam ser corrigidos pelo jogador, como numa espada de verdade.
    const tx = Math.max(-2.2, Math.min(2.2, up.x * 3.8));
    const ty = Math.max(-2.2, Math.min(2.2, up.z * 3.8));
    tilt.value = { x: tx, y: ty };
    velocity.x = (velocity.x + tx * 8.2 * dt) * Math.pow(0.32, dt);
    velocity.y = (velocity.y + ty * 8.2 * dt) * Math.pow(0.32, dt);
    ball.value.x += velocity.x * dt;
    ball.value.y += velocity.y * dt;
  }
  const distance = Math.hypot(ball.value.x, ball.value.y);
  if (distance > 1.38) finish('A Pokébola caiu da ponta!');
  else frame = requestAnimationFrame(tick);
}

async function start(): Promise<void> {
  if (phase.value === 'starting' || phase.value === 'playing') return;
  phase.value = 'starting';
  message.value = 'Pedindo acesso aos sensores…';
  const permission = await requestOrientationPermission();
  if (permission === 'unsupported') {
    phase.value = 'idle';
    message.value = 'Este navegador não oferece orientação do aparelho. Abra a Vila em um celular compatível para jogar.';
    return;
  }
  if (permission === 'denied') {
    phase.value = 'idle';
    message.value = 'O acesso aos sensores foi recusado. Permita Movimento e Orientação para jogar.';
    return;
  }
  feed.acquire();
  base = null;
  ball.value = { x: 0, y: 0 };
  velocity = { x: 0, y: 0 };
  elapsed.value = 0;
  reward.value = 0;
  startedAt = performance.now();
  last = startedAt;
  phase.value = 'playing';
  message.value = 'Equilibre a Pokébola. Inclinações rápidas fazem a espada perder o equilíbrio.';
  sensorWaitTimer = window.setTimeout(() => {
    if (phase.value === 'playing' && !feed.hasSamples) {
      phase.value = 'idle';
      message.value = 'O aparelho não enviou dados de orientação. Confira a permissão de movimento e tente novamente.';
      stopLoop();
    }
  }, 2500);
  frame = requestAnimationFrame(tick);
}

function leave(): void {
  stopLoop();
  emit('leave');
}

onBeforeUnmount(stopLoop);
</script>

<template>
  <div class="balance-game card">
    <div class="balance-head">
      <div>
        <h2>⚔️ Honedge e a Pokébola</h2>
        <p class="note">Use o sensor de orientação do celular para equilibrar uma Pokébola transparente na ponta da espada.</p>
      </div>
      <strong class="balance-score">{{ elapsed.toFixed(1) }}s</strong>
    </div>
    <div class="balance-stage" :class="{ playing: phase === 'playing' }" aria-label="Área para equilibrar a Pokébola">
      <div class="balance-target" aria-hidden="true"></div>
      <div class="balance-sword" :style="{ transform: `rotate(${tilt.x * 12}deg) translateY(${tilt.y * 7}px)` }" aria-hidden="true">
        <span class="balance-eye"></span>
      </div>
      <div class="balance-ball" :style="{ transform: `translate(calc(-50% + ${ball.x * 24}px), calc(-50% + ${ball.y * 24}px))` }" aria-label="Pokébola transparente"></div>
    </div>
    <p class="balance-message">{{ message }}</p>
    <div class="balance-actions">
      <button v-if="phase === 'idle' || phase === 'ended'" type="button" class="primary" @click="start">{{ phase === 'ended' ? 'Jogar novamente' : 'Abrir sensores e jogar' }}</button>
      <button v-else type="button" @click="finish('Você encerrou o treino.')">Parar e receber moedas</button>
      <button type="button" class="link" @click="leave">Voltar ao Fliperama</button>
    </div>
    <small class="note">Recompensa: 1 moeda a cada 5 segundos completos. A queda encerra a rodada.</small>
  </div>
</template>
