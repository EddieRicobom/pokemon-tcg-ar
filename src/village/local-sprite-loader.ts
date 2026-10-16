import { loadImageRgba } from '../recognition/browser-image';
import { hasLocalAnim, hasLocalShiny, sheetSize } from './local-sprite-meta';
import type { LocalSpriteMeta } from './local-sprite-meta';
import { sliceDirectionFrames } from './local-sprite';
import type { DecodedGif } from '../core/gif';
import type { Dir } from '../core/village/actors';

/** As 4 direções da Vila (`core/village/actors.ts`) e a linha correspondente na folha de sprite (ver `local-sprite-meta.ts`). */
const CARDINAL_ROWS: Record<Dir, 0 | 2 | 4 | 6> = { down: 0, right: 2, up: 4, left: 6 };

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
 * Uma pose (`animName`: "Idle", "Walk", ...), virada para baixo, de um Pokémon a partir do pacote de sprites
 * locais da Vila. Devolve null (sem lançar) quando a espécie não está no pacote, não tem essa animação, a
 * imagem não existe, ou a folha baixada não bate com os metadados — nesses casos quem chamou cai para outra
 * fonte (o GIF já baixado pela Caixa, na Vila; uma forma neutra, na Sobrevivência) sem travar nada.
 */
export async function loadLocalVillageSprite(dexId: number, shiny: boolean, deps: LocalSpriteDeps, animName = 'Idle'): Promise<DecodedGif | null> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const meta = await loadLocalSpriteMeta(deps.metaUrl, fetchImpl);
  if (!meta || !hasLocalAnim(meta, dexId, animName)) return null;
  const entry = meta[String(dexId)]!;
  const anim = entry.a[animName]!;
  const wantShiny = shiny && hasLocalShiny(meta, dexId);
  const { width, height } = sheetSize(anim);
  try {
    const { image } = await loadImageRgba(deps.spriteUrl(dexId, animName, wantShiny), width, height, fetchImpl);
    return sliceDirectionFrames(image, anim, 0 /* down: de frente para quem olha de cima */);
  } catch {
    return null;
  }
}

/**
 * As 4 poses cardeais (`up`/`down`/`left`/`right`) de uma animação, baixando a folha uma vez só e recortando cada
 * direção dela (mesmo custo de rede que `loadLocalVillageSprite`). Null nos mesmos casos que a de uma pose só; se
 * a folha carregar mas faltar alguma direção específica (planilha incompleta), essa chave simplesmente não entra
 * no resultado — quem usa cai pra outra direção disponível ou pro GIF de rede, nunca inventa um quadro.
 */
export async function loadLocalVillageSpriteDirs(
  dexId: number,
  shiny: boolean,
  deps: LocalSpriteDeps,
  animName = 'Idle',
): Promise<Partial<Record<Dir, DecodedGif>> | null> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const meta = await loadLocalSpriteMeta(deps.metaUrl, fetchImpl);
  if (!meta || !hasLocalAnim(meta, dexId, animName)) return null;
  const entry = meta[String(dexId)]!;
  const anim = entry.a[animName]!;
  const wantShiny = shiny && hasLocalShiny(meta, dexId);
  const { width, height } = sheetSize(anim);
  try {
    const { image } = await loadImageRgba(deps.spriteUrl(dexId, animName, wantShiny), width, height, fetchImpl);
    const out: Partial<Record<Dir, DecodedGif>> = {};
    for (const [dir, row] of Object.entries(CARDINAL_ROWS) as [Dir, number][]) {
      if (row >= anim.r) continue; // folha sem essa linha (menos de 8 direções): fica sem essa pose.
      out[dir] = sliceDirectionFrames(image, anim, row as 0 | 2 | 4 | 6);
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}
