import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { openCacheDb } from '../cache/db';
import { getCache } from './services';

vi.mock('../cache/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cache/db')>();
  return { ...actual, openCacheDb: vi.fn(actual.openCacheDb) };
});

describe('inicialização do cache de cartas', () => {
  it('compartilha a abertura e permite tentar novamente após falha transitória do IndexedDB', async () => {
    const actual = await vi.importActual<typeof import('../cache/db')>('../cache/db');
    const db = await actual.openCacheDb('services-cache-recovery-test');
    const failure = new DOMException('Banco temporariamente indisponível', 'UnknownError');
    const open = vi.mocked(openCacheDb);
    open.mockRejectedValueOnce(failure).mockResolvedValueOnce(db);
    try {
      const first = getCache();
      const concurrent = getCache();
      expect(concurrent).toBe(first);
      await expect(first).rejects.toBe(failure);
      await expect(concurrent).rejects.toBe(failure);
      expect(open).toHaveBeenCalledTimes(1);

      const retry = getCache();
      expect(retry).not.toBe(first);
      expect(getCache()).toBe(retry);
      const cache = await retry;
      expect(await cache.list()).toEqual([]);
      expect(await getCache()).toBe(cache);
      expect(open).toHaveBeenCalledTimes(2);
    } finally {
      db.close();
      open.mockRestore();
    }
  });
});
