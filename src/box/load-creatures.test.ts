import { describe, expect, it } from 'vitest';
import type { CachedCard } from '../cache/types';
import { loadCreatureEntries } from './load-creatures';
import type { CreatureDecoders } from './load-creatures';
import { MAX_CREATURES } from './box-scene';

function card(i: number, patch: Partial<CachedCard> = {}): CachedCard {
  return {
    id: `c${i}`,
    schema: 1,
    name: `Mon ${i}`,
    setId: 's',
    setName: 'Coleção',
    localId: String(i),
    setOfficial: 100,
    setTotal: 110,
    dexIds: [i + 1],
    reference: { state: 'ok' },
    sprite: { state: 'ok', kind: 'gif' },
    target: { state: 'missing' },
    firstSeenAt: 0,
    lastSeenAt: i,
    scanCount: 1,
    ...patch,
  } as CachedCard;
}

const frame = { rgba: new Uint8ClampedArray(4), delayMs: 100 };
const decoders: CreatureDecoders = {
  gif: async () => ({ width: 1, height: 1, frames: [frame], durationMs: 100 }) as never,
  image: async () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }),
};

describe('população da caixa', () => {
  it('um Pokémon por carta com sprite; GIF e PNG', async () => {
    const cards = [card(1), card(2, { sprite: { state: 'ok', kind: 'static' } }), card(3, { sprite: { state: 'missing' } })];
    const cache = { list: async () => cards, getAssetBlob: async () => new Blob(['x']) };
    const r = await loadCreatureEntries(cache, decoders);
    expect(r.available).toBe(2);
    expect(r.entries.map((e) => e.source.kind)).toEqual(['gif', 'image']);
    expect(r.entries[0]?.info).toMatchObject({ id: 'c1', name: 'Mon 1', dexId: 2, detail: 'Coleção 1/100' });
  });

  it('shiny e Mega seguem para a Caixa (inclusive a Gallade 244/236, que é sempre shiny)', async () => {
    const cards = [
      card(1),
      card(2, { shiny: true }),
      card(3, { name: 'Mega Gallade ex', localId: '244', setOfficial: 236, mega: true }),
      card(4, { name: 'M Absol-EX' }),
    ];
    const cache = { list: async () => cards, getAssetBlob: async () => new Blob(['x']) };
    const r = await loadCreatureEntries(cache, decoders);
    expect(r.entries.map((e) => [e.info.shiny, e.info.mega])).toEqual([[false, false], [true, false], [true, true], [false, true]]);
  });

  it('uma carta com problema vai para as falhas e não impede as outras', async () => {
    const cards = [card(1), card(2), card(3)];
    const cache = { list: async () => cards, getAssetBlob: async (c: CachedCard) => (c.id === 'c2' ? null : new Blob(['x'])) };
    const r = await loadCreatureEntries(cache, decoders);
    expect(r.entries).toHaveLength(2);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0]?.name).toBe('Mon 2');
  });

  it('respeita o limite de criaturas', async () => {
    const cards = Array.from({ length: MAX_CREATURES + 6 }, (_, i) => card(i));
    const cache = { list: async () => cards, getAssetBlob: async () => new Blob(['x']) };
    const r = await loadCreatureEntries(cache, decoders);
    expect(r.entries).toHaveLength(MAX_CREATURES);
    expect(r.available).toBe(MAX_CREATURES + 6);
  });

  it('com equipe escolhida, carrega só essas cartas, na ordem da equipe', async () => {
    const cards = [card(1), card(2), card(3), card(4)];
    const cache = { list: async () => cards, getAssetBlob: async () => new Blob(['x']) };
    const r = await loadCreatureEntries(cache, decoders, ['c3', 'c1', 'gone']);
    expect(r.entries.map((e) => e.info.id)).toEqual(['c3', 'c1']);
    expect(r.available).toBe(2);
  });

  it('Digital Pokémon da equipe entram na Caixa na ordem da equipe; sem sprite, viram falha (nada inventado)', async () => {
    const cards = [card(1), card(2)];
    const cache = { list: async () => cards, getAssetBlob: async () => new Blob(['x']) };
    const gif = { width: 1, height: 1, frames: [frame], durationMs: 100 } as never;
    const digital = {
      instances: [
        { instanceId: 'dp_1_4_0', name: 'Charmander', dexId: 4 },
        { instanceId: 'dp_2_7_1', name: 'Squirtle', dexId: 7 },
      ],
      sprite: async (dexId: number) => (dexId === 7 ? null : gif),
    };
    const r = await loadCreatureEntries(cache, decoders, ['c2', 'dp_1_4_0', 'c1', 'dp_2_7_1'], digital);
    expect(r.entries.map((e) => e.info.id)).toEqual(['c2', 'dp_1_4_0', 'c1']);
    expect(r.entries[1]?.info).toMatchObject({ name: 'Charmander', dexId: 4, digital: true, detail: 'Digital Pokémon' });
    expect(r.failed).toEqual([{ name: 'Squirtle', reason: expect.stringContaining('sprite indisponível') }]);
  });
});
