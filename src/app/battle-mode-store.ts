import { ref } from 'vue';
import { BATTLE_MODES } from '../core/battle';
import type { BattleMode } from '../core/battle';

const KEY = 'tcg-ar-battle-mode-v1';

/** Só aceita um modo conhecido; qualquer outra coisa volta ao padrão (todos contra todos). */
export function normalizeBattleMode(raw: unknown): BattleMode {
  return BATTLE_MODES.find((mode) => mode === raw) ?? 'royale';
}

function read(): BattleMode {
  try {
    return normalizeBattleMode(localStorage.getItem(KEY));
  } catch {
    return 'royale';
  }
}

/** Modo de batalha escolhido na Caixa, lembrado entre as visitas. */
export const battleMode = ref<BattleMode>(read());

export function setBattleMode(mode: BattleMode): void {
  battleMode.value = mode;
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Só não lembra da escolha na próxima vez.
  }
}
