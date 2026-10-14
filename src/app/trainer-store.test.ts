import { beforeEach, describe, expect, it } from 'vitest';
import { dismissReward, recordEvent, resetTrainerForTests, rewardFeed, syncTrainerHistory, trainer } from './trainer-store';

const scan = (n: number) => ({ type: 'scan' as const, cardId: `s-${n}`, setId: 's', setName: 'Coleção', setTotal: 50 });
const noon = new Date(2026, 9, 14, 12);

describe('armazém do Treinador', () => {
  beforeEach(() => resetTrainerForTests());

  it('registra, guarda no aparelho e avisa', () => {
    const rewards = recordEvent(scan(1), noon);
    expect(rewards.length).toBeGreaterThan(0);
    expect(trainer.value.xp).toBeGreaterThan(0);
    expect(JSON.parse(localStorage.getItem('tcg-ar-trainer-v1')!).xp).toBe(trainer.value.xp);
    expect(rewardFeed.value.length).toBeGreaterThan(0);
    expect(rewardFeed.value.length).toBeLessThanOrEqual(4);
    const first = rewardFeed.value[0]!;
    dismissReward(first.key);
    expect(rewardFeed.value.find((i) => i.key === first.key)).toBeUndefined();
  });

  it('importa o histórico sem XP e sem mudar nada na segunda vez', () => {
    const cards = [{ id: 's-1', setId: 's', setName: 'Coleção', setOfficial: 50, scanCount: 2 }];
    syncTrainerHistory(cards, noon);
    expect(trainer.value.xp).toBe(0);
    expect(trainer.value.cardIds).toEqual(['s-1']);
    const before = JSON.stringify(trainer.value);
    syncTrainerHistory(cards, noon);
    expect(JSON.stringify(trainer.value)).toBe(before);
  });
});
