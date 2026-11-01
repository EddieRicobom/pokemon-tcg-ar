import { describe, expect, it } from 'vitest';
import { createMember } from '../core/dungeon';
import { duelDigest, startDuel } from '../core/dungeon-duel';
import type { WireDuelMember, WireDuelRoster } from './dungeon-wire';
import { memberFromWire, rosterFromWire, rosterToWire } from './dungeon-roster';
import { encodeMessage, parseMessage } from './wire';
import type { WireMessage } from './wire';

const member = (o: Partial<WireDuelMember> = {}): WireDuelMember => ({ id: 'c1', dexId: 25, name: 'Pikachu', hp: 100, charge: 8, ammo: ['electric'], gems: [null, null, null], ...o });
const roster = (o: Partial<WireDuelRoster> = {}): WireDuelRoster => ({ members: [member()], fusionCharges: 1, potions: 2, ...o });
const roundTrip = (msg: WireMessage): WireMessage | null => parseMessage(encodeMessage(msg));

describe('PvP da Masmorra: mensagens', () => {
  it('as mensagens de progresso, equipe e jogada vão e voltam sem perder nada', () => {
    const msgs: WireMessage[] = [
      { t: 'dd-ready', ready: true, name: 'Ana' },
      { t: 'dd-start', seed: 4000000000 },
      { t: 'dd-prog', floor: 3, state: 'fighting', foes: 2 },
      { t: 'dd-prog', floor: 4, state: 'cleared', foes: 0 },
      { t: 'dd-team', roster: roster({ members: [member({ gems: [{ id: 3, kind: 'rubi', tier: 2, legendary: false }, null, { id: 9, kind: 'fenix', tier: 1, legendary: true }] })] }) },
      { t: 'dd-act', seq: 7, act: { k: 'move', x: 3, y: 4 }, sum: 123456 },
      { t: 'dd-act', seq: 8, act: { k: 'attack', x: 0, y: 6 }, sum: 1 },
      { t: 'dd-act', seq: 9, act: { k: 'switch', i: 2 }, sum: 1 },
      { t: 'dd-act', seq: 10, act: { k: 'fuse', a: 0, b: 1 }, sum: 1 },
      { t: 'dd-act', seq: 11, act: { k: 'ammo', m: 0, ammo: ['fire', 'water'] }, sum: 1 },
      { t: 'dd-act', seq: 12, act: { k: 'potion' }, sum: 1 },
      { t: 'dd-act', seq: 13, act: { k: 'end' }, sum: 1 },
      { t: 'dd-desync' },
      { t: 'dd-forfeit' },
    ];
    for (const msg of msgs) expect(roundTrip(msg)).toEqual(msg);
  });

  it('recusa jogadas fora do formato ou dos limites', () => {
    const act = (a: unknown, seq: unknown = 1, sum: unknown = 1) => parseMessage(JSON.stringify({ t: 'dd-act', seq, act: a, sum }));
    expect(act({ k: 'move', x: 7, y: 0 })).toBeNull();
    expect(act({ k: 'move', x: -1, y: 0 })).toBeNull();
    expect(act({ k: 'move', x: 1.5, y: 0 })).toBeNull();
    expect(act({ k: 'move', x: '1', y: 0 })).toBeNull();
    expect(act({ k: 'attack', x: 1 })).toBeNull();
    expect(act({ k: 'switch', i: 6 })).toBeNull();
    expect(act({ k: 'fuse', a: 0 })).toBeNull();
    expect(act({ k: 'ammo', m: 0, ammo: ['laser'] })).toBeNull();
    expect(act({ k: 'ammo', m: 0, ammo: [] })).toBeNull();
    expect(act({ k: 'ammo', m: 0, ammo: ['fire', 'water', 'grass'] })).toBeNull();
    expect(act({ k: 'teleport' })).toBeNull();
    expect(act(null)).toBeNull();
    expect(act({ k: 'end' }, -1)).toBeNull();
    expect(act({ k: 'end' }, 1.5)).toBeNull();
    expect(act({ k: 'end' }, 1, -5)).toBeNull();
    expect(act({ k: 'end' }, 1, 2 ** 33)).toBeNull();
    expect(parseMessage(JSON.stringify({ t: 'dd-start', seed: -1 }))).toBeNull();
    expect(parseMessage(JSON.stringify({ t: 'dd-start', seed: 1.5 }))).toBeNull();
    expect(parseMessage(JSON.stringify({ t: 'dd-prog', floor: 0, state: 'fighting', foes: 0 }))).toBeNull();
    expect(parseMessage(JSON.stringify({ t: 'dd-prog', floor: 2, state: 'dancing', foes: 0 }))).toBeNull();
    expect(parseMessage(JSON.stringify({ t: 'dd-ready', ready: 'sim', name: 'x' }))).toBeNull();
  });

  it('recusa equipe com números absurdos, gema fora do encaixe ou repetições', () => {
    const team = (r: unknown) => parseMessage(JSON.stringify({ t: 'dd-team', roster: r }));
    expect(team(roster())).not.toBeNull();
    expect(team(roster({ members: [] }))).toBeNull();
    expect(team(roster({ members: Array.from({ length: 7 }, (_, i) => member({ id: `m${i}` })) }))).toBeNull();
    expect(team(roster({ members: [member({ hp: -1 })] }))).toBeNull();
    expect(team(roster({ members: [member({ hp: 1e9 })] }))).toBeNull();
    expect(team(roster({ members: [member({ hp: 10.5 })] }))).toBeNull();
    expect(team(roster({ members: [member({ dexId: 0 })] }))).toBeNull();
    expect(team(roster({ members: [member({ ammo: ['laser' as never] })] }))).toBeNull();
    expect(team(roster({ members: [member({ gems: [null, null] as never })] }))).toBeNull();
    expect(team(roster({ members: [member({ id: 'dup' }), member({ id: 'dup' })] }))).toBeNull();
    expect(team(roster({ potions: 999 }))).toBeNull();
    expect(team(roster({ fusionCharges: -1 }))).toBeNull();
    // Lendária no encaixe comum e comum no encaixe lendário.
    expect(team(roster({ members: [member({ gems: [{ id: 1, kind: 'fenix', tier: 1, legendary: true }, null, null] })] }))).toBeNull();
    expect(team(roster({ members: [member({ gems: [null, null, { id: 1, kind: 'rubi', tier: 1, legendary: false }] })] }))).toBeNull();
    // Grau absurdo, tipo de gema inventado, rótulo de lendária mentindo.
    expect(team(roster({ members: [member({ gems: [{ id: 1, kind: 'rubi', tier: 99, legendary: false }, null, null] })] }))).toBeNull();
    expect(team(roster({ members: [member({ gems: [{ id: 1, kind: 'diamante' as never, tier: 1, legendary: false }, null, null] })] }))).toBeNull();
    expect(team(roster({ members: [member({ gems: [null, null, { id: 1, kind: 'rubi', tier: 1, legendary: true }] })] }))).toBeNull();
  });
});

describe('equipe do duelo pelo fio', () => {
  it('recalcula stats, tipos e arma pela espécie, sem confiar no que veio', () => {
    const local = createMember({ id: 'c1', dexId: 25, name: 'Pikachu', types: ['electric'], stats: { hp: 35, attack: 55, defense: 40, spAttack: 50, spDefense: 50, speed: 90 } });
    const built = memberFromWire(rosterToWire([local], 0, 0).members[0]!);
    expect(built).not.toBeNull();
    expect(built!.dexId).toBe(25);
    expect(built!.weapon).toBe(local.weapon);
    expect(built!.types.length).toBeGreaterThan(0);
    expect(built!.maxHp).toBeGreaterThan(0);
    expect(built!.hp).toBe(built!.maxHp);
  });

  it('a vida e a carga que chegam não passam do máximo da espécie', () => {
    const built = memberFromWire(member({ hp: 20000, charge: 500 }));
    expect(built!.hp).toBe(built!.maxHp);
    expect(built!.charge).toBe(built!.maxCharge);
    expect(memberFromWire(member({ hp: 5, charge: 3 }))).toMatchObject({ hp: 5, charge: 3, status: 'ready' });
    expect(memberFromWire(member({ hp: 0 }))).toMatchObject({ hp: 0, status: 'down' });
  });

  it('gemas equipadas entram nos números do membro', () => {
    const plain = memberFromWire(member())!;
    const gem = { id: 1, kind: 'esmeralda' as const, tier: 2, legendary: false };
    const boosted = memberFromWire(member({ gems: [gem, null, null] }))!;
    expect(boosted.maxHp).toBeGreaterThan(plain.maxHp);
  });

  it('recusa espécie sem dados no app e munição que não combina com ela', () => {
    expect(memberFromWire(member({ dexId: 1999 }))).toBeNull();
    expect(memberFromWire(member({ ammo: ['water'] }))).toBeNull();
  });

  it('equipe toda caída é recusada', () => {
    expect(rosterFromWire(roster({ members: [member({ hp: 0 })] }))).toBeNull();
    expect(rosterFromWire(roster({ members: [member({ hp: 0 }), member({ id: 'b' })] }))).not.toBeNull();
  });

  it('os dois celulares montam o mesmo duelo pelo mesmo caminho', () => {
    const mine = roster({ members: [member({ id: 'a' }), member({ id: 'b', dexId: 6, name: 'Charizard', ammo: ['fire'] })] });
    const theirs = roster({ members: [member({ id: 'x', dexId: 9, name: 'Blastoise', ammo: ['water'] })], potions: 0 });
    const build = () => startDuel(99, rosterFromWire(mine)!, rosterFromWire(theirs)!);
    const a = build();
    const b = build();
    expect(duelDigest(a)).toBe(duelDigest(b));
    expect(a.sides[1].potions).toBe(0);
    expect(a.sides[0].team).toHaveLength(2);
  });
});
