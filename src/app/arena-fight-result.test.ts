import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./trainer-store', async (original) => ({ ...(await original<typeof import('./trainer-store')>()), recordEvent: vi.fn() }));

import { finishLeagueFight } from './arena-fight-result';
import { league, pendingChallenge } from './league-store';
import { challengeById, emptyLeague, statusOf } from '../core/league';

describe('fim da luta da Liga', () => {
  beforeEach(() => {
    localStorage.clear();
    league.value = emptyLeague();
    pendingChallenge.value = 'gym-0';
  });

  it('vencer dá a insígnia, abre o próximo ginásio e já deixa o líder dele marcado', () => {
    const first = challengeById('gym-0')!;
    const result = finishLeagueFight(first, true);
    expect(statusOf(league.value, first)).toBe('beaten');
    expect(result.next?.id).toBe('gym-1');
    expect(pendingChallenge.value).toBe('gym-1');
    expect(statusOf(league.value, result.next!)).toBe('open');
  });

  it('perder não muda a Liga e mantém o desafio para a revanche', () => {
    const first = challengeById('gym-0')!;
    const result = finishLeagueFight(first, false);
    expect(statusOf(league.value, first)).toBe('open');
    expect(result.next).toBeNull();
    expect(pendingChallenge.value).toBe('gym-0');
  });
});
