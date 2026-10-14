import { describe, expect, it } from 'vitest';
import { prepareMultiAssets } from './multi-prepare';
import type { ArAssets, ArCacheLike } from './ar-prepare';

const fakeAssets = (id: string): ArAssets => ({ card: { id, name: id } as ArAssets['card'], target: new ArrayBuffer(4), cachedSprite: null });

describe('prepareMultiAssets', () => {
  it('prepara em ordem, uma de cada vez, e relata o progresso', async () => {
    const order: string[] = [];
    let running = 0;
    let peak = 0;
    const progress: string[] = [];
    const result = await prepareMultiAssets(
      {} as ArCacheLike, ['a', 'b', 'c'], new Map([['a', 'Pikachu']]),
      (done, total, name) => progress.push(`${done}/${total}:${name}`),
      async (_cache, id) => {
        running++;
        peak = Math.max(peak, running);
        await Promise.resolve();
        order.push(id);
        running--;
        return fakeAssets(id);
      },
    );
    expect(result.ready.map((r) => r.card.id)).toEqual(['a', 'b', 'c']);
    expect(order).toEqual(['a', 'b', 'c']);
    expect(peak).toBe(1);
    expect(progress[0]).toBe('0/3:Pikachu');
    expect(progress.at(-1)).toBe('3/3:');
  });

  it('uma carta que falha não impede as outras', async () => {
    const result = await prepareMultiAssets({} as ArCacheLike, ['a', 'b'], new Map([['b', 'Eevee']]), undefined, async (_c, id) => {
      if (id === 'b') throw new Error('sem alvo');
      return fakeAssets(id);
    });
    expect(result.ready).toHaveLength(1);
    expect(result.failed).toEqual([{ cardId: 'b', name: 'Eevee', reason: 'sem alvo' }]);
  });
});
