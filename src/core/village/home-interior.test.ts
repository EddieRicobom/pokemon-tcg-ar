import { describe, expect, it } from 'vitest';
import { add, emptyVillage } from './life';
import { homePickUp, homePlace, normalizeHomeInterior } from './home-interior';

describe('interior da casa', () => {
  it('guarda a decoração separada do quintal e devolve o móvel ao recolher', () => {
    const state = emptyVillage(7, { x: 1, y: 1 });
    state.house = 1;
    add(state, 'cadeira');
    expect(homePlace(state, 'cadeira', 2, 3).ok).toBe(true);
    expect(state.inventory.cadeira).toBe(0);
    expect(state.homeInterior.placed).toEqual([{ x: 2, y: 3, item: 'cadeira' }]);
    expect(homePickUp(state, 2, 3).ok).toBe(true);
    expect(state.inventory.cadeira).toBe(1);
  });

  it('limpa posições repetidas, fora da sala e itens inexistentes ao abrir um save', () => {
    expect(normalizeHomeInterior({ wallpaper: 'noite', floor: 'xadrez', placed: [
      { x: 1, y: 1, item: 'cadeira' }, { x: 1, y: 1, item: 'mesa' }, { x: 9, y: 1, item: 'mesa' }, { x: 2, y: 2, item: 'nada' },
    ] })).toEqual({ wallpaper: 'noite', floor: 'xadrez', placed: [{ x: 1, y: 1, item: 'cadeira' }] });
  });
});
