import { describe, expect, it } from 'vitest';
import { cardImageUrl, TcgdexClient, TcgdexError } from './tcgdex';

const card = { id: 'base1-58', localId: '58', name: 'Pikachu', dexId: [25], set: { id: 'base1', name: 'Base Set' } };

function client(handler: (url: string, call: number) => Response | Promise<Response>) {
  let call = 0;
  const fetchImpl = (async (input: RequestInfo | URL) => handler(String(input), ++call)) as typeof fetch;
  return new TcgdexClient({ fetchImpl, backoffMs: 0 });
}

describe('TcgdexClient', () => {
  it('busca a carta pelo endereço da API v2 e conta requisições e bytes', async () => {
    const urls: string[] = [];
    const c = client((url) => {
      urls.push(url);
      return new Response(JSON.stringify(card));
    });
    expect((await c.getCard('base1-58'))?.dexId).toEqual([25]);
    expect(urls).toEqual(['https://api.tcgdex.net/v2/en/cards/base1-58']);
    expect(c.stats.requests).toBe(1);
    expect(c.stats.bytes).toBeGreaterThan(10);
  });

  it('não repete a requisição da mesma carta na sessão', async () => {
    const c = client(() => new Response(JSON.stringify(card)));
    await Promise.all([c.getCard('base1-58'), c.getCard('base1-58')]);
    await c.getCard('base1-58');
    expect(c.stats.requests).toBe(1);
  });

  it('404 vira null', async () => {
    expect(await client(() => new Response('{}', { status: 404 })).getCard('zzz-1')).toBeNull();
  });

  it('tenta de novo em 500/429 e em falha de rede', async () => {
    const c = client((_url, call) => {
      if (call === 1) return new Response('', { status: 503 });
      if (call === 2) throw new TypeError('rede');
      return new Response(JSON.stringify(card));
    });
    expect((await c.getCard('base1-58'))?.id).toBe('base1-58');
    expect(c.stats.requests).toBe(3);
    expect(c.stats.failures).toBe(2);
  });

  it('desiste depois das tentativas e não guarda a falha na memória', async () => {
    let fail = true;
    const c = client(() => (fail ? new Response('', { status: 500 }) : new Response(JSON.stringify(card))));
    await expect(c.getCard('base1-58')).rejects.toThrow();
    fail = false;
    expect((await c.getCard('base1-58'))?.id).toBe('base1-58');
  });

  it('erro 4xx (exceto 404/429) não é repetido', async () => {
    const c = client(() => new Response('', { status: 400 }));
    await expect(c.getCard('x')).rejects.toBeInstanceOf(TcgdexError);
    expect(c.stats.requests).toBe(1);
  });
});

describe('cardImageUrl', () => {
  it('monta o endereço da imagem a partir da base do TCGdex', () => {
    expect(cardImageUrl('https://assets.tcgdex.net/en/base/base1/58')).toBe('https://assets.tcgdex.net/en/base/base1/58/low.webp');
    expect(cardImageUrl('https://a/b', 'high', 'png')).toBe('https://a/b/high.png');
  });
});
