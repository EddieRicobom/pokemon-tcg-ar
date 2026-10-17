import { describe, expect, it } from 'vitest';
import {
  addBox, BOX_SIZE, emptyLayout, findCard, MAX_BOXES, moveSlot, reconcileLayout, removeEmptyBox, renameBox, sortBox,
} from './box-layout';

const ids = (n: number, prefix = 'c') => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

describe('Box: organização das cartas em caixas 6 × 5', () => {
  it('sem nada salvo, as cartas enchem a primeira caixa em ordem e criam caixas novas quando precisa', () => {
    const layout = reconcileLayout(null, ids(35));
    expect(layout.boxes).toHaveLength(2);
    expect(layout.boxes[0]!.slots).toHaveLength(BOX_SIZE);
    expect(layout.boxes[0]!.slots[0]).toBe('c1');
    expect(layout.boxes[0]!.slots[29]).toBe('c30');
    expect(layout.boxes[1]!.slots.slice(0, 5)).toEqual(['c31', 'c32', 'c33', 'c34', 'c35']);
    expect(layout.boxes[1]!.name).toBe('Caixa 2');
  });

  it('respeita onde o jogador pôs cada carta; carta nova vai pro primeiro espaço livre', () => {
    const saved = { v: 1, boxes: [{ name: 'Fogo', slots: [null, null, 'c2', ...Array(27).fill(null)] }] };
    const layout = reconcileLayout(saved, ['c1', 'c2']);
    expect(layout.boxes[0]!.name).toBe('Fogo');
    expect(layout.boxes[0]!.slots[2]).toBe('c2');
    expect(layout.boxes[0]!.slots[0]).toBe('c1');
  });

  it('carta que saiu do aparelho some do espaço; id repetido fica só na primeira posição', () => {
    const saved = { v: 1, boxes: [{ name: 'A', slots: ['c1', 'velha', 'c1', ...Array(27).fill(null)] }] };
    const layout = reconcileLayout(saved, ['c1']);
    expect(layout.boxes[0]!.slots.slice(0, 3)).toEqual(['c1', null, null]);
  });

  it('dado salvo estranho não quebra nem perde carta', () => {
    for (const raw of [undefined, 'x', { boxes: 'nada' }, { boxes: [null, { name: 5, slots: 'x' }] }]) {
      const layout = reconcileLayout(raw, ids(3));
      expect(layout.boxes.flatMap((b) => b.slots).filter(Boolean)).toEqual(['c1', 'c2', 'c3']);
    }
  });

  it('mover para um espaço vazio move; para um ocupado, troca os dois de lugar (inclusive entre caixas)', () => {
    let layout = reconcileLayout(null, ids(31));
    layout = moveSlot(layout, { box: 0, slot: 0 }, { box: 1, slot: 10 });
    expect(findCard(layout, 'c1')).toEqual({ box: 1, slot: 10 });
    expect(layout.boxes[0]!.slots[0]).toBeNull();
    layout = moveSlot(layout, { box: 0, slot: 1 }, { box: 1, slot: 0 });
    expect(findCard(layout, 'c2')).toEqual({ box: 1, slot: 0 });
    expect(findCard(layout, 'c31')).toEqual({ box: 0, slot: 1 });
  });

  it('mover não muda o original (estado novo) e ignora posições fora da grade', () => {
    const layout = reconcileLayout(null, ids(2));
    const moved = moveSlot(layout, { box: 0, slot: 0 }, { box: 0, slot: 5 });
    expect(layout.boxes[0]!.slots[0]).toBe('c1');
    expect(moved.boxes[0]!.slots[5]).toBe('c1');
    expect(moveSlot(layout, { box: 0, slot: 0 }, { box: 9, slot: 0 })).toBe(layout);
  });

  it('caixas: nome (com limite), criar, e só apaga caixa vazia', () => {
    let layout = emptyLayout();
    layout = renameBox(layout, 0, '  Lendários e míticos do Arceus  ');
    expect(layout.boxes[0]!.name).toBe('Lendários e míticos do A');
    expect(renameBox(layout, 0, '   ').boxes[0]!.name).toBe('Caixa 1');
    layout = addBox(layout);
    expect(layout.boxes).toHaveLength(2);
    expect(removeEmptyBox(layout, 1).boxes).toHaveLength(1);
    const withCard = reconcileLayout(layout, ['c1']);
    expect(removeEmptyBox(withCard, 0)).toBe(withCard); // tem carta: não apaga
    let full = emptyLayout();
    for (let i = 0; i < MAX_BOXES + 3; i++) full = addBox(full);
    expect(full.boxes).toHaveLength(MAX_BOXES);
  });

  it('arrumar uma caixa pela Pokédex ou pelo nome não mexe nas outras', () => {
    const info: Record<string, { name: string; dex?: number }> = {
      c1: { name: 'Pikachu', dex: 25 }, c2: { name: 'Bulbasaur', dex: 1 }, c3: { name: 'Treinador' },
    };
    let layout = reconcileLayout(null, ['c1', 'c2', 'c3']);
    layout = addBox(layout);
    layout = moveSlot(layout, { box: 0, slot: 2 }, { box: 1, slot: 4 });
    const byDex = sortBox(layout, 0, 'pokedex', (id) => info[id]!);
    expect(byDex.boxes[0]!.slots.slice(0, 3)).toEqual(['c2', 'c1', null]);
    expect(byDex.boxes[1]!.slots[4]).toBe('c3');
    const byName = sortBox(reconcileLayout(null, ['c1', 'c2', 'c3']), 0, 'nome', (id) => info[id]!);
    expect(byName.boxes[0]!.slots.slice(0, 3)).toEqual(['c2', 'c1', 'c3']);
  });
});
