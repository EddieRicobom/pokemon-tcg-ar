import { describe, expect, it } from 'vitest';
import { add, emptyVillage, normalizeVillage } from './life';
import { ensureModeStories } from './mode-stories';
import { claimRequest, ensureRequests } from './requests';

const fresh = () => emptyVillage(20261019, { x: 45, y: 41 });

describe('histórias opcionais abertas por outros modos', () => {
  it('não inventa credenciais ou troféus sem uma conquista registrada', () => {
    const state = fresh();
    expect(ensureModeStories(state, {})).toBe(false);
    expect(state.requests.story).toEqual([]);
  });

  it('abre uma história da Arena uma vez e mantém o pedido após virar o dia e salvar', () => {
    const state = fresh();
    expect(ensureModeStories(state, { 'liga-insignia': '2026-10-19' })).toBe(true);
    expect(state.requests.story[0]).toMatchObject({
      id: 'modo:liga-insignia', persistent: true, done: false, item: 'madeira', qty: 2,
      title: 'Expor a credencial da Arena', location: 'Museu da Vila',
    });
    expect(ensureModeStories(state, { 'liga-insignia': '2026-10-19' })).toBe(false);
    state.requests.day = '2026-10-19';
    ensureRequests(state, '2026-10-20', []);
    const restored = normalizeVillage(JSON.parse(JSON.stringify(state)), state.seed, state.player);
    expect(restored.requests.story).toHaveLength(1);
    expect(restored.requests.story[0]?.id).toBe('modo:liga-insignia');
  });

  it('a partida perfeita dos Pins abre a história correspondente e só conclui com os materiais reais', () => {
    const state = fresh();
    ensureModeStories(state, { 'pins-perfeito': '2026-10-19' });
    expect(state.requests.story[0]).toMatchObject({ id: 'modo:pins-perfeito', item: 'concha', qty: 2 });
    expect(claimRequest(state, 'modo:pins-perfeito', '2026-10-19').ok).toBe(false);
    add(state, 'concha', 2);
    const result = claimRequest(state, 'modo:pins-perfeito', '2026-10-19');
    expect(result.ok).toBe(true);
    expect(state.requests.story[0]).toMatchObject({ done: true, rewardItem: 'pecha', rewardQty: 2 });
    expect(ensureModeStories(state, { 'pins-perfeito': '2026-10-19' })).toBe(false);
  });

  it('o troféu só abre a história da Torre após o chefão final e ela exige ferro de verdade', () => {
    const state = fresh();
    expect(ensureModeStories(state, { 'torre-treinador': '2026-10-19' })).toBe(false);
    expect(state.requests.story).toEqual([]);

    expect(ensureModeStories(state, { 'torre-chefao': '2026-10-19' })).toBe(true);
    expect(state.requests.story[0]).toMatchObject({
      id: 'modo:torre-chefao', title: 'Preparar a placa do Troféu da Torre', item: 'ferro', qty: 2,
      location: 'Museu da Vila', persistent: true, done: false,
    });
    expect(claimRequest(state, 'modo:torre-chefao', '2026-10-19').ok).toBe(false);
    add(state, 'ferro', 2);
    expect(claimRequest(state, 'modo:torre-chefao', '2026-10-19')).toMatchObject({ ok: true, coins: 50 });
    expect(ensureModeStories(state, { 'torre-chefao': '2026-10-19' })).toBe(false);
  });
});
