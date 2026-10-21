import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyBackup, applyFullBackup, BACKUP_FORMAT, BACKUP_KEYS, backupFileName, buildBackup, parseBackup, parseBackupZip, serializeBackup, serializeBackupZip } from './backup';
import { openCacheDb } from '../cache/db';
import { applyEvent, emptyTrainer, normalizeTrainer } from '../core/trainer';
import { loadVillage, saveVillage } from './village-store';

const NOW = '2026-10-16T12:00:00.000Z';

class MemoryCache {
  readonly values = new Map<string, Response>();
  async keys(): Promise<Request[]> { return [...this.values.keys()].map((url) => new Request(url)); }
  async match(request: Request | string): Promise<Response | undefined> { return this.values.get(typeof request === 'string' ? request : request.url); }
  async put(request: Request | string, response: Response): Promise<void> { this.values.set(typeof request === 'string' ? request : request.url, response.clone()); }
  async delete(request: Request | string): Promise<boolean> { return this.values.delete(typeof request === 'string' ? request : request.url); }
  clear(): void { this.values.clear(); }
}

const memoryCache = new MemoryCache();
(globalThis as typeof globalThis & { caches?: CacheStorage }).caches = { open: async () => memoryCache } as unknown as CacheStorage;

describe('backup — exportar', () => {
  beforeEach(() => localStorage.clear());

  it('junta todas as chaves conhecidas, com null pra quem não existe no aparelho', () => {
    localStorage.setItem('tcg-ar-trainer-v1', '{"xp":100}');
    localStorage.setItem('tcg-ar-perfil-v1', '{"name":"Ash"}');
    const file = buildBackup(localStorage, NOW);
    expect(file.format).toBe(BACKUP_FORMAT);
    expect(file.exportedAt).toBe(NOW);
    expect(file.data['tcg-ar-trainer-v1']).toBe('{"xp":100}');
    expect(file.data['tcg-ar-perfil-v1']).toBe('{"name":"Ash"}');
    expect(file.data['tcg-ar-vila-v1']).toBeNull();
    expect(Object.keys(file.data).sort()).toEqual([...BACKUP_KEYS].sort());
  });

  it('inclui todas as chaves do app, inclusive caches locais que permitem uso offline', () => {
    localStorage.setItem('tcg-ar-dex-names-v1', '[[1,"Bulbasaur"]]');
    localStorage.setItem('tcg-ar-profile-25', '{}');
    const file = buildBackup(localStorage, NOW);
    expect(file.data['tcg-ar-dex-names-v1']).toBe('[[1,"Bulbasaur"]]');
    expect(file.data['tcg-ar-profile-25']).toBe('{}');
  });
  it('inclui as preferências de música sem alterar os saves da Vila e da Torre', () => {
    localStorage.setItem('tcg-ar-village-music-v1', '{"enabled":false,"volume":20,"effectsVolume":60}');
    localStorage.setItem('tcg-ar-survivor-music-v1', '{"enabled":true,"volume":40}');
    const file = buildBackup(localStorage, NOW);
    expect(file.data['tcg-ar-village-music-v1']).toBe(localStorage.getItem('tcg-ar-village-music-v1'));
    expect(file.data['tcg-ar-survivor-music-v1']).toBe(localStorage.getItem('tcg-ar-survivor-music-v1'));
  });

  it('serializa como JSON legível e com um nome de arquivo datado', () => {
    const file = buildBackup(localStorage, NOW);
    expect(() => JSON.parse(serializeBackup(file))).not.toThrow();
    expect(backupFileName(new Date(NOW))).toBe('pokemon-tcg-ar-backup-2026-10-16.zip');
  });

  it('empacota o manifesto e recupera o backup ZIP', () => {
    const file = buildBackup(localStorage, NOW);
    const parsed = parseBackupZip(serializeBackupZip(file));
    expect(parsed).toEqual(file);
  });

  it('empacota a coleção com binários separados e verifica a integridade', () => {
    const file = {
      ...buildBackup(localStorage, NOW),
      collection: {
        cards: [],
        records: [],
        meta: [{ key: 'last', value: { ok: true } }],
        assets: [{ url: 'https://example.test/card.png', type: 'image/png', bytes: [0, 1, 2, 255] }],
      },
    };
    const parsed = parseBackupZip(serializeBackupZip(file));
    expect(parsed).toEqual(expect.objectContaining({ collection: expect.objectContaining({ assets: [expect.objectContaining({ url: 'https://example.test/card.png', bytes: [0, 1, 2, 255] })] }) }));
  });
});

describe('backup — importar', () => {
  beforeEach(() => localStorage.clear());

  it('restaura sementes depositadas e trabalhos reais da fazenda pelo ZIP', () => {
    const state = loadVillage();
    state.inventory['sem-tomate'] = 3;
    state.farm.seeds['sem-tomate'] = 7;
    state.farm.history.push({ residentId: 'bulbasaur', at: 1000, message: 'Regou um canteiro da fazenda.' });
    state.farm.nextDecisionAt = 31_000;
    expect(saveVillage(state)).toBe(true);
    const restored = parseBackupZip(serializeBackupZip(buildBackup(localStorage, NOW)));
    if (typeof restored === 'string') throw new Error(restored);
    localStorage.clear();
    applyBackup(restored, localStorage);
    expect(loadVillage().farm).toEqual(state.farm);
    expect(loadVillage().inventory['sem-tomate']).toBe(3);
  });

  it('restaura coleção, metadados e Cache Storage junto com o localStorage', async () => {
    const db = await openCacheDb();
    await db.clear('cards'); await db.clear('assets'); await db.clear('meta'); db.close();
    memoryCache.clear();
    const file = {
      ...buildBackup(localStorage, NOW),
      collection: {
        cards: [{ id: 'base1-1', schema: 1, name: 'Bulbasaur', setId: 'base1', setName: 'Base', localId: '1', setOfficial: 102, setTotal: 102, dexIds: [1], reference: { state: 'ok' as const, key: 'https://example.test/card.webp' }, sprite: { state: 'ok' as const, key: 'https://example.test/sprite.gif' }, target: { state: 'ok' as const, key: 'https://example.test/target.mind' }, firstSeenAt: 1, lastSeenAt: 1, scanCount: 1 }],
        records: [{ url: 'https://example.test/card.webp', kind: 'reference' as const, bytes: 3, refs: ['base1-1'], storedAt: 1 }],
        meta: [{ key: 'last', value: { ok: true } }],
        assets: [{ url: 'https://example.test/card.webp', type: 'image/webp', bytes: [1, 2, 3] }],
      },
    };
    localStorage.setItem('tcg-ar-trainer-v1', '{"xp":9}');
    await applyFullBackup(file, localStorage);
    const restored = await openCacheDb();
    expect(await restored.getAll('cards')).toHaveLength(1);
    expect(await restored.getAll('assets')).toHaveLength(1);
    expect(await restored.get('meta', 'last')).toEqual({ ok: true });
    restored.close();
    expect(await memoryCache.match('https://example.test/card.webp')).toBeDefined();
  });

  it('ida e volta: exporta, limpa o aparelho, importa de volta — tudo igual', () => {
    localStorage.setItem('tcg-ar-trainer-v1', '{"xp":500}');
    localStorage.setItem('tcg-ar-vila-v1', '{"coins":10}');
    const file = buildBackup(localStorage, NOW);
    const text = serializeBackup(file);
    localStorage.clear();
    const parsed = parseBackup(text);
    expect(parsed).not.toBe('json-invalido');
    expect(parsed).not.toBe('formato-desconhecido');
    applyBackup(parsed as Exclude<typeof parsed, string>, localStorage);
    expect(localStorage.getItem('tcg-ar-trainer-v1')).toBe('{"xp":500}');
    expect(localStorage.getItem('tcg-ar-vila-v1')).toBe('{"coins":10}');
  });

  it('preserva corridas concluídas e objetivos da Torre numa restauração JSON e ZIP', () => {
    const run = applyEvent(emptyTrainer(), {
      type: 'survivor', runId: 'torre-backup-1', survivedMs: 180_000, trainersBeaten: 1,
      bossesBeaten: 0, clearedTorre: false, infinite: false, wave: 4, kills: 23, level: 6,
      completedObjectives: ['abates-20', 'tempo-3m'],
    }, '2026-10-16');
    localStorage.setItem('tcg-ar-trainer-v1', JSON.stringify(run.state));

    for (const encoded of [serializeBackup(buildBackup(localStorage, NOW)), serializeBackupZip(buildBackup(localStorage, NOW))]) {
      const file = typeof encoded === 'string' ? parseBackup(encoded) : parseBackupZip(encoded);
      expect(typeof file).not.toBe('string');
      localStorage.clear();
      applyBackup(file as Exclude<typeof file, string>, localStorage);
      const restored = normalizeTrainer(JSON.parse(localStorage.getItem('tcg-ar-trainer-v1') ?? 'null'));
      expect(restored.torre).toMatchObject({
        runs: 1, bestWave: 4, bestLevel: 6, runIds: ['torre-backup-1'],
        completedObjectives: ['abates-20', 'tempo-3m'],
      });
      expect(restored.torre.recentRuns).toMatchObject([{
        id: 'torre-backup-1', day: '2026-10-16', survivedMs: 180_000, wave: 4, kills: 23, level: 6,
      }]);
    }
  });

  it('uma chave ausente no backup é removida do aparelho ao restaurar (restauração completa, não soma)', () => {
    localStorage.setItem('tcg-ar-perfil-v1', '{"name":"velho"}');
    const file = buildBackup(localStorage, NOW); // perfil entra como null porque nunca foi setado? não, foi setado acima
    // Agora simula um backup de outro perfil, sem o perfil setado:
    localStorage.clear();
    applyBackup(file, localStorage); // esse `file` tem o perfil antigo
    expect(localStorage.getItem('tcg-ar-perfil-v1')).toBe('{"name":"velho"}');
    const empty = buildBackup({ getItem: () => null }, NOW);
    applyBackup(empty, localStorage);
    expect(localStorage.getItem('tcg-ar-perfil-v1')).toBeNull();
  });

  it('não toca numa chave que não pertence ao app', () => {
    localStorage.setItem('other-app-key', 'preservar');
    const empty = buildBackup({ getItem: () => null }, NOW);
    applyBackup(empty, localStorage);
    expect(localStorage.getItem('other-app-key')).toBe('preservar');
  });

  it('captura e substitui chaves tcg-ar novas sem precisar alterar uma lista central', () => {
    localStorage.setItem('tcg-ar-preferencia-nova-v1', 'sim');
    const file = buildBackup(localStorage, NOW);
    localStorage.setItem('tcg-ar-preferencia-nova-v1', 'outro');
    applyBackup(file, localStorage);
    expect(localStorage.getItem('tcg-ar-preferencia-nova-v1')).toBe('sim');
  });

  it('JSON inválido ou formato desconhecido vira um erro claro, nunca lança e nunca inventa dados', () => {
    expect(parseBackup('{isso não é json')).toBe('json-invalido');
    expect(parseBackup('{}')).toBe('formato-desconhecido');
    expect(parseBackup(JSON.stringify({ format: 'outra-coisa', version: 1, data: {} }))).toBe('formato-desconhecido');
  });

  it('ignora chaves externas e descarta valores não-string pras conhecidas', () => {
    const raw = JSON.stringify({
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: NOW,
      data: { 'tcg-ar-trainer-v1': 123, 'tcg-ar-perfil-v1': '{"name":"Ash"}', 'chave-que-nao-existe': 'x' },
    });
    const parsed = parseBackup(raw);
    expect(parsed).not.toBe('json-invalido');
    expect(parsed).not.toBe('formato-desconhecido');
    const f = parsed as Exclude<typeof parsed, string>;
    expect(f.data['tcg-ar-trainer-v1']).toBeNull();
    expect(f.data['tcg-ar-perfil-v1']).toBe('{"name":"Ash"}');
    expect(Object.keys(f.data)).not.toContain('chave-que-nao-existe');
  });
});
