import { describe, expect, it } from 'vitest';
import { ITEMS, ITEM_BY_ID } from './village/catalog';
import { describeLunch, LUNCH_DURATION_MS, LUNCH_INGREDIENT_FAMILY, lunchEffectFor, lunchFamiliesOf, lunchTierOf } from './survivor-lunch';

const FOODS = ITEMS.filter((item) => item.kind === 'food');

function leafIngredients(id: string): string[] {
  const recipe = ITEM_BY_ID.get(id)?.recipe ?? {};
  return Object.keys(recipe).flatMap((key) => (ITEM_BY_ID.get(key)?.kind === 'food' ? leafIngredients(key) : [key]));
}

describe('marmita da Torre', () => {
  it('todo ingrediente de toda comida tem família, então toda comida vira uma marmita', () => {
    expect(FOODS.length).toBeGreaterThan(50);
    for (const food of FOODS) {
      for (const ingredient of leafIngredients(food.id)) expect(LUNCH_INGREDIENT_FAMILY[ingredient], `${food.id}: ${ingredient}`).toBeDefined();
      const effect = lunchEffectFor(food.id);
      expect(effect, food.id).not.toBeNull();
      expect(describeLunch(effect!).length, food.id).toBeGreaterThan(0);
    }
  });

  it('a complexidade da receita decide o nível e a duração', () => {
    expect(lunchTierOf('peixe-grelhado')).toBe(1);
    expect(lunchTierOf('pao-mel')).toBe(2);
    expect(lunchTierOf('curry')).toBe(3);
    // Receita que leva outro prato conta como complexa.
    expect(lunchTierOf('lanche-pokebola')).toBe(3);
    expect(lunchEffectFor('pipoca')!.durationMs).toBe(LUNCH_DURATION_MS[1]);
    expect(lunchEffectFor('lanche-pokebola')!.durationMs).toBe(LUNCH_DURATION_MS[3]);
  });

  it('a família vem do ingrediente e pratos de várias famílias aplicam 60% de cada efeito', () => {
    expect(lunchFamiliesOf('peixe-grelhado')).toEqual(['peixe']);
    expect(lunchFamiliesOf('pao-mel')).toEqual(['doce', 'grao']);
    const single = lunchEffectFor('melancia-gelada')!;
    expect(single.speedBonus).toBeCloseTo(0.02);
    const mixed = lunchEffectFor('pao-mel')!; // Doce + Grão, nível 2
    expect(mixed.regenPerSec).toBeCloseTo(0.3 * 0.6);
    expect(mixed.pickupBonus).toBeCloseTo(0.08 * 0.6);
    expect(mixed.defense).toBe(0);
  });

  it('o prato mais forte de uma família nunca passa da tabela', () => {
    for (const food of FOODS) {
      const effect = lunchEffectFor(food.id)!;
      expect(effect.regenPerSec).toBeLessThanOrEqual(0.4);
      expect(effect.xpBonus).toBeLessThanOrEqual(0.2);
      expect(effect.hitInvulnBonus).toBeLessThanOrEqual(0.25);
      expect(effect.defense).toBeLessThanOrEqual(10);
      expect(effect.pickupBonus).toBeLessThanOrEqual(0.1);
      expect(effect.speedBonus).toBeLessThanOrEqual(0.04);
    }
  });

  it('item que não é comida não vira marmita', () => {
    expect(lunchEffectFor('madeira')).toBeNull();
    expect(lunchEffectFor('nao-existe')).toBeNull();
  });
});
