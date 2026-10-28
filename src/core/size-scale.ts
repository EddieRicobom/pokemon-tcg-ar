import data from './data/pokemon-heights.json';

/**
 * Tamanho de cada Pokémon na tela pela ALTURA REAL da espécie (PokéAPI, ver `scripts/build-heights.mjs`), em vez de
 * pelo tamanho do desenho: os sprites do pacote local (PMD) e os GIFs do Showdown têm escalas próprias por espécie,
 * então um Snorlax e um Pikachu podiam sair do mesmo tamanho. A curva é compressiva (expoente 0,4) e presa entre um
 * mínimo e um máximo: a ordem real é preservada (maior na vida real = maior na tela), mas um Wailord de 14,5 m não
 * cobre a tela e um Joltik de 0,1 m não some. Âncora: o treinador da Vila (1,5 bloco) tem a altura de uma pessoa.
 */
const HEIGHTS_DM: readonly number[] = data.heights;
/** Formas alternativas (regionais, Mega, Gigantamax…) pelo id da PokéAPI (10001+), o mesmo de `spriteIdOf`. */
const FORM_HEIGHTS_DM: Readonly<Record<string, number>> = data.forms;

export const TRAINER_HEIGHT_M = 1.6;
export const TRAINER_TILES = 1.5;
export const SIZE_EXPONENT = 0.4;
export const MIN_TILES = 0.85;
export const MAX_TILES = 2.8;

/**
 * Altura real em metros: da espécie (número da Pokédex) ou da forma alternativa (id 10001+ da PokéAPI, ex.: Ponyta
 * de Galar 10162). Undefined se o número não está nos dados (nunca inventa).
 */
export function speciesHeightM(dexId: number | undefined): number | undefined {
  if (dexId === undefined || !Number.isInteger(dexId) || dexId <= 0) return undefined;
  const dm = dexId > 10000 ? FORM_HEIGHTS_DM[String(dexId)] : HEIGHTS_DM[dexId];
  return dm && dm > 0 ? dm / 10 : undefined;
}

/** Altura na tela, em blocos de 16 px da Vila, para uma altura real em metros. */
export function tilesForHeight(heightM: number): number {
  const raw = TRAINER_TILES * Math.pow(heightM / TRAINER_HEIGHT_M, SIZE_EXPONENT);
  return Math.min(MAX_TILES, Math.max(MIN_TILES, raw));
}

/** Altura na tela da espécie, ou undefined sem dado (quem chama mantém o tamanho pelo desenho, como antes). */
export function speciesTiles(dexId: number | undefined): number | undefined {
  const h = speciesHeightM(dexId);
  return h === undefined ? undefined : tilesForHeight(h);
}

/** Altura real de referência para o tamanho relativo: um Pokémon de 1 m sai do tamanho base (o ajuste do jogador). */
export const REFERENCE_HEIGHT_M = 1;

/**
 * Tamanho relativo da espécie, para cenas que não usam blocos da Vila (a Arena 3D e o AR da carta): 1 para um
 * Pokémon de 1 m, ~0,7 para um Pikachu, ~1,35 para um Snorlax. Mesma curva e mesmos limites de `tilesForHeight`.
 * Undefined sem dado de altura (quem chama mantém o tamanho pelo desenho, como antes).
 */
export function speciesRelativeSize(dexId: number | undefined): number | undefined {
  const tiles = speciesTiles(dexId);
  return tiles === undefined ? undefined : tiles / tilesForHeight(REFERENCE_HEIGHT_M);
}
