import { describe, expect, it } from 'vitest';
import {
  DEX_COINS_PER_NEW, DEX_MILESTONES, emptyPokedex, generationProgress, hasSeen, normalizePokedex, registerSightings, seenCount,
} from './pokedex';

describe('Pokédex', () => {
  it('registra espécie nova uma vez, com moedas, mesmo repetida na lista', () => {
    const r = registerSightings(emptyPokedex(), [25, 25, 4], 'pins', 1000);
    expect(r.added.sort((a, b) => a - b)).toEqual([4, 25]);
    expect(r.coins).toBe(2 * DEX_COINS_PER_NEW);
    expect(seenCount(r.dex)).toBe(2);
    expect(r.dex.seen['25']).toEqual({ first: 1000, count: 1, sources: ['pins'] });
  });

  it('um novo encontro só conta mais uma vez e junta a origem, sem pagar de novo', () => {
    const first = registerSightings(emptyPokedex(), [25], 'carta', 1000).dex;
    const again = registerSightings(first, [25], 'torre', 2000);
    expect(again.added).toEqual([]);
    expect(again.coins).toBe(0);
    expect(again.dex.seen['25']).toEqual({ first: 1000, count: 2, sources: ['carta', 'torre'] });
    expect(first.seen['25']!.count).toBe(1);
  });

  it('ignora números que não são espécies da Pokédex nacional', () => {
    const r = registerSightings(emptyPokedex(), [0, -1, 1.5, 99999, NaN, 1], 'vila', 1);
    expect(r.added).toEqual([1]);
  });

  it('paga cada marco uma única vez', () => {
    let dex = emptyPokedex();
    const ids = Array.from({ length: 10 }, (_, i) => i + 1);
    const hit = registerSightings(dex, ids, 'carta', 1);
    expect(hit.milestones.map((m) => m.count)).toEqual([10]);
    expect(hit.coins).toBe(10 * DEX_COINS_PER_NEW + DEX_MILESTONES[0]!.coins);
    dex = hit.dex;
    const next = registerSightings(dex, [11], 'carta', 2);
    expect(next.milestones).toEqual([]);
    expect(next.coins).toBe(DEX_COINS_PER_NEW);
  });

  it('descarta dados inválidos ao carregar', () => {
    const dex = normalizePokedex({
      version: 1,
      seen: { '25': { first: 5, count: 3, sources: ['pins', 'pins', 'lixo'] }, abc: { first: 1, count: 1, sources: [] }, '99999': { first: 1, count: 1, sources: [] }, '7': 'x' },
      claimed: [10, 77],
    });
    expect(Object.keys(dex.seen)).toEqual(['25']);
    expect(dex.seen['25']).toEqual({ first: 5, count: 3, sources: ['pins'] });
    expect(dex.claimed).toEqual([10]);
    expect(normalizePokedex(null)).toEqual(emptyPokedex());
    expect(hasSeen(dex, 25)).toBe(true);
  });

  it('conta o progresso por geração', () => {
    const dex = registerSightings(emptyPokedex(), [1, 25, 152, 906], 'carta', 1).dex;
    const gens = generationProgress(dex);
    expect(gens[0]).toEqual({ label: 'I', seen: 2, total: 151 });
    expect(gens[1]!.seen).toBe(1);
    expect(gens[8]!.seen).toBe(1);
  });
});
