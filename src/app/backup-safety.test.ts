import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { unzipSync, zipSync } from 'fflate';
import { applyFullBackup, buildFullBackup, parseBackupZip, serializeBackupZip } from './backup';
import { openCacheDb } from '../cache/db';
import type { BackupFile } from './backup';
import type { CachedCard } from '../cache/types';

const url = 'https://example.test/reference.webp';
const card: CachedCard = { id: 'base1-1', schema: 1, name: 'Bulbasaur', setId: 'base1', setName: 'Base', localId: '1', setOfficial: 102, setTotal: 102, dexIds: [1], reference: { state: 'ok', key: url }, sprite: { state: 'missing' }, target: { state: 'missing' }, firstSeenAt: 1, lastSeenAt: 2, scanCount: 3 };
const values = new Map<string, Response>();
let failPut = false;
const cache = {
  keys: async () => [...values.keys()].map((key) => new Request(key)),
  match: async (request: Request | string) => values.get(typeof request === 'string' ? request : request.url)?.clone(),
  delete: async (request: Request | string) => values.delete(typeof request === 'string' ? request : request.url),
  put: async (key: string, response: Response) => {
    if (failPut) { failPut = false; throw new Error('sem espaço'); }
    values.set(key, response.clone());
  },
};
Object.defineProperty(globalThis, 'caches', { configurable: true, value: { open: async () => cache } });

async function seed(): Promise<void> {
  localStorage.setItem('tcg-ar-vila-v1', '{"coins":789,"farm":{"seeds":{"sem-tomate":4}}}');
  const db = await openCacheDb();
  await db.put('cards', card);
  await db.put('assets', { url, kind: 'reference', bytes: 4, refs: [card.id], storedAt: 1 });
  await db.put('meta', { nested: ['valor', 42] }, 'last');
  db.close();
  await cache.put(url, new Response(Uint8Array.from([1, 2, 3, 255]), { headers: { 'content-type': 'image/webp' } }));
}
async function exported(): Promise<BackupFile> {
  const parsed = parseBackupZip(serializeBackupZip(await buildFullBackup(localStorage)));
  if (typeof parsed === 'string') throw new Error(parsed);
  return parsed;
}
beforeEach(async () => {
  localStorage.clear(); values.clear(); failPut = false;
  const db = await openCacheDb();
  await db.clear('cards'); await db.clear('assets'); await db.clear('meta'); db.close();
});

describe('backup completo — integridade e recuperação', () => {
  it('exporta duas vezes e restaura ZIP, cartas, metadados, bytes e progresso sem consumir os arquivos originais', async () => {
    await seed();
    const first = await exported(), second = await exported();
    expect(second.collection).toEqual(first.collection);
    localStorage.clear(); values.clear();
    await applyFullBackup(first);
    expect(localStorage.getItem('tcg-ar-vila-v1')).toBe(first.data['tcg-ar-vila-v1']);
    const db = await openCacheDb();
    expect(await db.get('cards', card.id)).toEqual(card);
    expect(await db.get('meta', 'last')).toEqual({ nested: ['valor', 42] }); db.close();
    expect([...new Uint8Array(await (await cache.match(url))!.arrayBuffer())]).toEqual([1, 2, 3, 255]);
  });
  it('simula aparelho A → arquivo mascarado → perfil novo no aparelho B e preserva todas as camadas', async () => {
    localStorage.setItem('tcg-ar-trainer-v1', JSON.stringify({ xp: 987654, torre: { runs: 12, bestWave: 38 } }));
    localStorage.setItem('tcg-ar-vila-v1', JSON.stringify({ coins: 4321, inventory: { 'love-candy': 4 }, homes: { '0': 7 } }));
    localStorage.setItem('tcg-ar-profile-v1:25', JSON.stringify({ name: 'Pikachu', moves: ['thunder-shock'] }));
    localStorage.setItem('tcg-ar-mega-v1:25:normal', JSON.stringify({ level: 3, shards: 17 }));
    localStorage.setItem('tcg-ar-empty-value', '');
    localStorage.setItem('tcg-ar-unicode', 'áéíóú • 保存 • 🎒');
    const db = await openCacheDb();
    await db.put('cards', card);
    await db.put('assets', { url, kind: 'reference', bytes: 1_048_576, refs: [card.id], storedAt: 42 });
    await db.put('meta', { lastScan: '2026-10-22', flags: ['shiny', 'mega'] }, 'session');
    db.close();
    const megabyte = new Uint8Array(1_048_576); megabyte.fill(65);
    await cache.put(url, new Response(megabyte, { headers: { 'content-type': 'image/webp' } }));
    await cache.put('https://example.test/target.mind', new Response(Uint8Array.from([0, 1, 2, 3, 4]), { headers: { 'content-type': 'application/octet-stream' } }));

    const source = await buildFullBackup(localStorage, '2026-10-22T12:00:00.000Z');
    const bytes = serializeBackupZip(source);
    expect(bytes.byteLength).toBeLessThan(JSON.stringify(source).length);
    const parsed = parseBackupZip(bytes);
    expect(typeof parsed).not.toBe('string');

    // Perfil B: vazio, com uma chave de outro app e lixo tcg-ar- antigo para garantir substituição completa.
    localStorage.clear(); localStorage.setItem('other-app-key', 'não tocar'); localStorage.setItem('tcg-ar-leftover-from-old-profile', 'remover');
    const empty = await openCacheDb(); await empty.clear('cards'); await empty.clear('assets'); await empty.clear('meta'); empty.close(); values.clear();
    await applyFullBackup(parsed as Exclude<typeof parsed, string>, localStorage);
    const destination = await buildFullBackup(localStorage, '2026-10-22T12:00:00.000Z');
    expect(destination.data).toEqual(source.data);
    expect(destination.collection).toEqual(source.collection);
    expect(localStorage.getItem('other-app-key')).toBe('não tocar');
    expect(localStorage.getItem('tcg-ar-leftover-from-old-profile')).toBeNull();
  });
  it('devolve coleção e progresso anteriores se Cache Storage falhar durante a restauração', async () => {
    await seed(); const before = await exported();
    const incoming: BackupFile = { ...before, data: { ...before.data, 'tcg-ar-vila-v1': '{"coins":0}' }, collection: { cards: [], records: [], meta: [], assets: [{ url: 'https://example.test/new', type: 'image/png', bytes: [5] }] } };
    failPut = true;
    await expect(applyFullBackup(incoming)).rejects.toThrow('sem espaço');
    expect((await exported()).collection).toEqual(before.collection);
    expect(localStorage.getItem('tcg-ar-vila-v1')).toBe(before.data['tcg-ar-vila-v1']);
  });
  it('devolve coleção e progresso anteriores se localStorage falhar depois de substituir a coleção', async () => {
    await seed(); const before = await exported(); let fail = true;
    const storage: Storage = { get length() { return localStorage.length; }, key: (i) => localStorage.key(i), getItem: (k) => localStorage.getItem(k), removeItem: (k) => localStorage.removeItem(k), clear: () => localStorage.clear(), setItem(k, v) { if (fail) { fail = false; throw new Error('quota'); } localStorage.setItem(k, v); } };
    await expect(applyFullBackup({ ...before, collection: { cards: [], records: [], assets: [] } }, storage)).rejects.toThrow('quota');
    expect((await exported()).collection).toEqual(before.collection);
    expect(localStorage.getItem('tcg-ar-vila-v1')).toBe(before.data['tcg-ar-vila-v1']);
  });
  it.each(['corrompido', 'ausente', 'omitido-do-manifesto'] as const)('recusa conteúdo de cartas %s antes de restaurar', async (change) => {
    await seed(); const files = unzipSync(serializeBackupZip(await buildFullBackup()));
    if (change === 'corrompido') files['collection/cards.json'] = new TextEncoder().encode('[]');
    if (change === 'ausente') delete files['collection/cards.json'];
    if (change === 'omitido-do-manifesto') {
      const manifest = JSON.parse(new TextDecoder().decode(files['backup.json']));
      manifest.archive.files = manifest.archive.files.filter((entry: { path: string }) => entry.path !== 'collection/cards.json');
      files['backup.json'] = new TextEncoder().encode(JSON.stringify(manifest));
      files['collection/cards.json'] = new TextEncoder().encode('[]');
    }
    expect(parseBackupZip(zipSync(files))).toBe('backup-invalido');
    expect((await exported()).collection?.cards).toEqual([card]);
  });
  it('recusa ZIP truncado e versão futura', async () => {
    await seed(); const bytes = serializeBackupZip(await buildFullBackup());
    expect(typeof parseBackupZip(bytes.subarray(0, 40))).toBe('string');
    const files = unzipSync(bytes), manifest = JSON.parse(new TextDecoder().decode(files['backup.json'])); manifest.version = 999;
    files['backup.json'] = new TextEncoder().encode(JSON.stringify(manifest));
    expect(parseBackupZip(zipSync(files))).toBe('versao-incompativel');
  });
});
