/** Backup local completo do estado do jogador. */
import { openCacheDb } from '../cache/db';
import { ASSET_CACHE_NAME } from '../cache/types';
import type { AssetRecord, CachedCard } from '../cache/types';
import { unzipSync, zipSync } from 'fflate';

export const BACKUP_FORMAT = 'pokemon-tcg-ar-backup';
export const BACKUP_VERSION = 2;
const LEGACY_VERSION = 1;
const MAX_BACKUP_BYTES = 512 * 1024 * 1024;
const MAX_ASSET_BYTES = 256 * 1024 * 1024;
const KEY_PREFIX = 'tcg-ar-';

/** Chaves conhecidas; novas chaves do app entram automaticamente quando começam com `tcg-ar-`. */
export const BACKUP_KEYS: readonly string[] = [
  'tcg-ar-trainer-v1', 'tcg-ar-vila-v1', 'tcg-ar-perfil-v1', 'tcg-ar-team-v1',
  'tcg-ar-roster-v1', 'tcg-ar-liga-v1', 'tcg-ar-insignias-v1', 'tcg-ar-pins-setup-v1',
  'tcg-ar-battle-mode-v1', 'tcg-ar-sensor-v1', 'tcg-ar-visual-v2', 'tcg-ar-visual-v1',
  'tcg-ar-scan-debug-v1', 'tcg-ar-scan-overlay-v1', 'tcg-ar-art-search-v1',
  'tcg-ar-layout-v3', 'tcg-ar-box-v1', 'tcg-ar-vila-v1-bak', 'tcg-ar-fala-gallade-v1',
  'tcg-ar-vila-controls-hint-hidden-v1', 'tcg-ar-stale-reload-v1', 'tcg-ar-dex-names-v1',
  'tcg-ar-card-journeys-v1',
];

interface MetaEntry { key: string; value: unknown }
export interface BackupAsset { url: string; type: string; bytes: number[]; hash?: string }
export interface BackupCollection {
  cards: CachedCard[];
  records: AssetRecord[];
  meta?: MetaEntry[];
  assets: BackupAsset[];
}
export interface BackupArchive {
  files: { path: string; kind: 'cards' | 'records' | 'meta' | 'asset'; url?: string; type?: string; bytes: number; hash: string }[];
}
export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  data: Record<string, string | null>;
  collection?: BackupCollection;
  archive?: BackupArchive;
}

export type BackupParseError = 'json-invalido' | 'formato-desconhecido' | 'versao-incompativel' | 'backup-invalido';

function backupKeys(storage: Pick<Storage, 'getItem'> & Partial<Pick<Storage, 'length' | 'key'>>): string[] {
  const keys = new Set(BACKUP_KEYS);
  if (typeof storage.length === 'number' && typeof storage.key === 'function') {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(KEY_PREFIX)) keys.add(key);
    }
  }
  return [...keys].sort();
}

export function buildBackup(storage: Pick<Storage, 'getItem'> & Partial<Pick<Storage, 'length' | 'key'>>, now = new Date().toISOString()): BackupFile {
  const data: Record<string, string | null> = {};
  for (const key of backupKeys(storage)) data[key] = storage.getItem(key);
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, data };
}

function hashBytes(bytes: Uint8Array): string {
  let a = 2166136261; let b = 2166136261;
  for (const value of bytes) { a = Math.imul(a ^ value, 16777619); b = Math.imul(b ^ (value + 31), 16777619); }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}

async function readCollection(): Promise<BackupCollection> {
  const db = await openCacheDb();
  try {
    const cards = await db.getAll('cards');
    const records = await db.getAll('assets');
    const metaKeys = await db.getAllKeys('meta');
    const meta: MetaEntry[] = [];
    for (const key of metaKeys) {
      const metaKey = String(key);
      const value = await db.get('meta', metaKey);
      meta.push({ key: metaKey, value });
    }
    const cache = await caches.open(ASSET_CACHE_NAME);
    const assets: BackupAsset[] = [];
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      if (!response) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_ASSET_BYTES) throw new Error('arquivo grande demais');
      assets.push({ url: request.url, type: response.headers.get('content-type') ?? 'application/octet-stream', bytes: [...bytes], hash: hashBytes(bytes) });
    }
    return { cards, records, meta, assets };
  } finally { db.close(); }
}

export async function buildFullBackup(storage: Storage = localStorage, now?: string): Promise<BackupFile> {
  const file = buildBackup(storage, now);
  if (typeof indexedDB === 'undefined' || typeof caches === 'undefined') return file;
  file.collection = await readCollection();
  return file;
}

function validateCollection(collection: BackupCollection): void {
  if (!Array.isArray(collection.cards) || !Array.isArray(collection.records) || !Array.isArray(collection.assets)) throw new Error('coleção inválida');
  let total = 0; const urls = new Set<string>();
  for (const asset of collection.assets) {
    if (!asset || typeof asset.url !== 'string' || typeof asset.type !== 'string' || !Array.isArray(asset.bytes)) throw new Error('arquivo inválido');
    if (urls.has(asset.url)) throw new Error('arquivo duplicado');
    urls.add(asset.url);
    if (asset.bytes.length > MAX_ASSET_BYTES || asset.bytes.some((b) => !Number.isInteger(b) || b < 0 || b > 255)) throw new Error('bytes inválidos');
    const bytes = Uint8Array.from(asset.bytes); total += bytes.byteLength;
    if (asset.hash && asset.hash !== hashBytes(bytes)) throw new Error('integridade inválida');
  }
  if (total > MAX_BACKUP_BYTES) throw new Error('backup grande demais');
}

function validateFile(file: BackupFile): void {
  if (file.format !== BACKUP_FORMAT || !Number.isInteger(file.version) || file.version < 1 || file.version > BACKUP_VERSION) throw new Error('versão incompatível');
  if (!file.data || typeof file.data !== 'object') throw new Error('dados inválidos');
  for (const value of Object.values(file.data)) if (value !== null && typeof value !== 'string') throw new Error('valor inválido');
  if (file.collection) validateCollection(file.collection);
}

interface Snapshot { data: Record<string, string | null>; collection?: BackupCollection }
async function snapshot(storage: Storage): Promise<Snapshot> {
  const file = buildBackup(storage);
  return { data: file.data, collection: typeof indexedDB !== 'undefined' && typeof caches !== 'undefined' ? await readCollection() : undefined };
}

async function writeCollection(collection: BackupCollection): Promise<void> {
  validateCollection(collection);
  const db = await openCacheDb();
  try {
    // Cada chamada usa uma transação curta. Uma transação única com centenas de `await`s pode
    // ficar inativa entre tarefas em alguns navegadores e abortar antes de concluir a restauração.
    // O backup continua tudo-ou-nada no nível de `applyFullBackup`, que restaura o snapshot se
    // qualquer uma destas operações falhar.
    await db.clear('cards');
    await db.clear('assets');
    await db.clear('meta');
    for (const card of collection.cards) await db.put('cards', card);
    for (const record of collection.records) await db.put('assets', record);
    for (const entry of collection.meta ?? []) await db.put('meta', entry.value, entry.key);
    const cache = await caches.open(ASSET_CACHE_NAME);
    for (const key of await cache.keys()) await cache.delete(key);
    for (const asset of collection.assets) {
      const bytes = Uint8Array.from(asset.bytes);
      await cache.put(asset.url, new Response(bytes, { headers: { 'content-type': asset.type } }));
    }
  } finally { db.close(); }
}

function writeData(file: BackupFile, storage: Storage): void {
  const keys = new Set([...backupKeys(storage), ...Object.keys(file.data)]);
  for (const key of keys) {
    if (!key.startsWith(KEY_PREFIX)) continue;
    const value = file.data[key];
    if (typeof value === 'string') storage.setItem(key, value); else storage.removeItem(key);
  }
}

/** Restauração transacional best-effort: qualquer erro tenta devolver o snapshot anterior. */
export async function applyFullBackup(file: BackupFile, storage: Storage = localStorage): Promise<void> {
  validateFile(file);
  if (file.collection && (typeof indexedDB === 'undefined' || typeof caches === 'undefined')) throw new Error('este navegador não suporta a coleção do backup');
  const before = await snapshot(storage);
  try {
    if (file.collection && typeof indexedDB !== 'undefined' && typeof caches !== 'undefined') await writeCollection(file.collection);
    writeData(file, storage);
  } catch (error) {
    try {
      if (before.collection && typeof indexedDB !== 'undefined' && typeof caches !== 'undefined') await writeCollection(before.collection);
      writeData({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: '', data: before.data }, storage);
    } catch { /* o erro original continua sendo informado */ }
    throw error;
  }
}

export function applyBackup(file: BackupFile, storage: Pick<Storage, 'setItem' | 'removeItem'>): void {
  validateFile(file);
  writeData(file, storage as Storage);
}

export function serializeBackup(file: BackupFile): string { return JSON.stringify(file, null, 2); }

/** ZIP v2: manifesto pequeno e conteúdo binário separado. */
export function serializeBackupZip(file: BackupFile): Uint8Array {
  validateFile(file);
  const files: Record<string, Uint8Array> = {};
  const archive: BackupArchive = { files: [] };
  if (file.collection) {
    const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
    for (const [path, kind, value] of [['collection/cards.json', 'cards', file.collection.cards], ['collection/records.json', 'records', file.collection.records], ['collection/meta.json', 'meta', file.collection.meta ?? []] ] as const) {
      const bytes = json(value); files[path] = bytes; archive.files.push({ path, kind, bytes: bytes.length, hash: hashBytes(bytes) });
    }
    file.collection.assets.forEach((asset, index) => {
      const path = `collection/assets/${index}.bin`; const bytes = Uint8Array.from(asset.bytes); files[path] = bytes;
      archive.files.push({ path, kind: 'asset', url: asset.url, type: asset.type, bytes: bytes.length, hash: hashBytes(bytes) });
    });
  }
  const manifest: BackupFile = { ...file, collection: undefined, archive: file.collection ? archive : undefined };
  files['backup.json'] = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  return zipSync(files, { level: 6 });
}

export function parseBackupZip(bytes: Uint8Array): BackupFile | BackupParseError {
  try {
    if (bytes.byteLength > MAX_BACKUP_BYTES) return 'backup-invalido';
    let declaredBytes = 0;
    const files = unzipSync(bytes, { filter: (entry) => {
      declaredBytes += entry.originalSize;
      if (declaredBytes > MAX_BACKUP_BYTES) throw new Error('backup grande demais');
      return true;
    } });
    const unpackedBytes = Object.values(files).reduce((sum, file) => sum + file.byteLength, 0);
    if (unpackedBytes > MAX_BACKUP_BYTES || Object.keys(files).length > 10000) return 'backup-invalido';
    const manifest = files['backup.json'];
    if (!manifest) return 'formato-desconhecido';
    const parsed = parseBackup(new TextDecoder().decode(manifest));
    if (typeof parsed === 'string') return parsed;
    if (!parsed.archive) return parsed;
    if (!Array.isArray(parsed.archive.files)) return 'backup-invalido';
    const declared = new Map<string, BackupArchive['files'][number]>();
    const required = new Map([['collection/cards.json', 'cards'], ['collection/records.json', 'records'], ['collection/meta.json', 'meta']]);
    for (const entry of parsed.archive.files) {
      if (!entry || typeof entry.path !== 'string' || declared.has(entry.path) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || typeof entry.hash !== 'string') return 'backup-invalido';
      if (entry.kind === 'asset' ? !/^collection\/assets\/\d+\.bin$/.test(entry.path) : required.get(entry.path) !== entry.kind) return 'backup-invalido';
      declared.set(entry.path, entry);
    }
    // Todos os JSONs lidos precisam estar cobertos pela verificação de integridade.
    for (const path of required.keys()) if (!declared.has(path)) return 'backup-invalido';
    for (const path of Object.keys(files)) if (path !== 'backup.json' && !declared.has(path)) return 'backup-invalido';
    const readJson = (path: string): unknown => { const f = files[path]; if (!f) throw new Error('arquivo ausente'); return JSON.parse(new TextDecoder().decode(f)); };
    const cards = readJson('collection/cards.json') as CachedCard[];
    const records = readJson('collection/records.json') as AssetRecord[];
    const meta = readJson('collection/meta.json') as MetaEntry[];
    const assets: BackupAsset[] = [];
    for (const item of parsed.archive.files) {
      const raw = files[item.path]; if (!raw || raw.length !== item.bytes || hashBytes(raw) !== item.hash) throw new Error('integridade inválida');
      if (item.kind === 'asset') assets.push({ url: item.url ?? '', type: item.type ?? 'application/octet-stream', bytes: [...raw], hash: item.hash });
    }
    const result = { ...parsed, collection: { cards, records, meta, assets }, archive: undefined };
    validateFile(result); return result;
  } catch { return 'backup-invalido'; }
}

export function parseBackup(raw: string): BackupFile | BackupParseError {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return 'json-invalido'; }
  if (!value || typeof value !== 'object') return 'formato-desconhecido';
  const v = value as Partial<BackupFile>;
  if (v.format !== BACKUP_FORMAT || typeof v.version !== 'number' || !v.data || typeof v.data !== 'object') return 'formato-desconhecido';
  if (v.version > BACKUP_VERSION || v.version < LEGACY_VERSION) return 'versao-incompativel';
  const rawData = v.data as Record<string, unknown>; const data: Record<string, string | null> = {};
  for (const key of new Set([...BACKUP_KEYS, ...Object.keys(rawData)])) {
    if (!key.startsWith(KEY_PREFIX)) continue;
    const entry = rawData[key];
    data[key] = typeof entry === 'string' ? entry : null;
  }
  const collection = v.collection && typeof v.collection === 'object' ? v.collection as BackupCollection : undefined;
  const file: BackupFile = { format: BACKUP_FORMAT, version: v.version, exportedAt: typeof v.exportedAt === 'string' ? v.exportedAt : '', data, ...(collection ? { collection } : {}), ...(v.archive ? { archive: v.archive as BackupArchive } : {}) };
  try { validateFile(file); return file; } catch (error) { return String(error).includes('versão') ? 'versao-incompativel' : 'backup-invalido'; }
}

export function backupFileName(now = new Date()): string { return `pokemon-tcg-ar-backup-${now.toISOString().slice(0, 10)}.zip`; }
