import { describe, expect, it } from 'vitest';
import {
  isValidDexId,
  pokemonSpriteUrl,
  pokemonStaticSpriteUrls,
  POKEAPI_SHOWDOWN_BASE_URL,
} from './sprite-url';

describe('pokemonSpriteUrl', () => {
  it('monta o endereço exato do padrão pedido para os Pokémon de teste', () => {
    for (const dexId of [25, 132, 1008, 1009]) {
      expect(pokemonSpriteUrl(dexId)).toBe(
        `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/${dexId}.gif`,
      );
    }
  });

  it('usa a base documentada', () => {
    expect(pokemonSpriteUrl(25).startsWith(`${POKEAPI_SHOWDOWN_BASE_URL}/`)).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejeita o dexId %s', (value) => {
    expect(() => pokemonSpriteUrl(value)).toThrow(RangeError);
  });
});

describe('pokemonStaticSpriteUrls', () => {
  it('devolve a cadeia do mais leve ao mais pesado, sempre por PNG', () => {
    const urls = pokemonStaticSpriteUrls(1008);
    expect(urls).toEqual([
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1008.png',
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/1008.png',
    ]);
  });

  it('rejeita dexId inválido', () => {
    expect(() => pokemonStaticSpriteUrls(0)).toThrow(RangeError);
  });
});

describe('isValidDexId', () => {
  it('aceita só inteiros positivos', () => {
    expect(isValidDexId(25)).toBe(true);
    expect(isValidDexId('25')).toBe(false);
    expect(isValidDexId(undefined)).toBe(false);
    expect(isValidDexId(0)).toBe(false);
  });
});
