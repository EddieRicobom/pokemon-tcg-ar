import type { PokemonType } from './pokemon-data';
import { survivorRegionAt } from './survivor-regions';

export type SurvivorBiomeZoneKind = 'folhagem' | 'poça' | 'neve';

export interface SurvivorBiomeZone {
  id: string;
  kind: SurvivorBiomeZoneKind;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export interface SurvivorBiomeDefinition {
  regionIndex: number;
  name: string;
  description: string;
  zones: readonly SurvivorBiomeZone[];
}

/**
 * Efeitos ambientais determinísticos da Torre.
 *
 * As zonas ficam nas mesmas posições durante a passagem pela região, para que o jogador consiga
 * antecipá-las visualmente. A transição regional só muda a paisagem; o efeito da região atual
 * continua valendo até a próxima etapa começar.
 */
export const SURVIVOR_BIOMES: readonly SurvivorBiomeDefinition[] = [
  {
    regionIndex: 0,
    name: 'Bosques de Kanto',
    description: 'A folhagem reduz o passo e desacelera projéteis que atravessam as clareiras fechadas.',
    zones: [
      { id: 'kanto-folhagem-oeste', kind: 'folhagem', x: 78, y: 108, width: 190, height: 128, label: 'Folhagem densa' },
      { id: 'kanto-folhagem-leste', kind: 'folhagem', x: 704, y: 382, width: 190, height: 138, label: 'Folhagem densa' },
    ],
  },
  {
    regionIndex: 2,
    name: 'Poças de Hoenn',
    description: 'Poças deixam o terreno escorregadio; golpes Elétricos causam mais dano dentro delas.',
    zones: [
      { id: 'hoenn-poca-sul', kind: 'poça', x: 116, y: 430, width: 210, height: 92, label: 'Poça' },
      { id: 'hoenn-poca-norte', kind: 'poça', x: 656, y: 106, width: 188, height: 94, label: 'Poça' },
    ],
  },
  {
    regionIndex: 3,
    name: 'Neve de Sinnoh',
    description: 'A neve reduz bastante a velocidade de quem atravessa as áreas altas.',
    zones: [
      { id: 'sinnoh-neve-norte', kind: 'neve', x: 88, y: 92, width: 216, height: 116, label: 'Neve profunda' },
      { id: 'sinnoh-neve-leste', kind: 'neve', x: 676, y: 406, width: 204, height: 112, label: 'Neve profunda' },
    ],
  },
] as const;

function activeBiome(elapsedMs: number): SurvivorBiomeDefinition | null {
  const { current } = survivorRegionAt(elapsedMs);
  return SURVIVOR_BIOMES.find((biome) => biome.regionIndex === current) ?? null;
}

export function survivorBiomeAt(elapsedMs: number): SurvivorBiomeDefinition | null {
  return activeBiome(elapsedMs);
}

export function survivorBiomeLabel(elapsedMs: number): string | null {
  return activeBiome(elapsedMs)?.name ?? null;
}

export function survivorBiomeZoneAt(elapsedMs: number, x: number, y: number): SurvivorBiomeZone | null {
  const biome = activeBiome(elapsedMs);
  if (!biome || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return biome.zones.find((zone) => x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height) ?? null;
}

export function survivorBiomeMovementMultiplier(elapsedMs: number, x: number, y: number): number {
  switch (survivorBiomeZoneAt(elapsedMs, x, y)?.kind) {
    case 'folhagem': return 0.88;
    case 'poça': return 0.9;
    case 'neve': return 0.76;
    default: return 1;
  }
}

export function survivorBiomeProjectileSpeedMultiplier(elapsedMs: number, x: number, y: number): number {
  return survivorBiomeZoneAt(elapsedMs, x, y)?.kind === 'folhagem' ? 0.82 : 1;
}

export function survivorBiomeDamageMultiplier(elapsedMs: number, x: number, y: number, type: PokemonType): number {
  return survivorBiomeZoneAt(elapsedMs, x, y)?.kind === 'poça' && type === 'electric' ? 1.2 : 1;
}

