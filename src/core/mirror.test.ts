import { describe, expect, it, vi } from 'vitest';
import { fetchWithMirror, mirrorUrl } from './mirror';

const RAW = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/255.gif';

describe('espelho do PokeAPI/sprites', () => {
  it('converte a URL do raw para o jsDelivr e ignora outras URLs', () => {
    expect(mirrorUrl(RAW)).toBe('https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/other/showdown/255.gif');
    expect(mirrorUrl('https://exemplo.com/a.gif')).toBeNull();
  });

  it('falha de rede no raw: tenta o espelho', async () => {
    const ok = new Response('x');
    const impl = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(ok);
    expect(await fetchWithMirror(RAW, undefined, impl as unknown as typeof fetch)).toBe(ok);
    expect(impl.mock.calls[1]![0]).toContain('cdn.jsdelivr.net');
  });

  it('resposta HTTP (ex.: 404) não vai para o espelho', async () => {
    const notFound = new Response('', { status: 404 });
    const impl = vi.fn().mockResolvedValue(notFound);
    expect(await fetchWithMirror(RAW, undefined, impl as unknown as typeof fetch)).toBe(notFound);
    expect(impl).toHaveBeenCalledTimes(1);
  });

  it('sem espelho possível, repassa o erro', async () => {
    const impl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchWithMirror('https://exemplo.com/a.gif', undefined, impl as unknown as typeof fetch)).rejects.toThrow(TypeError);
  });
});
