import { describe, expect, it } from 'vitest';
import { buildFighter, seededRng } from './battle';
import type { Fighter } from './battle';
import type { ChosenMove } from './moveset';
import type { PokemonType } from './pokemon-data';
import {
  accuracyMultiplier, actionBlocker, chooseFoeAction, createDuel, describeDuelEvent, duelMonFrom, forfeitDuel, needsStruggle, orderHint, resolveTurn,
  sendReplacement, stageBadges, stageMultiplier, statusBlockedByType, STRUGGLE, switchOptions,
} from './turn-battle';
import type { DuelEvent, DuelMon, DuelState } from './turn-battle';

function fighter(id: string, types: PokemonType[], speed = 80, hp = 80): Fighter {
  return buildFighter({ id, name: id, profile: { dexId: 1, types, stats: { hp, attack: 90, defense: 80, spAttack: 90, spDefense: 80, speed } }, card: null, gameMoves: [] });
}
const NO_EFFECT = { priority: 0, ailment: null, ailmentChance: 0, flinchChance: 0, statChanges: [], statChance: 0, drain: 0, healing: 0, critRate: 0, minHits: 1, maxHits: 1 };
const move = (slug: string, type: PokemonType, power: number, extra: Partial<ChosenMove> = {}): ChosenMove => ({
  slug, name: slug, type, power, accuracy: 100, pp: 10, damageClass: 'physical', ...NO_EFFECT, ...extra,
});
const status = (slug: string, type: PokemonType, extra: Partial<ChosenMove>): ChosenMove => move(slug, type, 0, { damageClass: 'status', accuracy: null, ...extra });
const always = (v: number) => () => v;
const mon = (name: string, types: PokemonType[], speed: number, moves: ChosenMove[], hp = 80): DuelMon => duelMonFrom(fighter(name, types, speed, hp), moves);
const kinds = (events: DuelEvent[]) => events.map((e) => e.kind);
const one = (mine: DuelMon, theirs: DuelMon): DuelState => createDuel({ name: 'Você', mons: [mine] }, { name: 'Rival', mons: [theirs] });
const tackle = move('tackle', 'normal', 40);
const both = (state: DuelState, rng: () => number) => resolveTurn(state, { kind: 'move', move: 0 }, { kind: 'move', move: 0 }, rng);

function duel(): DuelState {
  return createDuel(
    { name: 'Você', mons: [mon('Pikachu', ['electric'], 120, [move('thunder-shock', 'electric', 40, { damageClass: 'special' }), move('quick-attack', 'normal', 40, { pp: 1, priority: 1 })]), mon('Geodude', ['rock', 'ground'], 20, [move('rock-throw', 'rock', 50)])] },
    { name: 'Brock', mons: [mon('Onix', ['rock', 'ground'], 70, [tackle]), mon('Gyarados', ['water', 'flying'], 81, [move('bite', 'dark', 60)])] },
  );
}

describe('duelo por turnos: base', () => {
  it('monta os dois lados com PS cheios, PP de cada golpe e estágios zerados', () => {
    const state = duel();
    expect(state.sides[0].state[0]).toMatchObject({ hp: state.sides[0].mons[0]!.fighter.maxHp, pp: [10, 1], status: null, confusion: 0 });
    expect(Object.values(state.sides[0].state[0]!.stages).every((s) => s === 0)).toBe(true);
    expect(() => duelMonFrom(fighter('X', ['normal']), [])).toThrow();
  });

  it('o mais rápido age primeiro, gasta PP e a imunidade aparece na narração', () => {
    const state = duel();
    const { state: next, events } = both(state, seededRng(3));
    expect(events.find((e) => e.kind === 'move')!.side).toBe(0);
    expect(next.sides[0].state[0]!.pp[0]).toBe(9);
    expect(describeDuelEvent(next, events.find((e) => e.kind === 'immune')!)).toBe('Não afeta Onix do oponente…');
    expect(next.sides[1].state[0]!.hp).toBe(next.sides[1].mons[0]!.fighter.maxHp);
    expect(state.sides[0].state[0]!.pp[0]).toBe(10);
    expect(next.turn).toBe(1);
  });

  it('prioridade vem antes da Velocidade', () => {
    const state = one(mon('Lento', ['normal'], 10, [move('quick-attack', 'normal', 40, { priority: 1 })], 200), mon('Rapido', ['normal'], 150, [tackle], 200));
    expect(both(state, always(0.5)).events.find((e) => e.kind === 'move')!.side).toBe(0);
    expect(orderHint(state, 0)).toBe('first');
  });

  it('dica de ordem usa Velocidade e estágio de Velocidade', () => {
    const state = duel();
    expect(orderHint(state, 0)).toBe('first');
    state.sides[0].state[0]!.stages.speed = -6;
    expect(orderHint(state, 0)).toBe('second');
  });

  it('multiplicadores de estágio dos jogos', () => {
    expect(stageMultiplier(1)).toBe(1.5);
    expect(stageMultiplier(2)).toBe(2);
    expect(stageMultiplier(-1)).toBeCloseTo(2 / 3);
    expect(accuracyMultiplier(1)).toBeCloseTo(4 / 3);
    expect(accuracyMultiplier(-1)).toBe(0.75);
  });
});

describe('golpes de status e estágios', () => {
  it('Dança das Espadas sobe Atq. em 2 e para no +6', () => {
    const sd = status('swords-dance', 'normal', { statChanges: [{ stat: 'attack', change: 2, target: 'self' }], statChance: 100 });
    const state = one(mon('Pikachu', ['electric'], 120, [sd], 200), mon('Tauros', ['normal'], 50, [tackle], 200));
    const { state: next, events } = both(state, always(0.5));
    const stage = events.find((e) => e.kind === 'stage')!;
    expect(stage).toMatchObject({ side: 0, stat: 'attack', applied: 2 });
    expect(describeDuelEvent(next, stage)).toBe('Atq. de Pikachu subiu muito!');
    expect(stageBadges(next.sides[0].state[0]!.stages)).toEqual([{ stat: 'attack', label: 'Atq. +2', value: 2 }]);
    next.sides[0].state[0]!.stages.attack = 6;
    const capped = both(next, always(0.5));
    expect(describeDuelEvent(capped.state, capped.events.find((e) => e.kind === 'stage')!)).toBe('Atq. de Pikachu não pode subir mais!');
  });

  it('estágio de Atq. aumenta o dano', () => {
    const make = () => one(mon('A', ['normal'], 120, [tackle], 200), mon('B', ['water'], 10, [tackle], 255));
    const boosted = make();
    boosted.sides[0].state[0]!.stages.attack = 2;
    const hit = (s: DuelState) => both(s, always(0.5)).events.find((e) => e.kind === 'hit' && e.side === 1) as Extract<DuelEvent, { kind: 'hit' }>;
    expect(hit(boosted).damage).toBeGreaterThan(hit(make()).damage * 1.8);
  });

  it('Onda Trovão paralisa; não afeta tipo Terra; falha em quem já tem condição', () => {
    const wave = status('thunder-wave', 'electric', { accuracy: 90, ailment: 'paralysis', ailmentChance: 100 });
    const vsNormal = both(one(mon('P', ['electric'], 120, [wave], 200), mon('T', ['normal'], 50, [tackle], 200)), always(0.5));
    expect(vsNormal.events.find((e) => e.kind === 'status')).toMatchObject({ side: 1, status: 'paralysis' });
    expect(vsNormal.state.sides[1].state[0]!.status).toBe('paralysis');
    expect(statusBlockedByType(wave, ['rock', 'ground'])).toBe(true);
    expect(kinds(both(one(mon('P', ['electric'], 120, [wave], 200), mon('O', ['rock', 'ground'], 50, [tackle], 200)), always(0.5)).events)).toContain('immune');
    const burned = one(mon('P', ['electric'], 120, [wave], 200), mon('T', ['normal'], 50, [tackle], 200));
    burned.sides[1].state[0]!.status = 'burn';
    const fail = both(burned, always(0.5));
    expect(describeDuelEvent(fail.state, fail.events.find((e) => e.kind === 'fail')!)).toBe('Mas não funcionou!');
  });

  it('sono impede de agir e depois o Pokémon acorda', () => {
    const hypnosis = status('hypnosis', 'psychic', { accuracy: 60, ailment: 'sleep', ailmentChance: 100 });
    const first = both(one(mon('Drowzee', ['psychic'], 120, [hypnosis], 200), mon('Tauros', ['normal'], 50, [tackle], 200)), always(0));
    expect(first.events.find((e) => e.kind === 'status')).toMatchObject({ status: 'sleep' });
    expect(first.events.find((e) => e.kind === 'skip')).toMatchObject({ side: 1, cause: 'sleep' });
    const second = both(first.state, always(0));
    expect(kinds(second.events)).toContain('wake');
    expect(second.state.sides[1].state[0]!.status).toBeNull();
  });

  it('confusão: golpe de status ignora o tipo, deixa confuso e o confuso pode se atingir', () => {
    const ray = status('confuse-ray', 'ghost', { accuracy: 100, ailment: 'confusion', ailmentChance: 100 });
    const { state, events } = both(one(mon('Gastly', ['ghost'], 120, [ray], 200), mon('Tauros', ['normal'], 50, [tackle], 200)), always(0.2));
    expect(events.find((e) => e.kind === 'status')).toMatchObject({ side: 1, status: 'confusion' });
    expect(kinds(events)).toContain('confused');
    expect(describeDuelEvent(state, events.find((e) => e.kind === 'confusion-hit')!)).toBe('Tauros do oponente se atingiu na confusão!');
  });

  it('Recuperar cura metade dos PS e falha com os PS cheios', () => {
    const recover = status('recover', 'normal', { healing: 50 });
    const growl = status('growl', 'normal', { statChanges: [{ stat: 'attack', change: -1, target: 'foe' }], statChance: 100 });
    const make = () => one(mon('Chansey', ['normal'], 120, [recover], 200), mon('B', ['water'], 50, [growl], 200));
    expect(kinds(both(make(), always(0.5)).events)).toContain('fail');
    const hurt = make();
    const max = hurt.sides[0].mons[0]!.fighter.maxHp;
    hurt.sides[0].state[0]!.hp = Math.floor(max / 2);
    expect(both(hurt, always(0.5)).events.find((e) => e.kind === 'heal')).toMatchObject({ cause: 'heal', hpAfter: Math.min(max, 2 * Math.floor(max / 2)) });
  });
});

describe('efeitos dos golpes de dano', () => {
  it('dreno cura quem usa', () => {
    const state = one(mon('Oddish', ['grass'], 120, [move('giga-drain', 'grass', 75, { damageClass: 'special', drain: 50 })], 200), mon('Squirtle', ['water'], 50, [tackle], 255));
    state.sides[0].state[0]!.hp = 10;
    const heal = both(state, always(0.5)).events.find((e) => e.kind === 'heal') as Extract<DuelEvent, { kind: 'heal' }>;
    expect(heal).toMatchObject({ side: 0, cause: 'drain', hpBefore: 10 });
    expect(heal.hpAfter).toBeGreaterThan(10);
  });

  it('golpe de vários acertos', () => {
    const state = one(mon('Hitmonlee', ['fighting'], 120, [move('double-kick', 'fighting', 30, { minHits: 2, maxHits: 2 })], 200), mon('Snorlax', ['water'], 30, [tackle], 255));
    const { state: next, events } = both(state, always(0.5));
    expect(events.filter((e) => e.kind === 'hit' && e.side === 1)).toHaveLength(2);
    expect(describeDuelEvent(next, events.find((e) => e.kind === 'multi')!)).toBe('Acertou 2 vezes!');
  });

  it('hesitar só funciona se quem usa agir antes', () => {
    const fakeOut = move('fake-out', 'normal', 40, { flinchChance: 100 });
    const fast = both(one(mon('Rapido', ['normal'], 150, [fakeOut], 200), mon('Lento', ['water'], 10, [tackle], 200)), always(0.5));
    expect(fast.events.find((e) => e.kind === 'skip')).toMatchObject({ side: 1, cause: 'flinch' });
    const slow = both(one(mon('Lento', ['normal'], 10, [fakeOut], 200), mon('Rapido', ['water'], 150, [tackle], 200)), always(0.5));
    expect(kinds(slow.events)).not.toContain('skip');
  });

  it('golpe que erra não causa dano', () => {
    const { events, state } = both(one(mon('A', ['normal'], 200, [move('miss', 'normal', 100, { accuracy: 1 })]), mon('B', ['normal'], 10, [tackle])), always(0.99));
    expect(events.find((e) => e.kind === 'miss' && e.side === 0)).toBeDefined();
    expect(state.sides[1].state[0]!.hp).toBe(state.sides[1].mons[0]!.fighter.maxHp);
  });

  it('queimadura no fim do turno pode derrubar', () => {
    const growl = status('growl', 'normal', { accuracy: 100, statChanges: [{ stat: 'attack', change: -1, target: 'foe' }], statChance: 100 });
    const state = one(mon('Pikachu', ['electric'], 120, [move('thunder-shock', 'electric', 40, { damageClass: 'special' })], 200), mon('Tauros', ['normal'], 50, [growl], 255));
    state.sides[0].state[0]!.hp = 1;
    state.sides[0].state[0]!.status = 'burn';
    const { state: next, events } = both(state, always(0.5));
    expect(events.find((e) => e.kind === 'residual')).toMatchObject({ side: 0, cause: 'burn' });
    expect(next.winner).toBe(1);
  });
});

describe('PP, trocas e fim', () => {
  it('recusa golpe sem PP e oferece Struggle quando todos acabam', () => {
    let state = duel();
    state = resolveTurn(state, { kind: 'move', move: 1 }, { kind: 'move', move: 0 }, seededRng(1)).state;
    expect(actionBlocker(state, 0, { kind: 'move', move: 1 })).toContain('sem PP');
    expect(actionBlocker(state, 0, { kind: 'move', move: -1 })).toContain('Ainda há');
    state.sides[0].state[0]!.pp = [0, 0];
    expect(needsStruggle(state, 0)).toBe(true);
    const { events, state: after } = resolveTurn(state, { kind: 'move', move: -1 }, { kind: 'move', move: 0 }, seededRng(2));
    expect(events.some((e) => e.kind === 'move' && e.struggle && e.move.name === STRUGGLE.name)).toBe(true);
    expect(kinds(events)).toContain('recoil');
    expect(after.sides[0].state[0]!.hp).toBeLessThan(after.sides[0].mons[0]!.fighter.maxHp);
  });

  it('trocar gasta o turno, acontece antes dos golpes e zera os estágios', () => {
    const state = duel();
    state.sides[0].state[0]!.stages.attack = 2;
    expect(switchOptions(state, 0)).toEqual([1]);
    const { state: next, events } = resolveTurn(state, { kind: 'switch', to: 1 }, { kind: 'move', move: 0 }, seededRng(5));
    expect(events[0]).toMatchObject({ kind: 'switch', side: 0, from: 0, to: 1, forced: false });
    expect(describeDuelEvent(next, events[0]!)).toBe('Volte, Pikachu! Vai, Geodude!');
    expect(next.sides[0].active).toBe(1);
    expect(next.sides[0].state[0]!.stages.attack).toBe(0);
    expect(events.filter((e) => e.kind === 'move')).toHaveLength(1);
  });

  it('desmaio do oponente traz o próximo', () => {
    const state = duel();
    state.sides[1].state[0]!.hp = 1;
    const result = resolveTurn(state, { kind: 'move', move: 1 }, { kind: 'move', move: 0 }, always(0.01));
    expect(result.events.some((e) => e.kind === 'faint' && e.side === 1)).toBe(true);
    expect(result.events.some((e) => e.kind === 'switch' && e.side === 1 && e.forced)).toBe(true);
    expect(result.state.sides[1].active).toBe(1);
  });

  it('se o seu desmaia, você escolhe quem entra sem gastar turno', () => {
    const state = duel();
    state.sides[0].state[0]!.hp = 1;
    const after = both(state, always(0.01)).state;
    expect(after.sides[0].state[0]!.hp).toBe(0);
    expect(after.winner).toBeNull();
    expect(after.mustSwitch).toBe(true);
    expect(actionBlocker(after, 0, { kind: 'move', move: 0 })).toContain('Escolha');
    expect(() => resolveTurn(after, { kind: 'switch', to: 1 }, { kind: 'move', move: 0 }, always(0.01))).toThrow();
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
    const { state: next, events } = resolveTurn(state, { kind: 'move', move: 1 }, { kind: 'move', move: 0 }, always(0.01));
    expect(next.winner).toBe(0);
    expect(events.at(-1)).toEqual({ kind: 'end', winner: 0 });
    expect(describeDuelEvent(next, events.at(-1)!)).toBe('Você venceu Brock!');
    expect(actionBlocker(next, 0, { kind: 'move', move: 0 })).toContain('acabou');
  });

  it('desistir dá a vitória ao oponente', () => {
    const { state, events } = forfeitDuel(duel());
    expect(state.winner).toBe(1);
    expect(describeDuelEvent(state, events[0]!)).toBe('Você perdeu para Brock…');
  });
});

describe('oponente', () => {
  it('só escolhe golpes com PP e prefere os que causam dano', () => {
    const state = one(mon('Gengar', ['ghost'], 80, [move('lick', 'ghost', 30)]), mon('Tauros', ['normal'], 80, [tackle, move('bite', 'dark', 60)]));
    for (let seed = 0; seed < 5; seed++) expect(chooseFoeAction(state, seededRng(seed))).toEqual({ kind: 'move', move: 1 });
    state.sides[1].state[0]!.pp = [3, 0];
    expect(chooseFoeAction(state, seededRng(1))).toEqual({ kind: 'move', move: 0 });
    state.sides[1].state[0]!.pp = [0, 0];
    expect(chooseFoeAction(state, seededRng(1))).toEqual({ kind: 'move', move: -1 });
  });

  it('não insiste em condição num alvo que já tem uma', () => {
    const wave = status('thunder-wave', 'electric', { accuracy: 90, ailment: 'paralysis', ailmentChance: 100 });
    const state = one(mon('Tauros', ['normal'], 80, [tackle]), mon('Pikachu', ['electric'], 80, [wave, move('thunderbolt', 'electric', 90, { damageClass: 'special' })]));
    state.sides[0].state[0]!.status = 'paralysis';
    for (let seed = 0; seed < 5; seed++) expect(chooseFoeAction(state, seededRng(seed))).toEqual({ kind: 'move', move: 1 });
  });
});
