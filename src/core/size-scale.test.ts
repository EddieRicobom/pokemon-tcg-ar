import { describe, expect, it } from 'vitest';
import { MAX_TILES, MIN_TILES, speciesHeightM, speciesTiles, tilesForHeight, TRAINER_HEIGHT_M, TRAINER_TILES } from './size-scale';

describe('altura real das espécies (PokéAPI)', () => {
  it('tem os valores conhecidos', () => {
    expect(speciesHeightM(25)).toBe(0.4); // Pikachu
    expect(speciesHeightM(143)).toBe(2.1); // Snorlax
    expect(speciesHeightM(321)).toBe(14.5); // Wailord
    expect(speciesHeightM(1025)).toBeGreaterThan(0); // última da Ger. IX
  });

  it('formas alternativas têm a altura própria (id da PokéAPI, o mesmo de spriteIdOf)', () => {
    expect(speciesHeightM(10162)).toBe(0.8); // Ponyta de Galar
    expect(speciesHeightM(10091)).toBe(0.3); // Rattata de Alola
    expect(speciesHeightM(10034)).toBe(1.7); // Mega Charizard X
    expect(speciesHeightM(10195)).toBe(24); // Venusaur Gigantamax
    expect(speciesTiles(10195)).toBe(MAX_TILES);
  });

  it('sem dado não inventa', () => {
    expect(speciesHeightM(undefined)).toBeUndefined();
    expect(speciesHeightM(0)).toBeUndefined();
    expect(speciesHeightM(99999)).toBeUndefined();
    expect(speciesTiles(99999)).toBeUndefined();
  });
});

describe('tamanho na tela pela altura real', () => {
  it('uma pessoa tem a altura do treinador', () => {
    expect(tilesForHeight(TRAINER_HEIGHT_M)).toBeCloseTo(TRAINER_TILES);
  });

  it('a ordem real é preservada entre espécies comuns', () => {
    const pikachu = speciesTiles(25)!;
    const bulbasaur = speciesTiles(1)!;
    const charizard = speciesTiles(6)!;
    const snorlax = speciesTiles(143)!;
    expect(pikachu).toBeLessThan(bulbasaur);
    expect(bulbasaur).toBeLessThan(charizard);
    expect(charizard).toBeLessThan(snorlax);
    // Snorlax (2,1 m) bem maior que Pikachu (0,4 m), mas sem a diferença de 5× da vida real.
    expect(snorlax / pikachu).toBeGreaterThan(1.7);
    expect(snorlax / pikachu).toBeLessThan(2.5);
  });

  it('gigantes e minúsculos ficam dentro dos limites', () => {
    expect(speciesTiles(321)).toBe(MAX_TILES); // Wailord
    expect(speciesTiles(95)).toBe(MAX_TILES); // Onix 8,8 m
    expect(speciesTiles(595)).toBe(MIN_TILES); // Joltik 0,1 m
  });
});
