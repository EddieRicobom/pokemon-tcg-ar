import { reactive, watch } from 'vue';
import { DEFAULT_SMOOTHING, normalizeSmoothing } from '../core/pixel-upscale';
import type { SmoothingMode } from '../core/pixel-upscale';
import { normalizeWeatherMode } from '../core/weather';
import type { WeatherMode } from '../core/weather';

export interface VisualSettings {
  /** Suavização de pixels dos GIFs (compartilhada entre Escanear, Várias e Caixa). */
  smoothing: SmoothingMode;
  /** Luz dos golpes nos Pokémon, no chão e no vídeo (Caixa). Desligar poupa a GPU de celulares fracos. */
  lighting: boolean;
  /** Chão em pixel art e terreno que muda com os golpes elementais (Caixa). Desligar poupa a GPU. */
  terrain: boolean;
  /** Encontros entre os Pokémon e balões de emoji na caixa (Caixa). */
  social: boolean;
  /** Clima da Caixa: ciclo, um clima fixo ou desligado. Pesa na GPU (camadas e partículas). */
  weather: WeatherMode;
  /** Sons dos golpes e da vitória na batalha (Caixa). */
  sound: boolean;
  /** Sombra suave e brilho no chão sob o Pokémon sobre a carta (Escanear e Várias). */
  shadow: boolean;
  /** Acabamento metálico leve (tinta de aço e um brilho que passa) nos Digital Pokémon da Vila. */
  metallic: boolean;
  /** Reflexos do metal, sombras e faíscas na maleta de insígnias (Treinador › Liga). Desligar poupa a GPU. */
  caseFx: boolean;
  /** Ondas, respingos da fonte e raios de sol na Vila. */
  villageFx: boolean;
  /** Portal e chegada especial ao rastrear uma carta cujo companheiro evoluiu. */
  evolutionFx: boolean;
}

const KEY = 'tcg-ar-visual-v2';
const LEGACY_KEY = 'tcg-ar-visual-v1';
const DEFAULTS: VisualSettings = { smoothing: DEFAULT_SMOOTHING, lighting: true, terrain: true, social: true, weather: 'ciclo', sound: true, shadow: true, metallic: true, caseFx: true, villageFx: true, evolutionFx: true };

export function normalizeVisual(raw: Partial<VisualSettings> | null | undefined): VisualSettings {
  return { smoothing: normalizeSmoothing(raw?.smoothing), lighting: raw?.lighting !== false, terrain: raw?.terrain !== false, social: raw?.social !== false, weather: normalizeWeatherMode(raw?.weather), sound: raw?.sound !== false, shadow: raw?.shadow !== false, metallic: raw?.metallic !== false, caseFx: raw?.caseFx !== false, villageFx: raw?.villageFx !== false, evolutionFx: raw?.evolutionFx !== false };
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
    localStorage.setItem(KEY, JSON.stringify({ smoothing: visual.smoothing, lighting: visual.lighting, terrain: visual.terrain, social: visual.social, weather: visual.weather, sound: visual.sound, shadow: visual.shadow, metallic: visual.metallic, caseFx: visual.caseFx, villageFx: visual.villageFx, evolutionFx: visual.evolutionFx }));
  } catch {
    // Só não lembra da escolha na próxima vez.
  }
});

export function resetVisual(): void {
  Object.assign(visual, DEFAULTS);
}
