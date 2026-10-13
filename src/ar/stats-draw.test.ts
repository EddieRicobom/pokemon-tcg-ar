import { describe, expect, it } from 'vitest';
import { emptyBattleData } from '../app/pokemon-data-service';
import { ATTACK_ROW, hitTestPanel, MOVE_ROW, PANEL_HEIGHT_PX, PANEL_WIDTH_PX } from './stats-draw';
import type { PanelModel } from './stats-draw';

const model = (): PanelModel => {
  const data = emptyBattleData();
  data.card = { state: 'ok', value: { types: [], weaknesses: [], attacks: [{ name: 'Gnaw', cost: ['Colorless'] }, { name: 'Thunder Jolt', cost: ['Lightning'] }] } };
  data.moves = { state: 'ok', value: [
    { name: 'Thunderbolt', type: 'electric', power: 90, accuracy: 100, pp: 15, damageClass: 'special' },
    { name: 'Quick Attack', type: 'normal', power: 40, accuracy: 100, pp: 30, damageClass: 'physical' },
  ] };
  return { name: 'Pikachu', dexId: 25, data };
};

describe('toque no painel', () => {
  it('ataques da carta: cada linha devolve o seu ataque', () => {
    const m = model();
    expect(hitTestPanel(m, 'attacks', 100, ATTACK_ROW.top(0) + 10)).toEqual({ kind: 'move', source: 'card', index: 0, name: 'Gnaw' });
    expect(hitTestPanel(m, 'attacks', 100, ATTACK_ROW.top(1) + 40)).toEqual({ kind: 'move', source: 'card', index: 1, name: 'Thunder Jolt' });
  });
  it('linha que não existe (terceiro ataque) e espaço entre linhas não acertam', () => {
    const m = model();
    expect(hitTestPanel(m, 'attacks', 100, ATTACK_ROW.top(2) + 10)).toBeNull();
    expect(hitTestPanel(m, 'attacks', 100, ATTACK_ROW.top(0) + ATTACK_ROW.height + 4)).toBeNull();
    expect(hitTestPanel(m, 'attacks', 4, ATTACK_ROW.top(0) + 10)).toBeNull(); // fora da margem
  });
  it('golpes do jogo', () => {
    const m = model();
    expect(hitTestPanel(m, 'moves', 300, MOVE_ROW.top(1) + 20)).toEqual({ kind: 'move', source: 'game', index: 1, name: 'Quick Attack' });
  });
  it('a página mostrada decide: golpes não respondem na página de status', () => {
    expect(hitTestPanel(model(), 'status', 100, MOVE_ROW.top(0) + 10)).toBeNull();
  });
  it('enquanto carrega ou com erro, não há o que tocar', () => {
    const m = { ...model(), data: emptyBattleData() };
    expect(hitTestPanel(m, 'moves', 100, MOVE_ROW.top(0) + 10)).toBeNull();
  });
  it('pontos de página no rodapé trocam de página', () => {
    const m = model();
    const y = PANEL_HEIGHT_PX - 16;
    const c = PANEL_WIDTH_PX / 2;
    expect(hitTestPanel(m, 'status', c - 18, y)).toEqual({ kind: 'page', page: 'status' });
    expect(hitTestPanel(m, 'status', c, y)).toEqual({ kind: 'page', page: 'attacks' });
    expect(hitTestPanel(m, 'status', c + 18, y)).toEqual({ kind: 'page', page: 'moves' });
    expect(hitTestPanel(m, 'status', c + 120, y)).toBeNull();
  });
});
