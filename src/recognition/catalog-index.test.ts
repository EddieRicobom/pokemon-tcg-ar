import { describe, expect, it } from 'vitest';
import { CatalogLookup, digitVariants, loadCatalogIndex } from './catalog-index';
import type { CatalogIndexData, IndexCandidate } from './catalog-index';
import { parseBottomText } from './parse-ocr';
import type { ParsedBottom } from './parse-ocr';
import { nameSimilarity, normalizeName } from './text';

const data: CatalogIndexData = {
  version: 1,
  generatedAt: '2026-10-11T00:00:00Z',
  sets: [
    { id: 'base1', name: 'Base Set', official: 102, total: 102, release: '1999-01-09', code: 'BS', serie: 'base', cards: [['4', 'Charizard'], ['58', 'Pikachu']] },
    { id: 'base2', name: 'Jungle', official: 64, total: 64, release: '1999-06-16', cards: [['60', 'Pikachu']] },
    { id: 'hgss4', name: 'Triumphant', official: 102, total: 102, release: '2010-11-03', cards: [['58', 'Gengar']] },
    { id: 'sv03.5', name: '151', ptName: '151', official: 165, total: 207, release: '2023-09-22', code: 'MEW', cards: [['025', 'Pikachu'], ['006', 'Charizard ex', 'Charizard ex']] },
    { id: 'swsh12tg', name: 'Lost Origin Trainer Gallery', official: 30, total: 30, cards: [['TG05', 'Mimikyu']] },
  ],
};
const lookup = new CatalogLookup(data);

describe('CatalogLookup', () => {
  it('busca manual: nome parcial, número e combinação; mais recente primeiro', () => {
    expect(lookup.search('pika').map((m) => m.id)).toEqual(['sv03.5-025', 'base2-60', 'base1-58']);
    expect(lookup.search('pikachu', 58).map((m) => m.id)).toEqual(['base1-58']);
    expect(lookup.search('', 25).map((m) => m.id)).toEqual(['sv03.5-025']);
    expect(lookup.search('')).toEqual([]);
    expect(lookup.search('charzard').map((m) => m.id)).toContain('base1-4'); // erro de digitação
  });

  it('busca manual: miniatura só quando o índice sabe a série da coleção', () => {
    expect(lookup.search('pikachu', 58)[0]?.thumb).toBe('https://assets.tcgdex.net/en/base/base1/58/low.webp');
    expect(lookup.search('pikachu', 60)[0]?.thumb).toBeUndefined();
  });

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

describe('coleções japonesas (ex.: SV8a 136/187)', () => {
  const ja = new CatalogLookup({
    version: 1,
    generatedAt: '2026-11-03T00:00:00Z',
    sets: [
      { id: 'SV8a', name: 'テラスタルフェスex', lang: 'ja', official: 187, total: 237, release: '2024-12-06', code: 'SV8a', serie: 'SV', cards: [['136', 'テラパゴスex', 'Terapagos ex', 1024], ['001', 'スボミー', 'Budew', 406]] },
    ],
  });

  it('"136/187" chega à carta japonesa, com a espécie do índice', () => {
    const [best] = ja.candidates(parseBottomText('136/187'), []);
    expect(best).toMatchObject({ id: 'SV8a-136', dexId: 1024, altNames: ['Terapagos ex'] });
    expect(ja.byId('SV8a-136')?.dexId).toBe(1024);
  });

  it('busca manual pelo nome em inglês, com miniatura do idioma japonês', () => {
    const [match] = ja.search('terapagos');
    expect(match).toMatchObject({ id: 'SV8a-136', name: 'テラパゴスex' });
    expect(match?.thumb).toBe('https://assets.tcgdex.net/ja/SV/SV8a/136/low.webp');
  });
});

describe('busca manual em japonês (traduz o nome)', () => {
  const multi = new CatalogLookup({
    version: 1,
    generatedAt: '2026-11-03T00:00:00Z',
    sets: [
      { id: 'sv08.5', name: 'Prismatic Evolutions', official: 131, total: 180, release: '2025-01-17', cards: [['092', 'Terapagos ex'], ['093', 'Pikachu']] },
      { id: 'SV8a', name: 'テラスタルフェスex', lang: 'ja', official: 187, total: 237, release: '2024-12-06', serie: 'SV', cards: [['136', 'テラパゴスex', 'Terapagos ex', 1024]] },
    ],
  });

  it('acha a carta japonesa digitando em japonês (katakana ou hiragana) e mostra o nome em inglês', () => {
    for (const query of ['テラパゴス', 'てらぱごす']) {
      const match = multi.search(query).find((m) => m.id === 'SV8a-136');
      expect(match).toMatchObject({ name: 'テラパゴスex', altName: 'Terapagos ex' });
    }
  });

  it('o nome em japonês também acha as cartas em inglês da mesma espécie', () => {
    expect(multi.search('テラパゴス').map((m) => m.id)).toEqual(expect.arrayContaining(['sv08.5-092', 'SV8a-136']));
    expect(multi.search('テラパゴス').map((m) => m.id)).not.toContain('sv08.5-093');
  });

  it('nome em inglês acha a carta japonesa; busca em japonês sem tradução só acha o próprio nome', () => {
    expect(multi.search('terapagos').map((m) => m.id)).toContain('SV8a-136');
    expect(multi.search('ピカチュウ')).toEqual([]);
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

describe('dígitos confundidos pelo OCR', () => {
  it('gera variações de um dígito sem repetir o original', async () => {
    const { digitVariants } = await import('./catalog-index');
    const variants = digitVariants(60);
    expect(variants).toContain(80);
    expect(variants).toContain(50);
    expect(variants).not.toContain(60);
    expect(digitVariants(1)).toEqual([7]);
  });
});

describe('variantCandidates', () => {
  it('"80/64" (60 lido como 80) leva a Jungle 60, marcada como variante', () => {
    const found = lookup.variantCandidates(parseBottomText('80/64'), [], new Set());
    expect(found.map((c) => c.id)).toContain('base2-60');
    expect(found.every((c) => c.viaVariant)).toBe(true);
  });

  it('não repete ids já tentados e mantém o prefixo (TG06 → TG05, nunca 05 puro)', () => {
    const found = lookup.variantCandidates(parseBottomText('80/64'), [], new Set(['base2-60']));
    expect(found.map((c) => c.id)).not.toContain('base2-60');
    const tg = lookup.variantCandidates(parseBottomText('TG06/TG30'), [], new Set());
    expect(tg.map((c) => c.id)).toEqual(['swsh12tg-TG05']);
    expect(lookup.variantCandidates(parseBottomText('06/30'), [], new Set()).map((c) => c.id)).not.toContain('swsh12tg-TG05');
  });

  it('sem número lido não há variantes', () => {
    expect(lookup.variantCandidates({}, ['Pikachu'], new Set())).toEqual([]);
  });
});

/**
 * Cópia fiel da lógica ANTIGA (varredura completa com regex por carta), mantida só para provar que os índices
 * pré-computados devolvem exatamente os mesmos candidatos, na mesma ordem, com o mesmo total.
 */
function legacyParseLocalId(localId: string): { prefix: string; value: number } | null {
  const match = /^([A-Za-z]*)0*(\d+)$/.exec(localId);
  if (!match) return null;
  return { prefix: (match[1] ?? '').toUpperCase(), value: Number.parseInt(match[2] ?? '0', 10) };
}

function legacyCandidatesWithTotal(
  indexData: CatalogIndexData,
  bottom: ParsedBottom,
  nameGuesses: string[],
  limit = 8,
): { list: IndexCandidate[]; total: number } {
  const result: IndexCandidate[] = [];
  const number = bottom.number;
  const nameKeys = nameGuesses.map(normalizeName).filter(Boolean);
  const strictNumber = !!(number && number.total);

  for (const set of indexData.sets) {
    let setPrior = 0;
    if (number?.total && number.total.prefix === '') {
      if (set.official === number.total.value || set.total === number.total.value) setPrior += 0.4;
      else if (Math.abs(set.official - number.total.value) <= 2) setPrior += 0.2;
    }
    if (bottom.setCode && set.code && set.code.toUpperCase() === bottom.setCode.toUpperCase()) setPrior += 0.2;

    for (const [localId, name, ptName, dexId] of set.cards) {
      let prior = setPrior;
      let numberMatched = false;
      if (number) {
        const local = legacyParseLocalId(localId);
        if (local && local.value === number.value && local.prefix === number.prefix.toUpperCase()) {
          numberMatched = true;
          prior += 0.3;
        }
      }
      if (strictNumber) {
        if (!numberMatched) continue;
        if (nameGuesses.length > 0) {
          const similarity = Math.max(
            ...nameGuesses.map((guess) => Math.max(nameSimilarity(guess, name), ptName ? nameSimilarity(guess, ptName) : 0)),
          );
          prior += similarity * 0.4;
        }
      } else {
        if (!numberMatched && nameKeys.length === 0) continue;
        if (nameGuesses.length > 0) {
          const similarity = Math.max(
            ...nameGuesses.map((guess) => Math.max(nameSimilarity(guess, name), ptName ? nameSimilarity(guess, ptName) : 0)),
          );
          if (!numberMatched && similarity < 0.75) continue;
          prior += similarity * 0.4;
        } else if (!numberMatched) {
          continue;
        }
      }
      result.push({
        id: `${set.id}-${localId}`,
        setId: set.id,
        localId,
        name,
        altNames: ptName ? [ptName] : undefined,
        setOfficial: set.official,
        setTotal: set.total,
        setCode: set.code,
        release: set.release,
        ...(dexId ? { dexId } : {}),
        prior,
      });
    }
  }
  result.sort((a, b) => b.prior - a.prior || (b.release ?? '').localeCompare(a.release ?? ''));
  return { list: result.slice(0, limit), total: result.length };
}

function legacyVariantCandidates(
  indexData: CatalogIndexData,
  bottom: ParsedBottom,
  nameGuesses: string[],
  excludeIds: ReadonlySet<string>,
  limit = 6,
): IndexCandidate[] {
  const number = bottom.number;
  if (!number) return [];
  const numberValues = new Map<number, number>([[number.value, 0]]);
  for (const v of digitVariants(number.value)) numberValues.set(v, 1);
  const totalValues = new Map<number, number>();
  if (number.total && number.total.prefix === '') {
    totalValues.set(number.total.value, 0);
    for (const v of digitVariants(number.total.value)) totalValues.set(v, 1);
  }
  const result: IndexCandidate[] = [];
  for (const set of indexData.sets) {
    let changed = 0;
    if (totalValues.size > 0) {
      const penalty = totalValues.get(set.official);
      if (penalty === undefined) continue;
      changed += penalty;
    }
    for (const [localId, name, ptName, dexId] of set.cards) {
      const local = legacyParseLocalId(localId);
      if (!local || local.prefix !== number.prefix.toUpperCase()) continue;
      const numberPenalty = numberValues.get(local.value);
      if (numberPenalty === undefined) continue;
      const id = `${set.id}-${localId}`;
      if (excludeIds.has(id)) continue;
      let prior = 0.3 - 0.1 * (changed + numberPenalty);
      if (nameGuesses.length > 0) {
        const similarity = Math.max(
          ...nameGuesses.map((guess) => Math.max(nameSimilarity(guess, name), ptName ? nameSimilarity(guess, ptName) : 0)),
        );
        prior += similarity * 0.3;
      }
      result.push({
        id, setId: set.id, localId, name, altNames: ptName ? [ptName] : undefined, setOfficial: set.official,
        setTotal: set.total, setCode: set.code, release: set.release, ...(dexId ? { dexId } : {}), prior, viaVariant: true,
      });
    }
  }
  result.sort((a, b) => b.prior - a.prior || (b.release ?? '').localeCompare(a.release ?? ''));
  return result.slice(0, limit);
}

/** Catálogo determinístico de 40 sets × 75 cartas (3.000), cobrindo prefixos, zeros, nomes, altNames e dexId. */
function equivalenceCatalog(): CatalogIndexData {
  let seed = 0x2f6e2b1;
  const next = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const names = ['Pikachu', 'Pikachu ex', 'Charizard ex', 'Mimikyu', 'Gengar', 'Terapagos ex', 'Budew', 'Eevee', 'Mew', 'Snorlax'];
  const alts = ['Pikachu', 'Carapicu', 'Mimikyu', 'Gengar', 'Terapagos', 'Bulbasauro', 'Eevee', 'Mew'];
  const officials = [60, 102, 108, 165, 187, 30];
  const sets = Array.from({ length: 40 }, (_, s) => {
    const official = officials[s % officials.length]!;
    const cards: [string, string, string?, number?][] = [
      ['025', 'Pikachu', 'Pikachu', 25],
      ['25', 'Pikachu ex'],
      ['080', 'Pikachu'],
      ['80', 'Gengar', 'Gengar'],
      ['TG05', 'Mimikyu', 'Mimikyu'],
      ['TG06', 'Mimikyu ex'],
      ['SWSH025', 'Eevee', 'Eevee'],
      ['060', 'Gengar ex', 'Gengar', 94],
      ['SWSH001a', 'Budew'],
    ];
    for (let i = 0; i < 66; i++) {
      const base = 1 + Math.floor(next() * official);
      let localId = String(base);
      if (i % 11 === 0) localId = `TG${String(base).padStart(2, '0')}`;
      else if (i % 17 === 0) localId = `SWSH${String(base).padStart(3, '0')}`;
      else if (i % 37 === 0) localId = `SWSH${base}a`;
      else if (i % 5 === 0) localId = String(base).padStart(3, '0');
      const name = names[Math.floor(next() * names.length)] ?? 'Pikachu';
      const altName = i % 4 === 0 ? alts[Math.floor(next() * alts.length)] : undefined;
      const dexId = i % 9 === 0 ? 900 + (i % 50) : undefined;
      cards.push([localId, name, altName, dexId]);
    }
    return {
      id: `eq${s}`,
      name: `Equivalence ${s}`,
      ptName: s % 2 === 0 ? `Equivalencia ${s}` : undefined,
      official,
      total: official + (s % 4),
      release: `20${10 + (s % 15)}-0${1 + (s % 9)}-1${s % 10}`,
      code: s % 3 === 0 ? 'MEW' : undefined,
      cards,
    };
  });
  return { version: 1, generatedAt: '2026-11-25T00:00:00Z', sets };
}

describe('equivalência com a varredura ingênua (índices pré-computados)', () => {
  const indexData = equivalenceCatalog();
  const indexed = new CatalogLookup(indexData);

  const bottoms: [string, ParsedBottom][] = [
    ['número + total', parseBottomText('25/102')],
    ['zeros à esquerda', parseBottomText('025/165')],
    ['número + total com prefixo', parseBottomText('TG05/TG30')],
    ['total próximo', parseBottomText('25/108')],
    ['código do set + número/total', parseBottomText('MEW EN 025/102')],
    ['número sem total (promo)', parseBottomText('TG05')],
    ['número sem total SWSH', parseBottomText('SWSH025')],
    ['número sem total, sem prefixo', { number: { prefix: '', value: 25, raw: '25' } }],
    ['total sem set exato', parseBottomText('25/999')],
    ['só nome', {}],
    ['código do set sem número', { setCode: 'MEW' }],
  ];
  const guessSets: string[][] = [[], ['Pikachu'], ['Pikachu ex', 'Gengar'], ['!!!'], ['Zzzzz']];

  it('candidatesWithTotal: mesmos candidatos, ordem e total', () => {
    expect(indexData.sets).toHaveLength(40);
    expect(indexed.cardCount).toBe(3000);
    for (const [label, bottom] of bottoms) {
      for (const names of guessSets) {
        for (const limit of [1, 6, 50]) {
          const expected = legacyCandidatesWithTotal(indexData, bottom, names, limit);
          const actual = indexed.candidatesWithTotal(bottom, names, limit);
          expect(actual, `${label} / nomes=[${names.join(', ')}] / limite=${limit}`).toEqual(expected);
        }
      }
    }
  }, 30_000);

  it('variantCandidates: mesmas variantes, ordem, prior e viaVariant', () => {
    const variantBottoms: [string, ParsedBottom][] = [
      ['variante de número + total', parseBottomText('85/102')],
      ['total presente nos sets', parseBottomText('85/60')],
      ['prefixo TG', parseBottomText('TG06/TG30')],
      ['zeros à esquerda', parseBottomText('080/062')],
      ['número sem total', parseBottomText('SWSH025')],
      ['total sem set', parseBottomText('25/999')],
    ];
    const excludeSets: ReadonlySet<string>[] = [
      new Set(),
      new Set(['eq0-025', 'eq1-TG05', 'eq2-080', 'eq3-25']),
    ];
    const variantGuesses: string[][] = [[], ['Pikachu'], ['Mimikyu', 'Gengar']];
    for (const [label, bottom] of variantBottoms) {
      for (const excludeIds of excludeSets) {
        for (const names of variantGuesses) {
          for (const limit of [1, 6, 50]) {
            const expected = legacyVariantCandidates(indexData, bottom, names, excludeIds, limit);
            const actual = indexed.variantCandidates(bottom, names, excludeIds, limit);
            expect(actual, `${label} / nomes=[${names.join(', ')}] / limite=${limit}`).toEqual(expected);
          }
        }
      }
    }
  }, 30_000);

  it('byId e hasCard respondem como a varredura direta, inclusive para ids inexistentes', () => {
    for (const set of indexData.sets) {
      for (const [localId] of set.cards) {
        const id = `${set.id}-${localId}`;
        expect(indexed.hasCard(id), id).toBe(true);
        expect(indexed.byId(id), id).toMatchObject({ id, setId: set.id, localId });
      }
    }
    expect(indexed.hasCard('eq0-nao-existe')).toBe(false);
    expect(indexed.byId('eq0-nao-existe')).toBeNull();
  });
});
