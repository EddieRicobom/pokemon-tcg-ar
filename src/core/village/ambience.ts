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

/** Um bando de pássaros cruza a tela de tempos em tempos (a primeira passagem é depois de um minuto na Vila). */
export const FLOCK_PERIOD_MS = 60_000;
export const FLOCK_CROSS_MS = 11_000;

export interface FlockBird {
  /** Posição na tela, de 0 a 1 (pode passar um pouco das bordas para entrar e sair por fora). */
  x: number;
  y: number;
  /** Batida de asa, de -1 a 1. */
  flap: number;
}

const NO_BIRDS: readonly FlockBird[] = [];
function flockHash(n: number): number {
  const value = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/** Onde está o bando neste instante, em formação de V; não guarda nada e depende só do relógio. */
export function flockBirds(now: number, count = 5): readonly FlockBird[] {
  if (!Number.isFinite(now) || now < FLOCK_PERIOD_MS) return NO_BIRDS;
  const cycle = Math.floor(now / FLOCK_PERIOD_MS);
  const elapsed = now - cycle * FLOCK_PERIOD_MS;
  if (elapsed >= FLOCK_CROSS_MS) return NO_BIRDS;
  const progress = elapsed / FLOCK_CROSS_MS;
  const forward = flockHash(cycle) < 0.5;
  const lane = 0.12 + flockHash(cycle + 1) * 0.5;
  const drift = (flockHash(cycle + 2) - 0.5) * 0.25;
  return Array.from({ length: count }, (_, i) => {
    const rank = Math.ceil(i / 2);
    const side = i % 2 === 0 ? -1 : 1;
    const x = -0.2 + progress * 1.4 - rank * 0.045;
    return { x: forward ? x : 1 - x, y: lane + drift * progress + side * rank * 0.022, flap: Math.sin(now / 95 + i * 1.3) };
  });
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
