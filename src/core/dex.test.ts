import { describe, expect, it } from 'vitest';
import { seededRng } from './battle';
import { dexIdOfPiece, dexIdsFor, dexPieces, generationOf, GENERATIONS, parseSpeciesList, prettyPokemonName, sourceLabel } from './dex';
import { makeWhoQuestions } from './minigames';

const names = new Map<number, string>(Array.from({ length: 1025 }, (_, i) => [i + 1, `Mon ${i + 1}`]));

describe('gerações', () => {
  it('cobrem a Pokédex de 1 a 1025 sem buraco nem sobreposição', () => {
    expect(GENERATIONS[0]!.from).toBe(1);
    for (let i = 1; i < GENERATIONS.length; i++) expect(GENERATIONS[i]!.from).toBe(GENERATIONS[i - 1]!.to + 1);
    expect(GENERATIONS[GENERATIONS.length - 1]!.to).toBe(1025);
  });

  it('diz a geração de um número', () => {
    expect(generationOf(25)).toBe(1);
    expect(generationOf(152)).toBe(2);
    expect(generationOf(1008)).toBe(9);
    expect(generationOf(5000)).toBeNull();
  });

  it('rotula a origem do sorteio', () => {
    expect(sourceLabel({ kind: 'cards' })).toBe('Minhas cartas');
    expect(sourceLabel({ kind: 'random' })).toContain('todas');
    expect(sourceLabel({ kind: 'gen', gen: 4 })).toBe('Geração IV · Sinnoh');
  });
});

describe('nomes', () => {
  it('deixa o nome do PokeAPI legível', () => {
    expect(prettyPokemonName('pikachu')).toBe('Pikachu');
    expect(prettyPokemonName('great-tusk')).toBe('Great Tusk');
    expect(prettyPokemonName('mr-mime')).toBe('Mr. Mime');
    expect(prettyPokemonName('nidoran-f')).toBe('Nidoran♀');
    expect(prettyPokemonName('ho-oh')).toBe('Ho-Oh');
  });

  it('lê a lista de espécies e ignora entradas estranhas', () => {
    const list = parseSpeciesList({
      results: [
        { name: 'bulbasaur', url: 'https://pokeapi.co/api/v2/pokemon-species/1/' },
        { name: 'mr-mime', url: 'https://pokeapi.co/api/v2/pokemon-species/122/' },
        { name: 'sem-url' },
        { name: 'ruim', url: 'https://pokeapi.co/api/v2/pokemon-species/abc/' },
        null,
      ],
    });
    expect([...list]).toEqual([[1, 'Bulbasaur'], [122, 'Mr. Mime']]);
    expect(parseSpeciesList(null).size).toBe(0);
    expect(parseSpeciesList({ results: 'x' }).size).toBe(0);
  });
});

describe('sorteio por origem', () => {
  it('uma geração só tem números da própria faixa, e aleatório tem todos', () => {
    const gen2 = dexIdsFor({ kind: 'gen', gen: 2 }, names);
    expect(gen2[0]).toBe(152);
    expect(gen2[gen2.length - 1]).toBe(251);
    expect(gen2).toHaveLength(100);
    expect(dexIdsFor({ kind: 'random' }, names)).toHaveLength(1025);
  });

  it('só usa números com nome conhecido', () => {
    const partial = new Map<number, string>([[1, 'A'], [2, 'B'], [4, 'D']]);
    expect(dexIdsFor({ kind: 'gen', gen: 1 }, partial)).toEqual([1, 2, 4]);
    expect(dexIdsFor({ kind: 'gen', gen: 9 }, partial)).toEqual([]);
  });

  it('vira 5 perguntas sem repetir, com alternativas da mesma geração', () => {
    const pieces = dexPieces(dexIdsFor({ kind: 'gen', gen: 3 }, names), names);
    const questions = makeWhoQuestions(pieces, seededRng(9));
    expect(questions).toHaveLength(5);
    expect(new Set(questions.map((q) => q.piece.id)).size).toBe(5);
    for (const q of questions) {
      const id = dexIdOfPiece(q.piece)!;
      expect(generationOf(id)).toBe(3);
      for (const option of q.options) expect(generationOf(Number(option.replace('Mon ', '')))).toBe(3);
    }
  });

  it('reconhece só peças do sorteio', () => {
    expect(dexIdOfPiece({ id: 'dex-25', name: 'x', spriteKey: 'x' })).toBe(25);
    expect(dexIdOfPiece({ id: 'sv1-25', name: 'x', spriteKey: 'x' })).toBeNull();
  });
});
