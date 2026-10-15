import { fetchWithMirror } from '../core/mirror';
import { pokemonSpriteUrl, pokemonStaticSpriteUrls } from './sprite-url';

export type SpriteKind = 'gif' | 'static';

export interface SpriteSource {
  kind: SpriteKind;
  url: string;
  blob: Blob;
  /** É a variante shiny de verdade (cores diferentes). Falso/ausente = sprite normal, mesmo que a carta seja shiny. */
  shiny?: boolean;
}

export interface FetchSpriteOptions {
  /** A carta é shiny: tenta a variante shiny (GIF e depois PNG). Se ela não existir, cai para o sprite normal. */
  shiny?: boolean;
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
    response = await fetchWithMirror(url, undefined, fetchImpl);
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
export async function fetchSprite(
  dexId: number,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  options: FetchSpriteOptions = {},
): Promise<SpriteSource | null> {
  if (options.shiny) {
    const found = await fetchVariant(dexId, true, fetchImpl);
    if (found) return found;
    // Sem sprite shiny para este Pokémon: mostra o normal (e o `shiny` falso avisa que não é a variante de cores).
  }
  return fetchVariant(dexId, false, fetchImpl);
}

async function fetchVariant(dexId: number, shiny: boolean, fetchImpl: typeof fetch): Promise<SpriteSource | null> {
  const gifUrl = pokemonSpriteUrl(dexId, shiny);
  const gif = await tryFetch(gifUrl, fetchImpl);
  if (gif) return { kind: 'gif', url: gifUrl, blob: gif, ...(shiny ? { shiny: true } : {}) };
  for (const url of pokemonStaticSpriteUrls(dexId, shiny)) {
    const blob = await tryFetch(url, fetchImpl);
    if (blob) return { kind: 'static', url, blob, ...(shiny ? { shiny: true } : {}) };
  }
  return null;
}
