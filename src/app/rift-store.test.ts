import { beforeEach, describe, expect, it } from 'vitest';
import { applyRiftSave, clearRiftSave, normalizeRiftSave, readRiftSave, riftSaveOf, writeRiftSave } from './rift-store';
import { createRiftState } from '../core/rift';

describe('save da Fenda do Mew', () => {
  beforeEach(() => { localStorage.clear(); });

  it('ida e volta preserva nível, arma, itens, aliados e chefes', () => {
    const state = createRiftState();
    state.player.level = 7;
    state.player.xp = 40;
    state.player.weapon = 'martelo';
    state.player.unlocked.push('martelo');
    state.player.potions = 3;
    state.player.balls = 6;
    state.allies = [{ id: 'a1', dexId: 25, name: 'Pikachu', level: 5, hp: 30, maxHp: 60, x: 0, y: 0, attackMs: 0 }];
    state.reserve = [{ id: 'r1', dexId: 7, name: 'Squirtle', level: 4, hp: 22, maxHp: 44, x: 0, y: 0, attackMs: 0 }];
    state.defeated = ['ruinas'];
    const save = riftSaveOf(state);
    expect(writeRiftSave(save)).toBe(true);
    const loaded = readRiftSave()!;
    expect(loaded.player.level).toBe(7);
    expect(loaded.player.weapon).toBe('martelo');
    expect(loaded.allies[0]?.name).toBe('Pikachu');
    expect(loaded.reserve[0]?.name).toBe('Squirtle');
    expect(loaded.defeated).toEqual(['ruinas']);
    const next = createRiftState();
    applyRiftSave(next, loaded);
    expect(next.player.level).toBe(7);
    expect(next.player.xpNext).toBeGreaterThan(0);
    expect(next.allies).toHaveLength(1);
    expect(next.reserve).toHaveLength(1);
  });

  it('recusa lixo e normaliza limites', () => {
    expect(normalizeRiftSave(null)).toBeNull();
    expect(normalizeRiftSave({ version: 2 })).toBeNull();
    expect(normalizeRiftSave('x')).toBeNull();
    const save = normalizeRiftSave({
      version: 1,
      player: { level: 999, hp: -4, maxHp: 80, weapon: 'nada', potions: -3, balls: 999, unlocked: ['nada', 'martelo'] },
      allies: [{ dexId: 25, name: '  Pikachu  ', level: 0, hp: 999, maxHp: 50 }, { dexId: 'x', name: '' }],
      defeated: ['ruinas', 'outro'],
    })!;
    expect(save.player.level).toBe(99);
    expect(save.player.hp).toBe(1);
    expect(save.player.weapon).toBe('espada');
    expect(save.player.potions).toBe(0);
    expect(save.player.balls).toBe(99);
    expect(save.player.unlocked).toContain('martelo');
    expect(save.allies[0]).toMatchObject({ name: 'Pikachu', hp: 50, maxHp: 50 });
    expect(save.allies).toHaveLength(1);
    expect(save.defeated).toEqual(['ruinas']);
  });

  it('limpa o save', () => {
    writeRiftSave(riftSaveOf(createRiftState()));
    clearRiftSave();
    expect(readRiftSave()).toBeNull();
  });
});
