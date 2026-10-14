import { describe, expect, it } from 'vitest';
import {
  battleModeBlocker, buildFighter, calculateDamage, canGetStatus, cardDamageToPower, chooseMove, chooseTarget, effectivenessLabel, effectivenessTone, expectedDamage,
  FALLBACK_MOVE, isRosterSlot, parseCardDamage, personalityOf, planBattle, ROSTER_SLOTS, rosterBlocker, seededRng, simulateBattle, STATUS_CHANCE, summarizeBattle, TYPE_CHART, typeEffectiveness,
} from './battle';
import type { Fighter, RosterSlot } from './battle';
import { POKEMON_TYPES } from './pokemon-data';
import type { BaseStats } from './pokemon-data';

const stats = (over: Partial<BaseStats> = {}): BaseStats => ({ hp: 80, attack: 80, defense: 80, spAttack: 80, spDefense: 80, speed: 80, ...over });

function fighter(over: Partial<Fighter> = {}): Fighter {
  return {
    id: 'a', name: 'A', types: ['normal'], maxHp: 150, attack: 100, defense: 100, spAttack: 100, spDefense: 100, speed: 100,
    moves: [{ name: 'Golpe', type: 'normal', power: 60, accuracy: 100, special: false, source: 'jogo' }], personality: 'equilibrado', quality: 'completo', notes: [], ...over,
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
    for (let seed = 1; seed <= 40; seed++) {
      const result = simulateBattle(team(), seededRng(seed));
      const hp = team().map((f) => f.maxHp);
      const down = new Set<number>();
      for (const turn of result.turns) {
        expect(down.has(turn.attacker)).toBe(false);
        expect(down.has(turn.target)).toBe(false);
        if (turn.kind === 'attack') expect(turn.attacker).not.toBe(turn.target);
        else expect(turn.attacker).toBe(turn.target);
        expect(turn.targetHpBefore).toBe(hp[turn.target]);
        expect(turn.targetHpAfter).toBe(Math.max(0, turn.targetHpBefore - turn.damage));
        hp[turn.target] = turn.targetHpAfter;
        if (turn.fainted) down.add(turn.target);
        expect(turn.fainted).toBe(turn.targetHpAfter === 0);
        if (turn.kind === 'residual') expect(turn.targetHpAfter).toBeGreaterThanOrEqual(1);
      }
      expect(hp).toEqual(result.hpLeft);
    }
  });

  it('quem tem mais Velocidade abre a primeira rodada', () => {
    const result = simulateBattle(team(), seededRng(7));
    expect(result.turns.find((t) => t.round === 1)?.attacker).toBe(0);
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

const move = (over: Partial<Fighter['moves'][number]> = {}) => ({ name: 'M', type: 'normal' as const, power: 60, accuracy: 100, special: false, source: 'jogo' as const, ...over });

describe('personalidade', () => {
  const base = { maxHp: 150, attack: 100, defense: 100, spAttack: 100, spDefense: 100, speed: 100 };
  it('deriva dos atributos', () => {
    expect(personalityOf({ ...base, attack: 180 })).toBe('agressivo');
    expect(personalityOf({ ...base, spAttack: 180 })).toBe('agressivo');
    expect(personalityOf({ ...base, defense: 200, spDefense: 200, maxHp: 250 })).toBe('defensivo');
    expect(personalityOf({ ...base, speed: 200 })).toBe('veloz');
    expect(personalityOf(base)).toBe('equilibrado');
  });

  it('buildFighter preenche a personalidade (Onix é defensivo, Gastly é agressivo)', () => {
    const onix = buildFighter({ id: 'o', name: 'Onix', profile: { dexId: 95, types: ['rock', 'ground'], stats: { hp: 35, attack: 45, defense: 160, spAttack: 30, spDefense: 45, speed: 70 } }, card: null, gameMoves: [] });
    const gastly = buildFighter({ id: 'g', name: 'Gastly', profile: { dexId: 92, types: ['ghost', 'poison'], stats: { hp: 30, attack: 35, defense: 30, spAttack: 100, spDefense: 35, speed: 80 } }, card: null, gameMoves: [] });
    expect(onix.personality).toBe('defensivo');
    expect(gastly.personality).toBe('agressivo');
  });

  it('o golpe é escolhido pelo dano esperado: o agressivo quase sempre usa o melhor', () => {
    const strong = move({ name: 'Forte', power: 120 });
    const weak = move({ name: 'Fraco', power: 30 });
    const a = fighter({ personality: 'agressivo', moves: [weak, strong] });
    const rng = seededRng(3);
    let best = 0;
    for (let i = 0; i < 200; i++) if (chooseMove(a, fighter(), rng).name === 'Forte') best++;
    expect(best).toBeGreaterThan(180);
    // Contra imune, o golpe do tipo certo vence mesmo sendo mais fraco.
    const ghost = fighter({ types: ['ghost'] });
    const fire = move({ name: 'Brasa', type: 'fire', power: 40 });
    const norm = move({ name: 'Investida', type: 'normal', power: 120 });
    const picks = new Set<string>();
    for (let i = 0; i < 50; i++) picks.add(chooseMove(fighter({ personality: 'agressivo', moves: [norm, fire] }), ghost, rng).name);
    expect(picks.has('Brasa')).toBe(true);
    expect(expectedDamage(fighter(), ghost, norm)).toBe(0);
  });

  it('o agressivo mira quem dá para derrubar; o defensivo revida quem o acertou', () => {
    const fighters = [fighter({ id: 'a', personality: 'agressivo' }), fighter({ id: 'b', maxHp: 400 }), fighter({ id: 'c', maxHp: 20 })];
    const live = [
      { hp: 150, status: null, guard: false, guardedLast: false, lastHitBy: null },
      { hp: 400, status: null, guard: false, guardedLast: false, lastHitBy: null },
      { hp: 20, status: null, guard: false, guardedLast: false, lastHitBy: null },
    ];
    const rng = seededRng(8);
    let weakest = 0;
    for (let i = 0; i < 200; i++) if (chooseTarget(0, fighters, live, rng).target === 2) weakest++;
    expect(weakest).toBeGreaterThan(130);

    const d = [fighter({ id: 'd', personality: 'defensivo' }), fighter({ id: 'e' }), fighter({ id: 'g' })];
    const dl = d.map((_f, i) => ({ hp: 150, status: null, guard: false, guardedLast: false, lastHitBy: i === 0 ? 2 : null }));
    let revenge = 0;
    for (let i = 0; i < 200; i++) {
      const r = chooseTarget(0, d, dl, rng);
      if (r.target === 2 && r.revenge) revenge++;
    }
    expect(revenge).toBeGreaterThan(100);
  });
});

describe('guarda e condições', () => {
  it('em guarda o golpe recebido causa metade do dano', () => {
    const rng = () => 0.5;
    const m = move();
    const normal = calculateDamage(fighter(), fighter(), m, rng).damage;
    const guarded = calculateDamage(fighter(), fighter(), m, rng, { guarded: true }).damage;
    expect(guarded).toBeLessThan(normal * 0.6);
    expect(guarded).toBeGreaterThan(0);
  });

  it('queimado enfraquece golpes físicos, não os especiais', () => {
    const rng = () => 0.5;
    const phys = move();
    const spec = move({ special: true });
    expect(calculateDamage(fighter(), fighter(), phys, rng, { burned: true }).damage).toBeLessThan(calculateDamage(fighter(), fighter(), phys, rng).damage * 0.6);
    expect(calculateDamage(fighter(), fighter(), spec, rng, { burned: true }).damage).toBe(calculateDamage(fighter(), fighter(), spec, rng).damage);
  });

  it('imunidades a condições seguem os tipos', () => {
    expect(canGetStatus('burn', ['fire'])).toBe(false);
    expect(canGetStatus('burn', ['water'])).toBe(true);
    expect(canGetStatus('poison', ['steel'])).toBe(false);
    expect(canGetStatus('poison', ['poison', 'ground'])).toBe(false);
    expect(canGetStatus('paralysis', ['electric'])).toBe(false);
    expect(canGetStatus('freeze', ['ice'])).toBe(false);
    expect(STATUS_CHANCE.water).toBeUndefined();
  });

  it('numa batalha longa aparecem defesas, condições e perdas de PS no fim da rodada', () => {
    const fire = move({ name: 'Brasa', type: 'fire', power: 50, special: true });
    const bolt = move({ name: 'Choque', type: 'electric', power: 50, special: true });
    const tank = (id: string, extra: Partial<Fighter> = {}) => fighter({ id, maxHp: 260, defense: 150, spDefense: 150, personality: 'defensivo', moves: [fire, bolt], types: ['water'], ...extra });
    const kinds = new Set<string>();
    const statuses = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const result = simulateBattle([tank('a'), tank('b'), tank('c')], seededRng(seed));
      for (const t of result.turns) {
        kinds.add(t.kind);
        if (t.inflicted) statuses.add(t.inflicted);
        if (t.kind === 'skip') expect(['paralysis', 'freeze']).toContain(t.cause);
        if (t.kind === 'residual') expect(['burn', 'poison']).toContain(t.cause);
      }
    }
    expect([...kinds].sort()).toEqual(['attack', 'guard', 'residual', 'skip']);
    expect(statuses.has('burn')).toBe(true);
    expect(statuses.has('paralysis')).toBe(true);
  });

  it('um golpe em guarda marca guardedHit e a guarda vale por um golpe só', () => {
    let seen = 0;
    for (let seed = 1; seed <= 80 && seen < 3; seed++) {
      const tank = (id: string) => fighter({ id, maxHp: 200, personality: 'defensivo' });
      const result = simulateBattle([tank('a'), tank('b')], seededRng(seed));
      let guardedNow: number | null = null;
      for (const t of result.turns) {
        if (t.kind === 'guard') guardedNow = t.attacker;
        else if (t.kind === 'attack' && t.target === guardedNow && t.hit && t.damage > 0) {
          expect(t.guardedHit).toBe(true);
          guardedNow = null;
          seen++;
        } else if (t.kind === 'attack' && t.attacker === guardedNow) guardedNow = null;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('summarizeBattle', () => {
  it('soma dano, nocautes e golpes por lutador', () => {
    const fighters = [fighter({ id: 'a', speed: 120 }), fighter({ id: 'b', speed: 80 })];
    const result = simulateBattle(fighters, seededRng(4));
    const summary = summarizeBattle(fighters, result);
    const totalDealt = summary.fighters.reduce((n, f) => n + f.damageDealt, 0);
    const totalLost = result.turns.filter((t) => t.kind === 'attack').reduce((n, t) => n + t.damage, 0);
    expect(totalDealt).toBe(totalLost);
    expect(summary.fighters.reduce((n, f) => n + f.knockouts, 0)).toBe(1);
    expect(summary.rounds).toBe(result.turns.at(-1)?.round);
    expect(summary.fighters[summary.mvp]!.damageDealt).toBe(Math.max(...summary.fighters.map((f) => f.damageDealt)));
  });
});

describe('equipes e revezamento', () => {
  const six = () => Array.from({ length: 6 }, (_, i) => fighter({ id: `p${i}`, name: `P${i}`, speed: 60 + i * 10 }));

  it('sem equipes o resultado é o mesmo de sempre (todos contra todos)', () => {
    const base = simulateBattle(six(), seededRng(9));
    const explicit = simulateBattle(six(), seededRng(9), { teams: [0, 1, 2, 3, 4, 5] });
    expect(explicit.turns).toEqual(base.turns);
    expect(base.teams).toBeUndefined();
  });

  it('em equipes ninguém ataca aliado e vence a equipe que sobra', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const teams = [0, 1, 0, 1, 0, 1];
      const result = simulateBattle(six(), seededRng(seed), { teams });
      for (const turn of result.turns.filter((t) => t.kind === 'attack')) expect(teams[turn.attacker]).not.toBe(teams[turn.target]);
      const standing = new Set(result.hpLeft.map((hp, i) => (hp > 0 ? teams[i] : -1)).filter((x) => x !== -1));
      expect(standing.size).toBe(1);
      expect(result.winningTeam).toBe([...standing][0]);
      expect(teams[result.winner]).toBe(result.winningTeam);
      expect(result.hpLeft[result.winner]).toBeGreaterThan(0);
    }
  });

  it('valida as equipes', () => {
    expect(() => simulateBattle(six(), seededRng(1), { teams: [0, 0, 0, 0, 0, 0] })).toThrow();
    expect(() => simulateBattle(six(), seededRng(1), { teams: [0, 1] })).toThrow();
  });

  it('no revezamento só um de cada equipe luta por vez e o próximo entra quando o outro cai', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const teams = [0, 0, 0, 1, 1, 1];
      const result = simulateBattle(six(), seededRng(seed), { teams, relay: true });
      expect(result.relay).toBe(true);
      const hp = six().map((f) => f.maxHp);
      const front = [0, 3];
      for (const turn of result.turns) {
        if (turn.kind === 'attack') {
          expect(front).toContain(turn.attacker);
          expect(front).toContain(turn.target);
          hp[turn.target] = turn.targetHpAfter;
          if (turn.fainted) {
            const team = teams[turn.target]!;
            const next = hp.findIndex((h, i) => h > 0 && teams[i] === team);
            const after = result.turns[turn.index + 1];
            if (next >= 0) {
              expect(after?.kind).toBe('enter');
              expect(after?.attacker).toBe(next);
              front[team] = next;
            }
          }
        }
      }
      expect(result.hpLeft.filter((h, i) => h > 0 && teams[i] === result.winningTeam).length).toBeGreaterThan(0);
      expect(new Set(result.hpLeft.map((h, i) => (h > 0 ? teams[i] : -1)).filter((x) => x !== -1)).size).toBe(1);
    }
  });

  it('o resumo ignora entradas', () => {
    const fighters = six();
    const result = simulateBattle(fighters, seededRng(3), { teams: [0, 0, 0, 1, 1, 1], relay: true });
    const summary = summarizeBattle(fighters, result);
    expect(summary.fighters.reduce((n, f) => n + f.damageDealt, 0)).toBe(result.turns.filter((t) => t.kind === 'attack').reduce((n, t) => n + t.damage, 0));
  });
});

describe('planBattle', () => {
  it('royale usa todos e não consome sorteio', () => {
    let calls = 0;
    const plan = planBattle('royale', 5, () => (calls++, 0.3));
    expect(plan).toEqual({ mode: 'royale', picks: [0, 1, 2, 3, 4], relay: false });
    expect(calls).toBe(0);
  });

  it('equipes reparte todos de forma equilibrada', () => {
    for (const count of [2, 3, 5, 6, 9]) {
      const plan = planBattle('equipes', count, seededRng(count));
      expect([...plan.picks].sort((a, b) => a - b)).toEqual(Array.from({ length: count }, (_, i) => i));
      const sizes = [0, 1].map((t) => plan.teams!.filter((x) => x === t).length);
      expect(Math.abs(sizes[0]! - sizes[1]!)).toBeLessThanOrEqual(1);
      expect(plan.relay).toBe(false);
    }
  });

  it('3x3 sorteia 6 e é repetível', () => {
    const one = planBattle('tres', 9, seededRng(5));
    const two = planBattle('tres', 9, seededRng(5));
    expect(one).toEqual(two);
    expect(one.picks).toHaveLength(6);
    expect(new Set(one.picks).size).toBe(6);
    expect(one.teams).toEqual([0, 1, 0, 1, 0, 1]);
    expect(one.relay).toBe(true);
  });

  it('avisa quando faltam Pokémon', () => {
    expect(battleModeBlocker('tres', 4)).toContain('6');
    expect(battleModeBlocker('tres', 6)).toBeNull();
    expect(battleModeBlocker('royale', 1)).not.toBeNull();
    expect(() => planBattle('tres', 5, seededRng(1))).toThrow();
  });
});

describe('escalação manual', () => {
  const rng = () => seededRng(11);

  it('sem escalação (ou tudo em sorteio) o plano é o de sempre', () => {
    expect(planBattle('equipes', 7, rng(), ['auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'])).toEqual(planBattle('equipes', 7, rng()));
    expect(planBattle('tres', 9, rng(), undefined)).toEqual(planBattle('tres', 9, rng()));
  });

  it('quem está fora não luta (Royale)', () => {
    const plan = planBattle('royale', 5, rng(), [0, 'out', 'auto', 'out', 1]);
    expect(plan.picks).toEqual([0, 2, 4]);
    expect(plan.teams).toBeUndefined();
  });

  it('Equipes respeita as equipes fixas e reparte o sorteio equilibrando', () => {
    const roster: RosterSlot[] = [0, 0, 0, 1, 'auto', 'auto', 'out', 'auto'];
    const plan = planBattle('equipes', roster.length, rng(), roster);
    const red = plan.picks.filter((_, i) => plan.teams![i] === 0);
    const blue = plan.picks.filter((_, i) => plan.teams![i] === 1);
    expect(red).toEqual(expect.arrayContaining([0, 1, 2]));
    expect(blue).toContain(3);
    expect(plan.picks).not.toContain(6);
    expect(plan.picks).toHaveLength(7);
    expect(Math.abs(red.length - blue.length)).toBeLessThanOrEqual(1);
  });

  it('3x3 usa 3 por lado, com as fixas primeiro e o sorteio completando', () => {
    const roster: RosterSlot[] = [0, 'auto', 'auto', 'auto', 'auto', 1, 'auto', 'out'];
    const plan = planBattle('tres', roster.length, rng(), roster);
    expect(plan.relay).toBe(true);
    expect(plan.picks).toHaveLength(6);
    expect(plan.teams!.filter((t) => t === 0)).toHaveLength(3);
    expect(plan.teams!.filter((t) => t === 1)).toHaveLength(3);
    expect(plan.picks[plan.teams!.indexOf(0)]).toBe(0);
    expect(plan.picks[plan.teams!.indexOf(1)]).toBe(5);
  });

  it('explica o que impede a luta', () => {
    expect(rosterBlocker('royale', 3, ['out', 'out', 0])).toContain('2');
    expect(rosterBlocker('equipes', 3, [0, 0, 0])).toContain('equipe');
    expect(rosterBlocker('equipes', 3, [0, 0, 'auto'])).toBeNull();
    expect(rosterBlocker('tres', 8, [0, 0, 0, 0, 'auto', 'auto', 'auto', 'auto'])).toContain('3 por lado');
    expect(rosterBlocker('tres', 5, [0, 1, 'auto', 'auto', 'out'])).toContain('6');
    expect(() => planBattle('tres', 5, rng(), [0, 1, 'auto', 'auto', 'out'])).toThrow();
  });

  it('valida as marcas da escalação', () => {
    expect([...ROSTER_SLOTS].every(isRosterSlot)).toBe(true);
    expect(isRosterSlot('x')).toBe(false);
    expect(isRosterSlot(2)).toBe(false);
  });
});
