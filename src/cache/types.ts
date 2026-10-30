import type { SpriteKind } from '../ar/sprite-source';
import type { CardTraits } from '../core/card-traits';

/** Mude quando o formato dos registros mudar; versões antigas são migradas ou invalidadas. */
export const CACHE_SCHEMA_VERSION = 1;
export const DB_NAME = 'pokemon-tcg-ar';
export const ASSET_CACHE_NAME = `tcg-ar-assets-v${CACHE_SCHEMA_VERSION}`;

export type AssetKind = 'reference' | 'sprite' | 'target';
export type SlotState = 'ok' | 'missing' | 'unavailable' | 'error';

/** Características visuais serializadas (veja recognition/hash.ts). */
export interface StoredFeatures {
  v: number;
  f: number[];
  a: number[];
  c: number[];
}

export interface SlotInfo {
  state: SlotState;
  /** Chave do arquivo no Cache Storage (URL real, ou URL sintética para o alvo de AR). */
  key?: string;
  bytes?: number;
  error?: string;
  /** Só para o sprite: GIF animado ou PNG estático de reserva. */
  kind?: SpriteKind;
  /** Só para o sprite: foi baixado para uma carta shiny (pedindo a variante shiny). */
  shinyRequested?: boolean;
  /** Só para o sprite: o arquivo guardado é a variante shiny de verdade (ausente = sprite normal). */
  shiny?: boolean;
  /** Só para o alvo de AR: versão do processo de compilação (alvos de outra versão são recompilados). */
  version?: number;
  /** Só para o alvo de AR: qualidade da imagem usada na compilação. */
  source?: 'alta' | 'baixa';
}

/** Cartas já reconhecidas, com tudo que é reutilizável sem rede. Nunca guarda quadros da câmera. */
export interface CachedCard {
  id: string;
  schema: number;
  name: string;
  setId: string;
  setName: string;
  localId: string;
  /** Raridade informada pelo TCGdex; ausente nos saves antigos ou quando a fonte não a informa. */
  rarity?: string;
  setOfficial: number;
  setTotal: number;
  setCode?: string;
  dexIds: number[];
  imageBase?: string;
  /** Características da imagem de referência: servem para reconhecer de novo sem consultar o TCGdex. */
  features?: StoredFeatures;
  reference: SlotInfo;
  sprite: SlotInfo;
  target: SlotInfo;
  firstSeenAt: number;
  lastSeenAt: number;
  scanCount: number;
  /**
   * Carta de um escaneamento em andamento (momento em que começou). Enquanto existir, a carta não aparece na lista nem no
   * reconhecimento local: só vira definitiva quando referência, sprite e alvo de AR ficam prontos (`CardCache.scanCard`).
   * Sobras de um escaneamento interrompido são apagadas ao abrir o app.
   */
  pending?: number;
  /** Shiny: sorteado (1 em 50) no primeiro escaneamento completo e guardado. Ausente em cartas antigas. */
  shiny?: boolean;
  /** Escaneada como carta Mega (marcado no primeiro escaneamento completo). */
  mega?: boolean;
  /** Detalhes do TCGdex para os arquétipos (`core/card-traits.ts`). Ausente em cartas escaneadas antes; volta num novo escaneamento. */
  traits?: CardTraits;
  /** Quando o app tentou buscar os detalhes desta carta no TCGdex sozinho (para não repetir a cada abertura). */
  traitsCheckedAt?: number;
}

export interface AssetRecord {
  url: string;
  kind: AssetKind;
  bytes: number;
  contentType?: string;
  /** Ids das cartas que usam o arquivo (o mesmo GIF serve a todas as cartas do mesmo Pokémon). */
  refs: string[];
  storedAt: number;
}

export type CacheStatus = 'completo' | 'parcial' | 'falhou';

/**
 * Carta sem número da Pokédex no TCGdex. Pode ser Treinador ou Energia, mas também carta de Pokémon de coleção nova
 * que o TCGdex ainda não completou (ex.: 30th Celebration): o texto não afirma o que não sabe.
 */
export const NO_DEX_ERROR = 'O TCGdex não informa qual Pokémon é esta carta (Treinador, Energia ou dado faltando)';
/** Texto antigo do mesmo caso, ainda guardado em cartas escaneadas antes: a tela mostra o novo. */
export const LEGACY_NO_DEX_ERROR = 'Esta carta não tem um Pokémon (Treinador/Energia)';

export interface StorageInfo {
  cards: number;
  assets: number;
  assetBytes: number;
  usage?: number;
  quota?: number;
  persisted?: boolean;
}
