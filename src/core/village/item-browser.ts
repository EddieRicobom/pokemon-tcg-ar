/** Filtros e ordenação das listas de itens da Vila, independentes da interface. */

import type { ItemKind } from './catalog';

export type ItemBrowserSort = 'catalogo' | 'nome' | 'quantidade' | 'categoria' | 'prontas';

export interface ItemBrowserEntry {
  id: string;
  name: string;
  kind: ItemKind;
  /** Quantidade na mochila ou de porções já prontas. */
  quantity?: number;
  /** Se a receita pode ser feita sem consumir itens reservados. */
  ready?: boolean;
}

export interface ItemBrowserOptions {
  query?: string;
  kind?: ItemKind | 'todos';
  availability?: 'todos' | 'prontas' | 'faltando';
  sort?: ItemBrowserSort;
}

/** Remove acentos para a busca aceitar tanto "pao" quanto "pão". */
function searchable(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
}

/** Aplica busca, filtros e uma ordenação estável, preservando a ordem do catálogo nos empates. */
export function browseItems<T extends ItemBrowserEntry>(entries: readonly T[], options: ItemBrowserOptions = {}): T[] {
  const query = searchable(options.query ?? '').trim();
  const kind = options.kind ?? 'todos';
  const availability = options.availability ?? 'todos';
  const sort = options.sort ?? 'catalogo';
  const indexed = entries
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => (kind === 'todos' || item.kind === kind)
      && (!query || searchable(`${item.name} ${item.id}`).includes(query))
      && (availability === 'todos' || (availability === 'prontas' ? item.ready === true : item.ready === false)));

  indexed.sort((a, b) => {
    const byName = a.item.name.localeCompare(b.item.name, 'pt-BR');
    if (sort === 'nome') return byName || a.index - b.index;
    if (sort === 'quantidade') return (b.item.quantity ?? 0) - (a.item.quantity ?? 0) || byName || a.index - b.index;
    if (sort === 'categoria') return a.item.kind.localeCompare(b.item.kind, 'pt-BR') || byName || a.index - b.index;
    if (sort === 'prontas') return Number(b.item.ready) - Number(a.item.ready) || byName || a.index - b.index;
    return a.index - b.index;
  });
  return indexed.map(({ item }) => item);
}
