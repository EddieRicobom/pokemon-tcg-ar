import { describe, expect, it } from 'vitest';
import {
  adaptiveDifficulty, attack, attackArea, attacker, attackReach, attacksLeft, attackTargets, beginEnemyTurn, BOSS_EVERY, BOSS_FLOOR_EVERY, buildFloor, chooseReward, damage, depthScale, difficultyFloor, eliteChance, endTurn,
  enemyStep, equipGem, EXHAUST_ROUNDS, finishEnemyTurn, fuse, fusionName, fusionOrigins, GRID_H, GRID_W, isBossFloor, isMiniBossFloor, MINI_BOSS_FLOOR_EVERY, move, planEnemy,
  polishGems, previewAttack, previewFusion, profileFor, reachable, retreat, START_AP, startDungeon, switchTo, threatenedCells, turnAp, typeFactor,
  addMember, unequipGem, usePotion, baseSpeciesDexId, evolveMember, hasCompleteWeaponTable, NATIONAL_DEX_LAST, weaponOfDex, weaponOfferAtFloor,
} from './dungeon';
import { allFusions, ammoOptions, biomeOf, CATALOG_ORDER, evolveForDepth, floorGeneration, hazardAt, HOME_BONUS, setAmmo, stepCost, fusionDescription, fusionNumber, fusionWeapon } from './dungeon';
import type { DungeonState, EnemySpecies, MemberInput, WeaponId } from './dungeon';
import type { Gem } from './dungeon-gems';
import type { BaseStats } from './survivor-moves';
import { generationOf } from './species-filter';

const stats = (o: Partial<BaseStats> = {}): BaseStats => ({ hp: 60, attack: 80, defense: 60, spAttack: 50, spDefense: 60, speed: 90, ...o });
const mon = (id: string, o: Partial<BaseStats> = {}, types: MemberInput['types'] = ['fire'], dexId = 68): MemberInput => ({ id, dexId, name: id, types, stats: stats(o) });
const rattata = stats({ hp: 30, attack: 56, defense: 35, spAttack: 25, spDefense: 35, speed: 72 });
const pool: EnemySpecies[] = [
  { dexId: 19, name: 'Rattata', types: ['normal'], stats: rattata },
  { dexId: 95, name: 'Onix', types: ['rock', 'ground'], stats: stats({ hp: 35, attack: 45, defense: 160, spAttack: 30, spDefense: 45, speed: 70 }), boss: true },
];

/** Sala vazia com um inimigo numa casa escolhida (os testes não dependem do sorteio da sala). */
function arena(team: MemberInput[] = [mon('a'), mon('b'), mon('c')]): DungeonState {
  const s = startDungeon(team, pool.slice(0, 1), 42);
  s.walls = [];
  s.loot = [];
  s.hazards = [];
  s.enemies = s.enemies.slice(0, 1);
  Object.assign(s.enemies[0]!, { pos: { x: 3, y: GRID_H - 2 }, elite: false, boss: false, affixes: [], profile: 'bruto', atkMul: 1, defMul: 1 });
  s.pos = { x: 3, y: GRID_H - 1 };
  return s;
}

/** Limpa a sala na hora (um golpe que derruba o único inimigo). */
function clear(s: DungeonState): void {
  s.enemies = s.enemies.slice(0, 1);
  s.walls = [];
  s.loot = [];
  s.hazards = [];
  s.phase = 'player';
  s.mustSwitch = false;
  s.enemies[0]!.pos = { x: s.pos.x, y: s.pos.y - 1 };
  s.enemies[0]!.hp = 1;
  s.team[s.active]!.charge = s.team[s.active]!.maxCharge;
  s.ap = START_AP;
  attack(s, s.enemies[0]!.pos);
}

const gem = (id: number, kind: Gem['kind'], tier = 1, legendary = false): Gem => ({ id, kind, tier, legendary });

describe('armas e dano', () => {
  it('a tabela fixa cobre a Pokédex inteira e alcança as 20 armas', () => {
    expect(hasCompleteWeaponTable()).toBe(true);
    const got = Array.from({ length: NATIONAL_DEX_LAST }, (_, i) => weaponOfDex(i + 1));
    expect(got).not.toContain(null);
    expect(new Set(got)).toEqual(new Set(CATALOG_ORDER));
  });

  it('liga armas às espécies que as representam e mantém a espécie nas formas', () => {
    expect(weaponOfDex(15)).toBe('enxameador'); // Beedrill
    expect(weaponOfDex(68)).toBe('manoplas'); // Machamp
    expect(weaponOfDex(122)).toBe('barreira'); // Mr. Mime
    expect(weaponOfDex(212)).toBe('laminas'); // Scizor
    expect(weaponOfDex(475)).toBe('espada'); // Gallade
    expect(weaponOfDex(681)).toBe('espadaEscudo'); // Aegislash
    expect(weaponOfDex(10033)).toBe(weaponOfDex(3)); // Mega Venusaur
    expect(baseSpeciesDexId(10161)).toBe(52); // Meowth de Galar
    expect(weaponOfDex(99999)).toBeNull();
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
  it('a Pokébola aparece no 1º andar e depois a cada três', () => {
    expect([1, 3, 6, 9, 12].every(weaponOfferAtFloor)).toBe(true);
    expect([2, 4, 5, 7, 8, 10].some(weaponOfferAtFloor)).toBe(false);
  });

  it('acrescenta uma arma escolhida na escada e rejeita uma repetida', () => {
    const s = arena([mon('inicial')]);
    s.phase = 'reward';
    expect(addMember(s, mon('beedrill', {}, ['bug', 'poison'], 15)).ok).toBe(true);
    expect(s.team).toHaveLength(2);
    expect(s.team[1]!.weapon).toBe('enxameador');
    expect(addMember(s, mon('beedrill', {}, ['bug', 'poison'], 15)).ok).toBe(false);
  });

  it('evolui uma arma na escada com dados reais, preservando suas gemas', () => {
    const s = arena([mon('charmander', {}, ['fire'], 4)]);
    s.phase = 'reward';
    const carried = gem(1, 'rubi');
    s.team[0]!.gems[0] = carried;
    expect(evolveMember(s, 0, { dexId: 5, name: 'Charmeleon', types: ['fire'], stats: stats({ hp: 58, attack: 64, defense: 58, spAttack: 80, spDefense: 65, speed: 80 }) }).ok).toBe(true);
    expect(s.team[0]).toMatchObject({ dexId: 5, name: 'Charmeleon', weapon: 'continuo' });
    expect(s.team[0]!.gems[0]).toEqual(carried);
  });

  it('começa com 6 PA, até seis membros, e nenhum pilar isola uma casa', () => {
    const s = startDungeon([1, 2, 3, 4, 5, 6, 7].map((i) => mon(`m${i}`)), pool, 7);
    expect(s.team).toHaveLength(6);
    expect(s.ap).toBe(START_AP);
    expect(s.enemies.length).toBeGreaterThan(0);
    expect(s.enemies.some((e) => e.dexId === 95)).toBe(false);
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
    s.enemies[0]!.maxHp = 9999;
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
    s.enemies[0]!.maxHp = 9999;
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
    expect(previewFusion(s, 0, 1)!.ok).toBe(true);
    expect(fuse(s, 0, 1).ok).toBe(true);
    expect(s.ap).toBe(START_AP - 1);
    expect(s.fusionCharges).toBe(0);
    expect(fuse(s, 0, 1).ok).toBe(false);
  });

  it('divide o dano recebido entre os dois e termina no fim do terceiro turno, com recuperação curta', () => {
    const s = arena();
    fuse(s, 0, 1);
    s.enemies[0]!.hp = 9999;
    s.enemies[0]!.maxHp = 9999;
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

  it('guarda as duas armas de origem na ordem do catálogo e o Pokémon de cada orbe', () => {
    const s = arena([mon('lento', {}, ['fire'], 714), mon('rapido', {}, ['fire'], 123), mon('c')]);
    expect(fusionOrigins('lanca', 'laminas')).toEqual(['laminas', 'lanca']);
    fuse(s, 0, 1);
    expect(s.fusion!.origins).toEqual(['laminas', 'disco']);
    const who = attacker(s);
    expect(who.origins).toEqual(['laminas', 'disco']);
    expect(who.orbs).toEqual([s.team[1]!.dexId, s.team[0]!.dexId]);
    expect(who.weapon.name).toBe('Lâminas duplas + Disco retornável');
    expect(who.weapon.mechanics).toEqual(['rapido', 'retorno']);
  });

  it('a área do lançador cobre a casa e as quatro vizinhas', () => {
    const s = arena([mon('x', {}, ['fire'], 692)]);
    expect(attackArea(s, { x: 3, y: 3 })).toHaveLength(5);
    expect(attackArea(s, { x: 0, y: 0 })).toHaveLength(0);
  });

  it('ataques que ainda cabem no turno: o menor entre PA e carga', () => {
    const s = arena();
    const who = attacker(s);
    s.ap = who.weapon.ap * 3;
    s.team[s.active]!.charge = who.weapon.cost * 5;
    expect(attacksLeft(s)).toEqual({ count: 3, limit: 'ap' });
    s.team[s.active]!.charge = who.weapon.cost;
    expect(attacksLeft(s)).toEqual({ count: 1, limit: 'charge' });
    s.ap = 0;
    expect(attacksLeft(s).count).toBe(0);
  });

  it('o alcance desenhado cobre todo alvo possível, sem a própria casa nem paredes', () => {
    for (const dex of [68, 692, 714, 123]) {
      const s = arena([mon('x', {}, ['fire'], dex)]);
      s.walls = [{ x: 4, y: GRID_H - 1 }];
      const reach = attackReach(s).map((c) => `${c.x},${c.y}`);
      expect(reach.length).toBeGreaterThan(0);
      expect(reach).not.toContain(`${s.pos.x},${s.pos.y}`);
      expect(reach).not.toContain(`4,${GRID_H - 1}`);
      for (const t of attackTargets(s)) expect(reach).toContain(`${t.x},${t.y}`);
    }
  });
});

describe('descida sem fim', () => {
  it('sala limpa abre a escada e deixa andar à vontade; pisar na escada oferece recompensa e descer', () => {
    const s = arena();
    clear(s);
    expect(s.phase).toBe('cleared');
    expect(s.stairs).not.toBeNull();
    const ap = s.ap;
    expect(move(s, s.stairs!).ok).toBe(true);
    expect(s.ap).toBe(ap);
    expect(s.phase).toBe('reward');
    expect(chooseReward(s, 'fusion').ok).toBe(true);
    expect(s.floor).toBe(2);
    expect(s.fusionCharges).toBe(2);
    expect(s.phase).toBe('player');
  });

  it('dá para descer muito além de qualquer limite, com chefe a cada 5 andares, até decidir sair', () => {
    const s = arena([mon('a'), mon('b')]);
    s.pool = pool.map((p) => ({ ...p }));
    for (let floor = 1; floor < 23; floor++) {
      clear(s);
      expect(s.phase).toBe('cleared');
      move(s, s.stairs!);
      chooseReward(s, 'rest');
      expect(s.floor).toBe(floor + 1);
      if (isBossFloor(s.floor)) expect(s.enemies.some((e) => e.boss && e.profile === 'chefe')).toBe(true);
    }
    expect(s.stats.deepest).toBe(23);
    expect(retreat(s).ok).toBe(false);
    clear(s);
    expect(retreat(s).ok).toBe(true);
    expect(s.phase).toBe('retired');
  });

  it('os inimigos crescem sem teto: HP, ataque, defesas e chance de elite', () => {
    expect(depthScale(1)).toEqual({ hp: 1, atk: 1, def: 1 });
    expect(depthScale(30).hp).toBeGreaterThan(depthScale(10).hp);
    expect(depthScale(100).atk).toBeGreaterThan(depthScale(30).atk);
    expect(eliteChance(1)).toBe(0);
    expect(eliteChance(8)).toBeGreaterThan(eliteChance(4));
    expect(isBossFloor(BOSS_FLOOR_EVERY)).toBe(true);
    expect(isBossFloor(BOSS_FLOOR_EVERY + 1)).toBe(false);
    expect(new Set(Array.from({ length: 9 }, (_, i) => floorGeneration(42, i + 1))).size).toBe(9);
    expect(new Set(Array.from({ length: 9 }, (_, i) => floorGeneration(42, i + 10))).size).toBe(9);
    expect(isMiniBossFloor(MINI_BOSS_FLOOR_EVERY)).toBe(true);
    expect(isMiniBossFloor(MINI_BOSS_FLOOR_EVERY + 1)).toBe(false);
  });

  it('gira uma geração por andar, põe mini-chefe a cada 6 e não mistura a sala', () => {
    const regional: EnemySpecies[] = [19, 161, 261, 396, 504, 659, 731, 819, 915].map((dexId, i) => ({ dexId, name: `g${i + 1}`, types: ['normal'], stats: stats() }));
    const s = startDungeon([mon('a')], regional, 11);
    for (let floor = 1; floor <= 9; floor++) {
      s.floor = floor;
      buildFloor(s);
      expect(s.enemies).not.toHaveLength(0);
      expect(s.enemies.every((enemy) => generationOf(enemy.dexId) === s.biome + 1)).toBe(true);
    }
    s.floor = 6;
    buildFloor(s);
    expect(s.enemies.some((enemy) => enemy.miniBoss)).toBe(true);
  });

  it('acompanha aliados de pé e gemas sem punir quem já caiu', () => {
    const s = arena([mon('a'), mon('b'), mon('c')]);
    s.team[0]!.gems[0] = gem(1, 'rubi', 3);
    s.team[1]!.gems[0] = gem(2, 'safira', 3);
    expect(adaptiveDifficulty(s)).toBe(3); // dois aliados + seis graus de gema
    expect(difficultyFloor(s)).toBe(s.floor + 3);
    s.team[1]!.status = 'down';
    s.team[2]!.status = 'down';
    expect(adaptiveDifficulty(s)).toBe(0);
  });

  it('pegar o baú põe a gema na mochila', () => {
    const s = arena();
    const g = gem(900, 'rubi');
    s.loot = [{ pos: { x: 2, y: GRID_H - 1 }, items: [{ kind: 'gem', gem: g }, { kind: 'potion' }], chest: true }];
    move(s, { x: 2, y: GRID_H - 1 });
    expect(s.bag).toContainEqual(g);
    expect(s.potions).toBe(3);
    expect(s.loot).toHaveLength(0);
  });

  it('o chefe sempre deixa uma gema lendária', () => {
    const s = arena();
    s.enemies[0]!.boss = true;
    clear(s);
    const items = s.loot.flatMap((l) => l.items);
    expect(items.some((i) => i.kind === 'gem' && i.gem.legendary)).toBe(true);
  });
});

describe('gemas', () => {
  it('só se encaixam com a sala limpa; rubi aumenta o poder, esmeralda o HP e safira a carga', () => {
    const s = arena();
    s.bag = [gem(1, 'rubi', 2), gem(2, 'esmeralda', 1), gem(3, 'safira', 1)];
    expect(equipGem(s, 0, 0, 1).ok).toBe(false);
    clear(s);
    const power = attacker(s).power;
    const { maxHp, maxCharge } = s.team[0]!;
    expect(equipGem(s, 0, 0, 1).ok).toBe(true);
    expect(attacker(s).power).toBeGreaterThan(power);
    expect(equipGem(s, 0, 1, 2).ok).toBe(true);
    expect(s.team[0]!.maxHp).toBe(Math.round(maxHp * 1.1));
    expect(equipGem(s, 0, 1, 3).ok).toBe(true);
    expect(s.team[0]!.maxHp).toBe(maxHp);
    expect(s.team[0]!.maxCharge).toBe(maxCharge + 2);
    expect(s.bag.map((g) => g.id)).toEqual([2]);
    expect(unequipGem(s, 0, 0).ok).toBe(true);
    expect(s.bag.map((g) => g.id).sort()).toEqual([1, 2]);
  });

  it('lendária só no encaixe lendário, e comum nunca nele', () => {
    const s = arena();
    clear(s);
    s.bag = [gem(1, 'eco', 1, true), gem(2, 'rubi')];
    expect(equipGem(s, 0, 0, 1).ok).toBe(false);
    expect(equipGem(s, 0, 2, 2).ok).toBe(false);
    expect(equipGem(s, 0, 2, 1).ok).toBe(true);
  });

  it('três iguais do mesmo grau viram uma do grau seguinte', () => {
    const s = arena();
    clear(s);
    s.bag = [gem(1, 'topazio', 2), gem(2, 'topazio', 2), gem(3, 'topazio', 2), gem(4, 'topazio', 1)];
    expect(polishGems(s, 'topazio', 1).ok).toBe(false);
    expect(polishGems(s, 'topazio', 2).ok).toBe(true);
    expect(s.bag.map((g) => `${g.kind}${g.tier}`).sort()).toEqual(['topazio1', 'topazio3']);
  });

  it('Fênix salva uma vez por andar; Ampulheta dá +1 PA; Vampírica cura quem ataca', () => {
    const s = arena();
    clear(s);
    s.bag = [gem(1, 'fenix', 1, true), gem(2, 'ampulheta', 1, true), gem(3, 'vampiro', 1, true)];
    equipGem(s, 0, 2, 1);
    equipGem(s, 1, 2, 2);
    equipGem(s, 2, 2, 3);
    move(s, s.stairs!);
    chooseReward(s, 'potion');
    s.walls = [];
    s.loot = [];
    s.enemies = s.enemies.slice(0, 1);
    Object.assign(s.enemies[0]!, { pos: { x: 3, y: GRID_H - 2 }, hp: 9999, maxHp: 9999, profile: 'bruto', affixes: [], atkMul: 50, boss: false });
    s.pos = { x: 3, y: GRID_H - 1 };
    s.active = 0;
    s.team[0]!.hp = 1;
    endTurn(s);
    expect(s.team[0]!.hp).toBeGreaterThan(0);
    expect(s.team[0]!.phoenixUsed).toBe(true);

    s.active = 1;
    expect(turnAp(s)).toBe(START_AP + 1);

    s.active = 2;
    s.team[2]!.hp = 1;
    s.enemies[0]!.atkMul = 1;
    s.ap = START_AP;
    attack(s, s.enemies[0]!.pos);
    expect(s.team[2]!.hp).toBeGreaterThan(1);
  });
});

describe('inimigos', () => {
  it('o perfil sai da arma e dos stats: atirador, suporte, guardião, bruto e chefe', () => {
    expect(profileFor('emissor', stats({ attack: 40, spAttack: 100, spDefense: 50 }), false)).toBe('atirador');
    expect(profileFor('lancador', stats({ attack: 40, spAttack: 80, spDefense: 120 }), false)).toBe('suporte');
    expect(profileFor('martelo', stats({ speed: 40 }), false)).toBe('guardiao');
    expect(profileFor('laminas', stats({ speed: 100 }), false)).toBe('bruto');
    expect(profileFor('laminas', stats(), true)).toBe('chefe');
  });

  it('o guardião não sai do lugar enquanto você estiver longe', () => {
    const s = arena();
    const e = s.enemies[0]!;
    e.profile = 'guardiao';
    e.pos = { x: 3, y: 0 };
    endTurn(s);
    expect(e.pos).toEqual({ x: 3, y: 0 });
  });

  it('o guardião corre para o lado de um aliado ferido e o protege do seu dano', () => {
    const s = arena();
    const ally = s.enemies[0]!;
    ally.pos = { x: 3, y: 2 };
    ally.hp = 1000;
    ally.maxHp = 9999;
    const plain = previewAttack({ ...s, pos: { x: 3, y: 3 } }, ally.pos).hits[0]!.damage;
    const guard = { ...ally, uid: 77, pos: { x: 0, y: 2 }, profile: 'guardiao' as const, hp: 50, maxHp: 50 };
    s.enemies.push(guard);
    s.pos = { x: 3, y: 5 };
    expect(planEnemy(s, guard).kind).toBe('shield');
    guard.pos = { x: 2, y: 2 };
    const shielded = previewAttack({ ...s, pos: { x: 3, y: 3 } }, ally.pos).hits[0]!;
    expect(shielded.guarded).toBe(true);
    expect(shielded.damage).toBeLessThan(plain);
  });

  it('o suporte cura o aliado mais ferido', () => {
    const s = arena();
    const ally = s.enemies[0]!;
    ally.pos = { x: 0, y: 0 };
    ally.hp = 10;
    ally.maxHp = 100;
    s.enemies.push({ ...ally, uid: 78, pos: { x: 2, y: 0 }, profile: 'suporte', weapon: 'emissor', hp: 80, maxHp: 80 });
    expect(planEnemy(s, s.enemies[1]!).kind).toBe('heal');
    endTurn(s);
    expect(ally.hp).toBeGreaterThan(10);
  });

  it('o atirador recua quando você encosta', () => {
    const s = arena();
    const e = s.enemies[0]!;
    e.profile = 'atirador';
    e.weapon = 'emissor';
    e.hp = 9999;
    e.maxHp = 9999;
    endTurn(s);
    expect(Math.abs(e.pos.x - s.pos.x) + Math.abs(e.pos.y - s.pos.y)).toBeGreaterThan(1);
  });

  it('o chefe anuncia o golpe numa rodada e só acerta na seguinte, se você não sair das casas marcadas', () => {
    const fresh = () => {
      const s = arena();
      Object.assign(s.enemies[0]!, { profile: 'chefe', boss: true, pos: { x: 0, y: 0 }, hp: 9999, maxHp: 9999 });
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

  it('com metade do HP o chefe chama reforços uma vez', () => {
    const s = arena();
    Object.assign(s.enemies[0]!, { profile: 'chefe', boss: true, pos: { x: 3, y: 1 }, hp: 40, maxHp: 100 });
    s.round = 1;
    expect(planEnemy(s, s.enemies[0]!).kind).toBe('summon');
    endTurn(s);
    expect(s.enemies.length).toBeGreaterThan(1);
    expect(s.enemies[0]!.summoned).toBe(true);
  });

  it('a área ameaçada inclui as casas ao alcance de um bruto depois dos passos dele', () => {
    const s = arena();
    const threat = threatenedCells(s);
    expect(threat.has(`${s.pos.x},${s.pos.y}`)).toBe(true);
    expect(threat.has(`${s.enemies[0]!.pos.x},${s.enemies[0]!.pos.y}`)).toBe(true);
  });

  it('o turno inimigo pode andar um inimigo por vez (para a tela animar)', () => {
    const s = arena();
    s.enemies.push({ ...s.enemies[0]!, uid: 79, pos: { x: 0, y: 0 } });
    expect(beginEnemyTurn(s).ok).toBe(true);
    expect(s.phase).toBe('enemy');
    const first = enemyStep(s);
    const second = enemyStep(s);
    expect(new Set([first, second]).size).toBe(2);
    expect(enemyStep(s)).toBeNull();
    finishEnemyTurn(s);
    expect(s.phase).toBe('player');
    expect(s.round).toBe(2);
  });
});

describe('arsenal do catálogo', () => {
  it('tem as 20 armas e as 210 fusões com nome, número e texto do catálogo', () => {
    expect(CATALOG_ORDER).toHaveLength(20);
    const all = allFusions();
    expect(all).toHaveLength(210);
    expect(new Set(all.map((f) => f.weapon.name)).size).toBe(210);
    expect(all.map((f) => f.weapon.number)).toEqual(Array.from({ length: 210 }, (_, i) => i + 1));
    expect(fusionNumber('espada', 'martelo')).toBe(20);
    expect(fusionNumber('correntes', 'enxameador')).toBe(190);
    expect(fusionNumber('laminas', 'laminas')).toBe(191);
    expect(fusionNumber('enxameador', 'enxameador')).toBe(210);
    expect(fusionDescription('espada', 'laminas')).toBe('Ataca rapidamente um inimigo adjacente. O componente espada longa acrescenta uma estocada curta e precisa.');
    expect(fusionDescription('laminas', 'laminas')).toBe('Ataca rapidamente um inimigo adjacente. A segunda arma acrescenta cortes rápidos adjacentes, ampliando as possibilidades da ação.');
    expect(fusionWeapon('emissor', 'martelo').mechanics).toEqual(['abalo', 'rajada']);
    expect(fusionWeapon('martelo', 'martelo').mechanics).toEqual(['abalo', 'abalo']);
  });
});

describe('formatos e mecanismos', () => {
  const armed = (weapon: WeaponId, at = { x: 3, y: 3 }) => {
    const s = arena();
    s.team[0]!.weapon = weapon;
    Object.assign(s.enemies[0]!, { pos: at, hp: 9999, maxHp: 9999 });
    return s;
  };

  it('aura atinge as casas em volta e cone abre um leque à frente', () => {
    expect(attackArea(armed('orbital'), { x: 3, y: 5 })).toHaveLength(5);
    expect(attackArea(armed('dispersao'), { x: 3, y: 5 })).toHaveLength(4);
  });

  it('homing mira qualquer inimigo até o alcance, sem precisar de linha', () => {
    const s = armed('enxameador', { x: 1, y: 4 });
    expect(attackTargets(s)).toContainEqual({ x: 1, y: 4 });
  });

  it('armadilha vai para uma casa vazia e dispara em quem passa por ela', () => {
    const s = armed('armadilhas', { x: 3, y: 2 });
    expect(attack(s, { x: 3, y: 4 }).ok).toBe(true);
    expect(s.traps).toHaveLength(1);
    s.enemies[0]!.weapon = 'laminas';
    endTurn(s);
    expect(s.traps).toHaveLength(0);
    expect(s.enemies[0]!.hp).toBeLessThan(9999);
  });

  it('bloqueio amortece o próximo golpe e revida quem bate de perto', () => {
    const s = armed('escudo', { x: 3, y: 5 });
    attack(s, { x: 3, y: 5 });
    expect(s.guard.reduce).toBe(0.4);
    const hp = s.enemies[0]!.hp;
    endTurn(s);
    expect(s.guard.reduce).toBe(0);
    expect(s.enemies[0]!.hp).toBeLessThan(hp);
  });

  it('barreira fecha a casa à sua frente', () => {
    const s = armed('barreira');
    attack(s, { x: 3, y: 3 });
    expect(s.barriers.map((b) => b.pos)).toContainEqual({ x: 3, y: 5 });
    expect(reachable(s).has('3,5')).toBe(false);
  });

  it('ação sustentada queima o alvo no fim da rodada', () => {
    const s = armed('continuo', { x: 3, y: 4 });
    attack(s, { x: 3, y: 4 });
    expect(s.enemies[0]!.burn).not.toBeNull();
    s.enemies[0]!.pos = { x: 0, y: 0 };
    const hp = s.enemies[0]!.hp;
    endTurn(s);
    expect(s.enemies[0]!.hp).toBeLessThan(hp);
  });

  it('a corrente puxa o alvo até encostar', () => {
    const s = armed('correntes');
    attack(s, { x: 3, y: 3 });
    expect(s.enemies[0]!.pos).toEqual({ x: 3, y: 5 });
  });
});

describe('munição', () => {
  it('Pokémon de dois tipos escolhe tipo 1, tipo 2 ou mista; de um tipo só tem uma opção', () => {
    const s = arena([mon('duplo', {}, ['water', 'electric']), mon('simples')]);
    expect(ammoOptions(s.team[0]!)).toEqual([['water'], ['electric'], ['water', 'electric'], ['electric', 'water']]);
    expect(ammoOptions(s.team[1]!)).toEqual([['fire']]);
    expect(setAmmo(s, 0, ['electric']).ok).toBe(true);
    expect(attacker(s).ammo).toEqual(['electric']);
    expect(setAmmo(s, 0, ['electric', 'water']).ok).toBe(true);
    expect(setAmmo(s, 0, ['fire']).ok).toBe(false);
    expect(s.ap).toBe(START_AP);
  });
});

describe('andares por geração', () => {
  const gens: EnemySpecies[] = [
    { dexId: 19, name: 'Rattata', types: ['normal'], stats: rattata, generation: 0 },
    { dexId: 261, name: 'Poochyena', types: ['dark'], stats: rattata, generation: 2 },
  ];

  it('cada andar sorteia uma geração, que escolhe os inimigos e o cenário', () => {
    const s = startDungeon([mon('a')], gens, 7);
    expect(biomeOf(s.biome).gen).toBe(s.biome);
    expect(s.log[s.log.length - 1]).toContain(biomeOf(s.biome).name);
    const native = gens.find((g) => g.generation === s.biome);
    if (native) expect(s.enemies.every((e) => e.dexId === native.dexId)).toBe(true);
  });

  it('mais fundo, os selvagens aparecem evoluídos (com dados reais)', () => {
    const r = evolveForDepth(gens[0]!, 6, () => 0);
    expect(r.dexId).toBe(20);
    expect(evolveForDepth(gens[0]!, 1, () => 0).dexId).toBe(19);
  });

  it('água custa 2 PA para quem não nada nem voa', () => {
    const s = arena();
    s.hazards = [{ pos: { x: 2, y: GRID_H - 1 }, kind: 'agua' }];
    expect(stepCost(s, { x: 2, y: GRID_H - 1 })).toBe(2);
    expect(reachable(s).get(`2,${GRID_H - 1}`)).toBe(2);
    s.team[0]!.types = ['water'];
    expect(stepCost(s, { x: 2, y: GRID_H - 1 })).toBe(1);
  });

  it('lava queima quem termina a rodada nela, menos Fogo e Voador', () => {
    const s = arena([mon('grama', {}, ['grass']), mon('fogo', {}, ['fire'])]);
    s.enemies[0]!.pos = { x: 0, y: 0 };
    s.hazards = [{ pos: { ...s.pos }, kind: 'lava' }];
    expect(hazardAt(s, s.pos)).toBe('lava');
    const hp = s.team[0]!.hp;
    endTurn(s);
    expect(s.team[0]!.hp).toBeLessThan(hp);
    switchTo(s, 1);
    const fireHp = s.team[1]!.hp;
    s.enemies[0]!.pos = { x: 0, y: 0 };
    endTurn(s);
    expect(s.team[1]!.hp).toBe(fireHp);
  });

  it('quem é da geração do andar luta «em casa» e bate mais forte', () => {
    const s = arena();
    s.biome = 4;
    const away = previewAttack(s, s.enemies[0]!.pos).hits[0]!.damage;
    s.biome = 0;
    const home = previewAttack(s, s.enemies[0]!.pos).hits[0]!.damage;
    expect(home).toBeGreaterThan(away);
    expect(HOME_BONUS).toBeGreaterThan(0);
  });
});
