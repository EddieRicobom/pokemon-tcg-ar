import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cardCompanion, cardJourneys, cardJourneyError, CARD_JOURNEYS_KEY, commitCardEvolution, companionCard, recordCardVictories } from './card-evolution-store';
import { applyBackup, buildBackup } from './backup';
import type { CachedCard } from '../cache/types';

const card: CachedCard = { id: 'base1-46', schema: 1, name: 'Charmander', dexIds: [4], setId: 'base1', setName: 'Base', localId: '46', setOfficial: 102, setTotal: 102,
  reference: { state: 'ok', key: 'reference' }, sprite: { state: 'ok', key: '4.gif' }, target: { state: 'ok', key: 'original.mind' }, firstSeenAt: 1, lastSeenAt: 1, scanCount: 1 };
const mon = { id: card.id, dexId: 4, name: card.name };
function earn(): void { for (const t of ['pins', 'battle', 'survival'] as const) recordCardVictories([mon], t); }
beforeEach(() => { localStorage.clear(); cardJourneys.value = {}; cardJourneyError.value = ''; });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('progresso persistente das cartas', () => {
  it('só projeta a forma evoluída no companheiro; reconhecimento, alvo e sprite originais ficam intactos', () => {
    earn();
    expect(commitCardEvolution(mon, 100, 5, 'charmeleon-real')).toBe(true);
    const projected = companionCard(card);
    expect(projected.name).toBe('Charmeleon');
    expect(projected.dexIds).toEqual([5]);
    expect(card.name).toBe('Charmander');
    expect(card.dexIds).toEqual([4]);
    expect(projected.target).toBe(card.target);
    expect(projected.reference).toBe(card.reference);
    expect(cardCompanion(card)?.id).toBe(card.id);
    expect(JSON.parse(localStorage.getItem(CARD_JOURNEYS_KEY)!)[card.id].history).toEqual([4]);
  });
  it('se o armazenamento recusar, não anuncia evolução nem perde as provas', () => {
    earn();
    const before = cardJourneys.value;
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('cheio'); } });
    expect(commitCardEvolution(mon, 100, 5, 'charmeleon-real')).toBe(false);
    expect(cardJourneys.value).toBe(before);
    expect(cardJourneyError.value).toContain('Não consegui guardar');
    expect(companionCard(card)).toBe(card);
  });
  it('entra no backup com provas, origem e evolução', () => {
    earn();
    commitCardEvolution(mon, 100, 5, 'charmeleon-real');
    const file = buildBackup(localStorage);
    localStorage.clear();
    applyBackup(file, localStorage);
    expect(JSON.parse(localStorage.getItem(CARD_JOURNEYS_KEY)!)[card.id]).toMatchObject({ originDexId: 4, dexId: 5, history: [4] });
  });
  it('não reutiliza uma evolução para uma carta cuja espécie de origem é diferente', () => {
    earn(); commitCardEvolution(mon, 100, 5, 'charmeleon-real');
    const changed = { ...card, name: 'Squirtle', dexIds: [7] };
    expect(companionCard(changed)).toBe(changed);
  });
});
