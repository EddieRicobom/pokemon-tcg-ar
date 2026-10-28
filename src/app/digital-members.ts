import { isDigitalInstanceId } from '../core/village/digital';
import type { DigitalPokemonInstance, DigitalState } from '../core/village/digital';
import type { TeamCandidate } from './team';

/**
 * Digital Pokémon como membros da equipe da Caixa e da Box (pedido do dono). Eles não vêm de carta física — nunca
 * entram no cache de cartas, no scan nem no AR (Várias filtra a equipe só por cartas, então eles ficam de fora lá) —,
 * mas podem batalhar e aparecer na Box com um símbolo próprio. Os dados de batalha (ataques) vêm da carta real de
 * origem (`originCardId`), a mesma usada para confirmar a espécie.
 */

/** Candidatos da equipe: sempre "com sprite" (o sprite vem do pacote local ou do GIF na hora). */
export function digitalCandidates(d: DigitalState): TeamCandidate[] {
  return d.instances.map((i) => ({ id: i.instanceId, lastSeenAt: Date.parse(i.grantedAt) || 0, sprite: { state: 'ok' } }));
}

/** Para buscar ataques e dados de batalha: Digital Pokémon usam a carta real de origem; cartas, o próprio id. */
export function dataCardIdFor(cardId: string, d: DigitalState): string {
  if (!isDigitalInstanceId(cardId)) return cardId;
  return d.instances.find((i) => i.instanceId === cardId)?.originCardId ?? cardId;
}

export function digitalInstance(id: string, d: DigitalState): DigitalPokemonInstance | undefined {
  return isDigitalInstanceId(id) ? d.instances.find((i) => i.instanceId === id) : undefined;
}

/** Linha da Arena para um Digital Pokémon: o mesmo formato das cartas, marcado como `digital` (sem scan nem AR sobre carta; entra na Arena 3D). */
export interface DigitalBoxRow {
  id: string;
  schema: number;
  name: string;
  setId: string;
  setName: string;
  localId: string;
  setOfficial: number;
  setTotal: number;
  dexIds: number[];
  reference: { state: 'unavailable' };
  sprite: { state: 'ok' };
  target: { state: 'unavailable' };
  firstSeenAt: number;
  lastSeenAt: number;
  scanCount: number;
  status: 'completo';
  digital: true;
  originCardId: string;
}

export function digitalBoxRows(d: DigitalState): DigitalBoxRow[] {
  return d.instances.map((i) => {
    const at = Date.parse(i.grantedAt) || 0;
    return {
      id: i.instanceId, schema: 1, name: i.name, setId: 'digital', setName: 'Digital Pokémon', localId: '', setOfficial: 0, setTotal: 0,
      dexIds: [i.dexId], reference: { state: 'unavailable' }, sprite: { state: 'ok' }, target: { state: 'unavailable' },
      firstSeenAt: at, lastSeenAt: at, scanCount: 0, status: 'completo', digital: true, originCardId: i.originCardId,
    };
  });
}
