import { describe, expect, it } from 'vitest';
import { cardMatchesSpecies, generationOf, typesOfDex } from './species-filter';

const card = (dex: number | undefined, name: string) => ({ dexIds: dex === undefined ? [] : [dex], name });

describe('filtros de tipo e geração', () => {
  it('tipos reais das espécies (PokéAPI)', () => {
    expect(typesOfDex(1)).toEqual(['grass', 'poison']);
    expect(typesOfDex(25)).toEqual(['electric']);
    expect(typesOfDex(6)).toEqual(['fire', 'flying']);
    expect(typesOfDex(10162)).toEqual(['psychic']); // Ponyta de Galar
    expect(typesOfDex(undefined)).toEqual([]);
    expect(typesOfDex(99999)).toEqual([]);
  });

  it('geração pela faixa da Pokédex, nas bordas certas', () => {
    expect(generationOf(1)).toBe(1);
    expect(generationOf(151)).toBe(1);
    expect(generationOf(152)).toBe(2);
    expect(generationOf(493)).toBe(4);
    expect(generationOf(494)).toBe(5);
    expect(generationOf(905)).toBe(8);
    expect(generationOf(906)).toBe(9);
    expect(generationOf(1025)).toBe(9);
    expect(generationOf(0)).toBeUndefined();
    expect(generationOf(2000)).toBeUndefined();
  });

  it('filtra a carta pelo tipo (com forma regional) e pela geração', () => {
    expect(cardMatchesSpecies(card(77, 'Ponyta'), { type: 'fire' })).toBe(true);
    expect(cardMatchesSpecies(card(77, 'Galarian Ponyta'), { type: 'fire' })).toBe(false);
    expect(cardMatchesSpecies(card(77, 'Galarian Ponyta'), { type: 'psychic' })).toBe(true);
    expect(cardMatchesSpecies(card(25, 'Pikachu'), { generation: 1, type: 'electric' })).toBe(true);
    expect(cardMatchesSpecies(card(25, 'Pikachu'), { generation: 2 })).toBe(false);
  });

  it('carta sem Pokémon (Treinador/Energia) só passa sem filtro', () => {
    expect(cardMatchesSpecies(card(undefined, 'Professor Oak'), {})).toBe(true);
    expect(cardMatchesSpecies(card(undefined, 'Professor Oak'), { generation: 1 })).toBe(false);
  });
});
