import { describe, expect, it } from 'vitest';
import { emptyVillage } from './life';
import { discoverAt, normalizeWorldProgress, requestInfluence, resolveExpeditions, startExpedition, weeklyEventFor, weeklyModifiers } from './world-progress';

const fresh = () => emptyVillage(20261017, { x: 45, y: 41 });

describe('progresso vivo da Vila', () => {
  it('desbloqueia uma descoberta em etapas e não repete a recompensa', () => {
    const s = fresh();
    expect(discoverAt(s, 81, 16)?.completed).toBe(false);
    discoverAt(s, 10, 45);
    expect(discoverAt(s, 81, 16)?.completed).toBe(false);
    discoverAt(s, 10, 45);
    const done = discoverAt(s, 81, 16);
    expect(done?.completed).toBe(true);
    expect(s.discoveries.found).toContain(done?.id);
    expect(discoverAt(s, 81, 16)).toBeNull();
  });

  it('gera o mesmo evento semanal e transforma pedidos pendentes em influência', () => {
    const s = fresh();
    s.requests = { day: '2026-10-17', items: [{ id: 'r', day: '2026-10-17', kind: 'collect', title: 'Lago', detail: 'Lago', location: 'Lago', item: 'concha', qty: 1, rewardCoins: 1, rewardItem: 'flor', rewardQty: 1, rewardFriend: 0, done: false }, { id: 'r2', day: '2026-10-17', kind: 'collect', title: 'Correio', detail: 'Correio', location: 'Correio', item: 'tecido', qty: 1, rewardCoins: 1, rewardItem: 'flor', rewardQty: 1, rewardFriend: 0, done: false }] };
    expect(weeklyEventFor(s, '2026-10-17').id).toBe(weeklyEventFor(s, '2026-10-18').id);
    expect(requestInfluence(s, '2026-10-17')).toMatchObject({ weather: 'chuva', hourShift: 1, bellBonus: 1 });
    s.weekly.eventId = 'feira';
    expect(weeklyModifiers(s).saleMultiplier).toBe(1.25);
    s.weekly.eventId = 'mutirao';
    expect(weeklyModifiers(s).cropGrowthFactor).toBe(0.75);
  });

  it('expedição calcula resultado usando personalidade, tipo e clima', () => {
    const s = fresh();
    expect(startExpedition(s, 'a', 'lago', 100, 'chuva').ok).toBe(true);
    const result = resolveExpeditions(s, 100 + 15 * 60_000, () => 'Curioso', () => ['water']);
    expect(result).toHaveLength(1);
    expect(result[0]?.result?.coins).toBe(26);
    expect(result[0]?.result?.item).toBe('concha');
  });

  it('normaliza saves antigos sem progresso de mundo', () => {
    expect(normalizeWorldProgress({})).toEqual({ discoveries: { steps: {}, found: [], lastPlace: null }, weekly: { week: '', eventId: '' }, expeditions: [] });
  });
});
