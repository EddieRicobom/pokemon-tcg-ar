import type { PokemonType } from './pokemon-data';

/** Um símbolo por tipo elemental, para ler o elemento de relance (filtros, botão de ataque da Arena). */
export const TYPE_GLYPHS: Record<PokemonType, string> = {
  normal: '◉', fire: '🔥', water: '💧', electric: '⚡', grass: '🍃', ice: '❄️', fighting: '🥊', poison: '☠️',
  ground: '⛰️', flying: '🪽', psychic: '🔮', bug: '🪲', rock: '🪨', ghost: '👻', dragon: '🐉', dark: '🌑', steel: '⚙️', fairy: '✨',
};
