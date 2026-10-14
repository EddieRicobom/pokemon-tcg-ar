import { reactive, watch } from 'vue';
import { DEFAULT_SMOOTHING, normalizeSmoothing } from '../core/pixel-upscale';
import type { SmoothingMode } from '../core/pixel-upscale';

export interface VisualSettings {
  /** Suavização de pixels dos GIFs (compartilhada entre Escanear, Várias e Caixa). */
  smoothing: SmoothingMode;
  /** Luz dos golpes nos Pokémon, no chão e no vídeo (Caixa). Desligar poupa a GPU de celulares fracos. */
  lighting: boolean;
}

const KEY = 'tcg-ar-visual-v2';
const LEGACY_KEY = 'tcg-ar-visual-v1';
const DEFAULTS: VisualSettings = { smoothing: DEFAULT_SMOOTHING, lighting: true };

export function normalizeVisual(raw: Partial<VisualSettings> | null | undefined): VisualSettings {
  return { smoothing: normalizeSmoothing(raw?.smoothing), lighting: raw?.lighting !== false };
}

function read(): VisualSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeVisual(JSON.parse(raw) as Partial<VisualSettings>);
    // Os filtros de cor e de câmera da versão anterior foram removidos; a escolha antiga não vale mais.
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Sem armazenamento local: usa o padrão.
  }
  return { ...DEFAULTS };
}

export const visual = reactive<VisualSettings>(read());

watch(visual, () => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ smoothing: visual.smoothing, lighting: visual.lighting }));
  } catch {
    // Só não lembra da escolha na próxima vez.
  }
});

export function resetVisual(): void {
  Object.assign(visual, DEFAULTS);
}
