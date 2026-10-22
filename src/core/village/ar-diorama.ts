/** Medidas e limites do diorama da Vila no modo AR. Não dependem de WebGL. */
export const VILLAGE_DIORAMA_WIDTH_M = 2.8;
export const VILLAGE_DIORAMA_DEPTH_M = VILLAGE_DIORAMA_WIDTH_M * 0.75;
/** O plano do diorama fica horizontal. Inclinar o grupo inteiro transforma o mapa em uma lâmina diante da câmera. */
export const VILLAGE_AR_TILT_DEG = 0;
/** Inclinação visual dos elementos verticais, aplicada somente à textura do modo Diorama. */
export const VILLAGE_DIORAMA_OBJECT_TILT_DEG = 45;

/** O zoom amplia o modelo no próprio ponto da âncora, até 3× o tamanho-base. */
export const VILLAGE_SCALE_RANGE = { min: 0.42, max: 3 } as const;
export const DEFAULT_VILLAGE_SCALE = 0.72;

export function normalizeVillageScale(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_VILLAGE_SCALE;
  return Math.min(VILLAGE_SCALE_RANGE.max, Math.max(VILLAGE_SCALE_RANGE.min, number));
}
