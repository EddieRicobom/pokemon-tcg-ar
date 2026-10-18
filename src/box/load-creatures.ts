import { decodeGif } from '../core/gif';
import type { CachedCard } from '../cache/types';
import { MAX_CREATURES } from './box-scene';
import type { CreatureEntry } from './box-scene';
import { spriteIdOf } from '../core/dex-form';
import { isMega } from '../core/mega';
import { isShiny } from '../core/shiny';

export interface CreatureCacheLike {
  list(): Promise<CachedCard[]>;
  getAssetBlob(card: CachedCard, kind: 'sprite'): Promise<Blob | null>;
}

export interface CreatureDecoders {
  gif: (blob: Blob) => Promise<ReturnType<typeof decodeGif>>;
  image: (blob: Blob) => Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
}

/**
 * Digital Pokémon que podem entrar na Caixa (pedido do dono): o sprite não vem do cache de cartas, mas é o mesmo tipo
 * de sprite das cartas (o GIF da Showdown, ou o PNG de reserva), para ficarem em pé no chão como as outras. O pacote
 * pixelado da Vila tem margem embaixo do quadro e fazia os digitais flutuarem.
 */
export interface DigitalCreatures {
  instances: readonly { instanceId: string; name: string; dexId: number }[];
  sprite: (dexId: number) => Promise<CreatureEntry['source'] | null>;
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
  digital?: DigitalCreatures,
  companion?: (card: CachedCard, decoders: CreatureDecoders) => Promise<CreatureEntry | null>,
): Promise<LoadedCreatures> {
  let cards = (await cache.list()).filter((card) => card.sprite.state === 'ok');
  const digitalById = new Map((digital?.instances ?? []).map((i) => [i.instanceId, i]));
  // Equipe escolhida: só estas cartas (e Digital Pokémon), na ordem da equipe.
  let order: ({ kind: 'card'; card: CachedCard } | { kind: 'digital'; id: string })[] = cards.map((card) => ({ kind: 'card' as const, card }));
  if (only) {
    const byId = new Map(cards.map((card) => [card.id, card]));
    order = [];
    for (const id of only) {
      const card = byId.get(id);
      if (card) order.push({ kind: 'card', card });
      else if (digitalById.has(id)) order.push({ kind: 'digital', id });
    }
    cards = order.flatMap((o) => (o.kind === 'card' ? [o.card] : []));
  }
  const entries: CreatureEntry[] = [];
  const failed: LoadedCreatures['failed'] = [];
  for (const item of order) {
    if (entries.length >= MAX_CREATURES) break;
    if (item.kind === 'digital') {
      const inst = digitalById.get(item.id)!;
      try {
        const source = await digital!.sprite(inst.dexId);
        if (!source) throw new Error('sprite indisponível agora (sem rede?)');
        entries.push({ info: { id: inst.instanceId, name: inst.name, dexId: inst.dexId, detail: 'Digital Pokémon', digital: true }, source });
      } catch (error) {
        failed.push({ name: inst.name, reason: error instanceof Error ? error.message : String(error) });
      }
      continue;
    }
    const card = item.card;
    try {
      const evolved = await companion?.(card, decoders);
      if (evolved) {
        entries.push(evolved);
        continue;
      }
      const blob = await cache.getAssetBlob(card, 'sprite');
      if (!blob) throw new Error('arquivo do sprite não encontrado no cache');
      const info = { id: card.id, name: card.name, dexId: spriteIdOf(card), detail: `${card.setName} ${card.localId}/${card.setOfficial}`, shiny: isShiny(card), mega: isMega(card) };
      if (card.sprite.kind === 'gif') entries.push({ info, source: { kind: 'gif', gif: await decoders.gif(blob) } });
      else entries.push({ info, source: { kind: 'image', image: await decoders.image(blob) } });
    } catch (error) {
      failed.push({ name: card.name, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { entries, available: order.length, failed };
}
