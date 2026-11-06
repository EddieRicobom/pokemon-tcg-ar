import { pendingChallenge, league, recordLeagueResult } from './league-store';
import { cardJourneyError, recordCardVictories } from './card-evolution-store';
import { recordEvent } from './trainer-store';
import { withVillage } from './wallet';
import { nextChallenge, regionOf } from '../core/league';
import type { Challenge } from '../core/league';
import { dayKey } from '../core/trainer';
import { BATTLE_REWARDS_PER_DAY, battleRewardsLeft, claimBattleReward } from '../core/village/life';

/** O que fica gravado no fim de uma luta da Arena. A tela só mostra as mensagens. */

export interface LeagueFightResult {
  message: string;
  /** Próximo desafio aberto da mesma região, quando a pessoa venceu. */
  next: Challenge | null;
}

/** Desafio da Liga: grava o resultado e, na vitória, deixa o próximo líder à mão. */
export function finishLeagueFight(challenge: Challenge, won: boolean): LeagueFightResult {
  const { message } = recordLeagueResult(challenge, won);
  if (!won) return { message, next: null };
  const next = nextChallenge(league.value, regionOf(challenge).id) ?? null;
  pendingChallenge.value = next?.id ?? null;
  return { message, next };
}

export interface FightCompanion {
  id: string;
  dexId: number;
  name: string;
  digital: boolean;
}

/** Luta fora da Liga: conta para o Treinador, soma vitórias às cartas de quem ficou de pé e rende as moedas do dia. */
export function finishTeamFight(team: readonly FightCompanion[], won: boolean, hpLeft: readonly number[]): string[] {
  const notes: string[] = [];
  if (won && !recordCardVictories(team.filter((mon, index) => !mon.digital && (hpLeft[index] ?? 0) > 0), 'battle')) {
    notes.push(cardJourneyError.value ?? 'Não consegui guardar as vitórias das cartas.');
  }
  recordEvent({ type: 'battle', team: true });
  const today = dayKey(new Date());
  let gained = 0;
  let left = 0;
  withVillage((village) => {
    gained = claimBattleReward(village, today);
    left = battleRewardsLeft(village, today);
    return gained > 0;
  });
  notes.push(gained > 0
    ? `+${gained} moedas! (${BATTLE_REWARDS_PER_DAY - left} de ${BATTLE_REWARDS_PER_DAY} hoje)`
    : `As lutas de hoje já renderam as moedas (${BATTLE_REWARDS_PER_DAY} de ${BATTLE_REWARDS_PER_DAY}). Amanhã tem mais.`);
  return notes;
}
