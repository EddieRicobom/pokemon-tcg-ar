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

/** Mistura determinística sem tocar no RNG de combate. */
function regionShuffleRandom(runSeed: number, cycle: number): () => number {
  let value = (Math.floor(runSeed) ^ Math.imul(cycle + 1, 0x9e3779b9)) >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

/** Ordem de uma volta da Torre: cada geração aparece uma vez antes de qualquer repetição. */
export function survivorGenerationOrder(runSeed: number, cycle = 0): number[] {
  const order = Array.from({ length: SURVIVOR_REGIONS.length }, (_, index) => index);
  // Seed zero é a prévia estática/testável. Corridas sempre recebem uma seed aleatória não nula.
  if (!Number.isFinite(runSeed) || Math.floor(runSeed) === 0) return order;
  const rng = regionShuffleRandom(runSeed, Math.max(0, Math.floor(cycle)));
  for (let index = order.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1));
    [order[index], order[other]] = [order[other]!, order[index]!];
  }
  return order;
}

/** Cada etapa termina com uma mistura suave. A ordem é sorteada por corrida e só repete após fechar uma volta completa. */
export function survivorRegionAt(elapsedMs: number, runSeed = 0): { current: number; next: number; blend: number } {
  const time = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const step = Math.floor(time / REGION_DURATION_MS);
  const cycle = Math.floor(step / SURVIVOR_REGIONS.length);
  const position = step % SURVIVOR_REGIONS.length;
  const order = survivorGenerationOrder(runSeed, cycle);
  const current = order[position]!;
  const next = position + 1 < SURVIVOR_REGIONS.length
    ? order[position + 1]!
    : survivorGenerationOrder(runSeed, cycle + 1)[0]!;
  const progress = time % REGION_DURATION_MS;
  const t = Math.max(0, (progress - (REGION_DURATION_MS - REGION_TRANSITION_MS)) / REGION_TRANSITION_MS);
  return { current, next, blend: t * t * (3 - 2 * t) };
}

export function survivorRegionLabel(elapsedMs: number, runSeed = 0): string {
  const { current, next, blend } = survivorRegionAt(elapsedMs, runSeed);
  const region = SURVIVOR_REGIONS[current]!;
  return blend > 0 ? `${region.name} → ${SURVIVOR_REGIONS[next]!.name}` : `${region.name} · ${region.landscape}`;
}
