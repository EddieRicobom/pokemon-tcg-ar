import type { Friendship } from './life';

/** Quanto tempo o arco-íris fica no céu depois que a chuva passa. */
export const RAINBOW_MS = 45_000;
const RAINBOW_IN_MS = 4_000;
const RAINBOW_OUT_MS = 9_000;

/** Opacidade (0 a 1) do arco-íris `elapsed` ms depois de surgir: entra devagar, fica e some devagar. */
export function rainbowAlpha(elapsed: number): number {
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= RAINBOW_MS) return 0;
  return Math.min(1, elapsed / RAINBOW_IN_MS, (RAINBOW_MS - elapsed) / RAINBOW_OUT_MS);
}

/** Depois da primeira saudação, o morador espera um pouco para acenar de novo. */
export const GREETING_COOLDOWN_MS = 30_000;

/**
 * O que o morador mostra quando você passa perto: 🎁 se o pedido de hoje está em aberto, 👋 se ainda não conversaram
 * hoje. Assim dá para ver no mapa quem tem algo a oferecer sem abrir menu nenhum; depois disso ele fica na dele.
 */
export function residentGreeting(friend: Pick<Friendship, 'lastTalk' | 'request'> | undefined, day: string): string | null {
  if (friend?.request && friend.request.day === day && !friend.request.done) return '🎁';
  return friend?.lastTalk === day ? null : '👋';
}
