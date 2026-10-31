import { describe, expect, it } from 'vitest';
import type { CachedCard, SlotInfo } from '../cache/types';
import { cardArchetypeIds } from './card-archetypes';

const slot = (state: SlotInfo['state']): SlotInfo => ({ state });
function card(over: Partial<CachedCard> = {}): CachedCard {
  return {
    id: 'base1-58', schema: 1, name: 'Pikachu', setId: 'base1', setName: 'Base Set', localId: '58', setOfficial: 102, setTotal: 102,
    dexIds: [25], reference: slot('ok'), sprite: slot('ok'), target: slot('ok'), firstSeenAt: 0, lastSeenAt: 0, scanCount: 1, ...over,
  };
}

describe('arquétipos da carta escaneada', () => {
  it('junta espécie, raridade, coleção e o shiny guardado', () => {
    const ids = cardArchetypeIds(card({ rarity: 'Common', shiny: true }));
    expect(ids).toEqual(expect.arrayContaining(['tipo-electric', 'regiao-kanto', 'comum', 'classica-wotc', 'carta-fisica', 'shiny']));
    expect(ids).not.toContain('digital');
  });

  it('usa a forma impressa e os detalhes do TCGdex', () => {
    const ids = cardArchetypeIds(card({ name: 'Alolan Vulpix VSTAR', dexIds: [37], setId: 'swsh11', traits: { suffix: 'VSTAR', stage: 'VSTAR' } }));
    expect(ids).toEqual(expect.arrayContaining(['vstar', 'tipo-ice', 'forma-regional']));
  });

  it('carta sem espécie ainda ganha os arquétipos da carta', () => {
    expect(cardArchetypeIds(card({ dexIds: [], name: 'Pikachu' }))).toContain('carta-fisica');
  });
});
