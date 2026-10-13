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
});
