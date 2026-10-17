import { describe, expect, it } from 'vitest';
import { emptyVillage } from './life';
import { villageSummary } from './summary';
import type { Moment } from './social-state';

function moment(t: number, result: string[]): Moment {
  return { id: `m-${t}`, t, day: '2026-10-17', hour: 14, tpl: 'teste', kind: 'amizade', title: 'Piquenique', emoji: '🍎', cast: [{ id: 'a', name: 'Pikachu' }, { id: 'b', name: 'Eevee' }], lines: [{ who: 0, text: 'Oi' }], result };
}

describe('villageSummary', () => {
  it('resume momentos reais, consequências e pedidos pendentes', () => {
    const state = emptyVillage(1, { x: 1, y: 1 });
    state.diary = [moment(10, ['+5 amizade (Pikachu e Eevee)'])];
    state.requests = { day: '2026-10-17', items: [{ id: 'r', day: '2026-10-17', kind: 'talk', title: 'Conversa', detail: 'Fale com Pikachu', location: 'Praça', targetId: 'a', targetName: 'Pikachu', rewardCoins: 10, rewardItem: 'flor', rewardQty: 1, rewardFriend: 3, done: false }] };
    const summary = villageSummary(state, [{ id: 'a', name: 'Pikachu' }, { id: 'b', name: 'Eevee' }], 20);
    expect(summary.happened[0]).toContain('Piquenique');
    expect(summary.changed[0]).toContain('+5 amizade');
    expect(summary.possible[0]).toContain('Fale com Pikachu');
  });
  it('não inventa pistas quando não há fatos disponíveis', () => {
    const summary = villageSummary(emptyVillage(1, { x: 1, y: 1 }), [], 20);
    expect(summary.happened).toEqual([]);
    expect(summary.changed[0]).toContain('Ainda não');
    expect(summary.possible[0]).toContain('Nenhum pedido');
  });
});
