import { describe, expect, it } from 'vitest';
import { browseItems } from './item-browser';

const items = [
  { id: 'madeira', name: 'Madeira', kind: 'material' as const, quantity: 2 },
  { id: 'pao', name: 'Pão', kind: 'food' as const, quantity: 7, ready: true },
  { id: 'semente-oran', name: 'Semente Oran', kind: 'seed' as const, quantity: 1, ready: false },
];

describe('browseItems', () => {
  it('encontra nomes sem exigir acentos e filtra a categoria', () => {
    expect(browseItems(items, { query: 'pao' }).map((item) => item.id)).toEqual(['pao']);
    expect(browseItems(items, { kind: 'seed' }).map((item) => item.id)).toEqual(['semente-oran']);
  });

  it('separa receitas prontas das que ainda precisam de ingredientes', () => {
    expect(browseItems(items, { availability: 'prontas' }).map((item) => item.id)).toEqual(['pao']);
    expect(browseItems(items, { availability: 'faltando' }).map((item) => item.id)).toEqual(['semente-oran']);
  });

  it('organiza por quantidade sem alterar o resultado filtrado', () => {
    expect(browseItems(items, { sort: 'quantidade' }).map((item) => item.id)).toEqual(['pao', 'madeira', 'semente-oran']);
  });
});
