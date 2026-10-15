import { reactive, watch } from 'vue';
import { normalizeTrainerSprite } from '../core/trainer-sprites';

/** Como o jogador aparece: o sprite de treinador escolhido e o nome (Treinador, Ginásios e PvP da Caixa). */
export interface TrainerProfile {
  sprite: string;
  name: string;
}

const KEY = 'tcg-ar-perfil-v1';
export const NAME_MAX = 16;

export function normalizeName(value: unknown): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
  return text || 'Treinador';
}

export function normalizeProfile(raw: unknown): TrainerProfile {
  const r = (raw ?? {}) as Partial<TrainerProfile>;
  return { sprite: normalizeTrainerSprite(r.sprite), name: normalizeName(r.name) };
}

function read(): TrainerProfile {
  try {
    const raw = localStorage.getItem(KEY);
    return normalizeProfile(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeProfile(null);
  }
}

export const profile = reactive<TrainerProfile>(read());

watch(profile, () => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ sprite: profile.sprite, name: profile.name }));
  } catch {
    // Só não lembra da escolha.
  }
});
