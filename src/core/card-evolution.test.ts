import { describe, expect, it } from 'vitest';
import { battleWinners, canEvolveCard, evolveCard, journeyFor, normalizeCardJourneys, recordCardWin, survivalWinners } from './card-evolution';
import type { CardJourneys, EvolutionTrial } from './card-evolution';

const mon = { id: 'base1-46', dexId: 4, name: 'Charmander' };
function earned(): CardJourneys {
  return (['survival', 'battle', 'pins'] as EvolutionTrial[]).reduce((s, trial) => recordCardWin(s, mon, trial), {});
}
describe('evolução do companheiro da carta', () => {
  it('na Torre, só credita o companheiro que entrou na corrida vitoriosa, sem reserva nem infinito', () => {
    expect(survivalWinners(mon, { finalBossBeaten: false, infinite: false })).toEqual([]);
    expect(survivalWinners(mon, { finalBossBeaten: true, infinite: false })).toEqual([mon]);
    expect(survivalWinners(mon, { finalBossBeaten: true, infinite: true })).toEqual([]);
    expect(survivalWinners(null, { finalBossBeaten: true, infinite: false })).toEqual([]);
  });
  it('exige 100 de amizade e cada uma das três vitórias, em qualquer ordem', () => {
    const full = earned();
    expect(canEvolveCard(full[mon.id]!, 99, 5)).toBe(false);
    expect(canEvolveCard(full[mon.id]!, 100, 5)).toBe(true);
    for (const trial of ['survival', 'battle', 'pins'] as const) {
      expect(canEvolveCard({ ...full[mon.id]!, wins: { ...full[mon.id]!.wins, [trial]: false } }, 100, 5)).toBe(false);
    }
    expect(canEvolveCard(full[mon.id]!, 100, 6)).toBe(false);
  });
  it('não transfere vitórias entre cartas da mesma espécie nem concede aos digitais', () => {
    const state = earned();
    expect(journeyFor(state, { ...mon, id: 'outra' }).wins.battle).toBe(false);
    expect(recordCardWin(state, { ...mon, id: 'dp_presente' }, 'battle')).toBe(state);
  });
  it('evolui preservando origem e identidade e exige novas vitórias para a próxima forma', () => {
    const state = earned();
    const next = evolveCard(state, mon, 100, 5, 'carta-charmeleon')!;
    expect(next[mon.id]).toMatchObject({ originDexId: 4, dexId: 5, history: [4], wins: { survival: false, battle: false, pins: false } });
    expect(state[mon.id]!.dexId).toBe(4);
    expect(recordCardWin(next, mon, 'battle')).toBe(next);
    expect(evolveCard(next, { ...mon, dexId: 5 }, 100, 6, 'charizard')).toBeNull();
    expect(normalizeCardJourneys(JSON.parse(JSON.stringify(next)))).toEqual(next);
  });
  it('aceita ramos reais e rejeita evoluções inventadas, forma final e prova incompleta', () => {
    const eevee = { id: 'eevee', dexId: 133, name: 'Eevee' };
    const state = (['survival', 'battle', 'pins'] as const).reduce((s, t) => recordCardWin(s, eevee, t), {});
    expect(evolveCard(state, eevee, 100, 134, 'vaporeon')).not.toBeNull();
    expect(evolveCard(state, eevee, 100, 25, 'pikachu')).toBeNull();
    expect(evolveCard({}, mon, 100, 5, 'charmeleon')).toBeNull();
  });
  it('migra saves ausentes e descarta cadeias corrompidas e valores truthy', () => {
    expect(normalizeCardJourneys(undefined)).toEqual({});
    expect(normalizeCardJourneys({ bad: { originDexId: 4, dexId: 6, history: [4] } })).toEqual({});
    expect(normalizeCardJourneys({ a: { originDexId: 4, dexId: 4, history: [], wins: { battle: 'sim' } } }).a!.wins.battle).toBe(false);
  });
  it('conta apenas o vencedor individual ou os participantes da equipe vencedora', () => {
    const fighters = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const result = { turns: [], winner: 2, hpLeft: [0, 0, 5], reason: 'ko' as const };
    expect(battleWinners(fighters, result)).toEqual(['c']);
    expect(battleWinners(fighters, { ...result, teams: [0, 1, 0], winningTeam: 0 })).toEqual(['a', 'c']);
  });
});
