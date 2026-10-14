import { distinctPieces } from '../core/minigames';
import type { Piece } from '../core/minigames';
import type { CachedCard } from '../cache/types';

/** O pedaço do cache que os jogos usam (só leitura). */
export interface PieceSource {
  list(): Promise<CachedCard[]>;
  getAssetBlob(card: CachedCard, kind: 'sprite'): Promise<Blob | null>;
}

export interface LoadedPieces {
  pieces: Piece[];
  /** Endereço da imagem do Pokémon de cada peça (id da peça → URL local). */
  urls: Map<string, string>;
  release(): void;
}

/**
 * As cartas guardadas que têm o Pokémon carregado viram peças dos minigames. A imagem é o GIF do próprio Pokémon,
 * já guardado no aparelho (nada é baixado aqui).
 */
export async function loadPieces(source: PieceSource, makeUrl: (blob: Blob) => string = (b) => URL.createObjectURL(b), revoke: (url: string) => void = (u) => URL.revokeObjectURL(u)): Promise<LoadedPieces> {
  const cards = (await source.list()).filter((card) => card.sprite.state === 'ok' && card.sprite.key && card.dexIds.length > 0);
  const candidates: Piece[] = cards.map((card) => ({ id: card.id, name: card.name, spriteKey: card.sprite.key! }));
  const pieces = distinctPieces(candidates);
  const urls = new Map<string, string>();
  for (const piece of pieces) {
    const card = cards.find((c) => c.id === piece.id)!;
    const blob = await source.getAssetBlob(card, 'sprite').catch(() => null);
    if (blob) urls.set(piece.id, makeUrl(blob));
  }
  // Peça sem imagem não serve de jogo.
  const usable = pieces.filter((p) => urls.has(p.id));
  return { pieces: usable, urls, release: () => urls.forEach((url) => revoke(url)) };
}
