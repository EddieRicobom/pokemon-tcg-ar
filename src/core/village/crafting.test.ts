import { describe, expect, it } from 'vitest';
import { craftMany, craftMissing, maxCraftable, recipeLines } from './crafting';
import { count, emptyVillage } from './life';
import type { VillageState } from './life';

const village = (inventory: Record<string, number>): VillageState => {
  const s = emptyVillage(1, { x: 1, y: 1 });
  s.inventory = { ...inventory };
  return s;
};

describe('fabricar na Vila', () => {
  it('cada ingrediente diz quanto tem e quanto precisa', () => {
    const s = village({ madeira: 1, tecido: 5 });
    const lines = recipeLines(s, 'guarda-roupa');
    expect(lines).toEqual([
      expect.objectContaining({ item: 'tabua', need: 4, have: 0, ok: false, makeable: false }),
      expect.objectContaining({ item: 'tecido', need: 2, have: 5, ok: true }),
    ]);
  });

  it('conta quantas vezes dá para fazer e faz várias de uma vez', () => {
    const s = village({ madeira: 7 });
    expect(maxCraftable(s, 'tabua')).toBe(3);
    const result = craftMany(s, 'tabua', 5);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('3×');
    expect(count(s, 'tabua')).toBe(3);
    expect(count(s, 'madeira')).toBe(1);
  });

  it('sem material, não faz nada e diz o que falta', () => {
    const s = village({});
    expect(maxCraftable(s, 'tabua')).toBe(0);
    expect(craftMany(s, 'tabua', 3).ok).toBe(false);
  });

  it('faz antes o material que falta, se der', () => {
    const s = village({ madeira: 8, tecido: 2 });
    expect(recipeLines(s, 'guarda-roupa')[0]).toMatchObject({ item: 'tabua', makeable: true });
    const result = craftMissing(s, 'guarda-roupa');
    expect(result.ok).toBe(true);
    expect(count(s, 'tabua')).toBe(4);
    expect(count(s, 'madeira')).toBe(0);
    expect(maxCraftable(s, 'guarda-roupa')).toBe(1);
  });

  it('não gasta nada quando o que falta não dá para fazer', () => {
    const s = village({ madeira: 3, tecido: 2 });
    const result = craftMissing(s, 'guarda-roupa');
    expect(result.ok).toBe(false);
    expect(count(s, 'madeira')).toBe(3);
    expect(count(s, 'tabua')).toBe(0);
  });

  it('comida não aparece aqui: é da cozinha', () => {
    const s = village({});
    expect(recipeLines(s, 'pao-mel')).toEqual([]);
    expect(maxCraftable(s, 'pao-mel')).toBe(0);
  });
});
