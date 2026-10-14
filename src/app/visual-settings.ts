import { reactive, watch } from 'vue';
import { normalizeLook } from '../core/sprite-look';
import type { SpriteOutline, SpriteTone } from '../core/sprite-look';

export type CameraFilter = 'nenhum' | 'mono' | 'sepia' | 'contraste' | 'escuro' | 'quente' | 'frio';

export const CAMERA_FILTERS: { id: CameraFilter; label: string; css: string }[] = [
  { id: 'nenhum', label: 'Normal', css: 'none' },
  { id: 'mono', label: 'P&B', css: 'grayscale(1) contrast(1.05)' },
  { id: 'sepia', label: 'Sépia', css: 'sepia(0.85) contrast(1.05)' },
  { id: 'contraste', label: 'Contraste', css: 'contrast(1.35) saturate(1.1)' },
  { id: 'escuro', label: 'Escurecer', css: 'brightness(0.6) contrast(1.1)' },
  { id: 'quente', label: 'Quente', css: 'sepia(0.3) saturate(1.3) hue-rotate(-10deg)' },
  { id: 'frio', label: 'Frio', css: 'saturate(1.1) hue-rotate(15deg) brightness(1.03)' },
];

export interface VisualSettings {
  camera: CameraFilter;
  tone: SpriteTone;
  outline: SpriteOutline;
}

const KEY = 'tcg-ar-visual-v1';
const DEFAULTS: VisualSettings = { camera: 'nenhum', tone: 'normal', outline: 'none' };

export function cameraFilterCss(id: CameraFilter): string {
  return CAMERA_FILTERS.find((filter) => filter.id === id)?.css ?? 'none';
}

export function normalizeVisual(raw: Partial<VisualSettings> | null | undefined): VisualSettings {
  const camera = CAMERA_FILTERS.some((filter) => filter.id === raw?.camera) ? (raw?.camera as CameraFilter) : 'nenhum';
  return { camera, ...normalizeLook(raw ?? undefined) };
}

function read(): VisualSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeVisual(JSON.parse(raw) as Partial<VisualSettings>);
  } catch {
    // Sem armazenamento local: usa o padrão.
  }
  return { ...DEFAULTS };
}

/** Configurações de aparência compartilhadas entre Escanear e Caixa (câmera, tom e contorno do Pokémon). */
export const visual = reactive<VisualSettings>(read());

watch(visual, () => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ camera: visual.camera, tone: visual.tone, outline: visual.outline }));
  } catch {
    // Só não lembra da escolha na próxima vez.
  }
});

export function resetVisual(): void {
  Object.assign(visual, DEFAULTS);
}
