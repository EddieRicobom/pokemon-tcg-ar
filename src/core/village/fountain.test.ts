import { describe, expect, it } from 'vitest';
import { wishAtFountain } from './fountain';

describe('desejo na Fonte', () => {
  it('deduz uma moeda e libera Ho-Oh somente no primeiro desejo', () => {
    const first = wishAtFountain(2, false);
    expect(first).toEqual({ coinsAfter: 1, showHoOhCutscene: true });
    expect(wishAtFountain(first!.coinsAfter, true)).toEqual({ coinsAfter: 0, showHoOhCutscene: false });
  });

  it('não gasta moeda nem inicia cena sem saldo inteiro disponível', () => {
    expect(wishAtFountain(0, false)).toBeNull();
    expect(wishAtFountain(-1, false)).toBeNull();
    expect(wishAtFountain(1.5, false)).toBeNull();
  });
});
