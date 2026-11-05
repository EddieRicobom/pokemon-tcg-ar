import { describe, expect, it } from 'vitest';
import { buildFighter } from './battle';
import { hasOwnDamage, moveSpecial, moveVisual, specialHint } from './move-specials';
import { effectSummary, parseMoveDetail, toChosenMove, unusableReason } from './moveset';
import type { ChosenMove } from './moveset';
import type { PokemonType } from './pokemon-data';
import { createDuel, duelMonFrom, lockedAction, resolveTurn, switchOptions } from './turn-battle';
import type { DuelMon, DuelState } from './turn-battle';

const fighter = (id: string, types: PokemonType[], speed: number, hp: number) =>
  buildFighter({ id, name: id, profile: { dexId: 1, types, stats: { hp, attack: 90, defense: 80, spAttack: 90, spDefense: 80, speed } }, card: null, gameMoves: [] });
const NO_EFFECT = { priority: 0, ailment: null, ailmentChance: 0, flinchChance: 0, statChanges: [], statChance: 0, drain: 0, healing: 0, critRate: 0, minHits: 1, maxHits: 1 };
const move = (slug: string, type: PokemonType, power: number, extra: Partial<ChosenMove> = {}): ChosenMove => ({
  slug, name: slug, type, power, accuracy: 100, pp: 10, damageClass: 'physical', ...NO_EFFECT, ...extra,
});
const status = (slug: string, type: PokemonType, extra: Partial<ChosenMove> = {}): ChosenMove => move(slug, type, 0, { damageClass: 'status', accuracy: null, ...extra });
const mon = (name: string, types: PokemonType[], speed: number, moves: ChosenMove[], hp = 200): DuelMon => duelMonFrom(fighter(name, types, speed, hp), moves);
const one = (mine: DuelMon, theirs: DuelMon): DuelState => createDuel({ name: 'Você', mons: [mine] }, { name: 'Rival', mons: [theirs] });
const always = (v: number) => () => v;
const tackle = move('tackle', 'normal', 40);
const first = { kind: 'move', move: 0 } as const;
const turn = (state: DuelState, rng = always(0.5)) => resolveTurn(state, first, first, rng);

describe('tabela de efeitos', () => {
  it('conhece os golpes pelo nome oficial', () => {
    expect(moveSpecial('protect')?.kind).toBe('protect');
    expect(moveSpecial('tackle')).toBeNull();
    expect(hasOwnDamage(moveSpecial('seismic-toss'))).toBe(true);
    expect(specialHint(moveSpecial('hyper-beam'))).toContain('parado');
  });

  it('golpe sem poder mas com regra própria pode ser escolhido', () => {
    const json = { name: 'seismic-toss', type: { name: 'fighting' }, damage_class: { name: 'physical' }, power: null, accuracy: 100, pp: 20, priority: 0, stat_changes: [], meta: null };
    const detail = parseMoveDetail(json)!;
    expect(unusableReason(detail, 'seismic-toss')).toBeNull();
    const chosen = toChosenMove('seismic-toss', detail)!;
    expect(chosen.power).toBe(1);
    expect(effectSummary(chosen)[0]).toContain('Dano fixo');
  });

  it('status com regra própria deixa de ser recusado, mesmo vindo de dados guardados', () => {
    const json = { name: 'sunny-day', type: { name: 'fire' }, damage_class: { name: 'status' }, power: null, accuracy: null, pp: 5, priority: 0, stat_changes: [], meta: { category: { name: 'whole-field-effect' }, ailment: { name: 'none' } } };
    expect(toChosenMove('sunny-day', parseMoveDetail(json)!)).not.toBeNull();
    expect(unusableReason({ ...parseMoveDetail(json)!, noSimulatedEffect: true }, 'sunny-day')).toBeNull();
  });
});

describe('efeitos no duelo', () => {
  it('Proteger bloqueia o golpe do turno, e repetir pode falhar', () => {
    const state = one(mon('A', ['normal'], 100, [status('protect', 'normal', { priority: 4 })]), mon('B', ['normal'], 50, [tackle]));
    const a = turn(state);
    expect(a.events.some((e) => e.kind === 'protected')).toBe(true);
    expect(a.state.sides[0].state[0]!.hp).toBe(a.state.sides[0].mons[0]!.fighter.maxHp);
    expect(a.state.sides[0].state[0]!.protecting).toBe(false);
    const b = turn(a.state, always(0.9));
    expect(b.events.some((e) => e.kind === 'fail')).toBe(true);
  });

  it('Voar some num turno, escapa do golpe e acerta no seguinte, sem outra escolha', () => {
    const state = one(mon('A', ['flying'], 100, [move('fly', 'flying', 90), tackle]), mon('B', ['normal'], 50, [tackle]));
    const a = turn(state);
    expect(a.events.some((e) => e.kind === 'charge')).toBe(true);
    expect(a.events.some((e) => e.kind === 'miss')).toBe(true);
    expect(a.state.sides[0].state[0]!.pp[0]).toBe(9);
    expect(lockedAction(a.state, 0)).toEqual({ kind: 'move', move: 0 });
    const b = turn(a.state);
    expect(b.events.some((e) => e.kind === 'hit' && e.side === 1)).toBe(true);
    expect(b.state.sides[0].state[0]!.pp[0]).toBe(9);
    expect(lockedAction(b.state, 0)).toBeNull();
  });

  it('Raio Solar dispara na hora com sol', () => {
    const state = one(mon('A', ['grass'], 100, [move('solar-beam', 'grass', 120, { damageClass: 'special' })]), mon('B', ['normal'], 50, [tackle]));
    state.weather = { kind: 'sun', turns: 5 };
    expect(turn(state).events.some((e) => e.kind === 'charge')).toBe(false);
  });

  it('Hiperraio deixa um turno parado depois de acertar', () => {
    const state = one(mon('A', ['normal'], 100, [move('hyper-beam', 'normal', 150, { damageClass: 'special' })]), mon('B', ['normal'], 50, [tackle], 400));
    const a = turn(state);
    expect(a.state.sides[0].state[0]!.recharge).toBe(true);
    const b = turn(a.state);
    expect(b.events.some((e) => e.kind === 'skip' && e.cause === 'recharge')).toBe(true);
    expect(b.state.sides[0].state[0]!.pp[0]).toBe(a.state.sides[0].state[0]!.pp[0]);
  });

  it('dano fixo ignora atributos e respeita imunidade de tipo', () => {
    const state = one(mon('A', ['fighting'], 100, [move('seismic-toss', 'fighting', 1)]), mon('B', ['normal'], 50, [status('growl', 'normal')]));
    const { events } = turn(state);
    expect(events.find((e) => e.kind === 'hit')).toMatchObject({ damage: 50 });
    const ghost = one(mon('A', ['fighting'], 100, [move('seismic-toss', 'fighting', 1)]), mon('B', ['ghost'], 50, [status('growl', 'normal')]));
    expect(turn(ghost).events.some((e) => e.kind === 'immune')).toBe(true);
  });

  it('nocaute direto derruba se acertar; Super Presa tira metade', () => {
    const ohko = one(mon('A', ['normal'], 100, [move('guillotine', 'normal', 1, { accuracy: 30 })]), mon('B', ['normal'], 50, [tackle]));
    expect(turn(ohko, always(0.1)).state.winner).toBe(0);
    const fang = one(mon('A', ['normal'], 100, [move('super-fang', 'normal', 1)]), mon('B', ['normal'], 50, [status('growl', 'normal')]));
    const max = fang.sides[1].mons[0]!.fighter.maxHp;
    expect(turn(fang).state.sides[1].state[0]!.hp).toBe(max - Math.floor(max / 2));
  });

  it('Explosão derruba quem usa, mesmo errando', () => {
    const state = one(mon('A', ['normal'], 100, [move('explosion', 'normal', 250)]), mon('B', ['normal'], 50, [tackle], 900));
    expect(turn(state, always(0.5)).state.sides[0].state[0]!.hp).toBe(0);
    const miss = one(mon('A', ['normal'], 100, [move('explosion', 'normal', 250, { accuracy: 10 })]), mon('B', ['normal'], 50, [tackle], 900));
    expect(turn(miss, always(0.9)).state.sides[0].state[0]!.hp).toBe(0);
  });

  it('o clima muda o dano e acaba em 5 turnos; areia machuca no fim do turno', () => {
    const fire = move('ember', 'fire', 60, { damageClass: 'special' });
    const plain = turn(one(mon('A', ['normal'], 100, [fire]), mon('B', ['normal'], 50, [status('growl', 'normal')], 800)));
    const sunny = one(mon('A', ['normal'], 100, [fire]), mon('B', ['normal'], 50, [status('growl', 'normal')], 800));
    sunny.weather = { kind: 'sun', turns: 5 };
    const lost = (r: typeof plain) => r.state.sides[1].mons[0]!.fighter.maxHp - r.state.sides[1].state[0]!.hp;
    expect(lost(turn(sunny))).toBeGreaterThan(lost(plain));

    let state = one(mon('A', ['rock'], 100, [status('sandstorm', 'rock')]), mon('B', ['normal'], 50, [status('growl', 'normal')]));
    let result = turn(state);
    expect(result.state.weather?.kind).toBe('sand');
    expect(result.events.some((e) => e.kind === 'residual' && e.cause === 'weather' && e.side === 1)).toBe(true);
    expect(result.events.some((e) => e.kind === 'residual' && e.cause === 'weather' && e.side === 0)).toBe(false);
    state = result.state;
    for (let i = 0; i < 4; i++) {
      result = turn(state);
      state = result.state;
    }
    expect(state.weather).toBeNull();
    expect(result.events.some((e) => e.kind === 'weather' && e.weather === null)).toBe(true);
  });

  it('Refletir corta o dano físico pela metade', () => {
    const base = one(mon('A', ['normal'], 100, [tackle]), mon('B', ['normal'], 50, [status('growl', 'normal')], 800));
    const screened = one(mon('A', ['normal'], 100, [tackle]), mon('B', ['normal'], 50, [status('growl', 'normal')], 800));
    screened.sides[1].screens.reflect = 5;
    const lost = (s: DuelState) => { const r = turn(s); return r.state.sides[1].mons[0]!.fighter.maxHp - r.state.sides[1].state[0]!.hp; };
    expect(lost(screened)).toBeLessThan(lost(base));
  });

  it('Semente drena no fim do turno e não pega em planta', () => {
    const seed = status('leech-seed', 'grass', { accuracy: 100 });
    const state = one(mon('A', ['normal'], 100, [seed], 200), mon('B', ['normal'], 50, [status('growl', 'normal')]));
    const { events, state: next } = turn(state);
    expect(next.sides[1].state[0]!.seeded).toBe(true);
    expect(events.some((e) => e.kind === 'residual' && e.cause === 'leech')).toBe(true);
    const plant = one(mon('A', ['normal'], 100, [seed]), mon('B', ['grass'], 50, [status('growl', 'normal')]));
    expect(turn(plant).events.some((e) => e.kind === 'immune')).toBe(true);
  });

  it('Tóxico piora a cada turno', () => {
    const toxic = status('toxic', 'poison', { accuracy: 100, ailment: 'poison', ailmentChance: 100 });
    const state = one(mon('A', ['normal'], 100, [toxic]), mon('B', ['normal'], 50, [status('growl', 'normal')], 800));
    const a = turn(state);
    const b = turn(a.state);
    const hits = (r: typeof a) => r.events.filter((e) => e.kind === 'residual').map((e) => (e as { damage: number }).damage);
    expect(hits(b)[0]!).toBeGreaterThan(hits(a)[0]!);
  });

  it('preso não troca e perde PS por turnos', () => {
    const wrap = move('wrap', 'normal', 15);
    const state = createDuel({ name: 'Você', mons: [mon('A', ['normal'], 100, [wrap])] }, { name: 'Rival', mons: [mon('B', ['normal'], 50, [status('growl', 'normal')]), mon('C', ['normal'], 50, [tackle])] });
    const { state: next, events } = turn(state);
    expect(events.some((e) => e.kind === 'trapped')).toBe(true);
    expect(events.some((e) => e.kind === 'residual' && e.cause === 'trap')).toBe(true);
    expect(switchOptions(next, 1)).toEqual([]);
  });

  it('Descansar cura tudo e dorme', () => {
    const state = one(mon('A', ['normal'], 100, [status('rest', 'psychic')]), mon('B', ['normal'], 50, [status('growl', 'normal')]));
    state.sides[0].state[0]!.hp = 5;
    const { state: next } = turn(state);
    expect(next.sides[0].state[0]!.hp).toBe(next.sides[0].mons[0]!.fighter.maxHp);
    expect(next.sides[0].state[0]!.status).toBe('sleep');
  });
});

describe('aparência do golpe', () => {
  it('segue o nome do golpe e cai na categoria quando não reconhece', () => {
    expect(moveVisual('thunder-punch', 'physical')).toBe('punch');
    expect(moveVisual('crunch', 'physical')).toBe('bite');
    expect(moveVisual('slash', 'physical')).toBe('slash');
    expect(moveVisual('hyper-beam', 'special')).toBe('beam');
    expect(moveVisual('earthquake', 'physical')).toBe('wave');
    expect(moveVisual('blizzard', 'special')).toBe('storm');
    expect(moveVisual('pound', 'physical')).toBe('slam');
    expect(moveVisual('confusion', 'special')).toBe('orb');
    expect(moveVisual('growl', 'status')).toBe('aura');
  });
});
