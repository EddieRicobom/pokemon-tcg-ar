import { describe, expect, it } from 'vitest';
import { isMega, isMegaName, MEGA_ENERGY_COST, parseMegaName, pickMegaVariety } from './mega';

describe('parseMegaName', () => {
  it('reconhece os formatos das cartas', () => {
    expect(parseMegaName('Mega Gallade ex')).toEqual({ base: 'Gallade', variant: null });
    expect(parseMegaName('M Gallade-EX')).toEqual({ base: 'Gallade', variant: null });
    expect(parseMegaName('Mega-Absol ex')).toEqual({ base: 'Absol', variant: null });
    expect(parseMegaName('M Charizard-EX')).toEqual({ base: 'Charizard', variant: null });
  });

  it('lê a variante X/Y', () => {
    expect(parseMegaName('Mega Charizard X ex')).toEqual({ base: 'Charizard', variant: 'x' });
    expect(parseMegaName('Mega Mewtwo Y ex')).toEqual({ base: 'Mewtwo', variant: 'y' });
  });

  it('não confunde nomes que só começam parecido', () => {
    expect(parseMegaName('Meganium')).toBeNull();
    expect(parseMegaName('Mr. Mime')).toBeNull();
    expect(parseMegaName('Mew')).toBeNull();
    expect(parseMegaName('Gallade ex')).toBeNull();
    expect(parseMegaName('Pikachu')).toBeNull();
    expect(parseMegaName('')).toBeNull();
    expect(parseMegaName('Mega')).toBeNull();
  });
});

describe('isMega', () => {
  it('vale a marca do escaneamento ou o nome', () => {
    expect(isMegaName('Mega Gallade ex')).toBe(true);
    expect(isMega({ name: 'Pikachu' })).toBe(false);
    expect(isMega({ name: 'Pikachu', mega: true })).toBe(true);
    expect(isMega({ name: 'M Gallade-EX' })).toBe(true);
  });

  it('a troca de forma custa 50 de energia', () => {
    expect(MEGA_ENERGY_COST).toBe(50);
  });
});

describe('pickMegaVariety', () => {
  const gallade = [{ name: 'gallade' }, { name: 'gallade-mega' }];
  const charizard = [{ name: 'charizard' }, { name: 'charizard-mega-x' }, { name: 'charizard-mega-y' }, { name: 'charizard-gmax' }];

  it('uma única Mega serve', () => {
    expect(pickMegaVariety(gallade, null)?.name).toBe('gallade-mega');
  });

  it('com duas Mega usa a variante da carta', () => {
    expect(pickMegaVariety(charizard, 'x')?.name).toBe('charizard-mega-x');
    expect(pickMegaVariety(charizard, 'y')?.name).toBe('charizard-mega-y');
  });

  it('com duas Mega e sem variante, não chuta', () => {
    expect(pickMegaVariety(charizard, null)).toBeNull();
  });

  it('espécie sem Mega devolve null', () => {
    expect(pickMegaVariety([{ name: 'pikachu' }, { name: 'pikachu-gmax' }], null)).toBeNull();
  });
});
