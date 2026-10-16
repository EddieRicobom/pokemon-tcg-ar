import { MAP_H, MAP_W } from './map';

/**
 * Zoom da câmera da Vila: escala inteira (pixel art nítida) dos blocos de `tile` px. No celular em pé mostra uns
 * 11 blocos na largura (como sempre foi); numa tela larga (desktop) o bloco para de crescer em `MAX_CSS_TILE` px,
 * então a câmera fica mais afastada e mostra bem mais da Vila em vez de um close gigante. Nunca mostra mais blocos
 * que o mapa tem (senão sobraria borda vazia).
 */
export const PHONE_TILES_ACROSS = 11;
/** Tamanho máximo de um bloco na tela, em px CSS (desktop). */
export const MAX_CSS_TILE = 56;
/** Tamanho mínimo, pra nada ficar miúdo demais em telas pequenas. */
export const MIN_CSS_TILE = 28;

export function villageScale(cssWidth: number, cssHeight: number, dpr: number, tile = 16, mapW = MAP_W, mapH = MAP_H): number {
  const byWidth = cssWidth / PHONE_TILES_ACROSS;
  // Em paisagem, a altura também limita (mostra pelo menos ~8 blocos de altura).
  const byHeight = cssHeight > 0 ? cssHeight / 8 : byWidth;
  const cssTile = Math.min(MAX_CSS_TILE, Math.max(MIN_CSS_TILE, Math.min(byWidth, byHeight)));
  let scale = Math.max(2, Math.round((cssTile * dpr) / tile));
  // Não deixa a tela mostrar mais que o mapa inteiro.
  const fit = Math.ceil(Math.max((cssWidth * dpr) / (tile * mapW), (cssHeight * dpr) / (tile * mapH)));
  scale = Math.max(scale, fit);
  return scale;
}
