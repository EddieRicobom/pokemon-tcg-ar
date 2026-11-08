import { describe, expect, it } from 'vitest';
import { boxSummary } from './box-summary';
import { compareStats, replaceMember, suggestTeam, teamCoverage } from './team-insight';

const mon = (id: string, dexId: number | undefined, name = id): { id: string; name: string; dexId: number | undefined } => ({ id, name, dexId });

describe('teamCoverage', () => {
  it('usa os dois golpes reais e a tabela de tipos da arena', () => {
    const { covered, missing, unknown } = teamCoverage([mon('a', 6, 'Charizard')]);
    expect(covered).toContain('grass');
    expect(covered).not.toContain('water');
    expect(missing).toContain('water');
    expect(unknown).toEqual([]);
  });

  it('avisa do tipo que pega dois ou mais da equipe', () => {
    const { threats } = teamCoverage([mon('a', 4), mon('b', 37), mon('c', 58)]); // Charmander, Vulpix, Growlithe
    expect(threats.every((t) => t.weak === 3 && t.resist === 0)).toBe(true);
    expect(threats.map((t) => t.type)).toEqual(expect.arrayContaining(['ground', 'water', 'rock']));
  });

  it('quem resiste abate a fraqueza', () => {
    // Dois Fogo fracos a Água e dois Água que resistem: não é ameaça.
    const { threats } = teamCoverage([mon('a', 4), mon('b', 37), mon('c', 7), mon('d', 54)]);
    expect(threats.map((t) => t.type)).not.toContain('water');
  });

  it('sem número da Pokédex fica na lista de falta, sem inventar cobertura', () => {
    const coverage = teamCoverage([mon('x', undefined, 'Treinador')]);
    expect(coverage.unknown).toEqual(['Treinador']);
    expect(coverage.covered).toEqual([]);
    expect(coverage.threats).toEqual([]);
  });
});

describe('suggestTeam', () => {
  const pool = [mon('a', 6), mon('b', 9), mon('c', 3), mon('d', 25), mon('e', 149), mon('f', 150), mon('g', 19), mon('h', 129)];

  it('escolhe no máximo o limite, com um motivo por Pokémon, e deixa os fracos de fora', () => {
    const { ids, picks } = suggestTeam(pool, 6);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(picks).toHaveLength(6);
    for (const pick of picks) expect(pick.reason.length).toBeGreaterThan(5);
    expect(ids).toContain('f'); // Mewtwo: maior total
    expect(ids).not.toContain('g'); // Rattata
    expect(ids).not.toContain('h'); // Magikarp
  });

  it('é determinística', () => {
    expect(suggestTeam(pool, 6)).toEqual(suggestTeam([...pool].reverse(), 6));
  });

  it('prefere espécies diferentes e, se repetir para completar, diz isso', () => {
    const { ids, picks } = suggestTeam([mon('a', 150), mon('b', 150), mon('c', 19)], 3);
    expect(ids.slice(0, 2).sort()).toEqual(['a', 'c']);
    expect(picks[2]!.reason).toContain('repetida');
  });

  it('não sugere quem não tem número da Pokédex e não completa com invenção', () => {
    const { ids } = suggestTeam([mon('a', 25), mon('x', undefined)], 6);
    expect(ids).toEqual(['a']);
  });
});

describe('compareStats', () => {
  it('mostra a diferença de cada atributo e do total', () => {
    const result = compareStats(boxSummary(150), boxSummary(19))!;
    expect(result.rows).toHaveLength(6);
    expect(result.total).toBe(boxSummary(150).total! - boxSummary(19).total!);
    expect(result.rows.find((r) => r.label === 'PS')!.diff).toBe(106 - 30);
  });

  it('sem dado de um dos lados, não compara', () => {
    expect(compareStats({ stats: null, total: null }, boxSummary(19))).toBeNull();
  });
});

describe('replaceMember', () => {
  it('troca na mesma vaga', () => {
    expect(replaceMember(['a', 'b', 'c'], 'b', 'z')).toEqual(['a', 'z', 'c']);
  });

  it('não duplica nem troca quem não está na equipe', () => {
    expect(replaceMember(['a', 'b'], 'x', 'z')).toEqual(['a', 'b']);
    expect(replaceMember(['a', 'b'], 'a', 'b')).toEqual(['a', 'b']);
  });
});
