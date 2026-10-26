import { pinFromSpec } from './pins';
import { TYPE_LABELS_PT } from './pokemon-data';
import type { PinSpec } from './pins';
import type { CardBattleInfo, PokemonProfile, PokemonType } from './pokemon-data';
import type { CachedCard } from '../cache/types';

export interface PinCardInfo { state: 'loading' | 'ok'; profile: PokemonProfile | null; card: CardBattleInfo | null }

function energyTypeOf(name: string): PokemonType | null {
  const lower = name.toLowerCase();
  const map: Record<string, PokemonType> = { lightning: 'electric', darkness: 'dark', metal: 'steel' };
  const type = map[lower] ?? lower;
  return (Object.keys(TYPE_LABELS_PT) as PokemonType[]).find((t) => t === type) ?? null;
}

/** A ficha usa os dados da espécie quando disponíveis e os tipos da carta como reserva. */
export function pinSpecOf(card: CachedCard, info?: PinCardInfo): PinSpec {
  const cardTypes = (info?.card?.types ?? []).map((t) => energyTypeOf(t)).filter((t): t is PokemonType => t !== null);
  return { id: card.id, name: card.name, types: info?.profile?.types.length ? info.profile.types : cardTypes,
    stats: info?.profile?.stats ?? null, weightKg: info?.profile?.weightKg ?? null, attacks: info?.card?.attacks };
}

/** Informações da lista antes da partida, com aviso explícito para dados neutros. */
export function pinRowInfo(card: CachedCard, info?: PinCardInfo): { cost: number | null; types: PokemonType[]; moves: number; note: string } {
  if (!info || info.state === 'loading') return { cost: null, types: [], moves: 0, note: 'carregando…' };
  const pin = pinFromSpec(pinSpecOf(card, info), 0);
  return { cost: pin.cost, types: pin.types, moves: pin.moves.length, note: pin.estimated ? 'sem todos os dados (valores neutros)' : '' };
}
