import { describe, expect, it } from 'vitest';
import {
  BACKPACK_CAPACITY,
  clampOrbit,
  describeItem,
  homeSlot,
  ORBIT_LIMITS,
  planBackpack,
  qtyBadge,
  type BackpackItem,
} from './backpack-layout';

const item = (n: number, qty = 1): BackpackItem => ({ id: `item-${n}`, name: `Item ${n}`, qty });

describe('planBackpack', () => {
  it('mostra tudo quando cabe, na ordem do inventário', () => {
    const plan = planBackpack([item(1), item(2), item(3)]);
    expect(plan.shown.map((i) => i.id)).toEqual(['item-1', 'item-2', 'item-3']);
    expect(plan.hidden).toBe(0);
  });

  it('conta os tipos que não cabem em vez de sumir com eles em silêncio', () => {
    const many = Array.from({ length: BACKPACK_CAPACITY + 5 }, (_, n) => item(n));
    const plan = planBackpack(many);
    expect(plan.shown).toHaveLength(BACKPACK_CAPACITY);
    expect(plan.hidden).toBe(5);
  });

  it('ignora itens sem quantidade', () => {
    const plan = planBackpack([item(1, 0), item(2, 3)]);
    expect(plan.shown.map((i) => i.id)).toEqual(['item-2']);
    expect(plan.hidden).toBe(0);
  });
});

describe('homeSlot', () => {
  it('dá uma posição diferente para cada item da capacidade', () => {
    const keys = new Set(Array.from({ length: BACKPACK_CAPACITY }, (_, n) => {
      const s = homeSlot(n);
      return `${s.x.toFixed(3)}|${s.y.toFixed(3)}|${s.z.toFixed(3)}`;
    }));
    expect(keys.size).toBe(BACKPACK_CAPACITY);
  });

  it('mantém todos dentro do compartimento (x ±0,78; y 1,52–2,92; z 0,06–0,34)', () => {
    for (let n = 0; n < BACKPACK_CAPACITY; n++) {
      const s = homeSlot(n);
      expect(Math.abs(s.x)).toBeLessThanOrEqual(0.78);
      expect(s.y).toBeGreaterThanOrEqual(1.52 - 0.03);
      expect(s.y).toBeLessThanOrEqual(2.92);
      expect(s.z).toBeGreaterThanOrEqual(0.06);
      expect(s.z).toBeLessThanOrEqual(0.34);
    }
  });
});

describe('qtyBadge', () => {
  it('não marca item único', () => {
    expect(qtyBadge(1)).toBeNull();
    expect(qtyBadge(0)).toBeNull();
    expect(qtyBadge(Number.NaN)).toBeNull();
  });

  it('mostra a quantidade e limita em 99+', () => {
    expect(qtyBadge(2)).toBe('×2');
    expect(qtyBadge(99)).toBe('×99');
    expect(qtyBadge(100)).toBe('99+');
    expect(qtyBadge(7.9)).toBe('×7');
  });
});

describe('describeItem', () => {
  it('junta nome e quantidade', () => {
    expect(describeItem({ id: 'potion', name: 'Poção', qty: 3 })).toBe('Poção × 3');
  });
});

describe('clampOrbit', () => {
  it('não passa dos limites da câmera', () => {
    expect(clampOrbit(9, 9)).toEqual({ yaw: ORBIT_LIMITS.yaw, pitch: ORBIT_LIMITS.pitchMax });
    expect(clampOrbit(-9, -9)).toEqual({ yaw: -ORBIT_LIMITS.yaw, pitch: ORBIT_LIMITS.pitchMin });
  });

  it('deixa passar valores dentro da faixa', () => {
    expect(clampOrbit(0.3, 0.1)).toEqual({ yaw: 0.3, pitch: 0.1 });
  });
});
