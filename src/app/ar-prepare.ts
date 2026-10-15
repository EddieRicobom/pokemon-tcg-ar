import type { SpriteSource } from '../ar/sprite-source';
import type { PrepareProgress, PrepareResult } from '../cache/card-cache';
import type { CachedCard } from '../cache/types';

/** Etapas visíveis do preparo do AR (a busca manual e o reconhecimento passam pelas mesmas). */
export type ArPrepStage = 'dados' | 'alvo';

export interface ArCacheLike {
  get(id: string): Promise<CachedCard | undefined>;
  prepareCard(id: string, onProgress?: (progress: PrepareProgress) => void): Promise<PrepareResult>;
  getAssetBlob(card: CachedCard, kind: 'reference' | 'sprite' | 'target'): Promise<Blob | null>;
}

export interface ArAssets {
  card: CachedCard;
  target: ArrayBuffer;
  cachedSprite: SpriteSource | null;
}

/** Falha do preparo com a etapa onde ocorreu; a mensagem já é para o usuário (pt-BR). */
export class ArPrepareError extends Error {
  constructor(message: string, readonly stage: ArPrepStage) {
    super(message);
    this.name = 'ArPrepareError';
  }
}

/**
 * Deixa tudo pronto para iniciar o AR de uma carta: dados, referência, sprite (se já guardado) e o alvo
 * de rastreamento compilado. Qualquer falha vira um ArPrepareError claro; nunca fica pendente em silêncio.
 */
export async function prepareArAssets(
  cache: ArCacheLike,
  cardId: string,
  onStage?: (stage: ArPrepStage, detail: string) => void,
): Promise<ArAssets> {
  let card = await cache.get(cardId);
  if (!card) throw new ArPrepareError('Essa carta não está mais guardada neste aparelho. Escolha a carta de novo.', 'dados');

  onStage?.('dados', 'Preparando os dados e a imagem de referência…');
  try {
    card = (
      await cache.prepareCard(cardId, (progress) => {
        if (progress.step === 'alvo de AR') onStage?.('alvo', 'Compilando o alvo de rastreamento (pode levar alguns segundos)…');
        else onStage?.('dados', `Preparando ${progress.step}…`);
      })
    ).card;
  } catch (error) {
    throw new ArPrepareError(`Não consegui preparar a carta: ${error instanceof Error ? error.message : String(error)}`, 'dados');
  }

  if (card.reference.state !== 'ok') {
    const why = card.reference.error ? `: ${card.reference.error}` : '';
    throw new ArPrepareError(`Não consegui obter a imagem de referência da carta${why}.`, 'dados');
  }
  const targetBlob = card.target.state === 'ok' ? await cache.getAssetBlob(card, 'target') : null;
  if (!targetBlob) {
    const why = card.target.error ? `: ${card.target.error}` : '';
    throw new ArPrepareError(`Não consegui compilar o alvo de rastreamento desta carta${why}.`, 'alvo');
  }
  let target: ArrayBuffer;
  try {
    target = await targetBlob.arrayBuffer();
  } catch (error) {
    throw new ArPrepareError(`Não consegui ler o alvo guardado: ${error instanceof Error ? error.message : String(error)}`, 'alvo');
  }

  const spriteBlob = card.sprite.state === 'ok' && card.sprite.key ? await cache.getAssetBlob(card, 'sprite') : null;
  const cachedSprite: SpriteSource | null = spriteBlob && card.sprite.key ? { kind: card.sprite.kind ?? 'gif', url: card.sprite.key, blob: spriteBlob } : null;
  return { card, target, cachedSprite };
}
