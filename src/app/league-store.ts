import { ref } from 'vue';
import { applyLeagueResult, emptyLeague, normalizeLeague } from '../core/league';
import type { Challenge, LeagueOutcome, LeagueProgress } from '../core/league';
import { recordEvent } from './trainer-store';

const KEY = 'tcg-ar-liga-v1';

function read(): LeagueProgress {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeLeague(JSON.parse(raw)) : emptyLeague();
  } catch {
    return emptyLeague();
  }
}

/** Insígnias e corrida da Elite 4, só neste aparelho. */
export const league = ref<LeagueProgress>(read());

/** Desafio escolhido no Treinador, à espera da Caixa (a batalha acontece lá). */
export const pendingChallenge = ref<string | null>(null);

/** Guarda o resultado de uma batalha da Liga e dá o XP/energia ao Treinador quando vence. */
export function recordLeagueResult(challenge: Challenge, won: boolean): LeagueOutcome {
  const outcome = applyLeagueResult(league.value, challenge, won);
  league.value = outcome.progress;
  try {
    localStorage.setItem(KEY, JSON.stringify(outcome.progress));
  } catch {
    // Sem armazenamento: o progresso vale até fechar o app.
  }
  if (won) {
    const title = challenge.kind === 'gym' && outcome.first ? (challenge.badge?.name ?? 'Insígnia') : challenge.kind === 'champion' ? 'Campeão da Liga!' : `Vitória contra ${challenge.leader}`;
    recordEvent({ type: 'league', title, xp: challenge.xp, first: outcome.first });
  } else {
    recordEvent({ type: 'battle', team: true });
  }
  return outcome;
}
