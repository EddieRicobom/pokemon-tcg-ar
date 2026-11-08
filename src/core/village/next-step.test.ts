import { describe, expect, it } from 'vitest';
import { generateVillage } from './map';
import { add, emptyVillage, friendOf } from './life';
import type { VillageState } from './life';
import { dailyMarks, nextVillageStep } from './next-step';
import { ensureRequests } from './requests';

const map = generateVillage(42);
const day = '2026-11-08';
const residents = [{ id: 'a', name: 'Pikachu' }, { id: 'b', name: 'Eevee' }];
const board = { x: 10, y: 10 };
const fishing = { x: 20, y: 20 };
const fresh = (): VillageState => emptyVillage(42, map.spawn);
const ctx = (state: VillageState, over: Partial<Parameters<typeof nextVillageStep>[0]> = {}) => ({ state, day, residents, mailUnread: 0, board, fishing, ...over });
const talkedToAll = (state: VillageState) => { for (const r of residents) friendOf(state, r.id).lastTalk = day; };

describe('próximo passo da Vila', () => {
  it('sem moradores e sem presente, leva ao presente inicial', () => {
    expect(nextVillageStep(ctx(fresh(), { residents: [] })).action.kind).toBe('starter');
  });

  it('planta pronta vem antes de conversa', () => {
    const state = fresh();
    state.crops.push({ x: 3, y: 4, seed: 'sem-tomate', stage: 99, wateredAt: null });
    expect(nextVillageStep(ctx(state)).action).toMatchObject({ kind: 'point', x: 3, y: 4 });
  });

  it('planta com sede é apontada', () => {
    const state = fresh();
    state.crops.push({ x: 5, y: 6, seed: 'sem-tomate', stage: 0, wateredAt: null });
    expect(nextVillageStep(ctx(state)).title).toContain('sede');
  });

  it('pede a entrega só quando há material disponível', () => {
    const state = fresh();
    friendOf(state, 'b').request = { day, item: 'madeira', qty: 2, done: false };
    expect(nextVillageStep(ctx(state)).action).toEqual({ kind: 'resident', id: 'a' });
    add(state, 'madeira', 2);
    expect(nextVillageStep(ctx(state)).action).toEqual({ kind: 'resident', id: 'b' });
    expect(nextVillageStep(ctx(state)).title).toContain('Madeira');
  });

  it('aponta quem ainda não recebeu a conversa do dia', () => {
    const state = fresh();
    friendOf(state, 'a').lastTalk = day;
    expect(nextVillageStep(ctx(state)).action).toEqual({ kind: 'resident', id: 'b' });
  });

  it('depois das conversas, abre o mural do dia', () => {
    const state = fresh();
    talkedToAll(state);
    expect(nextVillageStep(ctx(state)).title).toContain('mural');
  });

  it('com tudo feito, diz a verdade: o dia acabou', () => {
    const state = fresh();
    talkedToAll(state);
    ensureRequests(state, day, residents);
    state.requests.items.forEach((request) => { request.done = true; });
    state.fishing = { day, casts: 10 };
    state.house = 6;
    expect(nextVillageStep(ctx(state)).action.kind).toBe('none');
    expect(nextVillageStep(ctx(state)).title).toContain('completo');
  });

  it('conta o dia a partir do que aconteceu', () => {
    const state = fresh();
    friendOf(state, 'a').lastTalk = day;
    state.fishing = { day: '2026-11-07', casts: 9 };
    expect(dailyMarks({ state, day, residents })).toEqual([
      { icon: '💬', label: 'Conversas', done: 1, total: 2 },
      { icon: '📌', label: 'Mural', done: 0, total: 3 },
      { icon: '🎣', label: 'Pesca', done: 0, total: 10 },
    ]);
  });
});
