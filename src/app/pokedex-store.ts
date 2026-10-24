import { ref } from 'vue';
import { normalizePokedex, registerSightings } from '../core/pokedex';
import type { DexSource, PokedexState } from '../core/pokedex';
import { speciesName } from '../core/survivor-evolution';
import { showReward } from './trainer-store';
import { addCoins } from './wallet';

const KEY = 'tcg-ar-pokedex-v1';

function read(): PokedexState {
  try {
    const raw = localStorage.getItem(KEY);
    return normalizePokedex(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizePokedex(null);
  }
}

function write(state: PokedexState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Sem armazenamento: o registro vale até fechar o app.
  }
}

/** Espécies que o jogador já encontrou, só neste aparelho (entra no backup, chave `tcg-ar-pokedex-v1`). */
export const pokedex = ref<PokedexState>(read());

/**
 * Registra espécies vistas e paga as moedas das novas e dos marcos. `announce` mostra o aviso na tela
 * (desligue ao sincronizar muitas de uma vez, como as cartas da coleção). Devolve as espécies novas.
 */
export function recordSightings(dexIds: readonly (number | undefined)[], source: DexSource, announce = true, now = Date.now()): number[] {
  const ids = dexIds.filter((id): id is number => id !== undefined);
  if (ids.length === 0) return [];
  const result = registerSightings(pokedex.value, ids, source, now);
  pokedex.value = result.dex;
  write(result.dex);
  if (result.coins > 0) addCoins(result.coins);
  if (announce && result.added.length > 0) {
    const names = result.added.slice(0, 3).map((id) => speciesName(id) || `nº ${id}`).join(', ');
    const more = result.added.length > 3 ? ` e mais ${result.added.length - 3}` : '';
    showReward({ text: `Pokédex: ${result.added.length === 1 ? 'nova espécie' : `${result.added.length} espécies novas`}`, sub: `${names}${more} · +${result.coins - result.milestones.reduce((s, m) => s + m.coins, 0)} moedas`, tone: 'new' });
  }
  if (announce) for (const m of result.milestones) showReward({ text: `Pokédex: ${m.count} espécies!`, sub: `+${m.coins} moedas de bônus`, tone: 'achievement' });
  return result.added;
}

/** Só para testes. */
export function resetPokedexForTests(): void {
  pokedex.value = normalizePokedex(null);
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Sem armazenamento: nada a limpar.
  }
}
