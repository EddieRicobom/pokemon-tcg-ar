import { describe, expect, it } from 'vitest';
import { POKEMON_TYPES } from './pokemon-data';
import { CATEGORY_BASE, moveForTypes, MOVE_CATEGORY_LABELS_PT, MOVE_EFFECT_LABELS_PT } from './survivor-moves';

describe('golpes da Torre por tipo', () => {
  it('todo tipo tem um golpe com nome, categoria, efeito, cor e ícone', () => {
    for (const type of POKEMON_TYPES) {
      const move = moveForTypes([type]);
      expect(move.type).toBe(type);
      expect(move.name.length).toBeGreaterThan(2);
      expect(MOVE_CATEGORY_LABELS_PT[move.category]).toBeTruthy();
      expect(MOVE_EFFECT_LABELS_PT[move.effect]).toBeTruthy();
      expect(move.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(move.icon).toBeTruthy();
    }
  });

  it('as três categorias aparecem e cada uma tem números base próprios', () => {
    const categories = new Set(POKEMON_TYPES.map((t) => moveForTypes([t]).category));
    expect([...categories].sort()).toEqual(['area', 'aura', 'projetil']);
    expect(CATEGORY_BASE.aura.radius).toBeGreaterThan(0);
    expect(CATEGORY_BASE.area.radius).toBeGreaterThan(0);
    expect(CATEGORY_BASE.projetil.range).toBeGreaterThan(0);
  });

  it('só o 1º tipo conta, e sem tipo o golpe é o do tipo Normal', () => {
    expect(moveForTypes(['fire', 'flying']).name).toBe('Bola de fogo');
    expect(moveForTypes(['electric']).effect).toBe('saltar');
    expect(moveForTypes([]).type).toBe('normal');
  });
});
