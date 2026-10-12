import { pokemonSpriteUrl, pokemonStaticSpriteUrls } from './sprite-url';

export type SpriteKind = 'gif' | 'static';

export interface SpriteSource {
  kind: SpriteKind;
  url: string;
  blob: Blob;
}

export class SpriteNetworkError extends Error {
  constructor(message: string, readonly url: string) {
    super(message);
    this.name = 'SpriteNetworkError';
  }
}

/** 404/410 significam "esse arquivo não existe"; qualquer outra coisa é falha de rede ou do servidor. */
async function tryFetch(url: string, fetchImpl: typeof fetch): Promise<Blob | null> {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw new SpriteNetworkError(`Sem conexão ao baixar ${url}: ${error instanceof Error ? error.message : String(error)}`, url);
  }
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new SpriteNetworkError(`HTTP ${response.status} ao baixar ${url}`, url);
  return response.blob();
}

/**
 * Obtém o sprite do Pokémon a partir do número da Pokédex: primeiro o GIF animado do PokeAPI/sprites;
 * se ele não existir (ex.: Miraidon, 1008), o PNG estático; se nada existir, devolve null (a interface
 * mostra o marcador). Falha de rede NÃO vira "não existe": lança, para tentar de novo depois.
 */
export async function fetchSprite(dexId: number, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): Promise<SpriteSource | null> {
  const gifUrl = pokemonSpriteUrl(dexId);
  const gif = await tryFetch(gifUrl, fetchImpl);
  if (gif) return { kind: 'gif', url: gifUrl, blob: gif };
  for (const url of pokemonStaticSpriteUrls(dexId)) {
    const blob = await tryFetch(url, fetchImpl);
    if (blob) return { kind: 'static', url, blob };
  }
  return null;
}
