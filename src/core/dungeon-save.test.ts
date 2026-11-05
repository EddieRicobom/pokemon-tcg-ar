import { describe, expect, it } from 'vitest';
import { canSaveRun, DUNGEON_SAVE_VERSION, parseRunSave } from './dungeon-save';

const state = {
  seed: 7, floor: 3, round: 2, ap: 4, phase: 'player', team: [{ id: 'a' }], active: 0, pos: { x: 1, y: 2 }, enemies: [], walls: [], loot: [], stairs: null, bag: [],
  fusion: null, fusionCharges: 1, potions: 2, mustSwitch: false, log: ['oi'], nextUid: 9, nextGemId: 4, rollCount: 12, rewardOptions: [], bossThreat: null, turnQueue: [], pool: [],
};
const save = (over: Record<string, unknown> = {}, st: Record<string, unknown> = {}) => JSON.stringify({ v: DUNGEON_SAVE_VERSION, state: { ...state, ...st }, chosen: ['a'], offered: [1], brought: null, ...over });

describe('descida salva', () => {
  it('volta igual: o andar, os sorteios já feitos e os andares que ofereceram armas', () => {
    const run = parseRunSave(save())!;
    expect(run.state.floor).toBe(3);
    expect(run.state.rollCount).toBe(12);
    expect(run.chosen).toEqual(['a']);
    expect(run.offered).toEqual([1]);
    expect(run.brought).toBeNull();
  });

  it('guarda o que saiu da Vila para devolver se abandonar', () => {
    const run = parseRunSave(save({ brought: { gems: [{ id: 3 }], lunchbox: 'bolo' } }))!;
    expect(run.brought?.gems).toHaveLength(1);
    expect(run.brought?.lunchbox).toBe('bolo');
  });

  it('não aceita lixo, outra versão, turno inimigo nem expedição terminada', () => {
    expect(parseRunSave(null)).toBeNull();
    expect(parseRunSave('{quebrado')).toBeNull();
    expect(parseRunSave(save({ v: 99 }))).toBeNull();
    expect(parseRunSave(save({}, { phase: 'enemy' }))).toBeNull();
    expect(parseRunSave(save({}, { phase: 'lost' }))).toBeNull();
    expect(parseRunSave(save({}, { team: [] }))).toBeNull();
    expect(parseRunSave(save({}, { seed: 'x' }))).toBeNull();
  });

  it('só a vez do jogador e as telas entre andares podem ser guardadas', () => {
    expect(canSaveRun('player')).toBe(true);
    expect(canSaveRun('reward')).toBe(true);
    expect(canSaveRun('enemy')).toBe(false);
    expect(canSaveRun('retired')).toBe(false);
  });
});
