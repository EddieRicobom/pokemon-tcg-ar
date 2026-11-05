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


/** Faixas de profundidade agrupam sprites sem um mesh ou textura por objeto. */
export const VILLAGE_DIORAMA_BANDS = 6;
export const VILLAGE_DIORAMA_TEXTURE_SCALE = 0.5;
export const VILLAGE_DIORAMA_BAND_PADDING = 80;

export function villageDioramaBand(y: number, height: number): number {
  return Math.max(0, Math.min(VILLAGE_DIORAMA_BANDS - 1, Math.floor(y / height * VILLAGE_DIORAMA_BANDS)));
}

export function villageDioramaBandBounds(index: number, height: number): { top: number; bottom: number; anchor: number } {
  const start = Math.floor(index * height / VILLAGE_DIORAMA_BANDS);
  const end = Math.floor((index + 1) * height / VILLAGE_DIORAMA_BANDS);
  return { top: start - VILLAGE_DIORAMA_BAND_PADDING, bottom: end + 16, anchor: (start + end) / 2 };
}

/** O mundo em pixel art muda mais devagar que a orientação do celular. */
export const VILLAGE_DIORAMA_SCENE_FPS = 15;
export const VILLAGE_DIORAMA_RENDER_FPS = 24;
export const VILLAGE_DIORAMA_FLOOR_INTERVAL_MS = 500;

export function villageDioramaFps(configured: number, limit: number): number {
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, limit) : limit;
}
