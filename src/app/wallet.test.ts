import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadVillage, saveVillage, VILLAGE_KEY } from './village-store';
import { addCoins, attachLiveVillage, coins, detachLiveVillage, spendCoins } from './wallet';

describe('carteira (saldo único de moedas)', () => {
  beforeEach(() => {
    localStorage.removeItem(VILLAGE_KEY);
    const v = loadVillage();
    v.coins = 100;
    saveVillage(v);
    attachLiveVillage(v, () => {});
    detachLiveVillage(v);
  });

  it('com a Vila fechada, ganha e gasta direto no que está guardado', () => {
    expect(coins.value).toBe(100);
    expect(addCoins(50)).toBe(50);
    expect(loadVillage().coins).toBe(150);
    expect(spendCoins(120)).toBe(true);
    expect(loadVillage().coins).toBe(30);
    expect(coins.value).toBe(30);
  });

  it('não gasta o que não tem (nada muda)', () => {
    expect(spendCoins(101)).toBe(false);
    expect(loadVillage().coins).toBe(100);
  });

  it('com a Vila aberta, mexe no estado vivo dela e pede para salvar (sem a Vila sobrescrever depois)', () => {
    const live = loadVillage();
    let saves = 0;
    attachLiveVillage(live, () => {
      saves++;
      saveVillage(live);
    });
    addCoins(40);
    expect(live.coins).toBe(140);
    expect(saves).toBe(1);
    expect(spendCoins(500)).toBe(false);
    expect(saves).toBe(1);
    detachLiveVillage(live);
    expect(coins.value).toBe(140);
  });

  it('ao fechar, o saldo mostrado é o da Vila viva, mesmo antes do último salvamento dela', () => {
    const live = loadVillage();
    attachLiveVillage(live, () => {}); // a Vila salva depois, por conta própria
    live.coins += 10; // ganhou conversando, ainda não salvou
    detachLiveVillage(live);
    expect(coins.value).toBe(110);
  });

  it('valores estranhos não viram moeda', () => {
    expect(addCoins(-5)).toBe(0);
    expect(addCoins(0.4)).toBe(0);
    expect(loadVillage().coins).toBe(100);
  });

  it.each([NaN, Infinity, -Infinity])('rejeita valor não finito (%s) sem corromper o saldo guardado', (amount) => {
    expect(addCoins(amount)).toBe(0);
    expect(spendCoins(amount)).toBe(false);
    expect(coins.value).toBe(100);
    expect(loadVillage().coins).toBe(100);
  });

  it('rejeita valores não finitos também com a Vila aberta, sem pedir salvamento', () => {
    const live = loadVillage();
    const save = vi.fn();
    attachLiveVillage(live, save);
    try {
      for (const amount of [NaN, Infinity, -Infinity]) {
        expect(addCoins(amount)).toBe(0);
        expect(spendCoins(amount)).toBe(false);
      }
      expect(live.coins).toBe(100);
      expect(save).not.toHaveBeenCalled();
    } finally {
      detachLiveVillage(live);
    }
  });

  it('não confirma recompensa nem compra quando o aparelho recusa o salvamento', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Sem espaço', 'QuotaExceededError');
    });
    try {
      expect(addCoins(50)).toBe(0);
      expect(spendCoins(50)).toBe(false);
      expect(coins.value).toBe(100);
      expect(loadVillage().coins).toBe(100);
    } finally {
      spy.mockRestore();
    }
  });

  it('não aceita gasto negativo', () => {
    expect(spendCoins(-10)).toBe(false);
    expect(loadVillage().coins).toBe(100);
  });

  it('Zapdos: logo depois do encontro as moedas rendem 25% a mais; 3 horas depois, normal', () => {
    const v = loadVillage();
    v.legendary = { ...v.legendary, history: [{ id: 'zapdos', at: new Date(Date.now() - 60_000).toISOString() }] };
    saveVillage(v);
    expect(addCoins(100)).toBe(125);
    const later = loadVillage();
    later.legendary = { ...later.legendary, history: [{ id: 'zapdos', at: new Date(Date.now() - 4 * 3_600_000).toISOString() }] };
    saveVillage(later);
    expect(addCoins(100)).toBe(100);
  });
});
