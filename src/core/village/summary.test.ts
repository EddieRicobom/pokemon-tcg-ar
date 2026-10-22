import { describe, expect, it } from 'vitest';
import { emptyVillage } from './life';
import { villageSummary } from './summary';
import { recentGossip } from './social';
import type { Moment } from './social-state';

function moment(t: number, result: string[]): Moment {
  return { id: `m-${t}`, t, day: '2026-10-17', hour: 14, tpl: 'teste', kind: 'amizade', title: 'Piquenique', emoji: '🍎', cast: [{ id: 'a', name: 'Pikachu' }, { id: 'b', name: 'Eevee' }], lines: [{ who: 0, text: 'Oi' }], result };
}

describe('villageSummary', () => {
  it('resume momentos reais, consequências e pedidos pendentes', () => {
    const state = emptyVillage(1, { x: 1, y: 1 });
    state.diary = [moment(10, ['+5 amizade (Pikachu e Eevee)'])];
    state.requests = { day: '2026-10-17', story: [], items: [{ id: 'r', day: '2026-10-17', kind: 'talk', title: 'Conversa', detail: 'Fale com Pikachu', location: 'Praça', targetId: 'a', targetName: 'Pikachu', rewardCoins: 10, rewardItem: 'flor', rewardQty: 1, rewardFriend: 3, done: false }] };
    const summary = villageSummary(state, [{ id: 'a', name: 'Pikachu' }, { id: 'b', name: 'Eevee' }], 20);
    expect(summary.happened[0]?.text).toContain('Piquenique');
    expect(summary.happened[0]?.momentId).toBe('m-10');
    expect(summary.changed[0]?.text).toContain('+5 amizade');
    expect(summary.changed[0]?.pokemonId).toBe('a');
    expect(summary.possible[0]?.text).toContain('Fale com Pikachu');
    expect(summary.possible[0]?.requestId).toBe('r');
  });
  it('não inventa pistas quando não há fatos disponíveis', () => {
    const summary = villageSummary(emptyVillage(1, { x: 1, y: 1 }), [], 20);
    expect(summary.happened).toEqual([]);
    expect(summary.changed[0]?.text).toContain('Ainda não');
    expect(summary.possible[0]?.text).toContain('Nenhum pedido');
  });
  it('faz uma memória persistente influenciar a fala do Pokémon', () => {
    const state = emptyVillage(1, { x: 1, y: 1 });
    state.memories.push({ id: 'm:a', mon: 'a', with: ['b'], kind: 'amizade', text: 'Piquenique: +5 amizade', day: '2026-10-17', t: 10, momentId: 'm' });
    const gossip = recentGossip(state, 'a', 20);
    expect(gossip).toContain('Piquenique: +5 amizade');
    expect(gossip).not.toBe('Ainda lembro: Piquenique: +5 amizade');
  });

  it('mostra compromissos sociais válidos e omite os vencidos', () => {
    const state = emptyVillage(1, { x: 1, y: 1 });
    state.plans = [
      { id: 'p-vivo', from: 'a', to: 'b', kind: 'visitar', createdDay: '2026-10-17', expiresDay: '2026-10-20', sourceMomentId: 'm-10' },
      { id: 'p-velho', from: 'b', to: 'a', kind: 'ajudar', createdDay: '2026-10-10', expiresDay: '2026-10-12', sourceMomentId: 'm-9' },
    ];
    const summary = villageSummary(state, [{ id: 'a', name: 'Pikachu' }, { id: 'b', name: 'Eevee' }], Date.parse('2026-10-18T12:00:00Z'));
    expect(summary.possible[0]).toMatchObject({ planId: 'p-vivo', pokemonId: 'a' });
    expect(summary.possible[0]?.text).toContain('Pikachu vai visitar Eevee');
    expect(summary.possible.some((entry) => entry.planId === 'p-velho')).toBe(false);
  });
});

