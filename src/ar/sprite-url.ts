/**
 * Sprites do Pokémon no repositório PokeAPI/sprites, montados a partir do número
 * oficial da Pokédex Nacional (o `dexId` do TCGdex).
 *
 * Não existe catálogo manual de URLs: os endereços são sempre calculados.
 * Nem todo Pokémon tem GIF animado (verificado em 2026-10-11: o Miraidon, 1008,
 * não tem), por isso existe uma cadeia de fallback estático.
 */
const SPRITES_BASE_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

export const POKEAPI_SHOWDOWN_BASE_URL = `${SPRITES_BASE_URL}/other/showdown`;

export function isValidDexId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function assertDexId(dexId: number): void {
  if (!isValidDexId(dexId)) {
    throw new RangeError(`Número da Pokédex inválido: ${String(dexId)}`);
  }
}

/**
 * GIF animado com fundo transparente. `shiny` pede a variante shiny (cores diferentes), que o mesmo repositório guarda
 * em `showdown/shiny/` (verificado em 2026-10-14 para 25, 475, 1009 e formas como 10034 e 10068; o 1008 não tem GIF).
 */
export function pokemonSpriteUrl(dexId: number, shiny = false): string {
  assertDexId(dexId);
  return `${POKEAPI_SHOWDOWN_BASE_URL}/${shiny ? 'shiny/' : ''}${dexId}.gif`;
}

/**
 * Sprites estáticos transparentes, do mais leve ao mais pesado. Todos existiam
 * para 25, 1008 e 1009 na verificação de 2026-10-11.
 */
export function pokemonStaticSpriteUrls(dexId: number, shiny = false): string[] {
  assertDexId(dexId);
  const dir = shiny ? 'shiny/' : '';
  return [`${SPRITES_BASE_URL}/${dir}${dexId}.png`, `${SPRITES_BASE_URL}/other/home/${dir}${dexId}.png`];
}

/** O endereço guardado é de um sprite shiny? */
export function isShinySpriteUrl(url: string | undefined): boolean {
  return url !== undefined && /\/shiny\/\d+\.(gif|png)$/.test(url.split('?')[0] ?? '');
}
