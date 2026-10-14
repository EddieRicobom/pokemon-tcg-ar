import { parseSpeciesList } from '../core/dex';
import { POKEAPI } from './pokemon-data-service';

const STORAGE_KEY = 'tcg-ar-dex-names-v1';
/** Abaixo disso a lista guardada ou recebida está incompleta e não vale. */
const MIN_NAMES = 900;

function readSaved(storage: Storage | undefined): Map<number, string> | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const pairs = JSON.parse(raw) as unknown;
    if (!Array.isArray(pairs)) return null;
    const map = new Map<number, string>();
    for (const pair of pairs) {
      if (Array.isArray(pair) && typeof pair[0] === 'number' && typeof pair[1] === 'string') map.set(pair[0], pair[1]);
    }
    return map.size >= MIN_NAMES ? map : null;
  } catch {
    return null;
  }
}

/**
 * Nomes de todos os Pokémon (número da Pokédex → nome). Uma consulta ao PokeAPI, guardada no aparelho: da segunda vez
 * em diante não usa a rede. Sem conexão e sem cópia guardada, falha com uma mensagem clara (nunca inventa nomes).
 */
export async function loadDexNames(
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  storage: Storage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage,
): Promise<Map<number, string>> {
  const saved = readSaved(storage);
  if (saved) return saved;
  let names: Map<number, string>;
  try {
    const response = await fetchImpl(`${POKEAPI}/pokemon-species?limit=2000`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    names = parseSpeciesList(await response.json());
  } catch {
    throw new Error('Não foi possível carregar a lista de Pokémon. Verifique a conexão e tente de novo.');
  }
  if (names.size < MIN_NAMES) throw new Error('A lista de Pokémon veio incompleta. Tente de novo em instantes.');
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify([...names]));
  } catch {
    // Sem espaço ou armazenamento bloqueado: segue sem guardar.
  }
  return names;
}
