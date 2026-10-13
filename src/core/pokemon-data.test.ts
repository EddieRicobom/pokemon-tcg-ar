import { describe, expect, it } from 'vitest';
import {
  easeOutCubic, energyType, parseCardBattleInfo, parseGameMove, parsePokeApiProfile, pickLevelUpMoves, prettyMoveName, rowProgress,
  statFraction,
} from './pokemon-data';

const pikachu = {
  types: [{ slot: 1, type: { name: 'electric' } }],
  stats: [
    { base_stat: 35, stat: { name: 'hp' } }, { base_stat: 55, stat: { name: 'attack' } }, { base_stat: 40, stat: { name: 'defense' } },
    { base_stat: 50, stat: { name: 'special-attack' } }, { base_stat: 50, stat: { name: 'special-defense' } }, { base_stat: 90, stat: { name: 'speed' } },
  ],
};

describe('PokéAPI: atributos e tipos', () => {
  it('lê os seis atributos-base e o tipo', () => {
    expect(parsePokeApiProfile(pikachu, 25)).toEqual({
      dexId: 25, types: ['electric'], stats: { hp: 35, attack: 55, defense: 40, spAttack: 50, spDefense: 50, speed: 90 },
    });
  });
  it('mantém a ordem dos tipos pelo slot', () => {
    const json = { ...pikachu, types: [{ slot: 2, type: { name: 'flying' } }, { slot: 1, type: { name: 'fire' } }] };
    expect(parsePokeApiProfile(json, 6)?.types).toEqual(['fire', 'flying']);
  });
  it('resposta incompleta ou inválida vira null (não completa com zero)', () => {
    expect(parsePokeApiProfile({ stats: pikachu.stats.slice(0, 5), types: [] }, 25)).toBeNull();
    expect(parsePokeApiProfile(null, 25)).toBeNull();
    expect(parsePokeApiProfile({ types: [] }, 25)).toBeNull();
  });
  it('ignora tipos desconhecidos', () => {
    expect(parsePokeApiProfile({ ...pikachu, types: [{ slot: 1, type: { name: 'stellar' } }] }, 25)?.types).toEqual([]);
  });
  it('fração da barra fica entre 0 e 1', () => {
    expect(statFraction(100)).toBe(0.5);
    expect(statFraction(255)).toBe(1);
    expect(statFraction(-4)).toBe(0);
  });
});

function moveEntry(name: string, details: [string, string, number][]) {
  return {
    move: { name, url: `https://pokeapi.co/api/v2/move/${name}/` },
    version_group_details: details.map(([group, method, level]) => ({
      version_group: { name: group }, move_learn_method: { name: method }, level_learned_at: level,
    })),
  };
}

describe('PokéAPI: escolha dos golpes do jogo', () => {
  it('pega os golpes por nível mais altos (até o nível 50) da geração mais nova', () => {
    const json = {
      moves: [
        moveEntry('thunder-shock', [['red-blue', 'level-up', 1], ['scarlet-violet', 'level-up', 1]]),
        moveEntry('quick-attack', [['scarlet-violet', 'level-up', 10]]),
        moveEntry('thunderbolt', [['red-blue', 'level-up', 26], ['scarlet-violet', 'level-up', 24]]),
        moveEntry('agility', [['scarlet-violet', 'level-up', 32]]),
        moveEntry('thunder', [['scarlet-violet', 'level-up', 42]]),
        moveEntry('light-screen', [['scarlet-violet', 'level-up', 50]]),
        moveEntry('volt-tackle', [['scarlet-violet', 'level-up', 60]]),
        moveEntry('surf', [['scarlet-violet', 'machine', 0]]),
        moveEntry('only-old', [['red-blue', 'level-up', 49]]),
      ],
    };
    expect(pickLevelUpMoves(json).map((m) => m.name)).toEqual(['light-screen', 'thunder', 'agility', 'thunderbolt']);
  });
  it('não depende da ordem em que os grupos aparecem na resposta', () => {
    const json = { moves: [moveEntry('a', [['scarlet-violet', 'level-up', 5], ['red-blue', 'level-up', 6]]), moveEntry('b', [['red-blue', 'level-up', 9]])] };
    expect(pickLevelUpMoves(json).map((m) => m.name)).toEqual(['a']);
  });
  it('sem golpes por nível, devolve lista vazia', () => {
    expect(pickLevelUpMoves({ moves: [moveEntry('x', [['red-blue', 'machine', 0]])] })).toEqual([]);
    expect(pickLevelUpMoves({})).toEqual([]);
  });
  it('nome legível', () => {
    expect(prettyMoveName('thunder-shock')).toBe('Thunder Shock');
  });
});

describe('PokéAPI: um golpe', () => {
  it('usa o nome em português quando existe e lê poder, precisão, PP, tipo e classe', () => {
    const move = parseGameMove({
      name: 'thunderbolt', power: 90, accuracy: 100, pp: 15, type: { name: 'electric' }, damage_class: { name: 'special' },
      names: [{ name: 'Thunderbolt', language: { name: 'en' } }, { name: 'Trovoada', language: { name: 'pt-BR' } }],
    });
    expect(move).toEqual({ name: 'Trovoada', type: 'electric', power: 90, accuracy: 100, pp: 15, damageClass: 'special' });
  });
  it('golpe de status não tem poder; sem nome traduzido usa o slug', () => {
    expect(parseGameMove({ name: 'thunder-wave', power: null, accuracy: 90, pp: 20, type: { name: 'electric' }, damage_class: { name: 'status' } }))
      .toMatchObject({ name: 'Thunder Wave', power: null, damageClass: 'status' });
  });
  it('resposta sem nome é inválida', () => {
    expect(parseGameMove({ power: 40 })).toBeNull();
  });
});

describe('TCGdex: dados de batalha da carta', () => {
  it('lê PS, tipo, ataques, fraqueza e recuo', () => {
    const info = parseCardBattleInfo({
      hp: 60, types: ['Lightning'], retreat: 1,
      attacks: [
        { name: 'Gnaw', cost: ['Colorless'], damage: 10 },
        { name: 'Thunder Jolt', cost: ['Lightning', 'Colorless'], damage: '30', effect: 'Flip a coin.' },
      ],
      weaknesses: [{ type: 'Fighting', value: '×2' }],
    });
    expect(info).toEqual({
      hp: 60, types: ['Lightning'], retreat: 1,
      attacks: [
        { name: 'Gnaw', cost: ['Colorless'], damage: '10', effect: undefined },
        { name: 'Thunder Jolt', cost: ['Lightning', 'Colorless'], damage: '30', effect: 'Flip a coin.' },
      ],
      weaknesses: [{ type: 'Fighting', value: '×2' }],
    });
  });
  it('carta de Treinador (sem ataques) devolve lista vazia, sem erro', () => {
    expect(parseCardBattleInfo({ name: 'Potion' })).toEqual({ hp: undefined, types: [], attacks: [], weaknesses: [], retreat: undefined });
  });
  it('energia vira tipo do jogo', () => {
    expect(energyType('Lightning')).toBe('electric');
    expect(energyType('Colorless')).toBe('normal');
    expect(energyType('???')).toBeNull();
  });
});

describe('animação', () => {
  it('easeOutCubic vai de 0 a 1 e é monotônico', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(easeOutCubic(2)).toBe(1);
  });
  it('cada linha começa depois da anterior', () => {
    expect(rowProgress(0, 0)).toBe(0);
    expect(rowProgress(100, 0)).toBeGreaterThan(rowProgress(100, 3));
    expect(rowProgress(2000, 5)).toBe(1);
  });
});
