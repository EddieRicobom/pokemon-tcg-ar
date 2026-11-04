import { describe, expect, it } from 'vitest';
import { makeFountainWish, wishAtFountain } from './fountain';
import { count, emptyVillage, normalizeVillage } from './life';

describe('desejo na Fonte', () => {
  it('deduz uma moeda e libera Ho-Oh somente no terceiro desejo', () => {
    const first = wishAtFountain(4, 0);
    expect(first).toEqual({ coinsAfter: 3, wishesAfter: 1, showHoOhCutscene: false });
    const second = wishAtFountain(first!.coinsAfter, first!.wishesAfter);
    expect(second).toEqual({ coinsAfter: 2, wishesAfter: 2, showHoOhCutscene: false });
    expect(wishAtFountain(second!.coinsAfter, second!.wishesAfter)).toEqual({ coinsAfter: 1, wishesAfter: 3, showHoOhCutscene: true });
    expect(wishAtFountain(1, 3)).toEqual({ coinsAfter: 0, wishesAfter: 4, showHoOhCutscene: false });
  });

  it('não gasta moeda nem inicia cena sem saldo inteiro disponível', () => {
    expect(wishAtFountain(0, 0)).toBeNull();
    expect(wishAtFountain(-1, 0)).toBeNull();
    expect(wishAtFountain(1.5, 0)).toBeNull();
  });

  it('entrega uma pedra na primeira moeda do dia e outra no dia seguinte, inclusive após recarregar', () => {
    const state = emptyVillage(7, { x: 1, y: 1 });
    expect(makeFountainWish(state, '2026-11-04')).toMatchObject({ coinsAfter: 99, trustStone: true });
    expect(count(state, 'trust-stone')).toBe(1);
    const restored = normalizeVillage(JSON.parse(JSON.stringify(state)), 7, { x: 1, y: 1 });
    expect(makeFountainWish(restored, '2026-11-04')).toMatchObject({ coinsAfter: 98, trustStone: false });
    expect(count(restored, 'trust-stone')).toBe(1);
    expect(makeFountainWish(restored, '2026-11-05')).toMatchObject({ coinsAfter: 97, trustStone: true, showHoOhCutscene: true });
    expect(count(restored, 'trust-stone')).toBe(2);
  });

  it('sem moeda não entrega nem consome a recompensa diária', () => {
    const state = emptyVillage(7, { x: 1, y: 1 });
    state.coins = 0;
    expect(makeFountainWish(state, '2026-11-04')).toBeNull();
    expect(state.fountainTrustStoneDay).toBe('');
    expect(count(state, 'trust-stone')).toBe(0);
    state.coins = 1;
    expect(makeFountainWish(state, '2026-11-04')?.trustStone).toBe(true);
  });

  it('com a mochila cheia não marca a recompensa como recebida', () => {
    const state = emptyVillage(7, { x: 1, y: 1 });
    state.inventory['trust-stone'] = 999;
    expect(makeFountainWish(state, '2026-11-04')?.trustStone).toBe(false);
    expect(state.fountainTrustStoneDay).toBe('');
    state.inventory['trust-stone'] = 998;
    expect(makeFountainWish(state, '2026-11-04')?.trustStone).toBe(true);
  });
});
