import { ref } from 'vue';
import { pokemonSpriteUrl } from '../ar/sprite-url';

/** Uma fala de Pokémon na caixa de texto (estilo dos jogos), por cima de qualquer tela. */
export interface Speech {
  name: string;
  text: string;
  sprite?: string;
}

export const speech = ref<Speech | null>(null);

export const GALLADE_LINE = 'Eu sempre acreditei que você é o maior treinador de todos!';
const GALLADE_KEY = 'tcg-ar-fala-gallade-v1';

type Store = Pick<Storage, 'getItem' | 'setItem'> | null;

function defaultStore(): Store {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** A Gallade shiny é a que fala (a 244/236, sempre shiny, ou qualquer Gallade que tenha saído shiny). */
export function isShinyGallade(pokemon: { name: string; shiny?: boolean }): boolean {
  return pokemon.shiny === true && /gallade/i.test(pokemon.name);
}

/**
 * Na primeira vez que a Gallade shiny aparece (AR ou Caixa), ela fala uma única vez. A marca fica no aparelho; sem
 * armazenamento disponível, não fala (melhor calar do que repetir a cada vez).
 */
export function maybeGalladeSpeaks(pokemon: { name: string; shiny?: boolean }, store: Store = defaultStore()): boolean {
  if (!isShinyGallade(pokemon) || !store) return false;
  try {
    if (store.getItem(GALLADE_KEY)) return false;
    store.setItem(GALLADE_KEY, String(Date.now()));
  } catch {
    return false;
  }
  speech.value = { name: 'Gallade', text: GALLADE_LINE, sprite: pokemonSpriteUrl(475, true) };
  return true;
}
