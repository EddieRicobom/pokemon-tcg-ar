import { reactive, watch } from 'vue';
import { DEFAULT_VILLAGE_SCALE, normalizeVillageScale } from '../core/village/ar-diorama';

const KEY = 'tcg-ar-vila-diorama-v1';

export interface VillageArSettings {
  /** Escala física do diorama; a posição no chão só vale enquanto a sessão da câmera estiver aberta. */
  scale: number;
}

export function normalizeVillageArSettings(raw: Partial<VillageArSettings> | null | undefined): VillageArSettings {
  return { scale: normalizeVillageScale(raw?.scale) };
}

function read(): VillageArSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeVillageArSettings(JSON.parse(raw) as Partial<VillageArSettings>);
  } catch {
    // Sem armazenamento: usa a escala confortável padrão.
  }
  return { scale: DEFAULT_VILLAGE_SCALE };
}

/** Preferências da visualização AR, guardadas neste aparelho. */
export const villageArSettings = reactive<VillageArSettings>(read());

watch(villageArSettings, () => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ scale: villageArSettings.scale }));
  } catch {
    // A âncora continua funcionando na sessão atual mesmo se não der para lembrar depois.
  }
});

export function resetVillageArSettingsForTests(): void {
  villageArSettings.scale = DEFAULT_VILLAGE_SCALE;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ambiente sem armazenamento
  }
}
