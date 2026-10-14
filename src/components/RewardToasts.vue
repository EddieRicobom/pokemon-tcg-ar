<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';
import { dismissReward, rewardFeed } from '../app/trainer-store';

const SHOW_MS = 3800;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

// Cada aviso sai sozinho depois de alguns segundos.
watch(
  rewardFeed,
  (items) => {
    for (const item of items) {
      if (timers.has(item.key)) continue;
      timers.set(item.key, setTimeout(() => {
        timers.delete(item.key);
        dismissReward(item.key);
      }, SHOW_MS));
    }
  },
  { deep: true, immediate: true },
);

onBeforeUnmount(() => {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
});
</script>

<template>
  <div class="reward-toasts" role="status" aria-live="polite">
    <p v-for="item in rewardFeed" :key="item.key" class="reward" :class="'tone-' + item.reward.tone">
      <strong>{{ item.reward.text }}</strong>
      <small v-if="item.reward.sub">{{ item.reward.sub }}</small>
    </p>
  </div>
</template>
