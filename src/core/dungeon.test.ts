import { describe, expect, it } from 'vitest';
import {
  attack, attackArea, attacker, attackTargets, BOSS_EVERY, chooseReward, damage, endTurn, EXHAUST_ROUNDS, fuse, fusionName, fusionOrigins, GRID_W, GRID_H, move,
  previewAttack, previewFusion, profileFor, reachable, START_AP, startDungeon, switchTo, threatenedCells, typeFactor, usePotion, weaponFor,
} from './dungeon';
import type { DungeonState, EnemySpecies, MemberInput } from './dungeon';
import type { BaseStats } from './survivor-moves';

const stats = (o: Partial<BaseStats> = {}): BaseStats => ({ hp: 60, attack: 80, defense: 60, spAttack: 50, spDefense: 60, speed: 90, ...o });
const mon = (id: string, o: Partial<BaseStats> = {}, types: MemberInput['types'] = ['fire']): MemberInput => ({ id, dexId: 4, name: id, types, stats: stats(o) });
const pool: EnemySpecies[] = [{ dexId: 19, name: 'Rattata', types: ['normal'], stats: stats({ hp: 30, attack: 56, defense: 35, spAttack: 25, spDefense: 35, speed: 72 }) }];

/** Sala vazia com um inimigo numa casa escolhida (os testes não dependem do sorteio da sala). */
function arena(team: MemberInput[] = [mon('a'), mon('b'), mon('c')]): DungeonState {
  const s = startDungeon(team, pool, 42);
  s.walls = [];
  s.enemies = s.enemies.slice(0, 1);
  s.enemies[0]!.pos = { x: 3, y: GRID_H - 2 };
  s.pos = { x: 3, y: GRID_H - 1 };
  return s;
}

describe('armas e dano', () => {
  it('a arma provisória sai dos stats: físico rápido, médio e lento; especial rápido e lento', () => {
    expect(weaponFor(stats({ speed: 100 }))).toBe('laminas');
    expect(weaponFor(stats({ speed: 70 }))).toBe('lanca');
    expect(weaponFor(stats({ speed: 30 }))).toBe('martelo');
    expect(weaponFor(stats({ attack: 40, spAttack: 100, speed: 90 }))).toBe('emissor');
    expect(weaponFor(stats({ attack: 40, spAttack: 100, speed: 40 }))).toBe('lancador');
  });

  it('usa multiplicadores moderados de tipo e troca imunidade por forte resistência', () => {
    expect(typeFactor('water', ['fire'])).toBe(1.25);
    expect(typeFactor('fire', ['water'])).toBe(0.8);
    expect(typeFactor('normal', ['ghost'])).toBe(0.5);
    expect(typeFactor('normal', ['normal'])).toBe(1);
  });

  it('munição mista divide o dano em 70%/30% e só a parcela do tipo do Pokémon ganha afinidade', () => {
    const single = damage(50, 100, 100, ['water'], ['water'], ['normal']);
    const mixed = damage(50, 100, 100, ['water', 'electric'], ['water'], ['normal']);
    expect(mixed.parts.map((p) => p.share)).toEqual([0.7, 0.3]);
    expect(mixed.parts.map((p) => p.affinity)).toEqual([true, false]);
    expect(mixed.total).toBeLessThan(single.total);
    expect(damage(1, 1, 999, ['fire'], [], ['water']).total).toBe(1);
  });

  it('nome da fusão segue a ordem do catálogo, qualquer que seja a ordem do par', () => {
    expect(fusionName('lanca', 'laminas')).toBe('Lâminas duplas + Lança de combate');
    expect(fusionName('laminas', 'lanca')).toBe('Lâminas duplas + Lança de combate');
  });
});

describe('a sala', () => {
  it('começa com 6 PA, até seis membros, e nenhum pilar isola uma casa', () => {
    const s = startDungeon([1, 2, 3, 4, 5, 6, 7].map((i) => mon(`m${i}`)), pool, 7);
    expect(s.team).toHaveLength(6);
    expect(s.ap).toBe(START_AP);
    expect(s.enemies.length).toBeGreaterThan(0);
    const blocked = new Set([...s.walls, ...s.enemies.map((e) => e.pos)].map((c) => `${c.x},${c.y}`));
    expect(blocked.has(`${s.pos.x},${s.pos.y}`)).toBe(false);
  });

  it('mover custa 1 PA por casa e não atravessa inimigos', () => {
    const s = arena();
    const reach = reachable(s);
    expect(reach.get(`${3},${GRID_H - 2}`)).toBeUndefined();
    expect(reach.get(`${0},${GRID_H - 1}`)).toBe(3);
    expect(move(s, { x: 0, y: GRID_H - 1 }).ok).toBe(true);
    expect(s.ap).toBe(START_AP - 3);
    expect(move(s, { x: GRID_W - 1, y: 0 }).ok).toBe(false);
  });
});

describe('ataque, carga e troca', () => {
  it('a prévia mostra alvo, dano, PA e carga antes de gastar', () => {
    const s = arena();
    const target = s.enemies[0]!.pos;
    expect(attackTargets(s)).toContainEqual(target);
    const p = previewAttack(s, target);
    expect(p.reason).toBeNull();
    expect(p.hits[0]!.damage).toBeGreaterThan(0);
    expect(s.ap).toBe(START_AP);
    expect(previewAttack(s, { x: 0, y: 0 }).reason).not.toBeNull();
  });

  it('atacar gasta PA e carga; carga zerada esgota o ativo e pede uma troca grátis', () => {
    const s = arena();
    s.enemies[0]!.hp = 9999;
    s.enemies[0]!.maxHp = 9999;
    s.team[0]!.charge = 1;
    expect(attack(s, s.enemies[0]!.pos).ok).toBe(true);
    expect(s.ap).toBe(START_AP - 1);
    expect(s.team[0]!.status).toBe('exhausted');
    expect(s.mustSwitch).toBe(true);
    expect(endTurn(s).ok).toBe(false);
    expect(switchTo(s, 1).ok).toBe(true);
    expect(s.ap).toBe(START_AP - 1);
  });

  it('esgotado fica fora por duas rodadas completas, sem contar a rodada em que esgotou, e volta com carga cheia', () => {
    const s = arena();
    s.enemies[0]!.stats.attack = 1;
    s.enemies[0]!.stats.spAttack = 1;
    s.enemies[0]!.hp = 9999;
    s.team[0]!.charge = 1;
    attack(s, s.enemies[0]!.pos);
    switchTo(s, 1);
    // A rodada do esgotamento e mais as duas seguintes: só depois dela volta.
    for (let r = 0; r < EXHAUST_ROUNDS; r++) {
      endTurn(s);
      expect(s.team[0]!.status).toBe('exhausted');
    }
    endTurn(s);
    expect(s.team[0]!.status).toBe('ready');
    expect(s.team[0]!.charge).toBe(s.team[0]!.maxCharge);
  });

  it('a reserva recupera 25% da carga por rodada; o ativo não', () => {
    const s = arena();
    s.enemies[0]!.pos = { x: 0, y: 0 };
    s.team[0]!.charge = 2;
    s.team[1]!.charge = 2;
    endTurn(s);
    expect(s.team[0]!.charge).toBe(2);
    expect(s.team[1]!.charge).toBe(2 + Math.ceil(s.team[1]!.maxCharge * 0.25));
  });

  it('trocar custa 1 PA e mantém a posição', () => {
    const s = arena();
    const pos = { ...s.pos };
    expect(switchTo(s, 2).ok).toBe(true);
    expect(s.ap).toBe(START_AP - 1);
    expect(s.pos).toEqual(pos);
  });

  it('poção custa 2 PA e não cura além do máximo', () => {
    const s = arena();
    expect(usePotion(s).ok).toBe(false);
    s.team[0]!.hp = 1;
    expect(usePotion(s).ok).toBe(true);
    expect(s.ap).toBe(START_AP - 2);
    expect(s.potions).toBe(1);
  });

  it('sem ninguém para assumir, a expedição termina de forma explícita', () => {
    const s = arena([mon('solo')]);
    s.enemies[0]!.hp = 9999;
    s.team[0]!.charge = 1;
    attack(s, s.enemies[0]!.pos);
    expect(s.phase).toBe('lost');
  });
});

describe('fusão', () => {
  it('custa 1 PA e um buff, mostra a prévia e bloqueia quem não está disponível', () => {
    const s = arena();
    s.team[2]!.status = 'down';
    expect(previewFusion(s, 0, 2)!.ok).toBe(false);
    const p = previewFusion(s, 0, 1)!;
    expect(p.ok).toBe(true);
    expect(fuse(s, 0, 1).ok).toBe(true);
    expect(s.ap).toBe(START_AP - 1);
    expect(s.fusionCharges).toBe(0);
    expect(fuse(s, 0, 1).ok).toBe(false);
  });

  it('divide o dano recebido entre os dois e termina no fim do terceiro turno, com recuperação curta', () => {
    const s = arena();
    fuse(s, 0, 1);
    s.enemies[0]!.hp = 9999;
    const before = [s.team[0]!.hp, s.team[1]!.hp];
    endTurn(s);
    expect(s.team[0]!.hp).toBeLessThan(before[0]!);
    expect(before[0]! - s.team[0]!.hp).toBe(before[1]! - s.team[1]!.hp);
    endTurn(s);
    expect(s.fusion).not.toBeNull();
    endTurn(s);
    expect(s.fusion).toBeNull();
    expect(s.active).toBe(2);
  });
});

describe('andares', () => {
  it('sala limpa oferece recompensa e desce; o chefe encerra a masmorra', () => {
    const s = arena();
    s.enemies[0]!.hp = 1;
    attack(s, s.enemies[0]!.pos);
    expect(s.phase).toBe('reward');
    expect(chooseReward(s, 'fusion', pool).ok).toBe(true);
    expect(s.floor).toBe(2);
    expect(s.fusionCharges).toBe(2);
    expect(s.phase).toBe('player');
    s.floor = 4;
    s.enemies = s.enemies.slice(0, 1);
    s.walls = [];
    s.enemies[0]!.pos = { x: s.pos.x, y: s.pos.y - 1 };
    s.enemies[0]!.hp = 1;
    attack(s, s.enemies[0]!.pos);
    expect(s.phase).toBe('won');
  });

  it('a área do lançador cobre a casa e as quatro vizinhas', () => {
    const s = arena([mon('x', { attack: 30, spAttack: 120, speed: 30 })]);
    expect(attackArea(s, { x: 3, y: 3 })).toHaveLength(5);
    expect(attackArea(s, { x: 0, y: 0 })).toHaveLength(0);
  });
});

describe('inimigos', () => {
  it('o perfil sai da arma: atirador para distância e área, guardião para corpo a corpo lento, chefe no último andar', () => {
    expect(profileFor('emissor', 90, false)).toBe('atirador');
    expect(profileFor('lancador', 30, false)).toBe('atirador');
    expect(profileFor('martelo', 40, false)).toBe('guardiao');
    expect(profileFor('laminas', 100, false)).toBe('bruto');
    expect(profileFor('laminas', 100, true)).toBe('chefe');
  });

  it('o guardião não sai do lugar enquanto você estiver longe', () => {
    const s = arena();
    const e = s.enemies[0]!;
    e.profile = 'guardiao';
    e.pos = { x: 3, y: 0 };
    endTurn(s);
    expect(e.pos).toEqual({ x: 3, y: 0 });
  });

  it('o atirador recua quando você encosta', () => {
    const s = arena();
    const e = s.enemies[0]!;
    e.profile = 'atirador';
    e.weapon = 'emissor';
    e.hp = 9999;
    endTurn(s);
    expect(Math.abs(e.pos.x - s.pos.x) + Math.abs(e.pos.y - s.pos.y)).toBeGreaterThan(1);
  });

  it('o chefe anuncia o golpe numa rodada e só acerta na seguinte, se você não sair das casas marcadas', () => {
    const fresh = () => {
      const s = arena();
      const e = s.enemies[0]!;
      e.profile = 'chefe';
      e.pos = { x: 0, y: 0 };
      e.hp = 9999;
      s.round = BOSS_EVERY;
      return s;
    };
    const dodge = fresh();
    const hp = dodge.team[0]!.hp;
    endTurn(dodge);
    expect(dodge.bossThreat?.cells.length).toBeGreaterThan(0);
    expect(threatenedCells(dodge).has(`${dodge.pos.x},${dodge.pos.y}`)).toBe(true);
    expect(dodge.team[0]!.hp).toBe(hp);
    move(dodge, { x: 6, y: GRID_H - 1 });
    endTurn(dodge);
    expect(dodge.bossThreat).toBeNull();
    expect(dodge.team[0]!.hp).toBe(hp);

    const stay = fresh();
    endTurn(stay);
    endTurn(stay);
    expect(stay.team[0]!.hp).toBeLessThan(hp);
  });

  it('a área ameaçada inclui as casas ao alcance de um bruto depois dos passos dele', () => {
    const s = arena();
    const threat = threatenedCells(s);
    expect(threat.has(`${s.pos.x},${s.pos.y}`)).toBe(true);
    expect(threat.has(`${s.enemies[0]!.pos.x},${s.enemies[0]!.pos.y}`)).toBe(true);
  });
});

describe('origens da fusão', () => {
  it('guarda as duas armas de origem na ordem do catálogo e o Pokémon de cada orbe', () => {
    const team = [mon('lento', { speed: 70 }), mon('rapido', { speed: 100 }), mon('c')];
    const s = arena(team);
    expect(fusionOrigins('lanca', 'laminas')).toEqual(['laminas', 'lanca']);
    fuse(s, 0, 1);
    expect(s.fusion!.origins).toEqual(['laminas', 'lanca']);
    const who = attacker(s);
    expect(who.origins).toEqual(['laminas', 'lanca']);
    expect(who.orbs).toEqual([s.team[1]!.dexId, s.team[0]!.dexId]);
    expect(who.weapon.name).toBe('Lâminas duplas + Lança de combate');
  });
});
