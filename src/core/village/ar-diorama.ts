/** Medidas e limites do diorama da Vila no modo AR. Não dependem de WebGL. */
export const VILLAGE_DIORAMA_WIDTH_M = 2.8;
export const VILLAGE_DIORAMA_DEPTH_M = VILLAGE_DIORAMA_WIDTH_M * 0.75;

/** Uma cidade menor pode ficar perto; uma maior revela detalhes à distância. */
export const VILLAGE_SCALE_RANGE = { min: 0.42, max: 1.2 } as const;
export const DEFAULT_VILLAGE_SCALE = 0.72;
/** Espaço livre entre a borda do diorama e quem está com o celular. */
export const VILLAGE_NEAR_GAP_M = 0.35;

export function normalizeVillageScale(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_VILLAGE_SCALE;
  return Math.min(VILLAGE_SCALE_RANGE.max, Math.max(VILLAGE_SCALE_RANGE.min, number));
}

/** Distância do centro necessária para não trazer a borda da cidade para cima da câmera. */
export function villageMinimumDistance(scale: number): number {
  const normalized = normalizeVillageScale(scale);
  return (VILLAGE_DIORAMA_WIDTH_M * normalized * Math.SQRT2) / 2 + VILLAGE_NEAR_GAP_M;
}
