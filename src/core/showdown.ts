/**
 * URLs dos GIFs animados do Pokémon Showdown.
 *
 * ATENÇÃO: a convenção de nomes abaixo (diretórios `ani`, `ani-back`, `ani-shiny`
 * e arquivos `<espécie>[-<forma>].gif`) segue o layout público conhecido do
 * Showdown, mas NÃO foi verificada contra o servidor real, porque o workspace de
 * desenvolvimento não alcança play.pokemonshowdown.com. Também não está
 * confirmado que o servidor envia cabeçalhos CORS (necessários para ler o GIF e
 * desenhá-lo em WebGL). Ver IMPLEMENTATION_PLAN.md, Fase 1.
 */
export const SHOWDOWN_SPRITES_BASE_URL = 'https://play.pokemonshowdown.com/sprites';

export type SpriteVariant = 'front' | 'back' | 'shiny' | 'back-shiny';

const VARIANT_DIRECTORY: Record<SpriteVariant, string> = {
  front: 'ani',
  back: 'ani-back',
  shiny: 'ani-shiny',
  'back-shiny': 'ani-back-shiny',
};

/** Identificador no estilo do Showdown: minúsculas, só a-z e 0-9, sem acentos. */
export function toShowdownId(text: string): string {
  return text
    .replace(/♀/g, 'f')
    .replace(/♂/g, 'm')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export interface SpriteOptions {
  /** Forma alternativa, por exemplo "Mega X" ou "Alola". */
  forme?: string;
  variant?: SpriteVariant;
}

export function showdownSpriteUrl(species: string, options: SpriteOptions = {}): string {
  const speciesId = toShowdownId(species);
  if (speciesId === '') {
    throw new RangeError('Informe o nome de um Pokémon (em inglês).');
  }

  const formeId = options.forme ? toShowdownId(options.forme) : '';
  const fileName = formeId === '' ? speciesId : `${speciesId}-${formeId}`;
  const directory = VARIANT_DIRECTORY[options.variant ?? 'front'];
  return `${SHOWDOWN_SPRITES_BASE_URL}/${directory}/${fileName}.gif`;
}
