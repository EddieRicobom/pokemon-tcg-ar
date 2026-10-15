/**
 * Espelho do PokeAPI/sprites no jsDelivr (permite CORS). Algumas redes e bloqueadores de anúncios
 * derrubam o raw.githubusercontent.com; nesse caso o app tenta o mesmo arquivo pelo espelho.
 */
const RAW_PREFIX = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/';
const MIRROR_PREFIX = 'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/';

/** Endereço do mesmo arquivo no espelho, ou null se a URL não for do PokeAPI/sprites. */
export function mirrorUrl(url: string): string | null {
  return url.startsWith(RAW_PREFIX) ? MIRROR_PREFIX + url.slice(RAW_PREFIX.length) : null;
}

/** `fetch` que, em falha de rede (não em resposta HTTP), tenta o espelho. */
export async function fetchWithMirror(url: string, init: RequestInit | undefined, fetchImpl: typeof fetch = (i, o) => fetch(i, o)): Promise<Response> {
  try {
    return await fetchImpl(url, init);
  } catch (error) {
    const mirror = mirrorUrl(url);
    if (!mirror || (error instanceof DOMException && error.name === 'AbortError')) throw error;
    return fetchImpl(mirror, init);
  }
}
