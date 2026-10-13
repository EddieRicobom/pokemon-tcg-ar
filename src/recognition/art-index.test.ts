import { describe, expect, it } from 'vitest';
import { syntheticCard } from './__fixtures__/synthetic';
import { ART_RECORD_BYTES, ArtIndex, encodeRecord, packArtIndex } from './art-index';
import { computeFeatures, FEATURE_VERSION } from './hash';

function build(seeds: number[]) {
  const entries = seeds.map((seed) => {
    const record = new Uint8Array(ART_RECORD_BYTES);
    encodeRecord(computeFeatures(syntheticCard(seed)), record);
    return { id: `set-${seed}`, record };
  });
  return packArtIndex(entries, '2026-10-13T00:00:00Z');
}

describe('ArtIndex', () => {
  it('guarda 112 bytes por carta', () => {
    const { bin, meta } = build([1, 2, 3]);
    expect(bin.length).toBe(3 * ART_RECORD_BYTES);
    expect(meta.ids).toEqual(['set-1', 'set-2', 'set-3']);
  });

  it('acha a própria carta em primeiro, com nota alta', () => {
    const { meta, bin } = build([1, 2, 3, 4, 5, 6]);
    const index = ArtIndex.from(meta, bin)!;
    for (const seed of [1, 4, 6]) {
      const [first] = index.search(computeFeatures(syntheticCard(seed)), 3);
      expect(first?.id).toBe(`set-${seed}`);
      expect(first?.score).toBeGreaterThan(0.99);
    }
  });

  it('devolve no máximo `limit`, da mais para a menos parecida', () => {
    const { meta, bin } = build([1, 2, 3, 4, 5]);
    const result = ArtIndex.from(meta, bin)!.search(computeFeatures(syntheticCard(2)), 3);
    expect(result).toHaveLength(3);
    expect(result[0]!.score).toBeGreaterThanOrEqual(result[1]!.score);
    expect(result[1]!.score).toBeGreaterThanOrEqual(result[2]!.score);
  });

  it('recusa arquivos que não combinam ou de outra versão das características', () => {
    const { meta, bin } = build([1, 2]);
    expect(ArtIndex.from(meta, bin.subarray(0, bin.length - 1))).toBeNull();
    expect(ArtIndex.from({ ...meta, featureVersion: FEATURE_VERSION + 1 }, bin)).toBeNull();
  });

  it('load: arquivo ausente (404) vira null, sem erro', async () => {
    const fetchImpl = (async () => new Response('', { status: 404 })) as typeof fetch;
    expect(await ArtIndex.load('/a.json', '/a.bin', fetchImpl)).toBeNull();
  });

  it('load: lê o par de arquivos', async () => {
    const { meta, bin } = build([1, 2, 3]);
    const fetchImpl = (async (url: RequestInfo | URL) =>
      String(url).endsWith('.json') ? new Response(JSON.stringify(meta)) : new Response(bin as BodyInit)) as typeof fetch;
    const index = await ArtIndex.load('/a.json', '/a.bin', fetchImpl);
    expect(index?.size).toBe(3);
  });
});
