import { archetypesOf } from '../core/archetypes';
import { spriteIdOf } from '../core/dex-form';
import { isShiny } from '../core/shiny';
import type { CachedCard } from '../cache/types';

/** Arquétipos de uma carta escaneada (espécie pela forma impressa, mais nome, raridade, coleção e detalhes do TCGdex). */
export function cardArchetypeIds(card: CachedCard): string[] {
  return archetypesOf({
    dexId: spriteIdOf(card) ?? 0,
    name: card.name,
    rarity: card.rarity,
    setId: card.setId,
    setName: card.setName,
    localId: card.localId,
    setOfficial: card.setOfficial,
    traits: card.traits,
    shiny: isShiny(card),
    mega: card.mega,
  });
}
