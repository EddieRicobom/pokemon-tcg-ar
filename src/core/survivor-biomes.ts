import type { PokemonType } from './pokemon-data';
import { survivorRegionAt } from './survivor-regions';

export type SurvivorBiomeZoneKind = 'folhagem' | 'poça' | 'neve' | 'vento' | 'pedra' | 'flores' | 'areia' | 'ruínas' | 'olival';

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

/** As zonas foram desenhadas numa célula de 960×640 e repetidas pela arena 9× maior. */
export const SURVIVOR_ARENA_SCALE = 9;
const SURVIVOR_BASE_W = 960;
const SURVIVOR_BASE_H = 640;

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
    regionIndex: 1,
    name: 'Ventos de Johto',
    description: 'Folhas levadas pelo vento aceleram o passo e os projéteis que cruzam a clareira.',
    zones: [
      { id: 'johto-vento-oeste', kind: 'vento', x: 86, y: 300, width: 206, height: 104, label: 'Vento de folhas' },
      { id: 'johto-vento-leste', kind: 'vento', x: 688, y: 112, width: 180, height: 106, label: 'Vento de folhas' },
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
  {
    regionIndex: 4,
    name: 'Pedras de Unova',
    description: 'O chão irregular reduz o passo; golpes de Pedra e Terra encontram apoio e causam mais dano.',
    zones: [
      { id: 'unova-pedra-norte', kind: 'pedra', x: 92, y: 112, width: 212, height: 98, label: 'Pedras soltas' },
      { id: 'unova-pedra-sul', kind: 'pedra', x: 650, y: 396, width: 214, height: 108, label: 'Pedras soltas' },
    ],
  },
  {
    regionIndex: 5,
    name: 'Jardins de Kalos',
    description: 'Flores abertas deixam Pokémon de Grama e Fada mais fortes, mas tornam o passo cuidadoso.',
    zones: [
      { id: 'kalos-flores-oeste', kind: 'flores', x: 98, y: 390, width: 206, height: 112, label: 'Jardim florido' },
      { id: 'kalos-flores-leste', kind: 'flores', x: 684, y: 98, width: 190, height: 112, label: 'Jardim florido' },
    ],
  },
  {
    regionIndex: 6,
    name: 'Areias de Alola',
    description: 'A areia funda reduz o passo e faz projéteis perderem velocidade.',
    zones: [
      { id: 'alola-areia-sul', kind: 'areia', x: 108, y: 424, width: 224, height: 92, label: 'Areia funda' },
      { id: 'alola-areia-norte', kind: 'areia', x: 642, y: 104, width: 220, height: 96, label: 'Areia funda' },
    ],
  },
  {
    regionIndex: 7,
    name: 'Ruínas de Galar',
    description: 'As ruínas estreitam o passo; golpes de Aço e Pedra aproveitam as paredes e causam mais dano.',
    zones: [
      { id: 'galar-ruinas-oeste', kind: 'ruínas', x: 84, y: 108, width: 214, height: 110, label: 'Ruínas antigas' },
      { id: 'galar-ruinas-leste', kind: 'ruínas', x: 676, y: 390, width: 208, height: 116, label: 'Ruínas antigas' },
    ],
  },
  {
    regionIndex: 8,
    name: 'Olivais de Paldea',
    description: 'Os olivais deixam o passo ligeiramente mais leve; golpes de Grama encontram terreno fértil.',
    zones: [
      { id: 'paldea-olival-norte', kind: 'olival', x: 108, y: 104, width: 220, height: 104, label: 'Olival' },
      { id: 'paldea-olival-sul', kind: 'olival', x: 646, y: 402, width: 224, height: 108, label: 'Olival' },
    ],
  },
] as const;

function activeBiome(elapsedMs: number): SurvivorBiomeDefinition | null {
  const { current } = survivorRegionAt(elapsedMs);
  return SURVIVOR_BIOMES.find((biome) => biome.regionIndex === current) ?? null;
}

const expandedZones = new Map<number, readonly SurvivorBiomeZone[]>();
function zonesFor(biome: SurvivorBiomeDefinition): readonly SurvivorBiomeZone[] {
  const cached = expandedZones.get(biome.regionIndex);
  if (cached) return cached;
  const zones = Array.from({ length: SURVIVOR_ARENA_SCALE * SURVIVOR_ARENA_SCALE }, (_, index) => {
    const offsetX = (index % SURVIVOR_ARENA_SCALE) * SURVIVOR_BASE_W;
    const offsetY = Math.floor(index / SURVIVOR_ARENA_SCALE) * SURVIVOR_BASE_H;
    return biome.zones.map((zone) => ({ ...zone, id: `${zone.id}-${index}`, x: zone.x + offsetX, y: zone.y + offsetY }));
  }).flat();
  expandedZones.set(biome.regionIndex, zones);
  return zones;
}

/** Zonas visuais e mecânicas já distribuídas por toda a arena expandida. */
export function survivorBiomeZones(elapsedMs: number): readonly SurvivorBiomeZone[] {
  const biome = activeBiome(elapsedMs);
  return biome ? zonesFor(biome) : [];
}

/** Versão por definição, usada pelo renderer para desenhar a transição atual e a próxima. */
export function survivorBiomeZonesOf(biome: SurvivorBiomeDefinition): readonly SurvivorBiomeZone[] {
  return zonesFor(biome);
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
  return zonesFor(biome).find((zone) => x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height) ?? null;
}

export function survivorBiomeMovementMultiplier(elapsedMs: number, x: number, y: number): number {
  switch (survivorBiomeZoneAt(elapsedMs, x, y)?.kind) {
    case 'folhagem': return 0.88;
    case 'poça': return 0.9;
    case 'neve': return 0.76;
    case 'vento': return 1.05;
    case 'pedra': return 0.86;
    case 'flores': return 0.95;
    case 'areia': return 0.84;
    case 'ruínas': return 0.92;
    case 'olival': return 1.04;
    default: return 1;
  }
}

export function survivorBiomeProjectileSpeedMultiplier(elapsedMs: number, x: number, y: number): number {
  switch (survivorBiomeZoneAt(elapsedMs, x, y)?.kind) {
    case 'folhagem': return 0.82;
    case 'vento': return 1.12;
    case 'areia': return 0.88;
    default: return 1;
  }
}

export function survivorBiomeDamageMultiplier(elapsedMs: number, x: number, y: number, type: PokemonType): number {
  const kind = survivorBiomeZoneAt(elapsedMs, x, y)?.kind;
  if (kind === 'poça' && type === 'electric') return 1.2;
  if (kind === 'pedra' && (type === 'rock' || type === 'ground')) return 1.15;
  if (kind === 'flores' && (type === 'grass' || type === 'fairy')) return 1.15;
  if (kind === 'ruínas' && (type === 'steel' || type === 'rock')) return 1.15;
  if (kind === 'olival' && type === 'grass') return 1.12;
  return 1;
}

