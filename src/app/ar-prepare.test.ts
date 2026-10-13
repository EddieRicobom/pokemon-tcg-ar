import { describe, expect, it } from 'vitest';
import type { CachedCard, SlotInfo } from '../cache/types';
import { ArPrepareError, prepareArAssets } from './ar-prepare';
import type { ArCacheLike } from './ar-prepare';

const slot = (state: SlotInfo['state'], extra: Partial<SlotInfo> = {}): SlotInfo => ({ state, ...extra });
function card(over: Partial<CachedCard> = {}): CachedCard {
  return {
    id: 'base1-58', schema: 1, name: 'Pikachu', setId: 'base1', setName: 'Base Set', localId: '58', setOfficial: 102, setTotal: 102,
    dexIds: [25], reference: slot('ok', { key: 'ref' }), sprite: slot('ok', { key: 'spr', kind: 'gif' }), target: slot('ok', { key: 'tgt' }),
    firstSeenAt: 0, lastSeenAt: 0, scanCount: 1, ...over,
  };
}
function fakeCache(stored: CachedCard | undefined, prepared: CachedCard | Error, blobs: Record<string, Blob | null> = { tgt: new Blob([new Uint8Array(8)]), spr: new Blob([new Uint8Array(4)]) }): ArCacheLike {
  return {
    get: async () => stored,
    prepareCard: async (id, onProgress) => {
      onProgress?.({ cardId: id, step: 'referência', index: 0, total: 3 });
      onProgress?.({ cardId: id, step: 'alvo de AR', index: 2, total: 3 });
      if (prepared instanceof Error) throw prepared;
      return { id, status: 'completo', card: prepared };
    },
    getAssetBlob: async (c, kind) => blobs[(kind === 'target' ? c.target : kind === 'sprite' ? c.sprite : c.reference).key ?? ''] ?? null,
  };
}

describe('prepareArAssets (caminho comum da busca manual, do reconhecimento e do cache)', () => {
  it('devolve alvo e sprite guardado, passando pelas etapas dados → alvo', async () => {
    const stages: string[] = [];
    const c = card();
    const result = await prepareArAssets(fakeCache(c, c), c.id, (stage) => stages.push(stage));
    expect(result.target.byteLength).toBe(8);
    expect(result.cachedSprite).toMatchObject({ kind: 'gif', url: 'spr' });
    expect(stages).toContain('dados');
    expect(stages).toContain('alvo');
  });

  it('carta ausente do cache: erro claro na etapa "dados"', async () => {
    await expect(prepareArAssets(fakeCache(undefined, card()), 'x')).rejects.toMatchObject({ name: 'ArPrepareError', stage: 'dados' });
  });

  it('falha ao compilar o alvo: erro na etapa "alvo" com o motivo (não fica pendente)', async () => {
    const c = card({ target: slot('error', { error: 'compilação falhou' }) });
    const error = await prepareArAssets(fakeCache(c, c), c.id).catch((e) => e as ArPrepareError);
    expect(error).toBeInstanceOf(ArPrepareError);
    expect(error.stage).toBe('alvo');
    expect(error.message).toContain('compilação falhou');
  });

  it('sem imagem de referência: erro na etapa "dados"', async () => {
    const c = card({ reference: slot('error', { error: 'HTTP 404' }), target: slot('missing') });
    await expect(prepareArAssets(fakeCache(c, c), c.id)).rejects.toMatchObject({ stage: 'dados', message: expect.stringContaining('HTTP 404') });
  });

  it('exceção do cache vira ArPrepareError', async () => {
    const c = card();
    await expect(prepareArAssets(fakeCache(c, new Error('sem espaço')), c.id)).rejects.toMatchObject({ stage: 'dados', message: expect.stringContaining('sem espaço') });
  });

  it('alvo marcado como ok mas arquivo sumiu (cache expulso): erro, não sucesso', async () => {
    const c = card();
    await expect(prepareArAssets(fakeCache(c, c, { tgt: null }), c.id)).rejects.toMatchObject({ stage: 'alvo' });
  });

  it('sem sprite guardado: segue com cachedSprite nulo (o GIF é buscado depois e a falha dele não derruba o AR)', async () => {
    const c = card({ sprite: slot('missing') });
    expect((await prepareArAssets(fakeCache(c, c), c.id)).cachedSprite).toBeNull();
  });
});
