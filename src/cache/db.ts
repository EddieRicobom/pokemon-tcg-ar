import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import { CACHE_SCHEMA_VERSION, DB_NAME } from './types';
import type { AssetRecord, CachedCard } from './types';

interface TcgDb extends DBSchema {
  cards: { key: string; value: CachedCard; indexes: { 'by-lastSeen': number } };
  assets: { key: string; value: AssetRecord; indexes: { 'by-kind': string } };
  meta: { key: string; value: unknown };
}

export type CacheDb = IDBPDatabase<TcgDb>;

export function openCacheDb(name = DB_NAME): Promise<CacheDb> {
  return openDB<TcgDb>(name, CACHE_SCHEMA_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('cards')) {
        db.createObjectStore('cards', { keyPath: 'id' }).createIndex('by-lastSeen', 'lastSeenAt');
      }
      if (!db.objectStoreNames.contains('assets')) {
        db.createObjectStore('assets', { keyPath: 'url' }).createIndex('by-kind', 'kind');
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    },
  });
}
