import { fetchSprite } from '../ar/sprite-source';
import { createDefaultBackend } from '../cache/assets';
import { prepareMegaForm, resolveMegaForm } from './mega-data';
import type { MegaPrepared } from './mega-data';
import { loadBattleData, loadCardInfo, loadProfile } from './pokemon-data-service';
import type { CardBattleInfo, PokemonProfile } from '../core/pokemon-data';
import { recordEvent, syncTrainerHistory } from './trainer-store';
import { CardCache } from '../cache/card-cache';
import { openCacheDb } from '../cache/db';
import { blobToRgba, loadImageRgba, rgbaToCanvas } from '../recognition/browser-image';
import { ArtIndex } from '../recognition/art-index';
import { loadCatalogIndex } from '../recognition/catalog-index';
import type { CatalogLookup } from '../recognition/catalog-index';
import { createTesseractEngine } from '../recognition/ocr';
import type { OcrEngine } from '../recognition/ocr';
import { RecognitionPipeline } from '../recognition/pipeline';
import { TcgdexClient } from '../recognition/tcgdex';
import { CARD_HEIGHT_PX, CARD_WIDTH_PX } from '../recognition/types';
import { loadChunk } from './stale-build';
import { loadLocalVillageSprite, loadLocalVillageSpriteDirs } from '../village/local-sprite-loader';
import type { DecodedGif } from '../core/gif';
import type { Dir } from '../core/village/actors';

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
let artPromise: Promise<ArtIndex | null> | null = null;
let artSearchOn = true;
let captureDebugOn = false;
let ocrListener: ((status: string, progress: number) => void) | null = null;

export function onOcrProgress(listener: ((status: string, progress: number) => void) | null): void {
  ocrListener = listener;
}

/** Diagnóstico do scan: o pipeline passa a guardar miniaturas e motivos de cada quadro. */
export function setCaptureDebug(on: boolean): void {
  captureDebugOn = on;
}

/** Opção "busca pela ilustração": liga/desliga sem recriar o pipeline. */
export function setArtSearch(on: boolean): void {
  artSearchOn = on;
}

/** Índice de ilustrações (carregado só quando a opção é usada). null se ainda não foi publicado. */
export function getArtIndex(): Promise<ArtIndex | null> {
  artPromise ??= ArtIndex.load(assetUrl('data/art-index.json'), assetUrl('data/art-index.bin'));
  return artPromise;
}

export function getCache(): Promise<CardCache> {
  cachePromise ??= (async () => {
    const { backend } = createDefaultBackend();
    const cache = new CardCache({
      db: await openCacheDb(),
      assets: backend,
      // O alvo de AR é compilado aqui, no aparelho, a partir da imagem de referência (MindAR carregado sob demanda).
      buildTarget: async (reference) => (await loadChunk(() => import('../ar/target'))).compileTarget(reference),
      decodeReference: (blob) => blobToRgba(blob, CARD_WIDTH_PX, CARD_HEIGHT_PX),
      // Cada leitura gravada rende XP no Treinador.
      onRecorded: (card) => recordEvent({ type: 'scan', cardId: card.id, setId: card.setId, setName: card.setName, setTotal: card.setOfficial, shiny: card.shiny === true }),
    });
    // Se o navegador apagou arquivos por falta de espaço, as cartas voltam a "parcial" em vez de fingirem estar prontas.
    await cache.verifyIntegrity().catch(() => 0);
    void cache.requestPersistence();
    // Cartas shiny guardadas com o sprite normal (só o brilho) trocam pelo sprite shiny de verdade, em segundo plano.
    void cache.refreshShinySprites().catch(() => 0);
    // As cartas que já estavam guardadas entram no Treinador sem XP.
    void cache.list().then((cards) => syncTrainerHistory(cards)).catch(() => undefined);
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

/**
 * Uma pose (`animName`: "Idle" por padrão, ou "Walk" etc. na Sobrevivência) de um Pokémon a partir do pacote de
 * sprites locais da Vila (`public/sprites/pokemon/`), null se a espécie não tiver essa animação no pacote ou
 * algo falhar — quem chamou cai para outra fonte nesse caso (ver `loadLocalVillageSprite`).
 */
export function getLocalVillageSprite(dexId: number, shiny: boolean, animName = 'Idle'): Promise<DecodedGif | null> {
  return loadLocalVillageSprite(
    dexId,
    shiny,
    {
      metaUrl: assetUrl('data/village-sprite-meta.json'),
      spriteUrl: (id, anim, wantShiny) => assetUrl(`sprites/pokemon/${id}/${wantShiny ? 's/' : ''}${anim}.png`),
    },
    animName,
  );
}

/**
 * As 4 poses cardeais (`up`/`down`/`left`/`right`) do pacote de sprites locais, para o Pokémon virar de verdade
 * conforme o último passo em vez de só espelhar a pose de frente. Mesmo custo de rede que `getLocalVillageSprite`
 * (baixa a folha uma vez e recorta as 4 direções dela). Null nos mesmos casos (ver `loadLocalVillageSpriteDirs`).
 */
export function getLocalVillageSpriteDirs(dexId: number, shiny: boolean, animName = 'Idle'): Promise<Partial<Record<Dir, DecodedGif>> | null> {
  return loadLocalVillageSpriteDirs(
    dexId,
    shiny,
    {
      metaUrl: assetUrl('data/village-sprite-meta.json'),
      spriteUrl: (id, anim, wantShiny) => assetUrl(`sprites/pokemon/${id}/${wantShiny ? 's/' : ''}${anim}.png`),
    },
    animName,
  );
}

/**
 * O recorte real de tileset usado como grama da Vila (`village-art.ts`), o mesmo ladrilho 32×32 já usado como
 * chão da Zona de Sobrevivência (ver THIRD_PARTY_NOTICES.md) — null se não der pra baixar (cai no ladrilho
 * desenhado por código de sempre).
 */
export function getVillageGroundTile(): Promise<{ w: number; h: number; data: Uint8ClampedArray } | null> {
  return loadImageRgba(assetUrl('tilesets/survivor-grass.png'), 32, 32)
    .then(({ image }) => ({ w: image.width, h: image.height, data: image.data }))
    .catch(() => null);
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
    captureDebug: () => captureDebugOn,
    artSearch: () => (artSearchOn ? getArtIndex() : Promise.resolve(null)),
  });
  return pipeline;
}

/** Carrega, em paralelo, atributos/golpes (PokéAPI) e ataques da carta (TCGdex) para o painel de AR. */
export function loadBattle(cardId: string, dexId: number | undefined, onPart: Parameters<typeof loadBattleData>[2]): Promise<void> {
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  return loadBattleData({ cardId, dexId }, { storage, getCard: (id) => getTcgdex().getCard(id) }, onPart);
}

/** O que o Pin Mode precisa de um Pokémon: atributos e peso (PokéAPI) e ataques da carta (TCGdex). Cada parte pode faltar. */
export async function loadPinData(cardId: string, dexId: number | undefined): Promise<{ profile: PokemonProfile | null; card: CardBattleInfo | null }> {
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  const [profile, card] = await Promise.all([loadProfile(dexId, { storage }), loadCardInfo(cardId, { storage, getCard: (id) => getTcgdex().getCard(id) })]);
  return { profile, card };
}

/** Deixa pronta a forma Mega de uma carta (espécie, atributos e sprite) sem cobrar nada: ver `prepareMegaForm`. */
export function prepareMegaFor(card: { id: string; name: string; baseDexId: number | undefined; shiny?: boolean }): Promise<MegaPrepared> {
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  return prepareMegaForm(card, {
    resolve: (dexId, variant) => resolveMegaForm(dexId, variant, { storage }),
    loadProfile: (formId) => loadProfile(formId, { storage }),
    fetchSprite: (formId, shiny) => fetchSprite(formId, undefined, { shiny }),
  });
}

export { fetchSprite };
