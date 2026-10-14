import { describe, expect, it } from 'vitest';
import { ALWAYS_SHINY, isAlwaysShiny, isShiny, rollShiny, SHINY_ODDS, shinyForNewCard } from './shiny';

const gallade = { name: 'Mega Gallade ex', localId: '244', setOfficial: 236 };

describe('rollShiny', () => {
  it('a chance é de 1 em 50', () => {
    expect(SHINY_ODDS).toBe(50);
    expect(rollShiny(() => 0)).toBe(true);
    expect(rollShiny(() => 0.0199)).toBe(true);
    expect(rollShiny(() => 0.02)).toBe(false);
    expect(rollShiny(() => 0.999)).toBe(false);
  });

  it('em 5000 sorteios com semente fixa, fica perto de 2%', () => {
    let seed = 12345;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    let hits = 0;
    for (let i = 0; i < 5000; i++) if (rollShiny(random)) hits++;
    expect(hits).toBeGreaterThan(60);
    expect(hits).toBeLessThan(140);
  });

  it('chance inválida nunca sorteia', () => {
    expect(rollShiny(() => 0, 0)).toBe(false);
    expect(rollShiny(() => 0, Number.NaN)).toBe(false);
  });
});

describe('cartas sempre shiny', () => {
  it('Gallade 244/236 é shiny, com ou sem zeros no número', () => {
    expect(ALWAYS_SHINY.length).toBeGreaterThan(0);
    expect(isAlwaysShiny(gallade)).toBe(true);
    expect(isAlwaysShiny({ ...gallade, localId: '0244' })).toBe(true);
    expect(isAlwaysShiny({ ...gallade, name: 'GALLADE' })).toBe(true);
  });

  it('outra carta de Gallade, ou outro número, não é', () => {
    expect(isAlwaysShiny({ ...gallade, localId: '245' })).toBe(false);
    expect(isAlwaysShiny({ ...gallade, setOfficial: 190 })).toBe(false);
    expect(isAlwaysShiny({ name: 'Gardevoir', localId: '244', setOfficial: 236 })).toBe(false);
  });

  it('o primeiro escaneamento de Gallade 244/236 é shiny mesmo com o pior sorteio', () => {
    expect(shinyForNewCard(gallade, () => 0.99)).toBe(true);
  });

  it('uma carta comum depende só do sorteio', () => {
    const card = { name: 'Pikachu', localId: '58', setOfficial: 102 };
    expect(shinyForNewCard(card, () => 0.01)).toBe(true);
    expect(shinyForNewCard(card, () => 0.5)).toBe(false);
  });
});

describe('isShiny', () => {
  it('vale o que foi guardado no escaneamento', () => {
    const card = { name: 'Pikachu', localId: '58', setOfficial: 102 };
    expect(isShiny(card)).toBe(false);
    expect(isShiny({ ...card, shiny: false })).toBe(false);
    expect(isShiny({ ...card, shiny: true })).toBe(true);
  });

  it('Gallade 244/236 já guardada sem a marca também é shiny', () => {
    expect(isShiny(gallade)).toBe(true);
    expect(isShiny({ ...gallade, shiny: false })).toBe(true);
  });
});
