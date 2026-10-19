import { fetchWithMirror } from '../core/mirror';
import { loadLocalPokemonSpriteManifest, localPokemonSpriteUrl } from './local-sprite-manifest';
import { isValidDexId, pokemonSpriteUrl, pokemonStaticSpriteUrls } from './sprite-url';

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

function hasImageSignature(blob: Blob, kind: SpriteKind): Promise<boolean> {
  return blob.slice(0, kind === 'gif' ? 6 : 8).arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    return kind === 'gif'
      ? bytes.length === 6 && (new TextDecoder().decode(bytes) === 'GIF87a' || new TextDecoder().decode(bytes) === 'GIF89a') && blob.size >= 13
      : bytes.length === 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte) && blob.size >= 24;
  }).catch(() => false);
}

async function tryFetchLocal(url: string, candidate: { key: string; kind: SpriteKind }, manifest: Awaited<ReturnType<typeof loadLocalPokemonSpriteManifest>>, fetchImpl: typeof fetch): Promise<Blob | null> {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const asset = manifest?.assets[candidate.key];
    if (!asset || blob.size !== asset.bytes || !(await hasImageSignature(blob, candidate.kind))) return null;
    if (/^[a-f\d]{64}$/i.test(asset.sha256) && globalThis.crypto?.subtle) {
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
      const actual = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      if (actual.toLowerCase() !== asset.sha256.toLowerCase()) return null;
    }
    return blob;
  } catch {
    // Um arquivo local quebrado ou ausente não transforma a espécie em inexistente; tenta a origem abaixo.
    return null;
  }
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
  if (!isValidDexId(dexId)) throw new RangeError(`Número da Pokédex inválido: ${String(dexId)}`);
  if (options.shiny) {
    const found = await fetchVariant(dexId, true, fetchImpl);
    if (found) return found;
    // Sem sprite shiny para este Pokémon: mostra o normal (e o `shiny` falso avisa que não é a variante de cores).
  }
  return fetchVariant(dexId, false, fetchImpl);
}

async function fetchVariant(dexId: number, shiny: boolean, fetchImpl: typeof fetch): Promise<SpriteSource | null> {
  const manifest = await loadLocalPokemonSpriteManifest(fetchImpl);
  const candidates: { key: string; kind: SpriteKind; remoteUrl: string }[] = [
    { key: `showdown/${shiny ? 'shiny/' : ''}${dexId}.gif`, kind: 'gif', remoteUrl: pokemonSpriteUrl(dexId, shiny) },
    ...pokemonStaticSpriteUrls(dexId, shiny).map((remoteUrl, i) => ({
      key: `${i === 0 ? 'default' : 'home'}/${shiny ? 'shiny/' : ''}${dexId}.png`,
      kind: 'static' as const,
      remoteUrl,
    })),
  ];
  for (const candidate of candidates) {
    // A fonte local vem primeiro para cada formato: GIF continua tendo prioridade sobre PNG.
    const localUrl = localPokemonSpriteUrl(manifest, candidate.key);
    if (localUrl) {
      const blob = await tryFetchLocal(localUrl, candidate, manifest, fetchImpl);
      if (blob) return { kind: candidate.kind, url: localUrl, blob, ...(shiny ? { shiny: true } : {}) };
    }
    const blob = await tryFetch(candidate.remoteUrl, fetchImpl);
    if (blob) return { kind: candidate.kind, url: candidate.remoteUrl, blob, ...(shiny ? { shiny: true } : {}) };
  }
  return null;
}
