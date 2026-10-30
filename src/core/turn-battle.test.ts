import { describe, expect, it } from 'vitest';
import { buildFighter, seededRng } from './battle';
import type { Fighter } from './battle';
import type { ChosenMove } from './moveset';
import type { PokemonType } from './pokemon-data';
import {
  actionBlocker, chooseFoeAction, createDuel, describeDuelEvent, duelMonFrom, forfeitDuel, needsStruggle, resolveTurn, sendReplacement,
  STRUGGLE, switchOptions,
} from './turn-battle';
import type { DuelEvent, DuelState } from './turn-battle';

function fighter(id: string, types: PokemonType[], speed = 80, hp = 80): Fighter {
  return buildFighter({ id, name: id, profile: { dexId: 1, types, stats: { hp, attack: 90, defense: 80, spAttack: 90, spDefense: 80, speed } }, card: null, gameMoves: [] });
}
const move = (slug: string, type: PokemonType, power: number, pp = 10, accuracy: number | null = 100): ChosenMove => ({
  slug, name: slug, type, power, accuracy, pp, damageClass: 'physical',
});
const alwaysLow = () => 0.01;
const alwaysHigh = () => 0.99;

function duel(): DuelState {
  return createDuel(
    { name: 'Você', mons: [duelMonFrom(fighter('Pikachu', ['electric'], 120), [move('thunder-shock', 'electric', 40), move('quick-attack', 'normal', 40, 1)]), duelMonFrom(fighter('Geodude', ['rock', 'ground'], 20), [move('rock-throw', 'rock', 50)])] },
    { name: 'Brock', mons: [duelMonFrom(fighter('Onix', ['rock', 'ground'], 70), [move('tackle', 'normal', 40)]), duelMonFrom(fighter('Gyarados', ['water', 'flying'], 81), [move('bite', 'dark', 60)])] },
  );
}

describe('duelo por turnos', () => {
  it('monta os dois lados com PS cheios e PP de cada golpe', () => {
    const state = duel();
    expect(state.sides[0].state[0]).toMatchObject({ hp: state.sides[0].mons[0]!.fighter.maxHp, pp: [10, 1], status: null });
    expect(state.sides[0].mons[0]!.fighter.moves.map((m) => m.name)).toEqual(['thunder-shock', 'quick-attack']);
    expect(() => duelMonFrom(fighter('X', ['normal']), [])).toThrow();
  });

  it('o mais rápido age primeiro, gasta PP e a eficácia aparece na narração', () => {
    const state = duel();
    const { state: next, events } = resolveTurn(state, { kind: 'move', move: 0 }, { kind: 'move', move: 0 }, seededRng(3));
    const moves = events.filter((e): e is Extract<DuelEvent, { kind: 'move' }> => e.kind === 'move');
    expect(moves[0]!.side).toBe(0);
    expect(next.sides[0].state[0]!.pp[0]).toBe(9);
    // Elétrico não afeta Onix (terra).
    const immune = events.find((e) => e.kind === 'immune');
    expect(immune).toBeDefined();
    expect(describeDuelEvent(next, immune!)).toBe('Não afeta Onix do oponente…');
    expect(next.sides[1].state[0]!.hp).toBe(next.sides[1].mons[0]!.fighter.maxHp);
    // O estado anterior fica intacto.
    expect(state.sides[0].state[0]!.pp[0]).toBe(10);
    expect(next.turn).toBe(1);
  });

  it('recusa golpe sem PP e oferece Struggle quando todos acabam', () => {
    let state = duel();
    state = resolveTurn(state, { kind: 'move', move: 1 }, { kind: 'move', move: 0 }, seededRng(1)).state;
    expect(actionBlocker(state, 0, { kind: 'move', move: 1 })).toContain('sem PP');
    expect(actionBlocker(state, 0, { kind: 'move', move: -1 })).toContain('Ainda há');
    state.sides[0].state[0]!.pp = [0, 0];
    expect(needsStruggle(state, 0)).toBe(true);
    const { events, state: after } = resolveTurn(state, { kind: 'move', move: -1 }, { kind: 'move', move: 0 }, seededRng(2));
    expect(events.some((e) => e.kind === 'move' && e.struggle && e.move.name === STRUGGLE.name)).toBe(true);
    expect(events.some((e) => e.kind === 'recoil')).toBe(true);
    expect(after.sides[0].state[0]!.hp).toBeLessThan(after.sides[0].mons[0]!.fighter.maxHp);
  });

  it('trocar gasta o turno e acontece antes dos golpes', () => {
    const state = duel();
    expect(switchOptions(state, 0)).toEqual([1]);
    const { state: next, events } = resolveTurn(state, { kind: 'switch', to: 1 }, { kind: 'move', move: 0 }, seededRng(5));
    expect(events[0]).toMatchObject({ kind: 'switch', side: 0, from: 0, to: 1, forced: false });
    expect(describeDuelEvent(next, events[0]!)).toBe('Volte, Pikachu! Vai, Geodude!');
    expect(next.sides[0].active).toBe(1);
    expect(events.filter((e) => e.kind === 'move')).toHaveLength(1);
  });

  it('desmaio do oponente traz o próximo', () => {
    const state = duel();
    state.sides[1].state[0]!.hp = 1;
    // Pikachu usa Quick Attack (normal) no Onix com 1 PS e acerta (o sorteio baixo sempre acerta).
    const result = resolveTurn(state, { kind: 'move', move: 1 }, { kind: 'move', move: 0 }, alwaysLow);
    expect(result.events.some((e) => e.kind === 'faint' && e.side === 1)).toBe(true);
    expect(result.events.some((e) => e.kind === 'switch' && e.side === 1 && e.forced)).toBe(true);
    expect(result.state.sides[1].active).toBe(1);
  });

  it('se o seu desmaia, você escolhe quem entra sem gastar turno', () => {
    const state = duel();
    state.sides[0].state[0]!.hp = 1;
    // Elétrico não afeta Onix; o Tackle dele derruba o Pikachu com 1 PS.
    const result = resolveTurn(state, { kind: 'move', move: 0 }, { kind: 'move', move: 0 }, alwaysLow);
    const after = result.state;
    expect(after.sides[0].state[0]!.hp).toBe(0);
    expect(after.winner).toBeNull();
    expect(after.mustSwitch).toBe(true);
    expect(actionBlocker(after, 0, { kind: 'move', move: 0 })).toContain('Escolha');
    expect(() => resolveTurn(after, { kind: 'switch', to: 1 }, { kind: 'move', move: 0 }, alwaysLow)).toThrow();
    const replaced = sendReplacement(after, 1);
    expect(replaced.state.sides[0].active).toBe(1);
    expect(replaced.state.mustSwitch).toBe(false);
    expect(replaced.state.turn).toBe(after.turn);
    expect(describeDuelEvent(replaced.state, replaced.events[0]!)).toBe('Vai, Geodude!');
  });

  it('acaba quando um lado fica sem ninguém', () => {
    const state = duel();
    state.sides[1].state[1]!.hp = 0;
    state.sides[1].state[0]!.hp = 1;
    const { state: next, events } = resolveTurn(state, { kind: 'move', move: 1 }, { kind: 'move', move: 0 }, alwaysLow);
    expect(next.winner).toBe(0);
    const end = events.at(-1)!;
    expect(end).toEqual({ kind: 'end', winner: 0 });
    expect(describeDuelEvent(next, end)).toBe('Você venceu Brock!');
    expect(actionBlocker(next, 0, { kind: 'move', move: 0 })).toContain('acabou');
  });

  it('golpe que erra não causa dano', () => {
    const state = createDuel(
      { name: 'Você', mons: [duelMonFrom(fighter('A', ['normal'], 200), [move('miss', 'normal', 100, 5, 1)])] },
      { name: 'B', mons: [duelMonFrom(fighter('B', ['normal'], 10), [move('tackle', 'normal', 40)])] },
    );
    const { events, state: next } = resolveTurn(state, { kind: 'move', move: 0 }, { kind: 'move', move: 0 }, alwaysHigh);
    expect(events.find((e) => e.kind === 'miss' && e.side === 0)).toBeDefined();
    expect(next.sides[1].state[0]!.hp).toBe(next.sides[1].mons[0]!.fighter.maxHp);
  });

  it('o oponente só escolhe golpes com PP e prefere os que causam dano', () => {
    const state = createDuel(
      { name: 'Você', mons: [duelMonFrom(fighter('Gengar', ['ghost']), [move('lick', 'ghost', 30)])] },
      { name: 'B', mons: [duelMonFrom(fighter('Tauros', ['normal']), [move('tackle', 'normal', 40), move('bite', 'dark', 60)])] },
    );
    for (let seed = 0; seed < 5; seed++) expect(chooseFoeAction(state, seededRng(seed))).toEqual({ kind: 'move', move: 1 });
    state.sides[1].state[0]!.pp = [3, 0];
    expect(chooseFoeAction(state, seededRng(1))).toEqual({ kind: 'move', move: 0 });
    state.sides[1].state[0]!.pp = [0, 0];
    expect(chooseFoeAction(state, seededRng(1))).toEqual({ kind: 'move', move: -1 });
  });

  it('desistir dá a vitória ao oponente', () => {
    const { state, events } = forfeitDuel(duel());
    expect(state.winner).toBe(1);
    expect(describeDuelEvent(state, events[0]!)).toBe('Você perdeu para Brock…');
  });
});
