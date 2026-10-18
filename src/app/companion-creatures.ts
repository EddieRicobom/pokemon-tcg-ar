import { companionCard } from './card-evolution-store';
import { fetchSprite } from '../ar/sprite-source';
import { spriteIdOf } from '../core/dex-form';
import { isShiny } from '../core/shiny';
import type { CachedCard } from '../cache/types';
import type { CreatureDecoders } from '../box/load-creatures';
import type { CreatureEntry } from '../box/box-scene';

/** Nenhum sprite da espécie antiga é usado se a forma evoluída não puder ser carregada. */
export async function loadCardCompanionEntry(card: CachedCard, decoders: CreatureDecoders): Promise<CreatureEntry | null> {
  const evolved = companionCard(card);
  if (evolved === card) return null;
  const dexId = spriteIdOf(evolved)!;
  const sprite = await fetchSprite(dexId, undefined, { shiny: isShiny(card) });
  if (!sprite) throw new Error('O sprite do companheiro evoluído não está disponível agora.');
  const info = { id: card.id, name: evolved.name, dexId, detail: `Evoluiu da sua carta de ${card.name} · ${card.setName}`, shiny: isShiny(card), mega: false };
  return sprite.kind === 'gif'
    ? { info, source: { kind: 'gif', gif: await decoders.gif(sprite.blob) } }
    : { info, source: { kind: 'image', image: await decoders.image(sprite.blob) } };
}
