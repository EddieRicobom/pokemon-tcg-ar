import { describe, expect, it } from 'vitest';
import { add, emptyVillage, normalizeVillage } from './life';
import { claimRequest } from './requests';
import { completeFestival, discoverAt, festivalRound, normalizeWorldProgress, requestInfluence, resolveExpeditions, startExpedition, weeklyEventFor, weeklyModifiers } from './world-progress';

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
    expect(done).toMatchObject({ title: 'A passagem do lago', rewardFurniture: 'lampiao-cristal' });
    expect(done?.diary).toContain('passagem escondida');
    expect(s.discoveries.found).toContain(done?.id);
    expect(discoverAt(s, 81, 16)).toBeNull();
  });

  it('mantém o pedido da descoberta até ser entregue e só então libera a próxima pista', () => {
    const s = fresh();
    discoverAt(s, 81, 16);
    discoverAt(s, 48, 37);
    discoverAt(s, 81, 16);
    discoverAt(s, 48, 37);
    const done = discoverAt(s, 81, 16);
    expect(done?.completed).toBe(true);
    expect(s.requests.story[0]).toMatchObject({ id: 'desc:lago-caverna', persistent: true, done: false, item: 'concha', qty: 2 });
    expect(discoverAt(s, 10, 63)).toBeNull();
    add(s, 'concha', 2);
    expect(claimRequest(s, 'desc:lago-caverna', '2099-01-01').ok).toBe(true);
    expect(s.requests.story[0]?.done).toBe(true);
    discoverAt(s, 48, 37);
    expect(discoverAt(s, 10, 63)?.id).toBe('bosque-atalho');
  });

  it('gera o mesmo evento semanal e transforma pedidos pendentes em influência', () => {
    const s = fresh();
    s.requests = { day: '2026-10-17', story: [], items: [{ id: 'r', day: '2026-10-17', kind: 'collect', title: 'Lago', detail: 'Lago', location: 'Lago', item: 'concha', qty: 1, rewardCoins: 1, rewardItem: 'flor', rewardQty: 1, rewardFriend: 0, done: false }, { id: 'r2', day: '2026-10-17', kind: 'collect', title: 'Correio', detail: 'Correio', location: 'Correio', item: 'tecido', qty: 1, rewardCoins: 1, rewardItem: 'flor', rewardQty: 1, rewardFriend: 0, done: false }] };
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

  it('deixa o festival semanal jogável uma vez e persiste o resultado', () => {
    const s = fresh();
    const round = festivalRound(s, '2026-10-17');
    expect(round.played).toBe(false);
    const correct = round.choices.findIndex((choice) => round.prompt.includes(choice.replace('Barraca das ', '')));
    const result = completeFestival(s, '2026-10-17', correct);
    expect(result.ok).toBe(true);
    expect(s.weekly.festivalWon).toBe(true);
    expect(festivalRound(s, '2026-10-18').played).toBe(true);
    expect(completeFestival(s, '2026-10-18', 1).ok).toBe(false);
  });

  it('normaliza saves antigos sem progresso de mundo', () => {
    expect(normalizeWorldProgress({})).toEqual({ discoveries: { steps: {}, found: [], lastPlace: null }, weekly: { week: '', eventId: '', festivalWeek: '', festivalWon: false }, expeditions: [] });
  });

  it('preserva pedidos de descoberta ao salvar e carregar a Vila', () => {
    const s = fresh();
    s.requests.story.push({ id: 'desc:lago-caverna', day: '', kind: 'collect', title: 'Passagem', detail: 'Conchas', location: 'Lago', item: 'concha', qty: 2, rewardCoins: 1, rewardItem: 'cristal', rewardQty: 1, rewardFriend: 0, persistent: true, done: false });
    const back = normalizeVillage(JSON.parse(JSON.stringify(s)), s.seed, s.player);
    expect(back.requests.story).toHaveLength(1);
    expect(back.requests.story[0]).toMatchObject({ id: 'desc:lago-caverna', persistent: true, item: 'concha' });
  });
});
