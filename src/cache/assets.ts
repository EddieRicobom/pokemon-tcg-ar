import { ASSET_CACHE_NAME } from './types';

/** Onde ficam os arquivos (imagens, GIFs, alvos de AR). Separado do banco para poder trocar e testar. */
export interface AssetBackend {
  get(url: string): Promise<Blob | null>;
  put(url: string, blob: Blob): Promise<void>;
  delete(url: string): Promise<boolean>;
  has(url: string): Promise<boolean>;
  clear(): Promise<void>;
}

export class QuotaError extends Error {
  constructor() {
    super('Sem espaço de armazenamento no aparelho.');
    this.name = 'QuotaError';
  }
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'QuotaExceededError' || error.code === 22);
}

/** Cache Storage do navegador: um `Response` por URL. */
export class CacheStorageBackend implements AssetBackend {
  constructor(private readonly name: string = ASSET_CACHE_NAME) {}

  private open(): Promise<Cache> {
    return caches.open(this.name);
  }

  async get(url: string): Promise<Blob | null> {
    const response = await (await this.open()).match(url);
    return response ? response.blob() : null;
  }

  async put(url: string, blob: Blob): Promise<void> {
    try {
      await (await this.open()).put(url, new Response(blob, { headers: { 'content-type': blob.type || 'application/octet-stream' } }));
    } catch (error) {
      if (isQuotaError(error)) throw new QuotaError();
      throw error;
    }
  }

  async delete(url: string): Promise<boolean> {
    return (await this.open()).delete(url);
  }

  async has(url: string): Promise<boolean> {
    return (await (await this.open()).match(url)) !== undefined;
  }

  async clear(): Promise<void> {
    await caches.delete(this.name);
  }

  /** Remove caches de versões antigas do esquema. */
  static async deleteOldVersions(): Promise<void> {
    if (typeof caches === 'undefined') return;
    for (const key of await caches.keys()) {
      if (key.startsWith('tcg-ar-assets-v') && key !== ASSET_CACHE_NAME) await caches.delete(key);
    }
  }
}

/** Memória: usada nos testes e como reserva quando o Cache Storage não existe (não sobrevive ao reinício). */
export class MemoryBackend implements AssetBackend {
  readonly files = new Map<string, Blob>();
  /** Teste: simula "sem espaço" após esse total de bytes. */
  quotaBytes = Number.POSITIVE_INFINITY;

  async get(url: string): Promise<Blob | null> {
    return this.files.get(url) ?? null;
  }

  async put(url: string, blob: Blob): Promise<void> {
    let used = 0;
    for (const [key, value] of this.files) if (key !== url) used += value.size;
    if (used + blob.size > this.quotaBytes) throw new QuotaError();
    this.files.set(url, blob);
  }

  async delete(url: string): Promise<boolean> {
    return this.files.delete(url);
  }

  async has(url: string): Promise<boolean> {
    return this.files.has(url);
  }

  async clear(): Promise<void> {
    this.files.clear();
  }
}

export function createDefaultBackend(): { backend: AssetBackend; persistent: boolean } {
  if (typeof caches !== 'undefined') return { backend: new CacheStorageBackend(), persistent: true };
  return { backend: new MemoryBackend(), persistent: false };
}
