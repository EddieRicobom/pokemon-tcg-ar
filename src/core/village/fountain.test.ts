import { describe, expect, it } from 'vitest';
import { wishAtFountain } from './fountain';

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
});
