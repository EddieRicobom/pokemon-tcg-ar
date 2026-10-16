import { beforeEach, describe, expect, it } from 'vitest';
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
});
