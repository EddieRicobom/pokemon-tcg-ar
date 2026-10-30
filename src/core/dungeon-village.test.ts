import { describe, expect, it } from 'vitest';
import { emptyVillage, normalizeVillage } from './village/life';
import { startDungeon } from './dungeon';
import type { DungeonState, EnemySpecies, MemberInput } from './dungeon';
import { bringGems, COINS_PER_FLOOR, DAILY_REWARDS, expeditionRewards, LOVE_CANDY, packLunch, settleExpedition, takeFromVault } from './dungeon-village';
import { SURVIVOR_MEGA_ITEM } from './survivor-mega';
import { VAULT_SIZE } from './village/dungeon-vault';
import type { BaseStats } from './survivor-moves';

const stats: BaseStats = { hp: 60, attack: 80, defense: 60, spAttack: 50, spDefense: 60, speed: 90 };
const team: MemberInput[] = [{ id: 'a', dexId: 4, name: 'a', types: ['fire'], stats }];
const pool: EnemySpecies[] = [{ dexId: 19, name: 'Rattata', types: ['normal'], stats }];
const spawn = { x: 1, y: 1 };

function run(phase: DungeonState['phase'], deepest: number, bosses: number): DungeonState {
  const s = startDungeon(team, pool, 9);
  s.phase = phase;
  s.stats.deepest = deepest;
  s.stats.bosses = bosses;
  s.bag = [{ id: 1, kind: 'rubi', tier: 2, legendary: false }, { id: 2, kind: 'eco', tier: 1, legendary: true }];
  return s;
}

describe('Masmorra e Vila', () => {
  it('sair com o espólio rende moedas por andar, Love Candy por chefe e fragmentos Mega, e guarda as gemas', () => {
    const v = emptyVillage(1, spawn);
    const r = settleExpedition(v, run('retired', 23, 4), '2026-10-30');
    expect(r.coins).toBe(23 * COINS_PER_FLOOR);
    expect(r.loveCandy).toBe(3);
    expect(r.megaShards).toBe(2);
    expect(v.inventory[LOVE_CANDY]).toBe(3);
    expect(v.inventory[SURVIVOR_MEGA_ITEM]).toBe(2);
    expect(v.dungeon.gems.map((g) => g.kind)).toEqual(['eco', 'rubi']);
    expect(v.dungeon.bestFloor).toBe(23);
  });

  it('quem cai não ganha prêmio nem guarda gemas, mas o recorde fica', () => {
    const v = emptyVillage(1, spawn);
    const r = settleExpedition(v, run('lost', 12, 2), '2026-10-30');
    expect([r.coins, r.loveCandy, r.megaShards, r.kept.length]).toEqual([0, 0, 0, 0]);
    expect(v.dungeon.bestFloor).toBe(12);
  });

  it('só as primeiras expedições do dia são premiadas; o cofre tem limite', () => {
    const v = emptyVillage(1, spawn);
    for (let i = 0; i < DAILY_REWARDS; i++) expect(settleExpedition(v, run('retired', 5, 1), 'dia').capped).toBe(false);
    const late = expeditionRewards(run('retired', 5, 1), v, 'dia');
    expect(late.capped).toBe(true);
    expect(late.coins).toBe(0);
    expect(expeditionRewards(run('retired', 5, 1), v, 'outro-dia').capped).toBe(false);
    for (let i = 0; i < 10; i++) settleExpedition(v, run('retired', 5, 0), 'x');
    expect(v.dungeon.gems.length).toBe(VAULT_SIZE);
  });

  it('leva até 2 gemas do cofre (que saem dele) e a marmita dá poção e fôlego', () => {
    const v = emptyVillage(1, spawn);
    settleExpedition(v, run('retired', 5, 0), 'd');
    const ids = v.dungeon.gems.map((g) => g.id);
    const taken = takeFromVault(v, ids);
    expect(taken).toHaveLength(2);
    expect(v.dungeon.gems).toHaveLength(0);
    const s = startDungeon(team, pool, 3);
    bringGems(s, taken);
    expect(s.bag).toHaveLength(2);
    const before = { potions: s.potions, hp: s.team[0]!.maxHp };
    packLunch(s, { name: 'Sanduíche' });
    expect(s.potions).toBe(before.potions + 1);
    expect(s.team[0]!.maxHp).toBeGreaterThan(before.hp);
  });

  it('o cofre entra no save da Vila e sobrevive à normalização', () => {
    const v = emptyVillage(1, spawn);
    settleExpedition(v, run('retired', 7, 0), 'd');
    const back = normalizeVillage(JSON.parse(JSON.stringify(v)), 1, spawn);
    expect(back.dungeon.gems.map((g) => g.kind)).toEqual(['eco', 'rubi']);
    expect(back.dungeon.bestFloor).toBe(7);
  });
});
