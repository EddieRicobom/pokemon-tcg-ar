/** Cenário independente do RNG de combate: trocar a paisagem nunca muda a corrida. */
export const SURVIVOR_REGIONS = [
  { name: 'Kanto', landscape: 'Prados e trilhas', ground: '#6f985b', path: '#bca77a', accent: '#365d40', detail: 'tree' },
  { name: 'Johto', landscape: 'Bosques de outono', ground: '#8c9560', path: '#c2ad82', accent: '#946348', detail: 'tree' },
  { name: 'Hoenn', landscape: 'Costa tropical', ground: '#8aa474', path: '#cfbb8b', accent: '#406d72', detail: 'pool' },
  { name: 'Sinnoh', landscape: 'Campos de altitude', ground: '#98aaa2', path: '#bdc8c3', accent: '#586877', detail: 'rock' },
  { name: 'Unova', landscape: 'Estradas de pedra', ground: '#7c8d73', path: '#a4a095', accent: '#59646a', detail: 'rock' },
  { name: 'Kalos', landscape: 'Jardins floridos', ground: '#7c9d72', path: '#c2b39d', accent: '#a47291', detail: 'flower' },
  { name: 'Alola', landscape: 'Areias e lagoas', ground: '#c7bb8a', path: '#d6c99e', accent: '#477f80', detail: 'pool' },
  { name: 'Galar', landscape: 'Campinas e ruínas', ground: '#78917b', path: '#aea68c', accent: '#65716c', detail: 'rock' },
  { name: 'Paldea', landscape: 'Campos de oliveiras', ground: '#a0a16a', path: '#cbb68c', accent: '#576b48', detail: 'tree' },
] as const;

export const REGION_DURATION_MS = 135_000;
export const REGION_TRANSITION_MS = 40_000;

/** Cada etapa termina com uma mistura suave; o infinito recomeça em Kanto. */
export function survivorRegionAt(elapsedMs: number): { current: number; next: number; blend: number } {
  const time = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const current = Math.floor(time / REGION_DURATION_MS) % SURVIVOR_REGIONS.length;
  const progress = time % REGION_DURATION_MS;
  const t = Math.max(0, (progress - (REGION_DURATION_MS - REGION_TRANSITION_MS)) / REGION_TRANSITION_MS);
  return { current, next: (current + 1) % SURVIVOR_REGIONS.length, blend: t * t * (3 - 2 * t) };
}

export function survivorRegionLabel(elapsedMs: number): string {
  const { current, next, blend } = survivorRegionAt(elapsedMs);
  const region = SURVIVOR_REGIONS[current]!;
  return blend > 0 ? `${region.name} → ${SURVIVOR_REGIONS[next]!.name}` : `${region.name} · ${region.landscape}`;
}
