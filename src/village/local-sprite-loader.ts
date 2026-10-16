import { loadImageRgba } from '../recognition/browser-image';
import { hasLocalAnim, hasLocalShiny, sheetSize } from './local-sprite-meta';
import type { LocalSpriteMeta } from './local-sprite-meta';
import { sliceDirectionFrames } from './local-sprite';
import type { DecodedGif } from '../core/gif';

export interface LocalSpriteDeps {
  /** Endereço do JSON de metadados (`assetUrl('data/village-sprite-meta.json')`). */
  metaUrl: string;
  /** Monta o endereço de `pokemon/<dexId>/<anim>.png` (ou `pokemon/<dexId>/s/<anim>.png` se `shiny`). */
  spriteUrl: (dexId: number, anim: string, shiny: boolean) => string;
  fetchImpl?: typeof fetch;
}

let metaPromise: Promise<LocalSpriteMeta | null> | null = null;

/** Carrega o JSON de metadados uma vez só; devolve null se não existir ou a leitura falhar (fallback silencioso). */
export function loadLocalSpriteMeta(url: string, fetchImpl: typeof fetch = fetch): Promise<LocalSpriteMeta | null> {
  metaPromise ??= fetchImpl(url)
    .then((response) => (response.ok ? (response.json() as Promise<LocalSpriteMeta>) : null))
    .catch(() => null);
  return metaPromise;
}

/** Só para testes: esquece o metadado carregado (cada teste começa do zero). */
export function resetLocalSpriteMetaCache(): void {
  metaPromise = null;
}

/**
 * Pose "Idle" (parado), virada para baixo, de um Pokémon a partir do pacote de sprites locais da Vila.
 * Devolve null (sem lançar) quando a espécie não está no pacote, a imagem não existe, ou a folha baixada
 * não bate com os metadados — nesses casos a Vila cai para o GIF já baixado pela Caixa, sem travar nada.
 */
export async function loadLocalVillageSprite(dexId: number, shiny: boolean, deps: LocalSpriteDeps): Promise<DecodedGif | null> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const meta = await loadLocalSpriteMeta(deps.metaUrl, fetchImpl);
  if (!meta || !hasLocalAnim(meta, dexId, 'Idle')) return null;
  const entry = meta[String(dexId)]!;
  const anim = entry.a.Idle!;
  const wantShiny = shiny && hasLocalShiny(meta, dexId);
  const { width, height } = sheetSize(anim);
  try {
    const { image } = await loadImageRgba(deps.spriteUrl(dexId, 'Idle', wantShiny), width, height, fetchImpl);
    return sliceDirectionFrames(image, anim, 0 /* down: de frente para quem olha a Vila de cima */);
  } catch {
    return null;
  }
}
