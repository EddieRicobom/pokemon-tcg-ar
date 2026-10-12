import { describe, expect, it } from 'vitest';
import { CatalogLookup, loadCatalogIndex } from './catalog-index';
import type { CatalogIndexData } from './catalog-index';
import { parseBottomText } from './parse-ocr';

const data: CatalogIndexData = {
  version: 1,
  generatedAt: '2026-10-11T00:00:00Z',
  sets: [
    { id: 'base1', name: 'Base Set', official: 102, total: 102, release: '1999-01-09', code: 'BS', cards: [['4', 'Charizard'], ['58', 'Pikachu']] },
    { id: 'base2', name: 'Jungle', official: 64, total: 64, release: '1999-06-16', cards: [['60', 'Pikachu']] },
    { id: 'hgss4', name: 'Triumphant', official: 102, total: 102, release: '2010-11-03', cards: [['58', 'Gengar']] },
    { id: 'sv03.5', name: '151', ptName: '151', official: 165, total: 207, release: '2023-09-22', code: 'MEW', cards: [['025', 'Pikachu'], ['006', 'Charizard ex', 'Charizard ex']] },
    { id: 'swsh12tg', name: 'Lost Origin Trainer Gallery', official: 30, total: 30, cards: [['TG05', 'Mimikyu']] },
  ],
};
const lookup = new CatalogLookup(data);

describe('CatalogLookup', () => {
  it('conta sets e cartas', () => {
    expect(lookup.setCount).toBe(5);
    expect(lookup.cardCount).toBe(7);
  });

  it('número + total chegam à impressão exata, mesmo com nomes diferentes lidos', () => {
    const ids = lookup.candidates(parseBottomText('58/102'), []).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['base1-58', 'hgss4-58']));
    expect(ids).not.toContain('base2-60');
  });

  it('o nome ordena as impressões com o mesmo número/total', () => {
    const [first] = lookup.candidates(parseBottomText('58/102'), ['Pikachu']);
    expect(first?.id).toBe('base1-58');
    const [gengar] = lookup.candidates(parseBottomText('58/102'), ['Gengar']);
    expect(gengar?.id).toBe('hgss4-58');
  });

  it('zeros à esquerda e código do set', () => {
    const [first] = lookup.candidates(parseBottomText('MEW EN 025/165'), []);
    expect(first).toMatchObject({ id: 'sv03.5-025', setCode: 'MEW' });
  });

  it('prefixos de galeria (TG05/TG30)', () => {
    const [first] = lookup.candidates(parseBottomText('TG05/TG30'), []);
    expect(first?.id).toBe('swsh12tg-TG05');
  });

  it('sem número, só o nome e só com semelhança alta', () => {
    const ids = lookup.candidates({}, ['Pikachu']).map((c) => c.id);
    expect(ids.sort()).toEqual(['base1-58', 'base2-60', 'sv03.5-025']);
    expect(lookup.candidates({}, [])).toEqual([]);
    expect(lookup.candidates({}, ['Zzzzzz'])).toEqual([]);
  });

  it('respeita o limite de candidatos', () => {
    expect(lookup.candidates({}, ['Pikachu'], 2)).toHaveLength(2);
  });
});

describe('loadCatalogIndex', () => {
  it('devolve null quando o arquivo não existe (índice é opcional)', async () => {
    const fake = (async () => new Response('nope', { status: 404 })) as typeof fetch;
    expect(await loadCatalogIndex('/x.json', fake)).toBeNull();
  });

  it('devolve null com JSON inválido ou erro de rede', async () => {
    expect(await loadCatalogIndex('/x.json', (async () => new Response('{"a":1}')) as typeof fetch)).toBeNull();
    expect(await loadCatalogIndex('/x.json', (async () => { throw new Error('offline'); }) as typeof fetch)).toBeNull();
  });

  it('carrega um índice válido', async () => {
    const loaded = await loadCatalogIndex('/x.json', (async () => new Response(JSON.stringify(data))) as typeof fetch);
    expect(loaded?.cardCount).toBe(7);
  });
});
