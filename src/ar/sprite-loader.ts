import { decodeGif } from '../core/gif';
import type { RgbaImage } from '../recognition/types';
import { CardSprite } from './card-sprite';
import { fetchSprite } from './sprite-source';
import type { SpriteSource } from './sprite-source';

export type SpriteLoadState =
  | { kind: 'loading' }
  | { kind: 'animated'; url: string; frames: number; durationMs: number }
  | { kind: 'static'; url: string; reason: string }
  | { kind: 'placeholder'; reason: string }
  | { kind: 'error'; message: string };

export interface SpriteLoaderDeps {
  /** Procura primeiro no cache do aparelho; depois na rede. Devolve null se o Pokémon não tem sprite. */
  getSprite?: (dexId: number) => Promise<SpriteSource | null>;
  /** Decodifica PNG em pixels (navegador). */
  decodeStatic?: (blob: Blob) => Promise<RgbaImage>;
}

/**
 * Carrega o sprite do Pokémon em um CardSprite, na ordem: GIF animado → PNG estático → marcador.
 * Nunca finge: cada estado diz o que realmente está na tela. Falha de rede é "erro" (dá para tentar
 * de novo), não "sem sprite".
 */
export async function loadSpriteInto(
  sprite: CardSprite,
  dexId: number | undefined,
  deps: SpriteLoaderDeps = {},
  onState?: (state: SpriteLoadState) => void,
): Promise<SpriteLoadState> {
  const emit = (state: SpriteLoadState) => {
    onState?.(state);
    return state;
  };
  emit({ kind: 'loading' });
  sprite.setSpecies(dexId);
  if (dexId === undefined) {
    sprite.setPlaceholder();
    return emit({ kind: 'placeholder', reason: 'Esta carta não é de um Pokémon (Treinador ou Energia).' });
  }
  let source: SpriteSource | null;
  try {
    source = await (deps.getSprite ?? ((id) => fetchSprite(id)))(dexId);
  } catch (error) {
    // Sem o GIF, mostra o marcador rotulado: assim dá para ver que o rastreamento funciona.
    sprite.setPlaceholder();
    return emit({ kind: 'error', message: error instanceof Error ? error.message : 'Não consegui baixar o sprite.' });
  }
  if (!source) {
    sprite.setPlaceholder();
    return emit({ kind: 'placeholder', reason: 'Não existe sprite para este Pokémon no PokeAPI/sprites.' });
  }
  try {
    if (source.kind === 'gif') {
      const gif = decodeGif(await source.blob.arrayBuffer());
      sprite.setAnimation(gif);
      return emit({ kind: 'animated', url: source.url, frames: gif.frames.length, durationMs: gif.durationMs });
    }
    if (!deps.decodeStatic) throw new Error('Decodificador de imagem indisponível.');
    sprite.setStatic(await deps.decodeStatic(source.blob));
    return emit({ kind: 'static', url: source.url, reason: 'Não existe GIF animado para este Pokémon; mostrando a imagem parada.' });
  } catch (error) {
    // Arquivo baixado mas ilegível (GIF corrompido, por exemplo): não esconder, avisar.
    sprite.setPlaceholder();
    return emit({ kind: 'error', message: error instanceof Error ? `Sprite ilegível: ${error.message}` : 'Sprite ilegível.' });
  }
}
