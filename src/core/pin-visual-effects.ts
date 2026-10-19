import { TERRAIN_KINDS } from './terrain';
import type { TerrainKind } from './terrain';

export type ElementalBurstShape = 'flame' | 'splash' | 'leaf' | 'ice' | 'lightning' | 'rock' | 'bubble' | 'rune' | 'shadow' | 'petal';

export interface ElementalBurstProfile {
  shape: ElementalBurstShape;
  particles: number;
  rings: number;
}

/** Direção de arte dos impactos elementais: partículas e anéis por marca do terreno. */
export const ELEMENTAL_BURST_PROFILES: Record<TerrainKind, ElementalBurstProfile> = {
  scorch: { shape: 'flame', particles: 9, rings: 2 },
  puddle: { shape: 'splash', particles: 10, rings: 3 },
  thicket: { shape: 'leaf', particles: 8, rings: 1 },
  frost: { shape: 'ice', particles: 8, rings: 2 },
  static: { shape: 'lightning', particles: 7, rings: 2 },
  crack: { shape: 'rock', particles: 8, rings: 1 },
  rubble: { shape: 'rock', particles: 10, rings: 1 },
  toxic: { shape: 'bubble', particles: 9, rings: 2 },
  psy: { shape: 'rune', particles: 8, rings: 3 },
  shade: { shape: 'shadow', particles: 8, rings: 2 },
  bloom: { shape: 'petal', particles: 10, rings: 2 },
};

/** Progresso seguro para a animação do canvas; no movimento reduzido os impactos ficam estáticos e discretos. */
export function elementalBurstFrame(age: number, life: number, reducedMotion = false): { progress: number; opacity: number } | null {
  if (!Number.isFinite(age) || !Number.isFinite(life) || life <= 0 || age < 0 || age >= life) return null;
  if (reducedMotion) return { progress: 0.55, opacity: 0.24 };
  const progress = Math.min(1, Math.max(0, age / life));
  return { progress, opacity: (1 - progress) ** 1.4 };
}

export function elementalBurstKinds(): readonly TerrainKind[] {
  return TERRAIN_KINDS;
}
