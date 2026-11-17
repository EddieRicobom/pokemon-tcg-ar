import { ref } from 'vue';
import type { Reward } from '../core/trainer';

interface FeedItem {
  key: number;
  reward: Reward;
}

export const rewardFeed = ref<FeedItem[]>([]);
let seq = 0;

export function dismissReward(key: number): void {
  rewardFeed.value = rewardFeed.value.filter((item) => item.key !== key);
}

export function showRewards(rewards: readonly Reward[]): void {
  rewardFeed.value = [...rewardFeed.value, ...rewards.map((reward) => ({ key: ++seq, reward }))].slice(-6);
}

/** Mostra um aviso sem passar pelo XP (Pokédex, por exemplo). */
export function showReward(reward: Reward): void {
  showRewards([reward]);
}
