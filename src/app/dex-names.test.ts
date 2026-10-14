import { describe, expect, it } from 'vitest';
import { loadDexNames } from './dex-names';

const species = (n: number) => ({ results: Array.from({ length: n }, (_, i) => ({ name: `mon-${i + 1}`, url: `https://pokeapi.co/api/v2/pokemon-species/${i + 1}/` })) });
const memory = (): Storage => {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k), clear: () => data.clear(), key: () => null, length: 0 };
};
const ok = (body: unknown): typeof fetch => (async () => new Response(JSON.stringify(body))) as typeof fetch;

describe('nomes dos Pokémon', () => {
  it('baixa uma vez e guarda no aparelho', async () => {
    const storage = memory();
    let calls = 0;
    const fetchImpl = (async () => (calls++, new Response(JSON.stringify(species(1025))))) as typeof fetch;
    const first = await loadDexNames(fetchImpl, storage);
    expect(first.size).toBe(1025);
    expect(first.get(1)).toBe('Mon 1');
    const second = await loadDexNames(fetchImpl, storage);
    expect(second.size).toBe(1025);
    expect(calls).toBe(1);
  });

  it('falha com mensagem clara sem rede ou com lista incompleta', async () => {
    const down = (async () => { throw new TypeError('offline'); }) as typeof fetch;
    await expect(loadDexNames(down, memory())).rejects.toThrow('conexão');
    await expect(loadDexNames(ok(species(10)), memory())).rejects.toThrow('incompleta');
    const bad = (async () => new Response('x', { status: 500 })) as typeof fetch;
    await expect(loadDexNames(bad, memory())).rejects.toThrow('conexão');
  });

  it('ignora cópia guardada estragada', async () => {
    const storage = memory();
    storage.setItem('tcg-ar-dex-names-v1', '{lixo');
    expect((await loadDexNames(ok(species(1025)), storage)).size).toBe(1025);
  });
});
