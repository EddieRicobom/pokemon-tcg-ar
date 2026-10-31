import { computed, reactive, watch } from 'vue';
import { DEFAULT_SMOOTHING, normalizeSmoothing } from '../core/pixel-upscale';
import type { SmoothingMode } from '../core/pixel-upscale';
import { normalizeWeatherMode } from '../core/weather';
import type { WeatherMode } from '../core/weather';

export interface VisualSettings {
  /** Suavização de pixels dos GIFs (compartilhada entre Escanear, Várias e Caixa). */
  smoothing: SmoothingMode;
  /** Luz dos golpes nos Pokémon, no chão e no vídeo (Caixa). Desligar poupa a GPU de celulares fracos. */
  lighting: boolean;
  /** Partículas e ondas de choque intensas na Arena, além do aviso ao tomar dano na Torre. */
  impactFx: boolean;
  /** Chão em pixel art e terreno que muda com os golpes elementais (Caixa). Desligar poupa a GPU. */
  terrain: boolean;
  /** Encontros entre os Pokémon e balões de emoji na caixa (Caixa). */
  social: boolean;
  /** Clima da Caixa: ciclo, um clima fixo ou desligado. Pesa na GPU (camadas e partículas). */
  weather: WeatherMode;
  /** Muro, arquibancada e tochas do Coliseu na Arena 3D (palco virtual). Desligar deixa só a areia e poupa a GPU. */
  scenery: boolean;
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
  /** Halos suaves das janelas, postes e lampiões da Vila à noite. Desligado, as janelas acendem sem o halo. */
  villageGlow: boolean;
  /** Mato alto e flores da Vila balançando ao vento. */
  villageWind: boolean;
  /** Profundidade de campo e luz por objeto na Vila, no estilo 2D-HD. */
  villageHd2d: boolean;
  /** Portal e chegada especial ao rastrear uma carta cujo companheiro evoluiu. */
  evolutionFx: boolean;
  /** Animações dos arquétipos da carta (selos, partículas e círculos em cel-shading) quando o Pokémon aparece no AR. */
  archetypeFx: boolean;
  /** Limite da taxa de quadros das cenas animadas; automático segue a tela. */
  frameRate: 'auto' | '30' | '20';
  /** Sobreposição de economia: desliga efeitos gráficos pesados sem apagar preferências individuais. */
  rotomMode: boolean;
}

const KEY = 'tcg-ar-visual-v2';
const LEGACY_KEY = 'tcg-ar-visual-v1';
const DEFAULTS: VisualSettings = { smoothing: DEFAULT_SMOOTHING, lighting: true, impactFx: true, terrain: true, social: true, weather: 'ciclo', scenery: true, sound: true, shadow: true, metallic: true, caseFx: true, villageFx: true, villageGlow: true, villageWind: true, villageHd2d: false, evolutionFx: true, archetypeFx: true, frameRate: 'auto', rotomMode: false };

export function normalizeVisual(raw: Partial<VisualSettings> | null | undefined): VisualSettings {
  return { smoothing: normalizeSmoothing(raw?.smoothing), lighting: raw?.lighting !== false, impactFx: raw?.impactFx !== false, terrain: raw?.terrain !== false, social: raw?.social !== false, weather: normalizeWeatherMode(raw?.weather), scenery: raw?.scenery !== false, sound: raw?.sound !== false, shadow: raw?.shadow !== false, metallic: raw?.metallic !== false, caseFx: raw?.caseFx !== false, villageFx: raw?.villageFx !== false, villageGlow: raw?.villageGlow !== false, villageWind: raw?.villageWind !== false, villageHd2d: raw?.villageHd2d === true, evolutionFx: raw?.evolutionFx !== false, archetypeFx: raw?.archetypeFx !== false, frameRate: raw?.frameRate === '30' || raw?.frameRate === '20' ? raw.frameRate : 'auto', rotomMode: raw?.rotomMode === true };
}

/** Preferências efetivas sem alterar o que a pessoa escolheu para cada efeito. */
export function effectiveVisualSettings(settings: VisualSettings): VisualSettings {
  if (!settings.rotomMode) return { ...settings };
  return { ...settings, smoothing: 'nitido', lighting: false, impactFx: false, terrain: false, social: false, weather: 'off', scenery: false, shadow: false, metallic: false, caseFx: false, villageFx: false, villageGlow: false, villageWind: false, villageHd2d: false, evolutionFx: false, archetypeFx: false, frameRate: '20' };
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
export const effectiveVisual = computed(() => effectiveVisualSettings(visual));
export function maxVisualFps(): number {
  return effectiveVisual.value.frameRate === 'auto' ? 0 : Number(effectiveVisual.value.frameRate);
}

watch(visual, () => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...visual }));
  } catch {
    // Só não lembra da escolha na próxima vez.
  }
});

export function resetVisual(): void {
  Object.assign(visual, DEFAULTS);
}
