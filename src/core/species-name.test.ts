import { describe, expect, it } from 'vitest';
import { formDexId } from './dex-form';
import { normalizeSpeciesName, speciesDexId } from './species-name';

describe('speciesDexId', () => {
  it('acha a espécie pelo nome simples', () => {
    expect(speciesDexId('Pikachu')).toBe(25);
    expect(speciesDexId('Heracross')).toBe(214);
    expect(speciesDexId('Mr. Mime')).toBe(122);
    expect(speciesDexId('Ho-Oh')).toBe(250);
    expect(speciesDexId('Porygon-Z')).toBe(474);
  });

  it('ignora acento e apóstrofo tipográfico', () => {
    expect(speciesDexId('Flabébé')).toBe(669);
    expect(speciesDexId('Farfetch’d')).toBe(83);
    expect(normalizeSpeciesName('Flabébé')).toBe('flabebe');
  });

  it('remove as marcas de raridade e de forma do nome', () => {
    expect(speciesDexId('Mega Golisopod ex')).toBe(768);
    expect(speciesDexId('Mega Rayquaza ex')).toBe(384);
    expect(speciesDexId('M Rayquaza-EX')).toBe(384);
    expect(speciesDexId('Radiant Greninja')).toBe(658);
    expect(speciesDexId('Shining Magikarp')).toBe(129);
    expect(speciesDexId('Origin Forme Palkia V')).toBe(484);
    expect(speciesDexId('Hisuian Zoroark VSTAR')).toBe(571);
    expect(speciesDexId('Ultra Necrozma')).toBe(800);
    expect(speciesDexId('Heat Rotom ex')).toBe(479);
    expect(speciesDexId('Nidoran♀')).toBe(29);
  });

  it('a forma regional continua sendo resolvida por formDexId', () => {
    const base = speciesDexId('Galarian Ponyta');
    expect(base).toBe(77);
    expect(formDexId(base!, 'Galarian Ponyta')).toBe(10162);
  });

  it('não inventa espécie para Treinador, Energia ou nome desconhecido', () => {
    for (const name of ['Aarune', 'Custom Vest', 'Bubbly Water Energy', 'Pokémon Catcher', 'Legendary Summit', 'Zzzzzz', '']) {
      expect(speciesDexId(name), name).toBeUndefined();
    }
  });
});
