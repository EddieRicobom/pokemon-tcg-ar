import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { syntheticCard } from '../recognition/__fixtures__/synthetic';
import { computeFeatures } from '../recognition/hash';
import type { CardRecordLike } from '../recognition/pipeline';
import { MemoryBackend } from './assets';
import { CardCache, targetKey } from './card-cache';
import type { CardCacheDeps } from './card-cache';
import { openCacheDb } from './db';
import type { CacheDb } from './db';
import { TARGET_VERSION } from '../ar/target';
import { SpriteNetworkError } from '../ar/sprite-source';

const pikachu: CardRecordLike = {
  id: 'base1-58', name: 'Pikachu', setId: 'base1', setName: 'Base Set', localId: '58', setOfficial: 102, setTotal: 102,
  dexIds: [25], imageBase: 'https://assets.example/base1/58',
};
const pikachu2: CardRecordLike = { ...pikachu, id: 'swsh1-65', setId: 'swsh1', setName: 'Sword & Shield', localId: '65', imageBase: 'https://assets.example/swsh1/65' };
const trainer: CardRecordLike = { ...pikachu, id: 'base1-91', name: 'Bill', localId: '91', dexIds: [], imageBase: 'https://assets.example/base1/91' };
const miraidon: CardRecordLike = { ...pikachu, id: 'sv01-81', name: 'Miraidon', localId: '081', dexIds: [1008], imageBase: 'https://assets.example/sv01/81' };

let dbCounter = 0;
let db: CacheDb;
let backend: MemoryBackend;
let clock = 1000;
let fetchLog: string[];
let failing: Set<string>;
let spriteCalls: number[];

const gif = () => new Blob([new Uint8Array(500)], { type: 'image/gif' });
const fakeFetch: typeof fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  fetchLog.push(url);
  if (failing.has(url)) throw new TypeError('offline');
  return new Response(new Blob([new Uint8Array(300)], { type: 'image/webp' }));
}) as typeof fetch;

function make(overrides: Partial<CardCacheDeps> = {}): CardCache {
  return new CardCache({
    db, assets: backend, fetchImpl: fakeFetch, now: () => ++clock, backoffMs: 0, retries: 1,
    fetchSprite: async (dexId) => {
      spriteCalls.push(dexId);
      if (failing.has(`sprite:${dexId}`)) throw new SpriteNetworkError('offline', 'x');
      if (dexId === 1008) return { kind: 'static', url: 'https://sprites/1008.png', blob: new Blob([new Uint8Array(100)], { type: 'image/png' }) };
      if (dexId === 999999) return null;
      return { kind: 'gif', url: `https://sprites/${dexId}.gif`, blob: gif() };
    },
    decodeReference: async () => syntheticCard(1),
    ...overrides,
  });
}

beforeEach(async () => {
  db = await openCacheDb(`teste-${++dbCounter}`);
  backend = new MemoryBackend();
  fetchLog = [];
  failing = new Set();
  spriteCalls = [];
});

describe('gravação depois do reconhecimento', () => {
  it('guarda metadados, dexId, características e referência — e nenhum quadro da câmera', async () => {
    const cache = make();
    const record = await cache.recordRecognition({
      card: pikachu, reference: syntheticCard(1), referenceBlob: new Blob([new Uint8Array(700)], { type: 'image/webp' }),
      referenceUrl: 'https://assets.example/base1/58/low.webp',
    });
    expect(record).toMatchObject({ id: 'base1-58', name: 'Pikachu', dexIds: [25], setId: 'base1', localId: '58', scanCount: 1 });
    expect(record.features?.a).toHaveLength(32);
    expect(record.reference).toMatchObject({ state: 'ok', key: 'https://assets.example/base1/58/low.webp' });
    expect([...backend.files.keys()]).toEqual(['https://assets.example/base1/58/low.webp']);
    // Nada além do que está declarado em CachedCard (sem campo de imagem do quadro).
    expect(Object.keys(record).sort()).not.toContain('frame');
  });

  it('reconhecer de novo atualiza a data e a contagem, sem duplicar', async () => {
    const cache = make();
    const first = await cache.recordRecognition({ card: pikachu });
    const second = await cache.recordRecognition({ card: pikachu });
    expect(await cache.count()).toBe(1);
    expect(second.scanCount).toBe(2);
    expect(second.lastSeenAt).toBeGreaterThan(first.lastSeenAt);
    expect(second.firstSeenAt).toBe(first.firstSeenAt);
  });

  it('lista da mais recente para a mais antiga, com status', async () => {
    const cache = make();
    await cache.recordRecognition({ card: pikachu });
    await cache.recordRecognition({ card: trainer });
    await cache.recordRecognition({ card: pikachu });
    const list = await cache.list();
    expect(list.map((c) => c.id)).toEqual(['base1-58', 'base1-91']);
    expect(list.every((c) => c.status === 'parcial')).toBe(true);
  });
});

describe('preparo (Carregar)', () => {
  it('baixa referência e sprite e marca como completo', async () => {
    const cache = make();
    await cache.recordRecognition({ card: pikachu });
    const steps: string[] = [];
    const result = await cache.prepareCard('base1-58', (p) => steps.push(p.step));
    expect(steps).toEqual(['referência', 'sprite', 'alvo de AR']);
    expect(result.card.reference.state).toBe('ok');
    expect(result.card.sprite).toMatchObject({ state: 'ok', kind: 'gif', key: 'https://sprites/25.gif' });
    expect(result.card.features).toBeDefined();
    expect(fetchLog).toEqual(['https://assets.example/base1/58/low.webp']);
    expect(result.status).toBe('completo');
  });

  it('o mesmo GIF é compartilhado entre cartas do mesmo Pokémon (deduplicação)', async () => {
    const cache = make();
    await cache.recordRecognition({ card: pikachu });
    await cache.recordRecognition({ card: pikachu2 });
    await cache.prepareCard('base1-58');
    await cache.prepareCard('swsh1-65');
    expect([...backend.files.keys()].filter((k) => k.endsWith('.gif'))).toEqual(['https://sprites/25.gif']);
    const info = await cache.storageInfo();
    expect(info.assets).toBe(3); // 2 referências + 1 GIF
    // Remover uma carta não apaga o GIF que a outra ainda usa.
    await cache.remove('base1-58');
    expect(backend.files.has('https://sprites/25.gif')).toBe(true);
    await cache.remove('swsh1-65');
    expect(backend.files.has('https://sprites/25.gif')).toBe(false);
    expect(backend.files.size).toBe(0);
  });

  it('sprite estático quando não há GIF (Miraidon) e indisponível sem Pokémon (Treinador)', async () => {
    const cache = make();
    await cache.recordRecognition({ card: miraidon });
    await cache.recordRecognition({ card: trainer });
    const m = await cache.prepareCard('sv01-81');
    expect(m.card.sprite).toMatchObject({ state: 'ok', kind: 'static' });
    const t = await cache.prepareCard('base1-91');
    expect(t.card.sprite.state).toBe('unavailable');
    expect(spriteCalls).toEqual([1008]);
  });

  it('não baixa de novo o que já está guardado', async () => {
    const cache = make();
    await cache.recordRecognition({ card: pikachu });
    await cache.prepareCard('base1-58');
    fetchLog.length = 0;
    spriteCalls.length = 0;
    await cache.prepareCard('base1-58');
    expect(fetchLog).toEqual([]);
    expect(spriteCalls).toEqual([]);
  });

  it('falha de rede vira "falhou" e Recarregar tenta só o que faltou', async () => {
    const cache = make();
    await cache.recordRecognition({ card: pikachu });
    failing.add('sprite:25');
    const first = await cache.prepareCard('base1-58');
    expect(first.card.sprite.state).toBe('error');
    expect(first.card.reference.state).toBe('ok');
    expect(first.status).toBe('falhou');
    fetchLog.length = 0;
    failing.clear();
    const second = await cache.reload('base1-58');
    expect(second.card.sprite.state).toBe('ok');
    expect(second.status).toBe('completo');
    expect(fetchLog).toEqual([]); // a referência já estava guardada
  });

  it('repete uma vez antes de desistir', async () => {
    const cache = make();
    await cache.recordRecognition({ card: pikachu });
    failing.add('sprite:25');
    await cache.prepareCard('base1-58');
    expect(spriteCalls).toEqual([25, 25]);
  });

  it('compila o alvo de AR quando há compilador e o guarda sob chave própria', async () => {
    const cache = make({ buildTarget: async () => new Blob([new Uint8Array(2000)]) });
    await cache.recordRecognition({ card: pikachu });
    const result = await cache.prepareCard('base1-58');
    expect(result.card.target).toMatchObject({ state: 'ok', key: targetKey('base1-58') });
    expect(await cache.getAssetBlob(result.card, 'target')).not.toBeNull();
  });

  it('compila o alvo com a imagem em ALTA resolução e registra a qualidade e a versão', async () => {
    const seen: number[] = [];
    const cache = make({ buildTarget: async (blob) => { seen.push(blob.size); return new Blob([new Uint8Array(2000)]); } });
    await cache.recordRecognition({ card: pikachu });
    const result = await cache.prepareCard('base1-58');
    expect(fetchLog).toContain('https://assets.example/base1/58/high.webp');
    expect(result.card.target).toMatchObject({ state: 'ok', version: TARGET_VERSION, source: 'alta' });
  });

  it('se a imagem em alta falhar, compila com a de baixa e marca como "baixa"', async () => {
    failing.add('https://assets.example/base1/58/high.webp');
    const cache = make({ buildTarget: async () => new Blob([new Uint8Array(2000)]) });
    await cache.recordRecognition({ card: pikachu });
    const result = await cache.prepareCard('base1-58');
    expect(result.card.target).toMatchObject({ state: 'ok', source: 'baixa' });
  });

  it('alvo de versão antiga é descartado e recompilado, nunca reutilizado', async () => {
    let builds = 0;
    const cache = make({ buildTarget: async () => { builds++; return new Blob([new Uint8Array(2000)]); } });
    await cache.recordRecognition({ card: pikachu });
    await cache.prepareCard('base1-58');
    // Simula um alvo gravado pelo processo antigo (sem versão, chave antiga).
    const old = (await cache.get('base1-58'))!;
    await backend.put('/__tcg-ar__/target/base1-58.mind', new Blob([new Uint8Array(10)]));
    await db.put('cards', { ...old, target: { state: 'ok', key: '/__tcg-ar__/target/base1-58.mind', bytes: 10 } });
    const fresh = make({ buildTarget: async () => { builds++; return new Blob([new Uint8Array(3000)]); } });
    const result = await fresh.prepareCard('base1-58');
    expect(builds).toBe(2);
    expect(result.card.target).toMatchObject({ state: 'ok', key: targetKey('base1-58'), version: TARGET_VERSION });
  });

  it('falha na compilação vira erro visível no alvo (não trava) e Recarregar tenta de novo', async () => {
    let fail = true;
    const cache = make({ buildTarget: async () => { if (fail) throw new Error('compilação falhou'); return new Blob([new Uint8Array(2000)]); } });
    await cache.recordRecognition({ card: pikachu });
    expect((await cache.prepareCard('base1-58')).card.target).toMatchObject({ state: 'error', error: 'compilação falhou' });
    fail = false;
    expect((await cache.reload('base1-58')).card.target.state).toBe('ok');
  });

  it('carta sem imagem de referência no TCGdex não trava o preparo', async () => {
    const cache = make();
    await cache.recordRecognition({ card: { ...pikachu, imageBase: undefined } });
    const result = await cache.prepareCard('base1-58');
    expect(result.card.reference.state).toBe('unavailable');
    expect(result.card.sprite.state).toBe('ok');
  });

  it('"Carregar todas as vistas" prepara só as cartas já reconhecidas e nada além', async () => {
    const cache = make();
    await cache.recordRecognition({ card: pikachu });
    await cache.recordRecognition({ card: miraidon });
    const progress: number[] = [];
    const summary = await cache.prepareAllViewed((p) => progress.push(p.done));
    expect(summary).toEqual({ count: 2, completo: 2, falhou: 0 });
    // Só as imagens dessas duas cartas foram pedidas.
    expect(fetchLog.sort()).toEqual(['https://assets.example/base1/58/low.webp', 'https://assets.example/sv01/81/low.webp']);
    expect(new Set(progress)).toEqual(new Set([0, 1]));
  });
});

describe('persistência e reinício', () => {
  it('uma carta reconhecida sobrevive ao reinício do app e é reconhecida pelo cache', async () => {
    const first = make();
    await first.recordRecognition({ card: pikachu, reference: syntheticCard(1) });
    await first.prepareCard('base1-58');
    db.close();

    // "Reinício": novo banco aberto sobre os mesmos dados e novas instâncias.
    const reopened = await openCacheDb(`teste-${dbCounter}`);
    db = reopened;
    const second = make();
    expect(await second.count()).toBe(1);
    const refs = await second.localReferences();
    expect(refs).toHaveLength(1);
    expect(refs[0]!.card).toMatchObject({ id: 'base1-58', dexIds: [25] });
    const expected = computeFeatures(syntheticCard(1));
    expect(Array.from(refs[0]!.features.artHash)).toEqual(Array.from(expected.artHash));
    const card = (await second.get('base1-58'))!;
    expect(card.sprite.state).toBe('ok');
    expect(await second.getAssetBlob(card, 'sprite')).not.toBeNull();
  });

  it('arquivos expulsos pelo navegador são detectados e voltam a "faltando"', async () => {
    const cache = make();
    await cache.recordRecognition({ card: pikachu });
    await cache.prepareCard('base1-58');
    await backend.clear(); // o navegador limpou o Cache Storage; o IndexedDB sobreviveu
    expect(await cache.verifyIntegrity()).toBe(2);
    const card = (await cache.get('base1-58'))!;
    expect(card.reference.state).toBe('missing');
    expect(card.sprite.state).toBe('missing');
    const result = await cache.reload('base1-58');
    expect(result.status).toBe('completo');
  });

  it('características de uma versão antiga do algoritmo são descartadas ao carregar', async () => {
    const cache = make();
    const record = await cache.recordRecognition({ card: pikachu, reference: syntheticCard(1) });
    await db.put('cards', { ...record, features: { ...record.features!, v: 0 } });
    const fresh = make();
    expect(await fresh.localReferences()).toEqual([]);
    expect((await fresh.get('base1-58'))?.features).toBeUndefined();
  });
});

describe('remoção, limpeza e limites', () => {
  it('Remover do cache apaga o registro e os arquivos que só ele usava', async () => {
    const cache = make();
    await cache.recordRecognition({ card: pikachu });
    await cache.prepareCard('base1-58');
    await cache.remove('base1-58');
    expect(await cache.count()).toBe(0);
    expect(backend.files.size).toBe(0);
    expect((await cache.storageInfo()).assets).toBe(0);
  });

  it('Limpar cache apaga tudo', async () => {
    const cache = make();
    await cache.recordRecognition({ card: pikachu });
    await cache.recordRecognition({ card: miraidon });
    await cache.prepareAllViewed();
    await cache.clear();
    expect(await cache.count()).toBe(0);
    expect(backend.files.size).toBe(0);
    expect(await db.count('assets')).toBe(0);
  });

  it('respeita o limite de cartas removendo as menos recentes', async () => {
    const cache = make({ maxCards: 2 });
    await cache.recordRecognition({ card: pikachu });
    await cache.recordRecognition({ card: trainer });
    await cache.recordRecognition({ card: miraidon });
    expect((await cache.list()).map((c) => c.id)).toEqual(['sv01-81', 'base1-91']);
  });

  it('sem espaço: libera as cartas mais antigas e tenta de novo', async () => {
    backend.quotaBytes = 1000;
    const cache = make();
    await cache.recordRecognition({ card: trainer });
    await cache.prepareCard('base1-91'); // 300 B de referência
    await cache.recordRecognition({ card: pikachu2 });
    await cache.prepareCard('swsh1-65'); // 300 + 500 B
    await cache.recordRecognition({ card: pikachu });
    const result = await cache.prepareCard('base1-58'); // precisaria de 300 B (+ GIF compartilhado)
    expect(result.card.reference.state).toBe('ok');
    expect(backend.files.size).toBeGreaterThan(0);
  });

  it('sem espaço e sem o que liberar: falha de forma clara, sem quebrar', async () => {
    backend.quotaBytes = 10;
    const cache = make();
    await cache.recordRecognition({ card: pikachu });
    const result = await cache.prepareCard('base1-58');
    expect(result.card.reference.state).toBe('error');
    expect(result.card.reference.error).toMatch(/espaço/);
    expect(result.status).toBe('falhou');
  });

  it('informa uso do armazenamento e pede persistência', async () => {
    const cache = make({
      storage: { estimate: async () => ({ usage: 5, quota: 100 }), persisted: async () => false, persist: async () => true },
    });
    await cache.recordRecognition({ card: pikachu });
    expect(await cache.storageInfo()).toMatchObject({ cards: 1, usage: 5, quota: 100, persisted: false });
    expect(await cache.requestPersistence()).toBe(true);
  });

  it('sem API de armazenamento no navegador, não quebra', async () => {
    const cache = make({ storage: {} });
    expect((await cache.storageInfo()).cards).toBe(0);
    expect(await cache.requestPersistence()).toBeUndefined();
  });
});

describe('aviso de leitura gravada', () => {
  it('chama onRecorded a cada leitura e ignora erros dele', async () => {
    const seen: [string, number][] = [];
    const cache = make({ onRecorded: (card) => { seen.push([card.id, card.scanCount]); throw new Error('falha do aviso'); } });
    await cache.recordRecognition({ card: pikachu });
    await cache.recordRecognition({ card: pikachu });
    expect(seen).toEqual([['base1-58', 1], ['base1-58', 2]]);
  });
});
