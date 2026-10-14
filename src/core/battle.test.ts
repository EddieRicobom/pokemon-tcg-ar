import { describe, expect, it } from 'vitest';
import {
  buildFighter, calculateDamage, cardDamageToPower, effectivenessLabel, effectivenessTone, FALLBACK_MOVE, parseCardDamage, seededRng,
  simulateBattle, TYPE_CHART, typeEffectiveness,
} from './battle';
import type { Fighter } from './battle';
import { POKEMON_TYPES } from './pokemon-data';
import type { BaseStats } from './pokemon-data';

const stats = (over: Partial<BaseStats> = {}): BaseStats => ({ hp: 80, attack: 80, defense: 80, spAttack: 80, spDefense: 80, speed: 80, ...over });

function fighter(over: Partial<Fighter> = {}): Fighter {
  return {
    id: 'a', name: 'A', types: ['normal'], maxHp: 150, attack: 100, defense: 100, spAttack: 100, spDefense: 100, speed: 100,
    moves: [{ name: 'Golpe', type: 'normal', power: 60, accuracy: 100, special: false, source: 'jogo' }], quality: 'completo', notes: [], ...over,
  };
}

describe('tabela de tipos', () => {
  it('cobre os 18 tipos e só usa tipos válidos', () => {
    expect(Object.keys(TYPE_CHART).sort()).toEqual([...POKEMON_TYPES].sort());
    for (const row of Object.values(TYPE_CHART)) {
      for (const [type, value] of Object.entries(row)) {
        expect(POKEMON_TYPES).toContain(type);
        expect([0, 0.5, 2]).toContain(value);
      }
    }
  });

  it('conhece os clássicos', () => {
    expect(typeEffectiveness('water', ['fire'])).toBe(2);
    expect(typeEffectiveness('fire', ['water'])).toBe(0.5);
    expect(typeEffectiveness('electric', ['ground'])).toBe(0);
    expect(typeEffectiveness('normal', ['ghost'])).toBe(0);
    expect(typeEffectiveness('dragon', ['fairy'])).toBe(0);
    expect(typeEffectiveness('ground', ['flying'])).toBe(0);
    expect(typeEffectiveness('fighting', ['normal'])).toBe(2);
  });

  it('multiplica os dois tipos do defensor', () => {
    expect(typeEffectiveness('ice', ['dragon', 'flying'])).toBe(4);
    expect(typeEffectiveness('grass', ['fire', 'flying'])).toBe(0.25);
    expect(typeEffectiveness('electric', ['water', 'ground'])).toBe(0);
    expect(typeEffectiveness('fire', [])).toBe(1);
  });

  it('classifica e descreve a efetividade', () => {
    expect(effectivenessTone(0)).toBe('immune');
    expect(effectivenessTone(0.5)).toBe('weak');
    expect(effectivenessTone(1)).toBe('neutral');
    expect(effectivenessTone(4)).toBe('strong');
    expect(effectivenessLabel(1)).toBeNull();
    expect(effectivenessLabel(2)).toBe('Super efetivo!');
    expect(effectivenessLabel(0.5)).toBe('Pouco efetivo…');
    expect(effectivenessLabel(0)).toBe('Não afeta…');
  });
});

describe('dano da carta', () => {
  it('lê o número do dano impresso', () => {
    expect(parseCardDamage('30')).toBe(30);
    expect(parseCardDamage('60+')).toBe(60);
    expect(parseCardDamage('20×')).toBe(20);
    expect(parseCardDamage(undefined)).toBeNull();
    expect(parseCardDamage('')).toBeNull();
    expect(parseCardDamage('×2')).toBeNull();
    expect(parseCardDamage('0')).toBeNull();
  });

  it('converte para poder crescente e limitado', () => {
    expect(cardDamageToPower(10)).toBe(34);
    expect(cardDamageToPower(60)).toBeGreaterThan(cardDamageToPower(30));
    expect(cardDamageToPower(500)).toBe(150);
    expect(cardDamageToPower(1)).toBe(30);
  });
});

describe('buildFighter', () => {
  it('usa atributos do jogo no nível 50', () => {
    const f = buildFighter({ id: 'x', name: 'Pikachu', profile: { dexId: 25, types: ['electric'], stats: stats({ hp: 35, speed: 90 }) }, card: null, gameMoves: [] });
    expect(f.maxHp).toBe(Math.floor((101 * 50) / 100) + 60);
    expect(f.speed).toBe(Math.floor((211 * 50) / 100) + 5);
    expect(f.types).toEqual(['electric']);
  });

  it('junta ataques da carta e golpes do jogo com poder', () => {
    const f = buildFighter({
      id: 'x', name: 'Charmander',
      profile: { dexId: 4, types: ['fire'], stats: stats({ attack: 52, spAttack: 60 }) },
      card: { types: ['Fire'], attacks: [{ name: 'Ember', cost: ['Fire', 'Colorless'], damage: '30' }, { name: 'Crescer', cost: ['Fire'] }], weaknesses: [] },
      gameMoves: [
        { name: 'Arranhão', type: 'normal', power: 40, accuracy: 100, pp: 35, damageClass: 'physical' },
        { name: 'Rugido', type: 'normal', power: null, accuracy: 100, pp: 40, damageClass: 'status' },
      ],
    });
    expect(f.moves.map((m) => `${m.source}:${m.name}`)).toEqual(['carta:Ember', 'jogo:Arranhão']);
    expect(f.moves[0]).toMatchObject({ type: 'fire', special: true });
    expect(f.moves[1]).toMatchObject({ special: false });
    expect(f.quality).toBe('completo');
  });

  it('ataque da carta sem energia colorida usa o tipo da carta', () => {
    const f = buildFighter({
      id: 'x', name: 'Eevee', profile: null,
      card: { types: ['Colorless'], attacks: [{ name: 'Tackle', cost: ['Colorless'], damage: '20' }], weaknesses: [] }, gameMoves: [],
    });
    expect(f.moves[0]?.type).toBe('normal');
  });

  it('sem dados nenhuns: valores neutros, Investida e aviso honesto', () => {
    const f = buildFighter({ id: 'x', name: 'Desconhecido', profile: null, card: null, gameMoves: [] });
    expect(f.quality).toBe('sem-dados');
    expect(f.moves).toEqual([FALLBACK_MOVE]);
    expect(f.types).toEqual(['normal']);
    expect(f.notes.length).toBeGreaterThan(0);
  });

  it('só a carta carregada: parcial, com tipo vindo da carta', () => {
    const f = buildFighter({
      id: 'x', name: 'Squirtle', profile: null,
      card: { types: ['Water'], attacks: [{ name: 'Bubble', cost: ['Water'], damage: '20' }], weaknesses: [] }, gameMoves: [],
    });
    expect(f.quality).toBe('parcial');
    expect(f.types).toEqual(['water']);
    expect(f.notes.join(' ')).toContain('atributos');
  });
});

describe('calculateDamage', () => {
  const always = () => 0.5; // acerta, sem crítico (0,5 > 1/16), sorteio de dano = 0,925

  it('tipo e STAB mudam o dano', () => {
    const attacker = fighter({ types: ['water'] });
    const move = { name: 'Jato', type: 'water' as const, power: 60, accuracy: 100, special: false, source: 'jogo' as const };
    const normal = calculateDamage(attacker, fighter({ types: ['normal'] }), move, always);
    const strong = calculateDamage(attacker, fighter({ types: ['fire'] }), move, always);
    const weak = calculateDamage(attacker, fighter({ types: ['grass'] }), move, always);
    expect(strong.damage).toBeGreaterThan(normal.damage * 1.8);
    expect(weak.damage).toBeLessThan(normal.damage * 0.6);
    expect(normal.stab).toBe(true);
    const noStab = calculateDamage(fighter({ types: ['normal'] }), fighter(), move, always);
    expect(normal.damage).toBeGreaterThan(noStab.damage);
  });

  it('atributos mudam o dano: físico usa Ataque/Defesa, especial usa os especiais', () => {
    const phys = { name: 'Soco', type: 'normal' as const, power: 60, accuracy: 100, special: false, source: 'jogo' as const };
    const spec = { ...phys, special: true };
    const attacker = fighter({ attack: 200, spAttack: 50 });
    const defender = fighter({ defense: 100, spDefense: 100 });
    expect(calculateDamage(attacker, defender, phys, always).damage).toBeGreaterThan(calculateDamage(attacker, defender, spec, always).damage);
    const tank = fighter({ defense: 300 });
    expect(calculateDamage(attacker, tank, phys, always).damage).toBeLessThan(calculateDamage(attacker, defender, phys, always).damage);
  });

  it('imunidade dá zero e erro de precisão não fere', () => {
    const ghostMove = { name: 'Investida', type: 'normal' as const, power: 80, accuracy: 100, special: false, source: 'jogo' as const };
    expect(calculateDamage(fighter(), fighter({ types: ['ghost'] }), ghostMove, always)).toMatchObject({ hit: true, damage: 0, effectiveness: 0 });
    const shaky = { ...ghostMove, accuracy: 50 };
    expect(calculateDamage(fighter(), fighter(), shaky, () => 0.99)).toMatchObject({ hit: false, damage: 0 });
  });

  it('crítico aumenta o dano', () => {
    const move = fighter().moves[0]!;
    let calls = 0;
    const critRng = () => [0.1, 0.01, 0.5][calls++ % 3]!;
    const crit = calculateDamage(fighter(), fighter(), move, critRng);
    const plain = calculateDamage(fighter(), fighter(), move, always);
    expect(crit.critical).toBe(true);
    expect(crit.damage).toBeGreaterThan(plain.damage);
  });

  it('dano mínimo é 1 quando acerta e não é imune', () => {
    const tiny = { name: 'Cócegas', type: 'normal' as const, power: 1, accuracy: 100, special: false, source: 'jogo' as const };
    expect(calculateDamage(fighter({ attack: 1 }), fighter({ defense: 999 }), tiny, always).damage).toBeGreaterThanOrEqual(1);
  });
});

describe('simulateBattle', () => {
  const team = () => [
    fighter({ id: 'a', speed: 120, types: ['fire'], moves: [{ name: 'Brasa', type: 'fire', power: 60, accuracy: 100, special: true, source: 'jogo' }] }),
    fighter({ id: 'b', speed: 80, types: ['grass'] }),
    fighter({ id: 'c', speed: 100, types: ['water'] }),
  ];

  it('exige pelo menos dois', () => {
    expect(() => simulateBattle([fighter()], seededRng(1))).toThrow();
  });

  it('é repetível com a mesma semente e termina com um vencedor em pé', () => {
    const one = simulateBattle(team(), seededRng(42));
    const two = simulateBattle(team(), seededRng(42));
    expect(one).toEqual(two);
    expect(one.reason).toBe('ko');
    expect(one.hpLeft[one.winner]).toBeGreaterThan(0);
    expect(one.hpLeft.filter((hp) => hp > 0)).toHaveLength(1);
  });

  it('mantém a contabilidade de PS e nunca ataca a si mesmo nem quem já caiu', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const result = simulateBattle(team(), seededRng(seed));
      const hp = team().map((f) => f.maxHp);
      const down = new Set<number>();
      for (const turn of result.turns) {
        expect(turn.attacker).not.toBe(turn.target);
        expect(down.has(turn.attacker)).toBe(false);
        expect(down.has(turn.target)).toBe(false);
        expect(turn.targetHpBefore).toBe(hp[turn.target]);
        expect(turn.targetHpAfter).toBe(Math.max(0, turn.targetHpBefore - turn.damage));
        hp[turn.target] = turn.targetHpAfter;
        if (turn.fainted) down.add(turn.target);
        expect(turn.fainted).toBe(turn.targetHpAfter === 0);
      }
      expect(hp).toEqual(result.hpLeft);
    }
  });

  it('quem tem mais Velocidade abre a primeira rodada', () => {
    const result = simulateBattle(team(), seededRng(7));
    expect(result.turns[0]?.attacker).toBe(0);
  });

  it('atributos e tipos decidem: o muito mais forte vence quase sempre', () => {
    const strong = fighter({ id: 's', maxHp: 300, attack: 180, defense: 160, types: ['water'], moves: [{ name: 'Jato', type: 'water', power: 90, accuracy: 100, special: false, source: 'jogo' }] });
    const weak = fighter({ id: 'w', maxHp: 90, attack: 60, defense: 60, types: ['fire'] });
    let wins = 0;
    for (let seed = 1; seed <= 40; seed++) if (simulateBattle([strong, weak], seededRng(seed)).winner === 0) wins++;
    expect(wins).toBe(40);
  });

  it('duelo travado termina pelo limite de rodadas com o maior PS proporcional', () => {
    const wall = (id: string) => fighter({
      id, maxHp: 9999, defense: 999, spDefense: 999,
      moves: [{ name: 'Cócegas', type: 'normal', power: 1, accuracy: 100, special: false, source: 'jogo' }],
    });
    const result = simulateBattle([wall('a'), wall('b')], seededRng(3));
    expect(result.reason).toBe('limite');
    expect([0, 1]).toContain(result.winner);
  });
});

describe('seededRng', () => {
  it('fica em [0,1) e repete', () => {
    const a = seededRng(5);
    const b = seededRng(5);
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(v).toBe(b());
    }
  });
});
