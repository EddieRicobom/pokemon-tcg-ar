import { describe, expect, it } from 'vitest';
import { BATTLE_REWARD_COINS, BATTLE_REWARDS_PER_DAY, battleRewardsLeft, claimBattleReward, emptyVillage, normalizeVillage } from './life';

const fresh = () => emptyVillage(1, { x: 10, y: 10 });

describe('moedas por batalha da Caixa', () => {
  it('cada batalha rende 100 moedas, até 3 por dia', () => {
    const s = fresh();
    const start = s.coins;
    expect(battleRewardsLeft(s, '2026-10-16')).toBe(BATTLE_REWARDS_PER_DAY);
    for (let i = 0; i < BATTLE_REWARDS_PER_DAY; i++) expect(claimBattleReward(s, '2026-10-16')).toBe(BATTLE_REWARD_COINS);
    expect(s.coins).toBe(start + BATTLE_REWARD_COINS * BATTLE_REWARDS_PER_DAY);
    // A 4ª batalha do dia não rende nada.
    expect(claimBattleReward(s, '2026-10-16')).toBe(0);
    expect(s.coins).toBe(start + 300);
    expect(battleRewardsLeft(s, '2026-10-16')).toBe(0);
  });

  it('no dia seguinte o limite volta', () => {
    const s = fresh();
    for (let i = 0; i < 4; i++) claimBattleReward(s, '2026-10-16');
    expect(battleRewardsLeft(s, '2026-10-17')).toBe(3);
    expect(claimBattleReward(s, '2026-10-17')).toBe(100);
  });

  it('sobrevive a salvar e carregar; dados estranhos não liberam recompensa extra', () => {
    const s = fresh();
    claimBattleReward(s, '2026-10-16');
    claimBattleReward(s, '2026-10-16');
    const loaded = normalizeVillage(JSON.parse(JSON.stringify(s)), 1, { x: 10, y: 10 });
    expect(battleRewardsLeft(loaded, '2026-10-16')).toBe(1);
    const tampered = normalizeVillage({ ...JSON.parse(JSON.stringify(s)), battleCoins: { day: '2026-10-16', count: -5 } }, 1, { x: 10, y: 10 });
    expect(battleRewardsLeft(tampered, '2026-10-16')).toBe(3);
    const old = normalizeVillage({ ...JSON.parse(JSON.stringify(s)), battleCoins: undefined }, 1, { x: 10, y: 10 });
    expect(old.battleCoins).toEqual({ day: '', count: 0 });
  });
});
