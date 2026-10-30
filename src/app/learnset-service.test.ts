import { describe, expect, it, vi } from 'vitest';
import { cachedMoveData, loadLearnset, loadMoveData } from './learnset-service';
import { prepareFoeSide, preparePlayerSide } from './turn-duel-setup';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
}

const pokemonJson = {
  id: 4,
  name: 'charmander',
  types: [{ slot: 1, type: { name: 'fire' } }],
  stats: ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'].map((name, i) => ({ base_stat: [39, 52, 43, 60, 50, 65][i], stat: { name } })),
  weight: 85,
  moves: [
    { move: { name: 'ember', url: 'https://pokeapi.co/api/v2/move/52/' }, version_group_details: [{ level_learned_at: 4, move_learn_method: { name: 'level-up' }, version_group: { name: 'scarlet-violet' } }] },
    { move: { name: 'growl', url: 'https://pokeapi.co/api/v2/move/45/' }, version_group_details: [{ level_learned_at: 1, move_learn_method: { name: 'level-up' }, version_group: { name: 'scarlet-violet' } }] },
    { move: { name: 'flamethrower', url: 'https://pokeapi.co/api/v2/move/53/' }, version_group_details: [{ level_learned_at: 0, move_learn_method: { name: 'machine' }, version_group: { name: 'scarlet-violet' } }] },
  ],
};
const moves: Record<string, unknown> = {
  52: { name: 'ember', names: [{ language: { name: 'en' }, name: 'Ember' }], type: { name: 'fire' }, power: 40, accuracy: 100, pp: 25, damage_class: { name: 'special' } },
  45: { name: 'growl', names: [], type: { name: 'normal' }, power: null, accuracy: 100, pp: 40, damage_class: { name: 'status' } },
  53: { name: 'flamethrower', names: [], type: { name: 'fire' }, power: 90, accuracy: 100, pp: 15, damage_class: { name: 'special' } },
};

function fakeFetch(fail = new Set<string>()) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if ([...fail].some((f) => url.includes(f))) return new Response('erro', { status: 500 });
    if (url.endsWith('/pokemon/4')) return new Response(JSON.stringify(pokemonJson));
    const id = /\/move\/(\d+)\//.exec(url)?.[1];
    if (id && moves[id]) return new Response(JSON.stringify(moves[id]));
    return new Response('nada', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('learnset da PokéAPI', () => {
  it('busca uma vez e depois usa a cópia guardada', async () => {
    const storage = memoryStorage();
    const fetchImpl = fakeFetch();
    const first = await loadLearnset(4, { storage, fetchImpl });
    expect(first.ok && first.value.moves.map((m) => m.slug)).toEqual(['growl', 'ember', 'flamethrower']);
    const again = await loadLearnset(4, { storage, fetchImpl: fakeFetch(new Set(['/pokemon/'])) });
    expect(again.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('sem rede e sem cópia, diz o que faltou', async () => {
    const result = await loadLearnset(4, { storage: memoryStorage(), fetchImpl: fakeFetch(new Set(['/pokemon/'])), timeoutMs: 50 });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain('PokéAPI');
  });

  it('carrega os números dos golpes, guarda e relata os que falharam', async () => {
    const storage = memoryStorage();
    const ls = await loadLearnset(4, { storage, fetchImpl: fakeFetch() });
    if (!ls.ok) throw new Error('learnset');
    const seen: string[] = [];
    const { data, failed } = await loadMoveData(ls.value.moves, { storage, fetchImpl: fakeFetch(new Set(['/move/53/'])), timeoutMs: 50 }, (slug) => seen.push(slug));
    expect(Object.keys(data).sort()).toEqual(['ember', 'growl']);
    expect(failed).toEqual(['flamethrower']);
    expect(seen.sort()).toEqual(['ember', 'growl']);
    expect(Object.keys(cachedMoveData(storage)).sort()).toEqual(['ember', 'growl']);
  });
});

describe('preparo do duelo', () => {
  it('o oponente usa só golpes de dano aprendidos por nível até o 50', async () => {
    const storage = memoryStorage();
    const foe = await prepareFoeSide({ trainer: 'Treinador', role: 'Treino', dexIds: [4], power: 1 }, { storage, fetchImpl: fakeFetch() });
    expect(foe.failed).toEqual([]);
    expect(foe.mons[0]!.fighter.moves.map((m) => m.name)).toEqual(['Ember']);
    expect(foe.mons[0]!.maxPp).toEqual([25]);
  });

  it('espécie sem dados fica de fora do oponente, sem golpe inventado', async () => {
    const foe = await prepareFoeSide({ trainer: 'T', role: 'Treino', dexIds: [4], power: 1 }, { storage: memoryStorage(), fetchImpl: fakeFetch(new Set(['/pokemon/'])), timeoutMs: 50 });
    expect(foe.mons).toEqual([]);
    expect(foe.failed).toHaveLength(1);
  });

  it('seus Pokémon usam os golpes salvos e quem não tem fica de fora com aviso', async () => {
    const flamethrower = { slug: 'flamethrower', name: 'Flamethrower', type: 'fire' as const, power: 90, accuracy: 100, pp: 15, damageClass: 'special' as const };
    const side = await preparePlayerSide(
      [{ id: 'a', name: 'Charmander', dexId: 4, shiny: false, bond: 4 }, { id: 'b', name: 'Vulpix', dexId: 37, shiny: false, bond: 0 }],
      { storage: memoryStorage(), profileOf: async () => null, savedMovesOf: (m) => (m.id === 'a' ? [flamethrower] : []) },
    );
    expect(side.mons).toHaveLength(1);
    expect(side.mons[0]!.fighter.moves[0]!.name).toBe('Flamethrower');
    expect(side.mons[0]!.fighter.bond).toBe(4);
    expect(side.notes.some((n) => n.includes('Vulpix ficou de fora'))).toBe(true);
    expect(side.notes.some((n) => n.includes('valores médios'))).toBe(true);
  });
});
