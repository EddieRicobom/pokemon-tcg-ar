import { nextEvolutions, speciesName } from './survivor-evolution';
import type { BattleResult, Fighter } from './battle';
import type { SurvivorSummary } from './survivor';

export type EvolutionTrial = 'survival' | 'battle' | 'pins';
export interface CardCompanion { id: string; dexId: number; name: string; shiny?: boolean; accessory?: string | null; digital?: boolean }
export interface CardJourney {
  originDexId: number;
  dexId: number;
  /** Carta real da forma atual, usada apenas nos dados de combate. */
  battleCardId?: string;
  history: number[];
  wins: Record<EvolutionTrial, boolean>;
}
export type CardJourneys = Record<string, CardJourney>;
export const emptyTrials = (): CardJourney['wins'] => ({ survival: false, battle: false, pins: false });

export function validCompanion(mon: CardCompanion): boolean {
  return !!mon.id && !mon.id.startsWith('dp_') && speciesName(mon.dexId) !== '';
}

export function journeyFor(state: CardJourneys, mon: CardCompanion): CardJourney {
  return state[mon.id] ?? { originDexId: mon.dexId, dexId: mon.dexId, history: [], wins: emptyTrials() };
}

/** A prova pertence à carta e à forma que entrou na partida; resultados atrasados não contam na próxima forma. */
export function recordCardWin(state: CardJourneys, mon: CardCompanion, trial: EvolutionTrial): CardJourneys {
  if (!validCompanion(mon)) return state;
  const journey = journeyFor(state, mon);
  if (journey.dexId !== mon.dexId || journey.wins[trial]) return state;
  return { ...state, [mon.id]: { ...journey, wins: { ...journey.wins, [trial]: true } } };
}

export function canEvolveCard(journey: CardJourney, friendship: number, nextDexId: number, withTrustStone = false): boolean {
  return friendship >= 100 && (withTrustStone || (journey.wins.survival && journey.wins.battle && journey.wins.pins))
    && nextEvolutions(journey.dexId).includes(nextDexId);
}

export function evolveCard(state: CardJourneys, mon: CardCompanion, friendship: number, nextDexId: number, battleCardId: string, withTrustStone = false): CardJourneys | null {
  if (!validCompanion(mon) || !battleCardId) return null;
  const journey = journeyFor(state, mon);
  if (journey.dexId !== mon.dexId || !canEvolveCard(journey, friendship, nextDexId, withTrustStone)) return null;
  return { ...state, [mon.id]: { ...journey, dexId: nextDexId, battleCardId, history: [...journey.history, journey.dexId], wins: emptyTrials() } };
}

/** Saves antigos começam sem provas; uma cadeia inválida nunca troca silenciosamente a espécie. */
export function normalizeCardJourneys(raw: unknown): CardJourneys {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: CardJourneys = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object' || id === '__proto__' || id === 'constructor' || id === 'prototype') continue;
    const v = value as Partial<CardJourney>;
    if (!validCompanion({ id, dexId: v.originDexId ?? 0, name: '' }) || !Number.isInteger(v.dexId)) continue;
    if (!Array.isArray(v.history) || v.history.length > 5) continue;
    const path = [...v.history, v.dexId!];
    if (path[0] !== v.originDexId || path.some((dexId, i) => !Number.isInteger(dexId) || (i > 0 && !nextEvolutions(path[i - 1]!).includes(dexId)))) continue;
    if (v.history.length > 0 && (typeof v.battleCardId !== 'string' || !v.battleCardId)) continue;
    out[id] = { originDexId: v.originDexId!, dexId: v.dexId!, history: [...v.history],
      ...(typeof v.battleCardId === 'string' ? { battleCardId: v.battleCardId } : {}),
      wins: { survival: v.wins?.survival === true, battle: v.wins?.battle === true, pins: v.wins?.pins === true } };
  }
  return out;
}

/** Somente os participantes do lado vencedor; banco e adversários não recebem prova. */
export function battleWinners(fighters: readonly Pick<Fighter, 'id'>[], result: BattleResult): string[] {
  return fighters.filter((_, i) => result.winningTeam === undefined
    ? i === result.winner : result.teams?.[i] === result.winningTeam).map((f) => f.id);
}

/** A vitória da Torre é zerar o modo normal. Matar inimigos, sair ou jogar no infinito não basta. */
export function survivalWinners(mon: CardCompanion | null, summary: Pick<SurvivorSummary, 'finalBossBeaten' | 'infinite'>): CardCompanion[] {
  return mon && validCompanion(mon) && summary.finalBossBeaten && !summary.infinite ? [mon] : [];
}
