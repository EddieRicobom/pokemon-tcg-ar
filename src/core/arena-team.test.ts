import { describe, expect, it } from 'vitest';
import { parseArenaTeam, seedArenaTeam } from './arena-team';

describe('parseArenaTeam', () => {
  it('sem nada gravado pede a migração', () => {
    expect(parseArenaTeam(null)).toBeNull();
  });

  it.each(['não é json', '{"x":1}', '42', 'null', '[1,2]'])('conteúdo corrompido (%s) pede a migração em vez de quebrar', (raw) => {
    expect(parseArenaTeam(raw)).toBeNull();
  });

  it('lista vazia é escolha válida (automática), não falta de dado', () => {
    expect(parseArenaTeam('[]')).toEqual([]);
  });

  it('descarta o que não é id, repetidos e o que passa de seis', () => {
    expect(parseArenaTeam('["a",1,"a","b","c","d","e","f","g"]')).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
});

describe('seedArenaTeam', () => {
  const known = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);

  it('pega os seis primeiros válidos, pulando quem sumiu e repetidos', () => {
    expect(seedArenaTeam(['x', 'a', 'a', 'b', 'y', 'c', 'd', 'e', 'f', 'g', 'h'], known)).toEqual({ ids: ['a', 'b', 'c', 'd', 'e', 'f'], settled: true });
  });

  it('não altera a equipe de origem', () => {
    const saved = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    seedArenaTeam(saved, known);
    expect(saved).toHaveLength(7);
  });

  it('equipe da Caixa vazia decide pela automática', () => {
    expect(seedArenaTeam([], known)).toEqual({ ids: [], settled: true });
  });

  it('equipe da Caixa sem ninguém neste aparelho não encerra a migração', () => {
    expect(seedArenaTeam(['x', 'y'], known)).toEqual({ ids: [], settled: false });
  });
});
