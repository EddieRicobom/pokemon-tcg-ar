import type { PokemonType } from '../pokemon-data';
import { itemDef } from './catalog';
import { dislikeOf, favoriteFoodOf, favoriteOf, friendOf } from './life';
import type { ItemId, VillageState } from './life';

/** O que o morador acha do item: ajuda a escolher sem precisar decorar o Livro. */
export type GiftTag = 'pedido' | 'favorito' | 'comida-favorita' | 'nao-gosta';

export interface GiftOption {
  id: ItemId;
  tag: GiftTag | null;
}

export const GIFT_TAG_LABEL: Readonly<Record<GiftTag, string>> = {
  pedido: '📌 pediu hoje',
  favorito: '❤️ favorito',
  'comida-favorita': '😋 prato favorito',
  'nao-gosta': '👎 não gosta',
};

const ORDER: Readonly<Record<GiftTag | 'neutro', number>> = { pedido: 0, favorito: 1, 'comida-favorita': 2, neutro: 3, 'nao-gosta': 4 };

/**
 * Lista do presente: o que ele pediu e o que ele ama vêm primeiro, e o que ele não gosta vai para o fim. Sem os tipos
 * carregados (sem rede), não há etiqueta de gosto: nada de palpite apresentado como fato. Prêmios sem valor de venda
 * (Pedra da Confiança, Fragmento Ômega, troféus) ficam de fora, para não se perderem num toque errado; o Love Candy fica.
 */
export function giftOptions(state: VillageState, id: string, types: readonly PokemonType[], items: readonly ItemId[], day: string): GiftOption[] {
  const friend = friendOf(state, id);
  const request = friend.request && friend.request.day === day && !friend.request.done ? friend.request.item : null;
  const known = types.length > 0;
  const tagOf = (item: ItemId): GiftTag | null => {
    if (item === request) return 'pedido';
    if (!known) return null;
    if (item === favoriteOf(types)) return 'favorito';
    if (item === favoriteFoodOf(types)) return 'comida-favorita';
    return item === dislikeOf(id, types) ? 'nao-gosta' : null;
  };
  return items
    .filter((item) => {
      const def = itemDef(item);
      return !!def && def.kind !== 'accessory' && !def.gift && (def.sell > 0 || !!def.friendshipLevels);
    })
    .map((item, index) => ({ id: item, tag: tagOf(item), index }))
    .sort((a, b) => ORDER[a.tag ?? 'neutro'] - ORDER[b.tag ?? 'neutro'] || a.index - b.index)
    .map(({ id: item, tag }) => ({ id: item, tag }));
}
