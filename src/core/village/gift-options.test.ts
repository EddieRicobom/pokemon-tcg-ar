import { describe, expect, it } from 'vitest';
import { generateVillage } from './map';
import { dislikeOf, emptyVillage, friendOf } from './life';
import { giftOptions } from './gift-options';

const map = generateVillage(42);
const fresh = () => emptyVillage(42, map.spawn);
const day = '2026-11-08';

describe('lista do presente', () => {
  it('põe o pedido do dia e o favorito na frente e o que ele não gosta no fim', () => {
    const state = fresh();
    friendOf(state, 'mon').request = { day, item: 'madeira', qty: 1, done: false };
    const disliked = dislikeOf('mon', ['fire']);
    const items = [disliked, 'pena', 'oran', 'madeira'];
    const list = giftOptions(state, 'mon', ['fire'], [...new Set(items)], day);
    expect(list[0]).toEqual({ id: 'madeira', tag: 'pedido' });
    expect(list.find((option) => option.id === 'oran')?.tag).toBe('favorito');
    if (disliked !== 'madeira') expect(list.at(-1)).toEqual({ id: disliked, tag: 'nao-gosta' });
  });

  it('sem os tipos carregados não inventa gosto', () => {
    const list = giftOptions(fresh(), 'mon', [], ['oran', 'pedra'], day);
    expect(list.every((option) => option.tag === null)).toBe(true);
  });

  it('não oferece prêmios sem valor de venda, mas mantém o Love Candy', () => {
    const list = giftOptions(fresh(), 'mon', ['fire'], ['trust-stone', 'omega-shard', 'love-candy', 'madeira'], day).map((option) => option.id);
    expect(list).toContain('love-candy');
    expect(list).not.toContain('trust-stone');
    expect(list).not.toContain('omega-shard');
  });

  it('um pedido de ontem ou já entregue não aparece como pedido', () => {
    const state = fresh();
    friendOf(state, 'mon').request = { day: '2026-11-07', item: 'madeira', qty: 1, done: false };
    expect(giftOptions(state, 'mon', [], ['madeira'], day)[0]?.tag).toBeNull();
    friendOf(state, 'mon').request = { day, item: 'madeira', qty: 1, done: true };
    expect(giftOptions(state, 'mon', [], ['madeira'], day)[0]?.tag).toBeNull();
  });
});
