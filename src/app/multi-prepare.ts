import { prepareArAssets } from './ar-prepare';
import type { ArAssets, ArCacheLike } from './ar-prepare';

export interface MultiPrepared {
  /** Cartas prontas (alvo compilado + sprite), na ordem pedida. */
  ready: ArAssets[];
  /** Cartas que não ficaram prontas, com o motivo. */
  failed: { cardId: string; name: string; reason: string }[];
}

type Prepare = (cache: ArCacheLike, cardId: string, onStage?: (stage: 'dados' | 'alvo', detail: string) => void) => Promise<ArAssets>;

/**
 * Prepara, uma de cada vez (compilar alvo é pesado para o celular), as cartas que serão rastreadas juntas.
 * Uma carta que falha não impede as outras: entra em `failed` com o motivo.
 */
export async function prepareMultiAssets(
  cache: ArCacheLike,
  cardIds: readonly string[],
  names: ReadonlyMap<string, string>,
  onProgress?: (done: number, total: number, name: string, detail: string) => void,
  prepare: Prepare = prepareArAssets,
): Promise<MultiPrepared> {
  const ready: ArAssets[] = [];
  const failed: MultiPrepared['failed'] = [];
  for (const [i, cardId] of cardIds.entries()) {
    const name = names.get(cardId) ?? cardId;
    onProgress?.(i, cardIds.length, name, 'Preparando…');
    try {
      ready.push(await prepare(cache, cardId, (_stage, detail) => onProgress?.(i, cardIds.length, name, detail)));
    } catch (error) {
      failed.push({ cardId, name, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  onProgress?.(cardIds.length, cardIds.length, '', 'Pronto');
  return { ready, failed };
}
