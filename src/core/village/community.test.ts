import { describe, expect, it } from 'vitest';
import { add, cook, emptyVillage, giveGift, normalizeVillage, sell } from './life';
import { advanceCommunity, communityForecast, COMMUNITY_RULES, decideCommunityProject, normalizeCommunity, socialOpportunityFromMemories } from './community';
import { scoreActivity } from './vocations';

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

  it('morador com afinidade pela horta rega um cultivo real e a chuva segue o relógio do ciclo', () => {
    const state = fresh();
    state.community.lastCycleDay = '2026-10-18';
    state.coins = 100;
    state.crops.push({ x: 80, y: 49, seed: 'sem-tomate', stage: 0, wateredAt: null });

    const result = advanceCommunity(state, '2026-10-19', [{ id: 'bulbasaur', types: ['grass'] }]).cycles[0]!;

    expect(state.crops[0]?.wateredAt).toBe(Date.parse('2026-10-19T12:00:00'));
    expect(result.activities).toMatchObject([{ residentId: 'bulbasaur', activity: 'agricultura', icon: '🌱', x: 80, y: 49, result: expect.stringContaining('Regou') }]);
    expect(state.community.residents.bulbasaur?.energy).toBe(COMMUNITY_RULES.initialEnergy - COMMUNITY_RULES.taskEnergyCost);
  });

  it('colhe apenas cultivos maduros uma vez e registra produção verificável', () => {
    const state = fresh();
    state.community.lastCycleDay = '2026-10-18';
    state.coins = 100;
    state.crops.push({ x: 81, y: 49, seed: 'sem-tomate', stage: 3, wateredAt: null });

    const cycle = advanceCommunity(state, '2026-10-19', [{ id: 'bulbasaur', types: ['grass'] }]).cycles[0]!;
    const activity = cycle.activities[0]!;

    expect(state.crops).toEqual([]);
    expect(activity).toMatchObject({ activity: 'agricultura', item: 'tomate', qty: expect.any(Number), x: 81, y: 49 });
    const consumed = cycle.consumed.find((entry) => entry.item === 'tomate')?.qty ?? 0;
    expect(consumed).toBeGreaterThan(0);
    expect(state.inventory.tomate ?? 0).toBe((activity.qty ?? 0) - consumed);
    advanceCommunity(state, '2026-10-19', [{ id: 'bulbasaur', types: ['grass'] }]);
    expect(state.inventory.tomate ?? 0).toBe((activity.qty ?? 0) - consumed);
  });

  it('transforma ingredientes em uma refeição real e limita a pesca comunitária a um peixe por dia', () => {
    const cooked = fresh();
    cooked.community.lastCycleDay = '2026-10-18';
    cooked.coins = 100;
    add(cooked, 'oran', 2);
    const cookCycle = advanceCommunity(cooked, '2026-10-19', [{ id: 'charmander', types: ['fire'] }]).cycles[0]!;
    expect(cookCycle.activities[0]).toMatchObject({ activity: 'culinaria', item: 'suco-oran', qty: 1 });
    expect(cookCycle.consumed).toEqual([{ item: 'suco-oran', qty: 1 }]);
    expect(cooked.inventory.oran).toBeUndefined();
    expect(cooked.inventory['suco-oran']).toBeUndefined();

    const fishing = fresh();
    fishing.community.lastCycleDay = '2026-10-18';
    fishing.coins = 300;
    const anglers = [{ id: 'vaporeon', types: ['water'] as const }, { id: 'lapras', types: ['water'] as const }];
    const fishingCycle = advanceCommunity(fishing, '2026-10-19', anglers).cycles[0]!;
    expect(fishingCycle.activities.filter((entry) => entry.activity === 'pesca')).toHaveLength(1);
    expect(fishingCycle.activities.filter((entry) => entry.item === 'peixe').reduce((sum, entry) => sum + (entry.qty ?? 0), 0)).toBe(1);
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

  it('normaliza e limita energia, interesses e registros ocupacionais do save', () => {
    const community = normalizeCommunity({
      residents: {
        pikachu: { energy: 0, interests: ['agricultura', 'inventada'], experience: { agricultura: 3, inventada: 99 }, recentActivity: 'agricultura', rememberedActivity: 'inventada', completedActivities: 5 },
      },
      history: [{ day: '2026-10-19', residents: 1, activities: [{ residentId: 'pikachu', activity: 'agricultura', icon: '🌱', result: 'Regou um cultivo.' }] }],
    });
    expect(community.residents.pikachu).toMatchObject({ energy: 0, interests: ['agricultura'], experience: { agricultura: 3 }, recentActivity: 'agricultura', rememberedActivity: null, completedActivities: 5 });
    expect(community.history[0]?.activities).toMatchObject([{ residentId: 'pikachu', activity: 'agricultura', result: 'Regou um cultivo.' }]);
    expect(community.history[0]?.activities).not.toContainEqual(expect.objectContaining({ residentId: 'inventado' }));
  });

  it('migra saves antigos para Conselho vazio e descarta projetos inválidos sem tocar no progresso', () => {
    expect(normalizeCommunity({ welfare: 62 }).council).toEqual([]);
    const normalized = normalizeCommunity({ council: [
      { id: 'bad', kind: 'cozinha-reforco', output: 'pikachu', createdDay: '2026-10-19', status: 'apoiado', ingredients: [], participants: [], result: '' },
      { id: 'good', kind: 'cozinha-reforco', output: 'suco-oran', createdDay: '2026-10-19', status: 'apoiado', ingredients: [{ item: 'oran', qty: 4 }], participants: ['charmander'], result: 'Em andamento.' },
    ] });
    expect(normalized.council).toHaveLength(1);
    expect(normalized.council[0]).toMatchObject({ id: 'good', status: 'apoiado', ingredients: [{ item: 'oran', qty: 4 }] });
  });

  it('propõe cozinha por escassez real, reserva insumos e só conclui depois da tarefa apoiada', () => {
    const poor = fresh();
    poor.community.lastCycleDay = '2026-10-18';
    poor.community.shortageDays = 1;
    poor.town.level = 3;
    poor.coins = 100;
    advanceCommunity(poor, '2026-10-19', [{ id: 'charmander', types: ['fire'] }]);
    expect(poor.community.council).toEqual([]);

    const state = fresh();
    state.community.lastCycleDay = '2026-10-18';
    state.community.shortageDays = 1;
    state.town.level = 3;
    state.coins = 100;
    add(state, 'oran', 4);

    const proposalCycle = advanceCommunity(state, '2026-10-19', [{ id: 'charmander', types: ['fire'] }]).cycles[0]!;
    const project = state.community.council[0]!;
    expect(project).toMatchObject({ kind: 'cozinha-reforco', status: 'proposto', output: 'suco-oran', ingredients: [{ item: 'oran', qty: 4 }], participants: [], cause: expect.stringContaining('despensa ficou curta') });
    expect(state.inventory.oran).toBe(4);
    expect(proposalCycle.foodShortage).toBe(2);
    expect(communityForecast(state, ['charmander']).foodReservedForCouncil).toBe(4);
    expect(cook(state, 'suco-oran')).toMatchObject({ ok: false, message: expect.stringContaining('Faltam ingredientes') });
    expect(sell(state, 'oran', 4).ok).toBe(false);
    expect(giveGift(state, 'charmander', ['fire'], 'oran', '2026-10-19').ok).toBe(false);
    expect(state.inventory.oran).toBe(4);

    const supported = decideCommunityProject(state, project.id, 'apoiar', '2026-10-19');
    expect(supported.ok).toBe(true);
    expect(state.inventory.oran).toBe(4);
    state.coins = 100;
    const execution = advanceCommunity(state, '2026-10-20', [{ id: 'charmander', types: ['fire'] }]).cycles[0]!;
    expect(execution.activities[0]).toMatchObject({ activity: 'culinaria', item: 'suco-oran', qty: 2, projectId: project.id });
    expect(execution.consumed).toEqual([{ item: 'suco-oran', qty: 1 }]);
    expect(state.inventory.oran).toBeUndefined();
    expect(state.inventory['suco-oran']).toBe(1);
    expect(state.community.council[0]).toMatchObject({ status: 'concluido', participants: ['charmander'], ingredients: [{ item: 'oran', qty: 4 }], result: expect.stringContaining('preparou 2') });
    expect(advanceCommunity(state, '2026-10-20', [{ id: 'charmander', types: ['fire'] }]).cycles).toEqual([]);
    expect(state.inventory['suco-oran']).toBe(1);
  });

  it('adiar ou recusar não gasta estoque e expira a proposta sem cobrar recursos', () => {
    const state = fresh();
    state.community.lastCycleDay = '2026-10-18';
    state.community.shortageDays = 1;
    state.town.level = 3;
    state.coins = 100;
    add(state, 'oran', 4);
    advanceCommunity(state, '2026-10-19', [{ id: 'charmander', types: ['fire'] }]);
    const project = state.community.council[0]!;
    expect(decideCommunityProject(state, project.id, 'adiar', '2026-10-19').ok).toBe(true);
    expect(state.inventory.oran).toBe(4);
    expect(decideCommunityProject(state, project.id, 'recusar', '2026-10-19').ok).toBe(false);
    advanceCommunity(state, '2026-10-26', []);
    expect(state.community.council[0]).toMatchObject({ status: 'expirado', result: expect.stringContaining('sem gastar recursos') });
    expect(state.inventory.oran).toBe(4);
  });

  it('preserva o aprendizado de um morador enquanto ele fica temporariamente fora da Vila', () => {
    const state = fresh();
    state.community.lastCycleDay = '2026-10-18';
    state.coins = 100;
    advanceCommunity(state, '2026-10-19', [{ id: 'bulbasaur', types: ['grass'] }]);
    const progress = structuredClone(state.community.residents.bulbasaur);

    advanceCommunity(state, '2026-10-20', []);
    expect(state.community.residents.bulbasaur).toEqual(progress);
    advanceCommunity(state, '2026-10-21', [{ id: 'bulbasaur', types: ['grass'] }]);

    expect(state.community.residents.bulbasaur?.completedActivities).toBe((progress?.completedActivities ?? 0) + 1);
  });

  it('registra no Diário e na memória social um encontro que ocorreu de fato', () => {
    const state = fresh();
    state.community.lastCycleDay = '2026-10-18';
    state.coins = 100;

    const cycle = advanceCommunity(state, '2026-10-19', [
      { id: 'abra', types: ['psychic'] },
      { id: 'mewtwo', types: ['psychic'] },
    ]).cycles[0]!;

    expect(cycle.activities.map((entry) => entry.activity)).toEqual(['acolhimento', 'acolhimento']);
    expect(state.diary).toContainEqual(expect.objectContaining({ id: 'comunidade:2026-10-19:praca', kind: 'amizade', cast: [{ id: 'abra', name: 'abra' }, { id: 'mewtwo', name: 'mewtwo' }] }));
    expect(state.memories.filter((memory) => memory.momentId === 'comunidade:2026-10-19:praca')).toHaveLength(2);
    advanceCommunity(state, '2026-10-19', [{ id: 'abra', types: ['psychic'] }, { id: 'mewtwo', types: ['psychic'] }]);
    expect(state.diary.filter((entry) => entry.id === 'comunidade:2026-10-19:praca')).toHaveLength(1);
    expect(state.memories.filter((memory) => memory.momentId === 'comunidade:2026-10-19:praca')).toHaveLength(2);
  });

  it('usa memórias com moradores ativos para orientar escolhas sociais e registrar ajuda alimentar real', () => {
    const state = fresh();
    state.community.lastCycleDay = '2026-10-18';
    state.coins = 100;
    state.memories = [
      { id: 'friend', mon: 'abra', with: ['mewtwo'], kind: 'amizade', text: 'Ajudaram na horta.', day: '2026-10-17', t: 1, momentId: 'friend' },
      { id: 'rival', mon: 'abra', with: ['clefairy'], kind: 'rivalidade', text: 'Disputaram a feira.', day: '2026-10-17', t: 2, momentId: 'rival' },
    ];
    const opportunity = socialOpportunityFromMemories(state, 'abra', new Set(['abra', 'mewtwo', 'clefairy']));
    expect(opportunity).toBe(1);
    expect(socialOpportunityFromMemories(state, 'abra', new Set(['abra', 'mewtwo']))).toBe(2);
    expect(socialOpportunityFromMemories(state, 'abra', new Set(['abra']))).toBe(0);
    expect(scoreActivity({ available: [], types: [], interests: [], energy: 70, socialOpportunity: opportunity }, 'acolhimento').score).toBe(1);
    expect(scoreActivity({ available: [], types: [], interests: [], energy: 70, socialOpportunity: 2 }, 'acolhimento').score).toBe(2);

    state.community.shortageDays = 1;
    const cycle = advanceCommunity(state, '2026-10-19', [{ id: 'vaporeon', types: ['water'] }]).cycles[0]!;
    expect(cycle.activities[0]).toMatchObject({ activity: 'pesca', item: 'peixe', qty: 1 });
    expect(cycle.consumed).toContainEqual({ item: 'peixe', qty: 1 });
    expect(state.diary).toContainEqual(expect.objectContaining({ id: 'comunidade:2026-10-19:ajuda-despensa', title: 'Ajuda na despensa' }));
  });
});
