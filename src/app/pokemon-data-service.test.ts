import { describe, expect, it, vi } from 'vitest';
import { emptyBattleData, loadBattleData } from './pokemon-data-service';
import type { BattleData, PartName } from './pokemon-data-service';

const pokemon = {
  types: [{ slot: 1, type: { name: 'electric' } }],
  stats: [
    { base_stat: 35, stat: { name: 'hp' } }, { base_stat: 55, stat: { name: 'attack' } }, { base_stat: 40, stat: { name: 'defense' } },
    { base_stat: 50, stat: { name: 'special-attack' } }, { base_stat: 50, stat: { name: 'special-defense' } }, { base_stat: 90, stat: { name: 'speed' } },
  ],
  moves: ['thunder-shock', 'quick-attack'].map((name, i) => ({
    move: { name, url: `https://pokeapi.co/api/v2/move/${name}/` },
    version_group_details: [{ version_group: { name: 'scarlet-violet' }, move_learn_method: { name: 'level-up' }, level_learned_at: 1 + i * 9 }],
  })),
};
const move = (name: string) => ({ name, power: 40, accuracy: 100, pp: 30, type: { name: 'electric' }, damage_class: { name: 'special' } });
const card = { hp: 60, types: ['Lightning'], attacks: [{ name: 'Gnaw', cost: ['Colorless'], damage: 10 }] };

function memoryStorage() {
  const map = new Map<string, string>();
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

function fakeFetch(routes: Record<string, unknown | Error>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = Object.entries(routes).find(([key]) => url.endsWith(key));
    if (!hit) return new Response('{}', { status: 404 });
    if (hit[1] instanceof Error) throw hit[1];
    return new Response(JSON.stringify(hit[1]), { status: 200 });
  });
}

async function run(options: { fetchImpl: typeof fetch; storage?: ReturnType<typeof memoryStorage>; getCard?: (id: string) => Promise<unknown>; dexId?: number | undefined }) {
  const data: BattleData = emptyBattleData();
  const order: PartName[] = [];
  await loadBattleData(
    { cardId: 'base1-58', dexId: 'dexId' in options ? options.dexId : 25 },
    { fetchImpl: options.fetchImpl, storage: options.storage ?? null, getCard: options.getCard ?? (async () => card), timeoutMs: 1000 },
    (part, result) => {
      (data as unknown as Record<string, unknown>)[part] = result;
      order.push(part);
    },
  );
  return { data, order };
}

describe('dados de batalha (PokéAPI + TCGdex)', () => {
  it('carrega atributos, golpes e a carta em paralelo', async () => {
    const fetchImpl = fakeFetch({ '/pokemon/25': pokemon, '/move/thunder-shock/': move('thunder-shock'), '/move/quick-attack/': move('quick-attack') });
    const { data } = await run({ fetchImpl });
    expect(data.profile).toMatchObject({ state: 'ok', value: { dexId: 25, types: ['electric'] } });
    expect(data.moves).toMatchObject({ state: 'ok' });
    expect(data.moves.state === 'ok' && data.moves.value.map((m) => m.name)).toEqual(['Quick Attack', 'Thunder Shock']);
    expect(data.card).toMatchObject({ state: 'ok', value: { hp: 60, attacks: [{ name: 'Gnaw' }] } });
  });

  it('falha da PokéAPI não derruba a carta (e vice-versa)', async () => {
    const down = fakeFetch({ '/pokemon/25': new Error('Failed to fetch') });
    const a = await run({ fetchImpl: down });
    expect(a.data.profile).toMatchObject({ state: 'error' });
    expect(a.data.moves).toMatchObject({ state: 'error' });
    expect(a.data.card.state).toBe('ok');

    const b = await run({ fetchImpl: fakeFetch({ '/pokemon/25': pokemon, '/move/thunder-shock/': move('a'), '/move/quick-attack/': move('b') }), getCard: async () => { throw new Error('HTTP 503'); } });
    expect(b.data.profile.state).toBe('ok');
    expect(b.data.card).toMatchObject({ state: 'error' });
    expect(b.data.card.state === 'error' && b.data.card.message).toContain('TCGdex');
  });

  it('golpe com falha parcial: mostra os que chegaram e não guarda a lista incompleta', async () => {
    const storage = memoryStorage();
    const fetchImpl = fakeFetch({ '/pokemon/25': pokemon, '/move/thunder-shock/': move('thunder-shock'), '/move/quick-attack/': new Error('x') });
    const { data } = await run({ fetchImpl, storage });
    expect(data.moves.state === 'ok' && data.moves.value).toHaveLength(1);
    expect(storage.map.has('tcg-ar-moves-v1:25')).toBe(false);
    expect(storage.map.has('tcg-ar-profile-v1:25')).toBe(true);
  });

  it('segunda vez usa o que foi guardado, sem rede', async () => {
    const storage = memoryStorage();
    const fetchImpl = fakeFetch({ '/pokemon/25': pokemon, '/move/thunder-shock/': move('thunder-shock'), '/move/quick-attack/': move('quick-attack') });
    await run({ fetchImpl, storage });
    const offline = fakeFetch({});
    const getCard = vi.fn(async () => card);
    const { data } = await run({ fetchImpl: offline, storage, getCard });
    expect(offline).not.toHaveBeenCalled();
    expect(getCard).not.toHaveBeenCalled();
    expect([data.profile.state, data.moves.state, data.card.state]).toEqual(['ok', 'ok', 'ok']);
  });

  it('carta sem número da Pokédex (Treinador): explica, sem inventar atributos', async () => {
    const fetchImpl = fakeFetch({});
    const { data } = await run({ fetchImpl, dexId: undefined, getCard: async () => ({ name: 'Potion' }) });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(data.profile).toMatchObject({ state: 'error' });
    expect(data.card).toMatchObject({ state: 'ok', value: { attacks: [] } });
  });

  it('resposta sem atributos vira erro claro', async () => {
    const { data } = await run({ fetchImpl: fakeFetch({ '/pokemon/25': { stats: [], types: [], moves: [] } }) });
    expect(data.profile).toMatchObject({ state: 'error' });
    expect(data.moves).toMatchObject({ state: 'ok', value: [] });
  });
});

describe('peso e perfil para o Pin Mode', () => {
  const withWeight = { ...pokemon, weight: 60 };

  it('lê o peso em kg (a PokéAPI traz em hectogramas)', async () => {
    const { parsePokeApiProfile } = await import('../core/pokemon-data');
    expect(parsePokeApiProfile(withWeight, 25)?.weightKg).toBe(6);
    expect(parsePokeApiProfile(pokemon, 25)?.weightKg).toBeUndefined();
  });

  it('perfil guardado sem peso é buscado de novo para ganhar o peso', async () => {
    const storage = memoryStorage();
    const { parsePokeApiProfile } = await import('../core/pokemon-data');
    const old = parsePokeApiProfile(pokemon, 25)!;
    storage.setItem('tcg-ar-profile-v1:25', JSON.stringify(old));
    const fetchImpl = fakeFetch({ '/pokemon/25': withWeight, '/move/thunder-shock/': move('thunder-shock'), '/move/quick-attack/': move('quick-attack') });
    const { data } = await run({ fetchImpl, storage });
    expect(fetchImpl).toHaveBeenCalled();
    expect(data.profile).toMatchObject({ state: 'ok', value: { weightKg: 6 } });
    expect(JSON.parse(storage.getItem('tcg-ar-profile-v1:25')!).weightKg).toBe(6);
  });

  it('loadProfile usa o guardado e só busca quando falta', async () => {
    const { loadProfile } = await import('./pokemon-data-service');
    const storage = memoryStorage();
    const fetchImpl = fakeFetch({ '/pokemon/25': withWeight });
    expect((await loadProfile(25, { fetchImpl, storage }))?.weightKg).toBe(6);
    const offline = fakeFetch({});
    expect((await loadProfile(25, { fetchImpl: offline, storage }))?.weightKg).toBe(6);
    expect(offline).not.toHaveBeenCalled();
    expect(await loadProfile(undefined, { fetchImpl, storage })).toBeNull();
    expect(await loadProfile(999, { fetchImpl: fakeFetch({}), storage: memoryStorage() })).toBeNull();
  });

  it('sem peso na resposta, guarda "consultado" e não pergunta de novo', async () => {
    const { loadProfile } = await import('./pokemon-data-service');
    const storage = memoryStorage();
    await loadProfile(25, { fetchImpl: fakeFetch({ '/pokemon/25': pokemon }), storage });
    const offline = fakeFetch({});
    const again = await loadProfile(25, { fetchImpl: offline, storage });
    expect(offline).not.toHaveBeenCalled();
    expect(again?.weightKg).toBe(0);
  });

  it('loadCardInfo lê os ataques da carta e guarda', async () => {
    const { loadCardInfo } = await import('./pokemon-data-service');
    const storage = memoryStorage();
    const getCard = vi.fn(async () => card);
    const first = await loadCardInfo('base1-58', { storage, getCard });
    expect(first?.attacks.length).toBeGreaterThan(0);
    const second = await loadCardInfo('base1-58', { storage, getCard: async () => { throw new Error('rede'); } });
    expect(second?.attacks).toEqual(first?.attacks);
    expect(await loadCardInfo('x', { storage: memoryStorage(), getCard: async () => { throw new Error('rede'); } })).toBeNull();
  });
});
