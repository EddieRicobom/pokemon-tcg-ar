import { decodeGif } from '../core/gif';
import type { CachedCard } from '../cache/types';
import { MAX_CREATURES } from './box-scene';
import type { CreatureEntry } from './box-scene';
import { spriteIdOf } from '../core/dex-form';

export interface CreatureCacheLike {
  list(): Promise<CachedCard[]>;
  getAssetBlob(card: CachedCard, kind: 'sprite'): Promise<Blob | null>;
}

export interface CreatureDecoders {
  gif: (blob: Blob) => Promise<ReturnType<typeof decodeGif>>;
  image: (blob: Blob) => Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
}

export interface LoadedCreatures {
  entries: CreatureEntry[];
  /** Cartas guardadas que têm sprite (mesmo as que ficaram de fora do limite). */
  available: number;
  /** Cartas cujo sprite não pôde ser lido (nome e motivo). */
  failed: { name: string; reason: string }[];
}

export const browserDecoders: CreatureDecoders = {
  gif: async (blob) => decodeGif(await blob.arrayBuffer()),
  image: async (blob) => {
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas 2D indisponível.');
      context.drawImage(bitmap, 0, 0);
      return { width: bitmap.width, height: bitmap.height, data: context.getImageData(0, 0, bitmap.width, bitmap.height).data };
    } finally {
      bitmap.close();
    }
  },
};

/**
 * Monta a população da Caixa a partir das cartas guardadas neste aparelho: um Pokémon por carta que tem
 * sprite guardado (GIF animado ou PNG parado), as mais recentes primeiro (ou só as de `only`, na ordem dada). Uma carta com problema não impede
 * as outras: entra na lista de falhas.
 */
export async function loadCreatureEntries(
  cache: CreatureCacheLike,
  decoders: CreatureDecoders = browserDecoders,
  only?: readonly string[],
): Promise<LoadedCreatures> {
  let cards = (await cache.list()).filter((card) => card.sprite.state === 'ok');
  // Equipe escolhida: só estas cartas, na ordem da equipe.
  if (only) {
    const byId = new Map(cards.map((card) => [card.id, card]));
    cards = only.map((id) => byId.get(id)).filter((card): card is NonNullable<typeof card> => card !== undefined);
  }
  const entries: CreatureEntry[] = [];
  const failed: LoadedCreatures['failed'] = [];
  for (const card of cards) {
    if (entries.length >= MAX_CREATURES) break;
    try {
      const blob = await cache.getAssetBlob(card, 'sprite');
      if (!blob) throw new Error('arquivo do sprite não encontrado no cache');
      const info = { id: card.id, name: card.name, dexId: spriteIdOf(card), detail: `${card.setName} ${card.localId}/${card.setOfficial}` };
      if (card.sprite.kind === 'gif') entries.push({ info, source: { kind: 'gif', gif: await decoders.gif(blob) } });
      else entries.push({ info, source: { kind: 'image', image: await decoders.image(blob) } });
    } catch (error) {
      failed.push({ name: card.name, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { entries, available: cards.length, failed };
}
