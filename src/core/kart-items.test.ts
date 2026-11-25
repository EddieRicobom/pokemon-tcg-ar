import { describe, expect, it } from 'vitest';
import { KART_ITEM_IDS, KART_ITEMS, kartItemAttacks, kartItemOdds, kartItemTierOdds, rollKartItem } from './kart-items';
import type { KartItemId } from './kart-items';

describe('itens do Kart', () => {
  it('as probabilidades somam 1 e nunca ficam negativas', () => {
    for (const total of [1, 2, 4, 6]) {
      for (let position = 1; position <= total; position++) {
        const odds = kartItemOdds(position, total);
        const sum = Object.values(odds).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1, 10);
        for (const value of Object.values(odds)) expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('quem está atrás tem mais chance de item épico do que o líder', () => {
    const first = kartItemTierOdds(1, 4);
    const last = kartItemTierOdds(4, 4);
    expect(last[3]).toBeGreaterThan(first[3] * 3);
    expect(last[2]).toBeGreaterThan(first[2]);
    expect(first[1]).toBeGreaterThan(last[1]);
    expect(first[3]).toBeLessThan(0.1);
    expect(last[3]).toBeGreaterThan(0.15);
  });

  it('a chance de concha, raio e cometa cresce de forma monotônica do líder ao último', () => {
    const top = (position: number): number => {
      const odds = kartItemOdds(position, 5);
      return odds.shell + odds.bolt + odds.comet;
    };
    for (let position = 2; position <= 5; position++) expect(top(position)).toBeGreaterThan(top(position - 1));
  });

  it('sorteia sempre um item do catálogo, inclusive nos extremos do rng', () => {
    for (const rng of [0, 0.0001, 0.5, 0.9999, 0.999999]) {
      expect(KART_ITEM_IDS).toContain(rollKartItem(() => rng, 3, 4));
    }
    expect(KART_ITEM_IDS).toContain(rollKartItem(() => 0, 1, 4));
    expect(KART_ITEM_IDS).toContain(rollKartItem(() => 0.999999, 4, 4));
  });

  it('com muitas amostras, o último recebe mais itens épicos do que o líder', () => {
    let seed = 123456789;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const count = (position: number, tier: 1 | 2 | 3, runs: number): number => {
      let hits = 0;
      for (let i = 0; i < runs; i++) {
        const item: KartItemId = rollKartItem(random, position, 4);
        if (KART_ITEMS[item].tier === tier) hits++;
      }
      return hits;
    };
    expect(count(4, 3, 4000)).toBeGreaterThan(count(1, 3, 4000) * 2);
    expect(count(1, 1, 4000)).toBeGreaterThan(count(4, 1, 4000));
  });

  it('marca como ataque os itens que acertam outros karts', () => {
    expect(kartItemAttacks('shell')).toBe(true);
    expect(kartItemAttacks('bolt')).toBe(true);
    expect(kartItemAttacks('banana')).toBe(true);
    expect(kartItemAttacks('oil')).toBe(true);
    expect(kartItemAttacks('turbo')).toBe(false);
    expect(kartItemAttacks('shield')).toBe(false);
    expect(kartItemAttacks('comet')).toBe(false);
  });

  it('o catálogo não tem id duplicado e todo item tem nome, ícone e descrição', () => {
    expect(new Set(KART_ITEM_IDS).size).toBe(KART_ITEM_IDS.length);
    for (const id of KART_ITEM_IDS) {
      expect(KART_ITEMS[id].id).toBe(id);
      expect(KART_ITEMS[id].name.length).toBeGreaterThan(0);
      expect(KART_ITEMS[id].icon.length).toBeGreaterThan(0);
      expect(KART_ITEMS[id].description.length).toBeGreaterThan(20);
    }
  });
});
