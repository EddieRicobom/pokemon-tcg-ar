/**
 * Catálogo dos sprites PokéAPI incorporados ao próprio site. Ele é produzido por
 * `scripts/sync-pokeapi-sprites.ts`; o app não considera uma URL previsível como
 * disponível sem antes ela constar aqui, evitando milhares de 404 no Pages.
 */
export interface LocalPokemonSpriteAsset {
  /** Caminho dentro de `public/sprites/pokeapi/`. */
  path: string;
  /** Caminho e revisão na fonte, para auditoria e nova importação. */
  sourcePath: string;
  sourceCommit: string;
  bytes: number;
  sha256: string;
}

export interface LocalPokemonSpriteManifest {
  version: 1;
  generatedAt: string;
  source: { repository: string; commit: string };
  assets: Record<string, LocalPokemonSpriteAsset>;
}

let manifestPromise: Promise<LocalPokemonSpriteManifest | null> | null = null;

function isManifest(value: unknown): value is LocalPokemonSpriteManifest {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<LocalPokemonSpriteManifest>;
  return data.version === 1 && typeof data.generatedAt === 'string' && typeof data.assets === 'object' && data.assets !== null;
}

/** Lê o manifesto uma única vez. Arquivo ausente significa pacote local ainda não publicado. */
export function loadLocalPokemonSpriteManifest(
  fetchImpl: typeof fetch = fetch,
  manifestUrl = `${import.meta.env.BASE_URL}data/pokeapi-sprite-manifest.json`,
): Promise<LocalPokemonSpriteManifest | null> {
  manifestPromise ??= fetchImpl(manifestUrl)
    .then(async (response) => (response.ok ? response.json() : null))
    .then((value) => (isManifest(value) ? value : null))
    .catch(() => null);
  return manifestPromise;
}

/** Só para testes: esquece o manifesto carregado. */
export function resetLocalPokemonSpriteManifest(): void {
  manifestPromise = null;
}

/** O caminho do asset publicado, se ele estiver no manifesto. */
export function localPokemonSpriteUrl(manifest: LocalPokemonSpriteManifest | null, key: string): string | null {
  const asset = manifest?.assets[key];
  return asset ? `${import.meta.env.BASE_URL}${asset.path}` : null;
}
