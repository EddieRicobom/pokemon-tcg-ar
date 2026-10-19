import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_PER_SIDE } from '../core/pins';
import { defaultSetup, DEFAULT_ENEMY, DEFAULT_MINE, emptySetup, loadSetup, normalizeSetup, roleOf, saveSetup, setRole, setupBlocker } from './pins-setup';

const cards = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, lastSeenAt: i }));
const ids = new Set(cards.map((c) => c.id));

describe('escolha dos pins', () => {
  beforeEach(() => localStorage.clear());

  it('sem escolha, começa com as cartas mais recentes', () => {
    const s = defaultSetup(cards);
    expect(s.mine).toEqual(['c11', 'c10', 'c9']);
    expect(s.enemy).toHaveLength(DEFAULT_ENEMY);
    expect(s.mine).toHaveLength(DEFAULT_MINE);
    expect(s.enemy[0]).toBe('c8');
    expect(defaultSetup([])).toEqual(emptySetup());
  });

  it('põe, troca de lado e tira, respeitando os limites', () => {
    let s = emptySetup();
    for (let i = 0; i < MAX_PER_SIDE[0]; i++) s = setRole(s, `c${i}`, 'mine').setup;
    const full = setRole(s, 'c9', 'mine');
    expect(full.full).toBe('mine');
    expect(full.setup).toEqual(s);
    const moved = setRole(s, 'c0', 'enemy');
    expect(moved.full).toBeNull();
    expect(roleOf(moved.setup, 'c0')).toBe('enemy');
    expect(moved.setup.mine).not.toContain('c0');
    expect(roleOf(setRole(moved.setup, 'c0', null).setup, 'c0')).toBeNull();
    expect(roleOf(s, 'x')).toBeNull();
  });

  it('o lado dos adversários comporta mais que o seu', () => {
    let s = emptySetup();
    for (let i = 0; i < 12; i++) s = setRole(s, `c${i}`, 'enemy').setup;
    expect(s.enemy).toHaveLength(MAX_PER_SIDE[1]);
  });

  it('limpa o que veio do armazenamento', () => {
    const s = normalizeSetup({ mine: ['c1', 'c1', 'gone', 7, 'c2'], enemy: ['c2', 'c3'], difficulty: 'dificil' }, ids);
    expect(s).toEqual({ mine: ['c1', 'c2'], enemy: ['c3'], difficulty: 'dificil', marks: true, shrink: true, sound: true, haptics: true, effects: true });
    expect(normalizeSetup({ marks: false, shrink: false, sound: false, haptics: false }, ids)).toMatchObject({ marks: false, shrink: false, sound: false, haptics: false });
    expect(normalizeSetup({ mine: ['c1'], enemy: ['c2'] }, ids).effects).toBe(true); // saves antigos ganham a preferência nova por padrão
    expect(normalizeSetup({ effects: false }, ids).effects).toBe(false);
    expect(normalizeSetup({ marks: 'x' }, ids).marks).toBe(true);
    expect(normalizeSetup('lixo', ids)).toEqual(emptySetup());
    expect(normalizeSetup({ difficulty: 'x' }, ids).difficulty).toBe('normal');
  });

  it('lembra a escolha e volta ao padrão se as cartas sumiram', () => {
    saveSetup({ mine: ['c1'], enemy: ['c2', 'c3'], difficulty: 'facil', marks: false, shrink: false, sound: false, haptics: true, effects: true });
    expect(loadSetup(ids, cards)).toEqual({ mine: ['c1'], enemy: ['c2', 'c3'], difficulty: 'facil', marks: false, shrink: false, sound: false, haptics: true, effects: true });
    expect(loadSetup(new Set(['c5', 'c6']), cards.slice(5, 7)).mine).toEqual(['c6', 'c5']);
    localStorage.setItem('tcg-ar-pins-setup-v1', '{quebrado');
    expect(loadSetup(ids, cards)).toEqual(defaultSetup(cards));
  });

  it('diz o que falta para começar', () => {
    expect(setupBlocker(emptySetup())).toContain('seu');
    expect(setupBlocker({ ...emptySetup(), mine: ['c1'] })).toContain('adversário');
    expect(setupBlocker({ ...emptySetup(), mine: ['c1'], enemy: ['c2'] })).toBeNull();
  });
});
