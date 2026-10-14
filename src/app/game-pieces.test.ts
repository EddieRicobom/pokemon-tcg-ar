import { describe, expect, it } from 'vitest';
import { loadPieces } from './game-pieces';
import type { PieceSource } from './game-pieces';
import type { CachedCard } from '../cache/types';

const card = (id: string, name: string, key: string | null, dexIds = [25]): CachedCard => ({
  id, schema: 1, name, setId: 's', setName: 'S', localId: '1', setOfficial: 1, setTotal: 1, dexIds,
  reference: { state: 'missing' }, sprite: key ? { state: 'ok', key } : { state: 'missing' }, target: { state: 'missing' }, firstSeenAt: 1, lastSeenAt: 1, scanCount: 1,
});

describe('peças dos minigames', () => {
  it('usa só cartas com Pokémon carregado, sem repetir, e libera as imagens', async () => {
    const revoked: string[] = [];
    const source: PieceSource = {
      list: async () => [card('a', 'Pikachu', 'k1'), card('b', 'Pikachu ex', 'k1'), card('c', 'Bill', 'k2', []), card('d', 'Eevee', null), card('e', 'Mew', 'k3'), card('f', 'Falha', 'k4')],
      getAssetBlob: async (c) => (c.id === 'f' ? null : new Blob([c.id])),
    };
    const loaded = await loadPieces(source, (blob) => `blob:${blob.size}:${Math.random()}`, (u) => revoked.push(u));
    expect(loaded.pieces.map((p) => p.id)).toEqual(['a', 'e']);
    expect([...loaded.urls.keys()]).toEqual(['a', 'e']);
    loaded.release();
    expect(revoked).toHaveLength(2);
  });
});
