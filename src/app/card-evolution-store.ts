import { ref } from 'vue';
import { evolveCard, normalizeCardJourneys, recordCardWin } from '../core/card-evolution';
import type { CardCompanion, CardJourneys, EvolutionTrial } from '../core/card-evolution';
import { speciesName } from '../core/survivor-evolution';
import { spriteIdOf } from '../core/dex-form';
import type { CachedCard } from '../cache/types';

export const CARD_JOURNEYS_KEY = 'tcg-ar-card-journeys-v1';
function read(): CardJourneys {
  try { return normalizeCardJourneys(JSON.parse(localStorage.getItem(CARD_JOURNEYS_KEY) ?? 'null')); }
  catch { return {}; }
}
export const cardJourneys = ref<CardJourneys>(read());
export const cardJourneyError = ref('');
function commit(next: CardJourneys): boolean {
  try {
    localStorage.setItem(CARD_JOURNEYS_KEY, JSON.stringify(next));
    cardJourneys.value = next;
    cardJourneyError.value = '';
    return true;
  } catch {
    cardJourneyError.value = 'Não consegui guardar o progresso de evolução. Libere espaço no aparelho e tente de novo.';
    return false;
  }
}

export function recordCardVictories(mons: readonly CardCompanion[], trial: EvolutionTrial): boolean {
  let next = cardJourneys.value;
  for (const mon of mons) next = recordCardWin(next, mon, trial);
  return next === cardJourneys.value || commit(next);
}

export function commitCardEvolution(mon: CardCompanion, friendship: number, nextDexId: number, battleCardId: string): boolean {
  const next = evolveCard(cardJourneys.value, mon, friendship, nextDexId, battleCardId);
  return next !== null && commit(next);
}

/** Projeção só para o companheiro. Nunca altera a carta reconhecida nem seu alvo MindAR. */
export function companionCard(card: CachedCard): CachedCard {
  const journey = cardJourneys.value[card.id];
  if (!journey?.history.length || journey.originDexId !== spriteIdOf(card)) return card;
  return { ...card, name: speciesName(journey.dexId), dexIds: [journey.dexId], mega: false };
}

export function cardCompanion(card: CachedCard): CardCompanion | null {
  const projected = companionCard(card);
  const dexId = spriteIdOf(projected);
  return dexId === undefined ? null : { id: card.id, dexId, name: projected.name };
}

export function evolvedBattleCardId(id: string): string | undefined {
  return cardJourneys.value[id]?.battleCardId;
}
