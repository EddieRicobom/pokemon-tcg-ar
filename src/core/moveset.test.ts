import { describe, expect, it } from 'vitest';
import {
  compatibleMoves, coverageGaps, effectSummary, MOVESET_SIZE, moveChosenMove, movesetFor, parseLearnset, parseMoveDetail, sanitizeMovesetBook,
  suggestMoveset, toBattleMove, toChosenMove, toggleChosenMove, unusableReason, withMoveset,
} from './moveset';
import type { ChosenMove, MoveDetail } from './moveset';

const detail = (group: string, method: string, level = 0) => ({ level_learned_at: level, move_learn_method: { name: method }, version_group: { name: group } });
const entry = (slug: string, ...details: ReturnType<typeof detail>[]) => ({ move: { name: slug, url: `https://pokeapi.co/api/v2/move/${slug}/` }, version_group_details: details });

const NO_EFFECT = { priority: 0, ailment: null, ailmentChance: 0, flinchChance: 0, statChanges: [], statChance: 0, drain: 0, healing: 0, critRate: 0, minHits: 1, maxHits: 1 };
const move = (slug: string, type: ChosenMove['type'], power: number, extra: Partial<ChosenMove> = {}): ChosenMove => ({
  slug, name: slug, type, power, accuracy: 100, pp: 15, damageClass: 'physical', ...NO_EFFECT, ...extra,
});

/** Resposta de `/move/{id}` no formato da PokéAPI. */
function apiMove(name: string, opts: {
  type?: string; power?: number | null; accuracy?: number | null; pp?: number; damageClass?: string; priority?: number; target?: string;
  statChanges?: { change: number; stat: string }[]; meta?: Record<string, unknown> | null;
} = {}): unknown {
  const meta = opts.meta === null ? null : {
    ailment: { name: 'none' }, ailment_chance: 0, category: { name: 'damage' }, crit_rate: 0, drain: 0, flinch_chance: 0, healing: 0,
    max_hits: null, min_hits: null, max_turns: null, min_turns: null, stat_chance: 0, ...opts.meta,
  };
  return {
    name, names: [], type: { name: opts.type ?? 'normal' }, power: opts.power === undefined ? 40 : opts.power, accuracy: opts.accuracy === undefined ? 100 : opts.accuracy,
    pp: opts.pp ?? 20, damage_class: { name: opts.damageClass ?? 'physical' }, priority: opts.priority ?? 0, target: { name: opts.target ?? 'selected-pokemon' },
    stat_changes: (opts.statChanges ?? []).map((c) => ({ change: c.change, stat: { name: c.stat } })), meta,
  };
}
const parsed = (json: unknown): MoveDetail => parseMoveDetail(json)!;

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

describe('efeitos vindos da PokéAPI', () => {
  it('golpe de status que causa condição pode ser escolhido', () => {
    const wave = parsed(apiMove('thunder-wave', { type: 'electric', power: null, accuracy: 90, damageClass: 'status', meta: { ailment: { name: 'paralysis' }, category: { name: 'ailment' } } }));
    expect(unusableReason(wave)).toBeNull();
    const chosen = toChosenMove('thunder-wave', wave)!;
    expect(chosen).toMatchObject({ damageClass: 'status', power: 0, ailment: 'paralysis', ailmentChance: 100, accuracy: 90 });
    expect(effectSummary(chosen)).toEqual(['Paralisa']);
  });

  it('estágios: em si (Dança das Espadas, Close Combat) e no alvo com chance (Psychic)', () => {
    const sd = parsed(apiMove('swords-dance', { power: null, accuracy: null, damageClass: 'status', target: 'user', statChanges: [{ change: 2, stat: 'attack' }], meta: { category: { name: 'net-good-stats' } } }));
    expect(sd.effect.statChanges).toEqual([{ stat: 'attack', change: 2, target: 'self' }]);
    expect(sd.effect.statChance).toBe(100);
    const psychic = parsed(apiMove('psychic', { type: 'psychic', power: 90, damageClass: 'special', statChanges: [{ change: -1, stat: 'special-defense' }], meta: { category: { name: 'damage+lower' }, stat_chance: 10 } }));
    expect(psychic.effect.statChanges[0]).toEqual({ stat: 'spDefense', change: -1, target: 'foe' });
    expect(effectSummary(psychic.effect)).toEqual(['Def. Esp. −1 no alvo (10%)']);
    const cc = parsed(apiMove('close-combat', { type: 'fighting', power: 120, statChanges: [{ change: -1, stat: 'defense' }, { change: -1, stat: 'special-defense' }], meta: { category: { name: 'damage+raise' } } }));
    expect(cc.effect.statChanges.every((c) => c.target === 'self')).toBe(true);
  });

  it('prioridade, dreno, recuo, cura, vários golpes e crítico', () => {
    expect(parsed(apiMove('quick-attack', { priority: 1 })).effect.priority).toBe(1);
    expect(parsed(apiMove('giga-drain', { type: 'grass', power: 75, damageClass: 'special', meta: { drain: 50, category: { name: 'damage+heal' } } })).effect.drain).toBe(50);
    expect(parsed(apiMove('double-edge', { power: 120, meta: { drain: -33 } })).effect.drain).toBe(-33);
    const recover = parsed(apiMove('recover', { power: null, accuracy: null, damageClass: 'status', meta: { healing: 50, category: { name: 'heal' } } }));
    expect(unusableReason(recover)).toBeNull();
    expect(recover.effect.healing).toBe(50);
    const kick = parsed(apiMove('double-kick', { type: 'fighting', power: 30, meta: { min_hits: 2, max_hits: 2 } }));
    expect(kick.effect).toMatchObject({ minHits: 2, maxHits: 2 });
    expect(effectSummary(kick.effect)).toEqual(['2 golpes']);
    expect(effectSummary(parsed(apiMove('slash', { power: 70, meta: { crit_rate: 1 } })).effect)).toEqual(['Crítico mais fácil']);
  });

  it('efeito que o duelo não simula: status bloqueado, dano especial bloqueado, dano com aviso', () => {
    const protect = parsed(apiMove('protect', { power: null, accuracy: null, damageClass: 'status', priority: 4, meta: { category: { name: 'unique' } } }));
    expect(unusableReason(protect)).toContain('não simulado');
    expect(toChosenMove('protect', protect)).toBeNull();
    expect(unusableReason(parsed(apiMove('growl', { power: null, damageClass: 'status', meta: null })))).toContain('não simulado');
    expect(unusableReason(parsed(apiMove('seismic-toss', { power: null, meta: { category: { name: 'unique' } } })))).toContain('Dano especial');
    const outrage = parsed(apiMove('outrage', { type: 'dragon', power: 120, meta: { min_turns: 2, max_turns: 3 } }));
    expect(unusableReason(outrage)).toBeNull();
    expect(outrage.unsupported).toContain('efeito por vários turnos');
  });

  it('falta de tipo ou PP impede a escolha', () => {
    expect(unusableReason({ ...parsed(apiMove('x')), type: null })).toContain('tipo');
    expect(unusableReason({ ...parsed(apiMove('x')), pp: null })).toContain('PP');
  });

  it('o motor automático recebe golpe que nunca erra como precisão 100', () => {
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

  it('a sugestão usa só golpes de dano, prefere os fortes do próprio tipo e varia os tipos', () => {
    const options = [
      move('ember', 'fire', 40), move('flamethrower', 'fire', 90, { damageClass: 'special' }), move('fire-blast', 'fire', 110, { accuracy: 85, damageClass: 'special' }),
      move('slash', 'normal', 70), move('dragon-claw', 'dragon', 80), move('air-slash', 'flying', 75, { accuracy: 95, damageClass: 'special' }),
      move('will-o-wisp', 'fire', 0, { damageClass: 'status', ailment: 'burn', ailmentChance: 100 }),
    ];
    const picked = suggestMoveset(options, ['fire', 'flying'], false).map((m) => m.slug);
    expect(picked).toEqual(['fire-blast', 'air-slash', 'flamethrower', 'dragon-claw']);
    expect(suggestMoveset(options.slice(0, 2), ['fire'], true)).toHaveLength(2);
  });

  it('aviso de cobertura: tipos que nenhum golpe de dano acerta com super efetivo', () => {
    const gaps = coverageGaps([move('ember', 'fire', 40), move('will-o-wisp', 'fire', 0, { damageClass: 'status' })]);
    expect(gaps).not.toContain('grass');
    expect(gaps).toContain('water');
    expect(coverageGaps([move('ember', 'fire', 40), move('surf', 'water', 90), move('earthquake', 'ground', 100)])).not.toContain('fire');
    expect(coverageGaps([])).toHaveLength(18);
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

  it('limpa entradas quebradas, repetidas ou além de 4, e completa efeitos ausentes', () => {
    const { priority: _p, ailment: _a, statChanges: _s, ...old } = move('velho', 'fire', 40);
    void _p; void _a; void _s;
    const raw = {
      ok: { dexId: 6, moves: [move('a', 'fire', 40), move('a', 'fire', 40), move('b', 'fire', 40), move('c', 'fire', 40), move('d', 'fire', 40), move('e', 'fire', 40)] },
      antigo: { dexId: 6, moves: [old, move('wisp', 'fire', 0, { damageClass: 'status', ailment: 'burn', ailmentChance: 100 })] },
      semDex: { moves: [move('a', 'fire', 40)] },
      tipoRuim: { dexId: 6, moves: [{ ...move('a', 'fire', 40), type: 'laser' }] },
      ppRuim: { dexId: 6, moves: [{ ...move('a', 'fire', 40), pp: 0 }] },
      danoSemPoder: { dexId: 6, moves: [move('a', 'fire', 0)] },
      estagioRuim: { dexId: 6, moves: [move('a', 'fire', 40, { statChanges: [{ stat: 'attack', change: 9, target: 'self' }] })] },
    };
    const book = sanitizeMovesetBook(raw);
    expect(Object.keys(book).sort()).toEqual(['antigo', 'ok']);
    expect(book.ok!.moves.map((m) => m.slug)).toEqual(['a', 'b', 'c', 'd']);
    expect(book.antigo!.moves[0]).toMatchObject({ slug: 'velho', priority: 0, ailment: null, statChanges: [] });
    expect(book.antigo!.moves[1]).toMatchObject({ damageClass: 'status', power: 0, ailment: 'burn' });
    expect(sanitizeMovesetBook('lixo')).toEqual({});
  });
});
