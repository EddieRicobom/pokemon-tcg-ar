import { fetchSprite } from '../ar/sprite-source';
import { createDefaultBackend } from '../cache/assets';
import { CardCache } from '../cache/card-cache';
import { openCacheDb } from '../cache/db';
import { blobToRgba, loadImageRgba, rgbaToCanvas } from '../recognition/browser-image';
import { loadCatalogIndex } from '../recognition/catalog-index';
import type { CatalogLookup } from '../recognition/catalog-index';
import { createTesseractEngine } from '../recognition/ocr';
import type { OcrEngine } from '../recognition/ocr';
import { RecognitionPipeline } from '../recognition/pipeline';
import { TcgdexClient } from '../recognition/tcgdex';
import { CARD_HEIGHT_PX, CARD_WIDTH_PX } from '../recognition/types';

/**
 * Serviços do app, criados sob demanda e uma vez só (nada pesado é carregado antes de o usuário
 * precisar: OCR, índice do catálogo, banco local). Caminhos usam `import.meta.env.BASE_URL`.
 */
const base = import.meta.env.BASE_URL;

export const assetUrl = (path: string): string => `${base}${path.replace(/^\//, '')}`;

let cachePromise: Promise<CardCache> | null = null;
let tcgdex: TcgdexClient | null = null;
let catalogPromise: Promise<CatalogLookup | null> | null = null;
let ocrPromise: Promise<OcrEngine> | null = null;
let pipeline: RecognitionPipeline | null = null;
let ocrListener: ((status: string, progress: number) => void) | null = null;

export function onOcrProgress(listener: ((status: string, progress: number) => void) | null): void {
  ocrListener = listener;
}

export function getCache(): Promise<CardCache> {
  cachePromise ??= (async () => {
    const { backend } = createDefaultBackend();
    const cache = new CardCache({
      db: await openCacheDb(),
      assets: backend,
      // O alvo de AR é compilado aqui, no aparelho, a partir da imagem de referência (MindAR carregado sob demanda).
      buildTarget: async (reference) => (await import('../ar/target')).compileTarget(reference),
      decodeReference: (blob) => blobToRgba(blob, CARD_WIDTH_PX, CARD_HEIGHT_PX),
    });
    // Se o navegador apagou arquivos por falta de espaço, as cartas voltam a "parcial" em vez de fingirem estar prontas.
    await cache.verifyIntegrity().catch(() => 0);
    void cache.requestPersistence();
    return cache;
  })();
  return cachePromise;
}

export function getTcgdex(): TcgdexClient {
  tcgdex ??= new TcgdexClient();
  return tcgdex;
}

export function getCatalog(): Promise<CatalogLookup | null> {
  catalogPromise ??= loadCatalogIndex(assetUrl('data/catalog-index.json'));
  return catalogPromise;
}

export function getOcr(): Promise<OcrEngine> {
  ocrPromise ??= createTesseractEngine({
    assetsBaseUrl: assetUrl('ocr'),
    toCanvas: rgbaToCanvas,
    onProgress: (status, progress) => ocrListener?.(status, progress),
  }).catch((error) => {
    ocrPromise = null;
    throw error;
  });
  return ocrPromise;
}

export async function getPipeline(): Promise<RecognitionPipeline> {
  if (pipeline) return pipeline;
  const [cache, catalog, ocr] = await Promise.all([getCache(), getCatalog(), getOcr()]);
  pipeline = new RecognitionPipeline({
    ocr,
    tcgdex: getTcgdex(),
    catalog,
    loadReference: (url) => loadImageRgba(url, CARD_WIDTH_PX, CARD_HEIGHT_PX),
    localReferences: () => cache.localReferences(),
  });
  return pipeline;
}

export { fetchSprite };
