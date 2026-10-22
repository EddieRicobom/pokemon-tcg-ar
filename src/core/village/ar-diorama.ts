/** Medidas e limites do diorama da Vila no modo AR. Não dependem de WebGL. */
export const VILLAGE_DIORAMA_WIDTH_M = 2.8;
export const VILLAGE_DIORAMA_DEPTH_M = VILLAGE_DIORAMA_WIDTH_M * 0.75;
/** A base acompanha o chão estimado; a perspectiva 2.5D mora nas camadas da cena. */
export const VILLAGE_AR_TILT_DEG = 0;
/** Os recortes da Vila ficam em pé sobre o piso, sem deformar os sprites. */
export const VILLAGE_DIORAMA_OBJECT_TILT_DEG = 0;

/** O zoom amplia o modelo no próprio ponto da âncora, até 3× o tamanho-base. */
export const VILLAGE_SCALE_RANGE = { min: 0.42, max: 3 } as const;
export const DEFAULT_VILLAGE_SCALE = 0.72;

export function normalizeVillageScale(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_VILLAGE_SCALE;
  return Math.min(VILLAGE_SCALE_RANGE.max, Math.max(VILLAGE_SCALE_RANGE.min, number));
}

