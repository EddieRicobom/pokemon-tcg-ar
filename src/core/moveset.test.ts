import { describe, expect, it } from 'vitest';
import {
  compatibleMoves, MOVESET_SIZE, moveChosenMove, movesetFor, parseLearnset, sanitizeMovesetBook, suggestMoveset, toBattleMove,
  toChosenMove, toggleChosenMove, unusableReason, withMoveset,
} from './moveset';
import type { ChosenMove } from './moveset';
import type { GameMove } from './pokemon-data';

const detail = (group: string, method: string, level = 0) => ({ level_learned_at: level, move_learn_method: { name: method }, version_group: { name: group } });
const entry = (slug: string, ...details: ReturnType<typeof detail>[]) => ({ move: { name: slug, url: `https://pokeapi.co/api/v2/move/${slug}/` }, version_group_details: details });

const move = (slug: string, type: ChosenMove['type'], power: number, extra: Partial<ChosenMove> = {}): ChosenMove => ({
  slug, name: slug, type, power, accuracy: 100, pp: 15, damageClass: 'physical', ...extra,
});

describe('parseLearnset', () => {
  it('usa só o grupo de versão mais novo e junta os métodos de cada golpe', () => {
    const json = {
      moves: [
        entry('thunder-shock', detail('red-blue', 'level-up', 1), detail('scarlet-violet', 'level-up', 1)),
        entry('thunderbolt', detail('scarlet-violet', 'machine'), detail('scarlet-violet', 'level-up', 36)),
        entry('surf', detail('sword-shield', 'machine')),
        entry('volt-tackle', detail('scarlet-violet', 'egg')),
        entry('ignored', detail('legends-arceus', 'level-up', 1)),
      ],
    };
    const learnset = parseLearnset(json)!;
    expect(learnset.versionGroup).toBe('scarlet-violet');
    expect(learnset.moves.map((m) => m.slug)).toEqual(['thunder-shock', 'thunderbolt', 'volt-tackle']);
    expect(learnset.moves[1]).toMatchObject({ methods: ['machine', 'level-up'], level: 36 });
    expect(learnset.moves[2]).toMatchObject({ methods: ['egg'], level: null });
  });

  it('sem golpes ou resposta quebrada dá null (falta de dado, não lista inventada)', () => {
    expect(parseLearnset({ moves: [] })).toBeNull();
    expect(parseLearnset(null)).toBeNull();
    expect(parseLearnset({ moves: [entry('x', detail('legends-arceus', 'level-up', 1))] })).toBeNull();
  });
});

describe('golpes escolhíveis', () => {
  const thunderbolt: GameMove = { name: 'Thunderbolt', type: 'electric', power: 90, accuracy: 100, pp: 15, damageClass: 'special' };

  it('aceita golpe de dano com todos os números', () => {
    expect(unusableReason(thunderbolt)).toBeNull();
    expect(toChosenMove('thunderbolt', thunderbolt)).toEqual({ slug: 'thunderbolt', name: 'Thunderbolt', type: 'electric', power: 90, accuracy: 100, pp: 15, damageClass: 'special' });
  });

  it('recusa status, poder ausente e dados faltando, dizendo o motivo', () => {
    expect(unusableReason({ ...thunderbolt, damageClass: 'status', power: null })).toContain('status');
    expect(unusableReason({ ...thunderbolt, power: null })).toContain('poder');
    expect(unusableReason({ ...thunderbolt, type: null })).toContain('tipo');
    expect(unusableReason({ ...thunderbolt, pp: null })).toContain('PP');
    expect(toChosenMove('x', { ...thunderbolt, pp: null })).toBeNull();
  });

  it('precisão nula vira golpe que nunca erra no motor', () => {
    expect(toBattleMove(move('aerial-ace', 'flying', 60, { accuracy: null })).accuracy).toBe(100);
    expect(toBattleMove(move('x', 'fire', 80, { damageClass: 'special' })).special).toBe(true);
  });
});

describe('montar o conjunto', () => {
  it('no máximo 4 golpes, sem repetir, e tira ao tocar de novo', () => {
    let moves: ChosenMove[] = [];
    for (const slug of ['a', 'b', 'c', 'd']) moves = toggleChosenMove(moves, move(slug, 'normal', 40)).moves;
    expect(moves).toHaveLength(MOVESET_SIZE);
    const full = toggleChosenMove(moves, move('e', 'normal', 40));
    expect(full.full).toBe(true);
    expect(full.moves).toHaveLength(4);
    expect(toggleChosenMove(moves, move('b', 'normal', 40)).moves.map((m) => m.slug)).toEqual(['a', 'c', 'd']);
  });

  it('reordena dentro dos limites', () => {
    const moves = [move('a', 'normal', 40), move('b', 'normal', 40), move('c', 'normal', 40)];
    expect(moveChosenMove(moves, 'b', -1).map((m) => m.slug)).toEqual(['b', 'a', 'c']);
    expect(moveChosenMove(moves, 'a', -1).map((m) => m.slug)).toEqual(['a', 'b', 'c']);
  });

  it('descarta o que a espécie não aprende', () => {
    const learnset = parseLearnset({ moves: [entry('a', detail('scarlet-violet', 'machine'))] })!;
    expect(compatibleMoves([move('a', 'normal', 40), move('z', 'normal', 40)], learnset).map((m) => m.slug)).toEqual(['a']);
  });

  it('a sugestão prefere golpes fortes do próprio tipo e varia os tipos', () => {
    const options = [
      move('ember', 'fire', 40), move('flamethrower', 'fire', 90, { damageClass: 'special' }), move('fire-blast', 'fire', 110, { accuracy: 85, damageClass: 'special' }),
      move('slash', 'normal', 70), move('dragon-claw', 'dragon', 80), move('air-slash', 'flying', 75, { accuracy: 95, damageClass: 'special' }),
    ];
    const picked = suggestMoveset(options, ['fire', 'flying'], false).map((m) => m.slug);
    expect(picked).toHaveLength(4);
    expect(picked[0]).toBe('fire-blast');
    expect(picked).toContain('air-slash');
    expect(picked).toContain('dragon-claw');
    expect(suggestMoveset(options.slice(0, 2), ['fire'], true)).toHaveLength(2);
  });
});

describe('caderno salvo', () => {
  it('grava, lê pela espécie e apaga com lista vazia', () => {
    let book = withMoveset({}, 'carta-1', 25, [move('a', 'electric', 40)]);
    expect(movesetFor(book, 'carta-1', 25).map((m) => m.slug)).toEqual(['a']);
    expect(movesetFor(book, 'carta-1', 26)).toEqual([]);
    expect(movesetFor(book, 'outra', 25)).toEqual([]);
    book = withMoveset(book, 'carta-1', 25, []);
    expect(book).toEqual({});
  });

  it('limpa entradas quebradas, repetidas ou além de 4', () => {
    const raw = {
      ok: { dexId: 6, moves: [move('a', 'fire', 40), move('a', 'fire', 40), move('b', 'fire', 40), move('c', 'fire', 40), move('d', 'fire', 40), move('e', 'fire', 40)] },
      semDex: { moves: [move('a', 'fire', 40)] },
      tipoRuim: { dexId: 6, moves: [{ ...move('a', 'fire', 40), type: 'laser' }] },
      ppRuim: { dexId: 6, moves: [{ ...move('a', 'fire', 40), pp: 0 }] },
    };
    const book = sanitizeMovesetBook(raw);
    expect(Object.keys(book)).toEqual(['ok']);
    expect(book.ok!.moves.map((m) => m.slug)).toEqual(['a', 'b', 'c', 'd']);
    expect(sanitizeMovesetBook('lixo')).toEqual({});
  });
});
