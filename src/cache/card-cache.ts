import { fetchSprite as defaultFetchSprite } from '../ar/sprite-source';
import type { SpriteSource } from '../ar/sprite-source';
import { computeFeatures, featuresFromJson, featuresToJson, FEATURE_VERSION } from '../recognition/hash';
import type { CardFeatures } from '../recognition/hash';
import type { CardRecordLike, LocalReference, RecognitionResult } from '../recognition/pipeline';
import { cardImageUrl } from '../recognition/tcgdex';
import type { RgbaImage } from '../recognition/types';
import { QuotaError } from './assets';
import type { AssetBackend } from './assets';
import type { CacheDb } from './db';
import { CACHE_SCHEMA_VERSION } from './types';
import type { AssetKind, AssetRecord, CachedCard, CacheStatus, SlotInfo, StorageInfo } from './types';

export const DEFAULT_MAX_CARDS = 300;
export const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;

export interface StorageApi {
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
}

export interface CardCacheDeps {
  db: CacheDb;
  assets: AssetBackend;
  fetchImpl?: typeof fetch;
  fetchSprite?: (dexId: number) => Promise<SpriteSource | null>;
  /** Compila o alvo de AR (arquivo .mind) a partir da imagem de referência. Opcional (Marco 4). */
  buildTarget?: (reference: Blob) => Promise<Blob>;
  /** Decodifica a referência em pixels (para recalcular características). */
  decodeReference?: (blob: Blob) => Promise<RgbaImage>;
  now?: () => number;
  maxCards?: number;
  maxBytes?: number;
  /** Espera base entre tentativas (testes usam 0). */
  backoffMs?: number;
  retries?: number;
  storage?: StorageApi;
}

export interface RecordInput {
  card: CardRecordLike;
  reference?: RgbaImage;
  referenceBlob?: Blob;
  referenceUrl?: string;
}

export function inputFromResult(result: RecognitionResult, chosen = result.card): RecordInput | null {
  if (!chosen) return null;
  const sameCard = result.card?.id === chosen.id;
  return {
    card: chosen,
    reference: sameCard ? result.reference : undefined,
    referenceBlob: sameCard ? result.referenceBlob : undefined,
    referenceUrl: sameCard ? result.referenceUrl : undefined,
  };
}

export type PrepareStep = 'referência' | 'sprite' | 'alvo de AR';

export interface PrepareProgress {
  cardId: string;
  step: PrepareStep;
  index: number;
  total: number;
}

export interface PrepareResult {
  id: string;
  status: CacheStatus;
  card: CachedCard;
}

const TARGET_PREFIX = '/__tcg-ar__/target/';
export function targetKey(cardId: string): string {
  return `${TARGET_PREFIX}${encodeURIComponent(cardId)}.mind`;
}

const emptySlot = (): SlotInfo => ({ state: 'missing' });

export function cacheStatusOf(card: CachedCard): CacheStatus {
  const slots = [card.reference, card.sprite, card.target];
  if (slots.some((slot) => slot.state === 'error')) return 'falhou';
  if (slots.some((slot) => slot.state === 'missing')) return 'parcial';
  return 'completo';
}

export class CardCache {
  private readonly db: CacheDb;
  private readonly assets: AssetBackend;
  private readonly fetchImpl: typeof fetch;
  private readonly fetchSpriteImpl: (dexId: number) => Promise<SpriteSource | null>;
  private readonly now: () => number;
  private readonly maxCards: number;
  private readonly maxBytes: number;
  private readonly backoffMs: number;
  private readonly retries: number;
  private index: Map<string, CachedCard> | null = null;

  constructor(private readonly deps: CardCacheDeps) {
    this.db = deps.db;
    this.assets = deps.assets;
    this.fetchImpl = deps.fetchImpl ?? ((input, init) => fetch(input, init));
    this.fetchSpriteImpl = deps.fetchSprite ?? ((dexId) => defaultFetchSprite(dexId, this.fetchImpl));
    this.now = deps.now ?? (() => Date.now());
    this.maxCards = deps.maxCards ?? DEFAULT_MAX_CARDS;
    this.maxBytes = deps.maxBytes ?? DEFAULT_MAX_BYTES;
    this.backoffMs = deps.backoffMs ?? 500;
    this.retries = deps.retries ?? 2;
  }

  // ---------------------------------------------------------------- leitura

  private async load(): Promise<Map<string, CachedCard>> {
    if (!this.index) {
      const all = await this.db.getAll('cards');
      this.index = new Map(all.map((card) => [card.id, this.migrate(card)]));
    }
    return this.index;
  }

  /** Versionamento: características de outra versão do algoritmo são descartadas (recalculadas depois). */
  private migrate(card: CachedCard): CachedCard {
    if (card.features && card.features.v !== FEATURE_VERSION) return { ...card, features: undefined };
    return card;
  }

  async list(): Promise<(CachedCard & { status: CacheStatus })[]> {
    const cards = [...(await this.load()).values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    return cards.map((card) => ({ ...card, status: cacheStatusOf(card) }));
  }

  async get(id: string): Promise<CachedCard | undefined> {
    return (await this.load()).get(id);
  }

  async count(): Promise<number> {
    return (await this.load()).size;
  }

  /** Referências para reconhecer sem rede: cartas com características válidas guardadas. */
  async localReferences(): Promise<LocalReference[]> {
    const result: LocalReference[] = [];
    for (const card of (await this.load()).values()) {
      if (!card.features) continue;
      result.push({ card: this.toRecord(card), features: featuresFromJson(card.features) });
    }
    return result;
  }

  private toRecord(card: CardRecordLike): CardRecordLike {
    return {
      id: card.id, name: card.name, setId: card.setId, setName: card.setName, localId: card.localId,
      setOfficial: card.setOfficial, setTotal: card.setTotal, setCode: card.setCode, dexIds: card.dexIds, imageBase: card.imageBase,
    };
  }

  async getAssetBlob(card: CachedCard, kind: AssetKind): Promise<Blob | null> {
    const slot = kind === 'reference' ? card.reference : kind === 'sprite' ? card.sprite : card.target;
    if (slot.state !== 'ok' || !slot.key) return null;
    return this.assets.get(slot.key);
  }

  // --------------------------------------------------------------- gravação

  private async save(card: CachedCard): Promise<void> {
    (await this.load()).set(card.id, card);
    await this.db.put('cards', card);
  }

  /**
   * Chamado depois de cada identificação confiável: guarda os metadados, a referência e as
   * características reutilizáveis. Nunca recebe nem guarda o quadro da câmera.
   */
  async recordRecognition(input: RecordInput): Promise<CachedCard> {
    const existing = await this.get(input.card.id);
    const timestamp = this.now();
    const card: CachedCard = existing
      ? { ...existing, ...this.toRecord(input.card), lastSeenAt: timestamp, scanCount: existing.scanCount + 1, schema: CACHE_SCHEMA_VERSION }
      : {
          ...this.toRecord(input.card), schema: CACHE_SCHEMA_VERSION, reference: emptySlot(), sprite: emptySlot(), target: emptySlot(),
          firstSeenAt: timestamp, lastSeenAt: timestamp, scanCount: 1,
        };
    if (input.reference && !card.features) card.features = featuresToJson(computeFeatures(input.reference));
    if (input.referenceBlob && input.referenceUrl && card.reference.state !== 'ok') {
      card.reference = await this.storeAsset(card.id, 'reference', input.referenceUrl, input.referenceBlob, card.reference);
    }
    await this.save(card);
    await this.enforceLimits(card.id);
    return card;
  }

  /** Guarda um arquivo, com contagem de referências para deduplicar (um GIF por Pokémon, não por carta). */
  private async storeAsset(cardId: string, kind: AssetKind, url: string, blob: Blob, previous?: SlotInfo): Promise<SlotInfo> {
    const knownRecord = await this.db.get('assets', url);
    const alreadyStored = knownRecord && (await this.assets.has(url));
    if (!alreadyStored) {
      try {
        await this.assets.put(url, blob);
      } catch (error) {
        if (!(error instanceof QuotaError)) throw error;
        await this.evictForSpace(cardId, blob.size);
        await this.assets.put(url, blob);
      }
    }
    const refs = new Set(knownRecord?.refs ?? []);
    refs.add(cardId);
    const record: AssetRecord = {
      url, kind, bytes: alreadyStored ? knownRecord.bytes : blob.size, contentType: blob.type || undefined,
      refs: [...refs], storedAt: alreadyStored ? knownRecord.storedAt : this.now(),
    };
    await this.db.put('assets', record);
    if (previous?.key && previous.key !== url) await this.release(cardId, previous.key);
    return { state: 'ok', key: url, bytes: record.bytes, kind: previous?.kind };
  }

  private async release(cardId: string, url: string): Promise<void> {
    const record = await this.db.get('assets', url);
    if (!record) {
      await this.assets.delete(url);
      return;
    }
    const refs = record.refs.filter((ref) => ref !== cardId);
    if (refs.length === 0) {
      await this.assets.delete(url);
      await this.db.delete('assets', url);
    } else {
      await this.db.put('assets', { ...record, refs });
    }
  }

  // ---------------------------------------------------------------- preparo

  private async withRetry<T>(task: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        return await task();
      } catch (error) {
        if (error instanceof QuotaError || error instanceof RangeError) throw error;
        lastError = error;
        if (this.backoffMs > 0) await new Promise((resolve) => setTimeout(resolve, this.backoffMs * (attempt + 1)));
      }
    }
    throw lastError;
  }

  private errorSlot(previous: SlotInfo, error: unknown): SlotInfo {
    const message = error instanceof QuotaError ? 'Sem espaço no aparelho' : error instanceof Error ? error.message : String(error);
    return { state: 'error', error: message, kind: previous.kind };
  }

  /**
   * Baixa só o que falta para a carta ficar pronta (referência, sprite, alvo de AR). Não toca no
   * TCGdex além da imagem de referência dessa carta, e nunca baixa o catálogo.
   */
  async prepareCard(id: string, onProgress?: (progress: PrepareProgress) => void): Promise<PrepareResult> {
    let card = await this.get(id);
    if (!card) throw new Error(`Carta ${id} não está no cache.`);
    const steps: PrepareStep[] = ['referência', 'sprite', 'alvo de AR'];
    const report = (step: PrepareStep) => onProgress?.({ cardId: id, step, index: steps.indexOf(step), total: steps.length });

    // 1) Referência
    report('referência');
    if (card.reference.state !== 'ok') {
      if (!card.imageBase) {
        card = { ...card, reference: { state: 'unavailable', error: 'Sem imagem no TCGdex' } };
      } else {
        const url = cardImageUrl(card.imageBase, 'low', 'webp');
        try {
          const blob = await this.withRetry(async () => {
            const response = await this.fetchImpl(url);
            if (!response.ok) throw new Error(`HTTP ${response.status} ao baixar a referência`);
            return response.blob();
          });
          card = { ...card, reference: await this.storeAsset(id, 'reference', url, blob, card.reference) };
        } catch (error) {
          card = { ...card, reference: this.errorSlot(card.reference, error) };
        }
      }
      await this.save(card);
    }
    if (card.reference.state === 'ok' && !card.features && this.deps.decodeReference) {
      try {
        const blob = await this.getAssetBlob(card, 'reference');
        if (blob) card = { ...card, features: featuresToJson(computeFeatures(await this.deps.decodeReference(blob))) };
        await this.save(card);
      } catch {
        // Características serão recalculadas na próxima oportunidade; não é uma falha da carta.
      }
    }

    // 2) Sprite (GIF animado; PNG estático se o GIF não existir; "indisponível" se nada existir)
    report('sprite');
    if (card.sprite.state !== 'ok') {
      const dexId = card.dexIds[0];
      if (dexId === undefined) {
        card = { ...card, sprite: { state: 'unavailable', error: 'Esta carta não tem um Pokémon (Treinador/Energia)' } };
      } else {
        try {
          const sprite = await this.withRetry(() => this.fetchSpriteImpl(dexId));
          card = sprite
            ? { ...card, sprite: { ...(await this.storeAsset(id, 'sprite', sprite.url, sprite.blob, card.sprite)), kind: sprite.kind } }
            : { ...card, sprite: { state: 'unavailable', error: 'Nenhum sprite encontrado para este Pokémon' } };
        } catch (error) {
          card = { ...card, sprite: this.errorSlot(card.sprite, error) };
        }
      }
      await this.save(card);
    }

    // 3) Alvo de AR (compilado a partir da referência, só se o compilador estiver disponível)
    report('alvo de AR');
    if (card.target.state !== 'ok' && this.deps.buildTarget) {
      const reference = await this.getAssetBlob(card, 'reference');
      if (!reference) {
        card = { ...card, target: { state: 'missing' } };
      } else {
        try {
          const target = await this.deps.buildTarget(reference);
          card = { ...card, target: await this.storeAsset(id, 'target', targetKey(id), target, card.target) };
        } catch (error) {
          card = { ...card, target: this.errorSlot(card.target, error) };
        }
      }
      await this.save(card);
    } else if (card.target.state !== 'ok' && !this.deps.buildTarget) {
      card = { ...card, target: { state: 'unavailable', error: 'Alvo de AR é compilado na hora de carregar' } };
      await this.save(card);
    }

    return { id, status: cacheStatusOf(card), card };
  }

  /** "Carregar todas as vistas": prepara só as cartas já reconhecidas neste aparelho, uma de cada vez. */
  async prepareAllViewed(onProgress?: (progress: PrepareProgress & { done: number; count: number }) => void): Promise<{ count: number; completo: number; falhou: number }> {
    const cards = (await this.list()).filter((card) => card.status !== 'completo');
    let completo = 0;
    let falhou = 0;
    for (let done = 0; done < cards.length; done++) {
      const card = cards[done]!;
      const result = await this.prepareCard(card.id, (p) => onProgress?.({ ...p, done, count: cards.length }));
      if (result.status === 'completo') completo++;
      if (result.status === 'falhou') falhou++;
    }
    return { count: cards.length, completo, falhou };
  }

  /** "Recarregar": tenta de novo só o que falhou ou está faltando (inclui arquivos expulsos pelo navegador). */
  async reload(id: string, onProgress?: (progress: PrepareProgress) => void): Promise<PrepareResult> {
    await this.verifyIntegrity();
    const card = await this.get(id);
    if (!card) throw new Error(`Carta ${id} não está no cache.`);
    const reset = (slot: SlotInfo): SlotInfo => (slot.state === 'error' ? { state: 'missing', kind: slot.kind } : slot);
    await this.save({ ...card, reference: reset(card.reference), sprite: reset(card.sprite), target: reset(card.target) });
    return this.prepareCard(id, onProgress);
  }

  // ------------------------------------------------------------ manutenção

  /** Detecta arquivos que o navegador expulsou (cache evicted): o registro volta a "faltando". */
  async verifyIntegrity(): Promise<number> {
    let repaired = 0;
    for (const card of (await this.load()).values()) {
      let changed = false;
      const next = { ...card };
      for (const slotName of ['reference', 'sprite', 'target'] as const) {
        const slot = card[slotName];
        if (slot.state === 'ok' && slot.key && !(await this.assets.has(slot.key))) {
          next[slotName] = { state: 'missing', kind: slot.kind };
          changed = true;
          repaired++;
        }
      }
      if (changed) await this.save(next);
    }
    return repaired;
  }

  async remove(id: string): Promise<void> {
    const card = await this.get(id);
    if (!card) return;
    for (const slot of [card.reference, card.sprite, card.target]) {
      if (slot.key) await this.release(id, slot.key);
    }
    await this.db.delete('cards', id);
    (await this.load()).delete(id);
  }

  async clear(): Promise<void> {
    await this.db.clear('cards');
    await this.db.clear('assets');
    await this.assets.clear();
    this.index = new Map();
  }

  private async totalBytes(): Promise<number> {
    let total = 0;
    for (const record of await this.db.getAll('assets')) total += record.bytes;
    return total;
  }

  /** Mantém o limite de cartas e de bytes removendo as menos recentes (nunca a que acabou de ser usada). */
  async enforceLimits(protectId?: string): Promise<number> {
    let removed = 0;
    const byAge = () => [...this.index!.values()].filter((card) => card.id !== protectId).sort((a, b) => a.lastSeenAt - b.lastSeenAt);
    while ((await this.load()).size > this.maxCards) {
      const oldest = byAge()[0];
      if (!oldest) break;
      await this.remove(oldest.id);
      removed++;
    }
    while ((await this.totalBytes()) > this.maxBytes) {
      const oldest = byAge()[0];
      if (!oldest) break;
      await this.remove(oldest.id);
      removed++;
    }
    return removed;
  }

  private async evictForSpace(protectId: string, needed: number): Promise<void> {
    const candidates = [...(await this.load()).values()].filter((card) => card.id !== protectId).sort((a, b) => a.lastSeenAt - b.lastSeenAt);
    let freed = 0;
    for (const card of candidates) {
      if (freed >= needed) break;
      const before = await this.totalBytes();
      await this.remove(card.id);
      freed += before - (await this.totalBytes());
    }
  }

  // --------------------------------------------------------------- armazenamento

  async storageInfo(): Promise<StorageInfo> {
    const records = await this.db.getAll('assets');
    const info: StorageInfo = {
      cards: (await this.load()).size,
      assets: records.length,
      assetBytes: records.reduce((sum, record) => sum + record.bytes, 0),
    };
    const storage = this.deps.storage ?? (typeof navigator !== 'undefined' ? navigator.storage : undefined);
    try {
      const estimate = await storage?.estimate?.();
      info.usage = estimate?.usage;
      info.quota = estimate?.quota;
      info.persisted = await storage?.persisted?.();
    } catch {
      // Navegadores sem a API de estimativa: só mostramos o que contamos.
    }
    return info;
  }

  /** Pede armazenamento persistente. O navegador pode negar e, mesmo assim, o app trata a perda (verifyIntegrity). */
  async requestPersistence(): Promise<boolean | undefined> {
    const storage = this.deps.storage ?? (typeof navigator !== 'undefined' ? navigator.storage : undefined);
    try {
      return await storage?.persist?.();
    } catch {
      return undefined;
    }
  }
}

export type { CardFeatures };
