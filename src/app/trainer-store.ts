import { ref } from 'vue';
import { applyEvent, dayKey, emptyTrainer, importHistory, normalizeTrainer } from '../core/trainer';
import { addCoins } from './wallet';
import type { Reward, TrainerEvent, TrainerState } from '../core/trainer';

const KEY = 'tcg-ar-trainer-v1';

function read(): TrainerState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeTrainer(JSON.parse(raw)) : emptyTrainer();
  } catch {
    return emptyTrainer();
  }
}

function write(state: TrainerState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Só não lembra do progresso se o armazenamento estiver cheio ou bloqueado.
  }
}

/** Progresso do Treinador (XP, sequência, missões, conquistas), só neste aparelho. */
export const trainer = ref<TrainerState>(read());

export interface FeedItem {
  key: number;
  reward: Reward;
}

/** Recompensas recém-ganhas, para a faixa de avisos; cada uma sai sozinha (`dismissReward`). */
export const rewardFeed = ref<FeedItem[]>([]);
let seq = 0;

export function dismissReward(key: number): void {
  rewardFeed.value = rewardFeed.value.filter((item) => item.key !== key);
}

/** Registra um feito (carta lida, batalha, minigame) e devolve o que foi ganho. */
export function recordEvent(event: TrainerEvent, now: Date = new Date()): Reward[] {
  const before = trainer.value.xp;
  const { state, rewards } = applyEvent(trainer.value, event, dayKey(now));
  trainer.value = state;
  write(state);
  // Saldo único: o que antes virava energia do Treinador (o XP ganho) agora vira moedas.
  addCoins(state.xp - before);
  // Mais de 4 avisos de uma vez viram bagunça: os mais importantes (nível, conquista, missão) vêm primeiro.
  const rank: Record<Reward['tone'], number> = { level: 0, achievement: 1, mission: 2, streak: 3, new: 4, xp: 5 };
  const shown = [...rewards].sort((a, b) => rank[a.tone] - rank[b.tone]).slice(0, 4);
  rewardFeed.value = [...rewardFeed.value, ...shown.map((reward) => ({ key: ++seq, reward }))].slice(-6);
  return rewards;
}

/** Traz as cartas que já estavam guardadas (sem dar XP por elas). Seguro de chamar mais de uma vez. */
export function syncTrainerHistory(cards: Parameters<typeof importHistory>[1], now: Date = new Date()): void {
  const next = importHistory(trainer.value, cards, dayKey(now));
  if (JSON.stringify(next) === JSON.stringify(trainer.value)) return;
  trainer.value = next;
  write(next);
}

/** Só para testes. */
export function resetTrainerForTests(): void {
  trainer.value = emptyTrainer();
  rewardFeed.value = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Sem armazenamento: nada a limpar.
  }
}
