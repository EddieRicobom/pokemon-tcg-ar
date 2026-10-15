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
    const mirror = 'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/other/showdown/25.gif';
    await expect(fetchSprite(25, fakeFetch({ [`${GIF}/25.gif`]: 0, [mirror]: 0 }))).rejects.toBeInstanceOf(SpriteNetworkError);
  });

  it('raw fora do ar: baixa o mesmo GIF pelo espelho do jsDelivr', async () => {
    const mirror = 'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/other/showdown/255.gif';
    const sprite = await fetchSprite(255, fakeFetch({ [`${GIF}/255.gif`]: 0, [mirror]: 200 }));
    expect(sprite).toMatchObject({ kind: 'gif', url: `${GIF}/255.gif` });
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

describe('fetchSprite: variante shiny', () => {
  it('pede o GIF shiny de showdown/shiny (Ditto, 132)', async () => {
    const log: string[] = [];
    const sprite = await fetchSprite(132, fakeFetch({ [`${GIF}/shiny/132.gif`]: 200 }, log), { shiny: true });
    expect(sprite).toMatchObject({ kind: 'gif', url: `${GIF}/shiny/132.gif`, shiny: true });
    expect(log).toEqual([`${GIF}/shiny/132.gif`]);
  });

  it('sem GIF shiny, tenta o PNG shiny antes de desistir da variante', async () => {
    const log: string[] = [];
    const sprite = await fetchSprite(1008, fakeFetch({ [`${STATIC}/shiny/1008.png`]: 200 }, log), { shiny: true });
    expect(sprite).toMatchObject({ kind: 'static', url: `${STATIC}/shiny/1008.png`, shiny: true });
    expect(log).toEqual([`${GIF}/shiny/1008.gif`, `${STATIC}/shiny/1008.png`]);
  });

  it('sem nenhum sprite shiny, devolve o normal e NÃO marca como shiny', async () => {
    const sprite = await fetchSprite(25, fakeFetch({ [`${GIF}/25.gif`]: 200 }), { shiny: true });
    expect(sprite?.url).toBe(`${GIF}/25.gif`);
    expect(sprite?.shiny).toBeUndefined();
  });

  it('falha de rede no shiny lança (não vira "não existe")', async () => {
    await expect(fetchSprite(25, fakeFetch({ [`${GIF}/shiny/25.gif`]: 0, ['https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/other/showdown/shiny/25.gif']: 0 }), { shiny: true })).rejects.toBeInstanceOf(SpriteNetworkError);
  });

  it('sem pedir shiny nunca toca na pasta shiny', async () => {
    const log: string[] = [];
    await fetchSprite(25, fakeFetch({ [`${GIF}/25.gif`]: 200 }, log));
    expect(log.some((u) => u.includes('/shiny/'))).toBe(false);
  });
});

