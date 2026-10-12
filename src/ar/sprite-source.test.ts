import { describe, expect, it } from 'vitest';
import { fetchSprite, SpriteNetworkError } from './sprite-source';

const GIF = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown';
const STATIC = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

function fakeFetch(files: Record<string, number>, log: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    log.push(url);
    const status = files[url];
    if (status === undefined) return new Response('404: Not Found', { status: 404 });
    if (status === 0) throw new TypeError('offline');
    return new Response(new Blob([url]), { status });
  }) as typeof fetch;
}

describe('fetchSprite', () => {
  it('usa o GIF do padrão exato para Pikachu, Ditto e Walking Wake', async () => {
    for (const id of [25, 132, 1009]) {
      const log: string[] = [];
      const sprite = await fetchSprite(id, fakeFetch({ [`${GIF}/${id}.gif`]: 200 }, log));
      expect(sprite?.kind).toBe('gif');
      expect(sprite?.url).toBe(`${GIF}/${id}.gif`);
      expect(log).toEqual([`${GIF}/${id}.gif`]);
    }
  });

  it('Miraidon (1008): sem GIF, cai para o PNG estático mais leve', async () => {
    const log: string[] = [];
    const sprite = await fetchSprite(1008, fakeFetch({ [`${STATIC}/1008.png`]: 200 }, log));
    expect(sprite).toMatchObject({ kind: 'static', url: `${STATIC}/1008.png` });
    expect(log).toEqual([`${GIF}/1008.gif`, `${STATIC}/1008.png`]);
  });

  it('tenta a segunda opção estática se a primeira não existe', async () => {
    const sprite = await fetchSprite(1008, fakeFetch({ [`${STATIC}/other/home/1008.png`]: 200 }));
    expect(sprite?.url).toBe(`${STATIC}/other/home/1008.png`);
  });

  it('nenhum arquivo existe: devolve null (a interface mostra o marcador)', async () => {
    expect(await fetchSprite(999999, fakeFetch({}))).toBeNull();
  });

  it('falha de rede NÃO é tratada como "GIF inexistente"', async () => {
    await expect(fetchSprite(25, fakeFetch({ [`${GIF}/25.gif`]: 0 }))).rejects.toBeInstanceOf(SpriteNetworkError);
  });

  it('erro 500 também lança, para tentar de novo depois', async () => {
    await expect(fetchSprite(25, fakeFetch({ [`${GIF}/25.gif`]: 500 }))).rejects.toBeInstanceOf(SpriteNetworkError);
  });

  it('rejeita dexId inválido antes de qualquer requisição', async () => {
    const log: string[] = [];
    await expect(fetchSprite(0, fakeFetch({}, log))).rejects.toThrow(RangeError);
    expect(log).toEqual([]);
  });
});
