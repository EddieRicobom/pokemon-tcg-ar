import { describe, expect, it } from 'vitest';
import { add, emptyVillage, normalizeVillage } from './life';
import { advanceCommunity, communityForecast, COMMUNITY_RULES } from './community';

const fresh = () => emptyVillage(9, { x: 10, y: 10 });

describe('economia diária da comunidade', () => {
  it('estima a população ativa por ID, sem contar duplicatas nem acervo fora da Vila', () => {
    const state = fresh();
    const estimate = communityForecast(state, ['carta:1', 'digital:1', 'carta:1']);
    expect(estimate).toMatchObject({ residents: 2, foodTarget: 3, maintenanceDue: 18, foodAvailable: 0, mealsAtCurrentStock: 0, maintenanceFunded: true });
    expect(communityForecast(state, []).maintenanceDue).toBe(0);
  });

  it('liquida alimentação e manutenção uma vez por ciclo, sem deixar saldo ou estoque negativos', () => {
    const state = fresh();
    state.community.lastCycleDay = '2026-10-18';
    state.coins = 100;
    add(state, 'oran', 1);
    add(state, 'salada', 1);
    const first = advanceCommunity(state, '2026-10-19', ['pikachu']);
    expect(first.cycles).toHaveLength(1);
    expect(first.cycles[0]).toMatchObject({ foodTarget: 2, foodServed: 3, consumed: [{ item: 'oran', qty: 1 }, { item: 'salada', qty: 1 }], maintenanceDue: 14, maintenancePaid: 14, foodShortage: 0 });
    expect(state.inventory).toEqual({});
    expect(state.coins).toBe(86);
    expect(advanceCommunity(state, '2026-10-19', ['pikachu']).cycles).toEqual([]);
    expect(state.coins).toBe(86);
  });

  it('prioriza a comida favorita conhecida dos moradores no ciclo diário', () => {
    const state = fresh();
    state.community.lastCycleDay = '2026-10-18';
    state.coins = 100;
    add(state, 'suco-oran', 1);
    add(state, 'oran', 1);

    const result = advanceCommunity(state, '2026-10-19', [
      { id: 'pikachu', favoriteFood: 'suco-oran' },
      { id: 'bulbasaur', favoriteFood: 'oran' },
    ]).cycles[0]!;

    expect(result).toMatchObject({
      foodTarget: 3,
      foodServed: 3,
      preferredServings: 3,
      consumed: [{ item: 'oran', qty: 1 }, { item: 'suco-oran', qty: 1 }],
      foodShortage: 0,
    });
  });

  it('escala até 50 residentes e não cobra população zero', () => {
    const state = fresh();
    state.community.lastCycleDay = '2026-10-18';
    state.coins = 300;
    const residents = Array.from({ length: 50 }, (_, i) => `mon-${i}`);
    residents.push('mon-0');
    const result = advanceCommunity(state, '2026-10-19', residents).cycles[0]!;
    expect(result.residents).toBe(50);
    expect(result.foodTarget).toBe(Math.ceil(50 * COMMUNITY_RULES.mealsPerResident));
    expect(result.maintenanceDue).toBe(210);
    expect(result.maintenancePaid).toBe(210);
    const zero = fresh();
    zero.community.lastCycleDay = '2026-10-18';
    zero.coins = 37;
    expect(advanceCommunity(zero, '2026-10-19', []).cycles[0]).toMatchObject({ residents: 0, foodTarget: 0, maintenanceDue: 0, maintenancePaid: 0 });
    expect(zero.coins).toBe(37);
  });

  it('limita ausência longa a sete liquidações e não repete ciclos ao voltar no relógio', () => {
    const state = fresh();
    state.community.lastCycleDay = '2026-10-01';
    state.coins = 999999;
    const result = advanceCommunity(state, '2026-10-31', ['pikachu']);
    expect(result.cycles).toHaveLength(7);
    expect(result.skippedDays).toBe(23);
    expect(state.community.history.at(-1)?.day).toBe('2026-10-08');
    expect(state.community.lastCycleDay).toBe('2026-10-31');
    expect(advanceCommunity(state, '2026-10-03', ['pikachu']).cycles).toEqual([]);
  });

  it('sobe a crise em etapas, reduz só confiança comunitária e recupera com comida', () => {
    const state = fresh();
    state.community.lastCycleDay = '2026-10-01';
    state.coins = 999;
    let result = advanceCommunity(state, '2026-10-08', ['pikachu']);
    expect(result.cycles.at(-1)).toMatchObject({ shortageDays: 7, welfare: 53, notice: expect.stringContaining('crise alimentar') });
    expect(state.friends).toEqual({});
    add(state, 'oran', 20);
    state.coins = 100;
    result = advanceCommunity(state, '2026-10-09', ['pikachu']);
    expect(result.cycles[0]).toMatchObject({ shortageDays: 0, foodShortage: 0, notice: expect.stringContaining('recuperada') });
    expect(state.community.welfare).toBeGreaterThan(54);
    expect(state.community.trust).toBeGreaterThan(0);
  });

  it('migra save antigo sem cobrar retroativamente e preserva amizade, inventário e moedas', () => {
    const state = fresh();
    state.friends.pikachu = { points: 41, lastTalk: '', lastGift: '', request: null };
    state.inventory.oran = 3;
    const raw = { ...state } as Record<string, unknown>;
    delete raw.community;
    const migrated = normalizeVillage(raw, 9, { x: 10, y: 10 });
    const first = advanceCommunity(migrated, '2026-10-19', ['pikachu']);
    expect(first).toMatchObject({ cycles: [], initialized: true });
    expect(migrated.community.lastCycleDay).toBe('2026-10-19');
    expect(migrated.inventory.oran).toBe(3);
    expect(migrated.friends.pikachu?.points).toBe(41);
    expect(migrated.coins).toBe(state.coins);
  });
});
