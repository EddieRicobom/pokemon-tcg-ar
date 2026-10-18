/**
 * Backup completo do progresso e dos ajustes num único arquivo JSON — pra trocar de aparelho ou guardar uma
 * cópia de segurança fora do navegador. Sem servidor nenhum (como tudo no projeto): o arquivo é gerado e lido
 * inteiramente no aparelho.
 *
 * O que entra: tudo que representa progresso ou escolha do jogador (Treinador, Vila — incluindo Digital Pokémon
 * e Encontros lendários —, perfil, equipe, roster, Liga e o polimento das insígnias, Pin Mode, modo de batalha, sensores, ajustes visuais e
 * alguns ajustes pequenos do Scanner).
 *
 * O que fica de fora, de propósito: as imagens de referência e os alvos de AR das cartas escaneadas (guardados
 * no IndexedDB do aparelho, não no localStorage) e qualquer cache de dados do PokeAPI/TCGdex (nomes, atributos,
 * golpes) — tudo isso é refeito sozinho na próxima vez que precisar, então entrar no backup só deixaria o
 * arquivo maior sem guardar nada que não dê pra buscar de novo. Quem restaura um backup num aparelho novo
 * precisa escanear as cartas físicas de novo para elas aparecerem na Vila e na Caixa.
 */

export const BACKUP_FORMAT = 'pokemon-tcg-ar-backup';
export const BACKUP_VERSION = 1;
import { openCacheDb } from '../cache/db';
import { ASSET_CACHE_NAME } from '../cache/types';
import type { AssetRecord, CachedCard } from '../cache/types';
import { unzipSync, zipSync } from 'fflate';

/** Toda chave do localStorage com progresso ou ajuste do jogador — nunca um cache de API, que se refaz sozinho. */
export const BACKUP_KEYS: readonly string[] = [
  'tcg-ar-card-journeys-v1',
  'tcg-ar-trainer-v1',
  'tcg-ar-vila-v1',
  'tcg-ar-perfil-v1',
  'tcg-ar-team-v1',
  'tcg-ar-roster-v1',
  'tcg-ar-liga-v1',
  'tcg-ar-insignias-v1',
  'tcg-ar-pins-setup-v1',
  'tcg-ar-battle-mode-v1',
  'tcg-ar-sensor-v1',
  'tcg-ar-visual-v2',
  'tcg-ar-scan-debug-v1',
  'tcg-ar-scan-overlay-v1',
  'tcg-ar-art-search-v1',
  'tcg-ar-layout-v3',
  'tcg-ar-box-v1',
  'tcg-ar-vila-v1-bak',
  'tcg-ar-fala-gallade-v1',
];

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** ISO; só informativo (mostrado na hora de confirmar uma importação). */
  exportedAt: string;
  /** Uma entrada por chave de `BACKUP_KEYS`; `null` quando a chave não existia no aparelho de origem. */
  data: Record<string, string | null>;
  /** Cartas reconhecidas e arquivos locais (referências, sprites e alvos MindAR). */
  collection?: { cards: CachedCard[]; records: AssetRecord[]; assets: { url: string; type: string; bytes: number[] }[] };
}

/** Lê cada chave conhecida do `storage` (sem tocar em nada) e monta o arquivo de backup. */
export function buildBackup(storage: Pick<Storage, 'getItem'>, now: string = new Date().toISOString()): BackupFile {
  const data: Record<string, string | null> = {};
  for (const key of BACKUP_KEYS) data[key] = storage.getItem(key);
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, data };
}

/** Exporta também o banco e os arquivos usados pelas cartas guardadas. */
export async function buildFullBackup(storage: Storage = localStorage, now?: string): Promise<BackupFile> {
  const file = buildBackup(storage, now);
  if (typeof indexedDB === 'undefined' || typeof caches === 'undefined') return file;
  const db = await openCacheDb();
  try {
    const cards = await db.getAll('cards');
    const cache = await caches.open(ASSET_CACHE_NAME);
    const requests = await cache.keys();
    const assets: NonNullable<BackupFile['collection']>['assets'] = [];
    for (const request of requests) {
      const response = await cache.match(request);
      if (!response) continue;
      const bytes = [...new Uint8Array(await response.arrayBuffer())];
      assets.push({ url: request.url, type: response.headers.get('content-type') ?? 'application/octet-stream', bytes });
    }
    file.collection = { cards, records: await db.getAll('assets'), assets };
    return file;
  } finally { db.close(); }
}

export async function applyFullBackup(file: BackupFile, storage: Storage = localStorage): Promise<void> {
  applyBackup(file, storage);
  if (!file.collection || typeof indexedDB === 'undefined' || typeof caches === 'undefined') return;
  const db = await openCacheDb();
  try {
    const tx = db.transaction(['cards', 'assets', 'meta'], 'readwrite');
    await Promise.all([tx.objectStore('cards').clear(), tx.objectStore('assets').clear(), tx.objectStore('meta').clear()]);
    for (const card of file.collection.cards) await tx.objectStore('cards').put(card);
    for (const record of file.collection.records ?? []) await tx.objectStore('assets').put(record);
    await tx.done;
    const cache = await caches.open(ASSET_CACHE_NAME);
    await cache.keys().then((keys) => Promise.all(keys.map((key) => cache.delete(key))));
    for (const asset of file.collection.assets) {
      await cache.put(asset.url, new Response(new Uint8Array(asset.bytes), { headers: { 'content-type': asset.type } }));
    }
  } finally { db.close(); }
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file, null, 2);
}

/** Pacote compacto compatível com ZIP comum; o JSON continua disponível para importar backups antigos. */
export function serializeBackupZip(file: BackupFile): Uint8Array {
  return zipSync({ 'backup.json': new TextEncoder().encode(serializeBackup(file)) }, { level: 6 });
}

export function parseBackupZip(bytes: Uint8Array): BackupFile | BackupParseError {
  try {
    const files = unzipSync(bytes);
    const manifest = files['backup.json'];
    return manifest ? parseBackup(new TextDecoder().decode(manifest)) : 'formato-desconhecido';
  } catch {
    return 'json-invalido';
  }
}

export type BackupParseError = 'json-invalido' | 'formato-desconhecido';

/** Lê o texto de um arquivo de backup; nunca lança — um erro vem como `BackupParseError`, nunca inventa dados. */
export function parseBackup(raw: string): BackupFile | BackupParseError {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return 'json-invalido';
  }
  if (!value || typeof value !== 'object') return 'formato-desconhecido';
  const v = value as Partial<BackupFile>;
  if (v.format !== BACKUP_FORMAT || typeof v.version !== 'number' || !v.data || typeof v.data !== 'object') return 'formato-desconhecido';
  const rawData = v.data as Record<string, unknown>;
  const data: Record<string, string | null> = {};
  for (const key of BACKUP_KEYS) {
    const entry = rawData[key];
    data[key] = typeof entry === 'string' ? entry : null;
  }
  let collection: BackupFile['collection'];
  if (v.collection && typeof v.collection === 'object') {
    const rawCollection = v.collection as { cards?: unknown; records?: unknown; assets?: unknown };
    const cards = Array.isArray(rawCollection.cards) ? rawCollection.cards as CachedCard[] : [];
    const assets = Array.isArray(rawCollection.assets) ? rawCollection.assets.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const a = item as { url?: unknown; type?: unknown; bytes?: unknown };
      return typeof a.url === 'string' && typeof a.type === 'string' && Array.isArray(a.bytes) && a.bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)
        ? [{ url: a.url, type: a.type, bytes: a.bytes as number[] }] : [];
    }) : [];
    const records = Array.isArray(rawCollection.records) ? rawCollection.records as AssetRecord[] : [];
    collection = { cards, records, assets };
  }
  return { format: BACKUP_FORMAT, version: v.version, exportedAt: typeof v.exportedAt === 'string' ? v.exportedAt : '', data, ...(collection ? { collection } : {}) };
}

/**
 * Restaura um backup já lido (`parseBackup`) no `storage`: cada chave conhecida é gravada com o valor do
 * backup, ou removida se o backup não tinha nada ali. Só toca nas chaves de `BACKUP_KEYS` — nada mais no
 * aparelho (incluindo o cache de cartas escaneadas, no IndexedDB) é afetado.
 */
export function applyBackup(file: BackupFile, storage: Pick<Storage, 'setItem' | 'removeItem'>): void {
  for (const key of BACKUP_KEYS) {
    const value = file.data[key];
    if (typeof value === 'string') storage.setItem(key, value);
    else storage.removeItem(key);
  }
}

/** Nome do arquivo sugerido pro download, com a data de hoje (`AAAA-MM-DD`). */
export function backupFileName(now = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  return `pokemon-tcg-ar-backup-${iso}.zip`;
}
