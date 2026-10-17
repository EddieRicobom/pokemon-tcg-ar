import type { Tile, VillageMap } from '../core/village/map';

/**
 * O minimapa da Vila: um pixel por bloco, com a cor de cada tipo de chão (as ruas e a praça claras, a água azul, as
 * matas escuras, os prédios marrons). Os pontos (você, os Pokémon, o sino) são desenhados por cima, a cada instante, em
 * `VillageView.vue`. Função pura: dá para testar sem navegador.
 */
export const MINI_COLORS: Readonly<Record<Tile, number>> = {
  grass: 0x6cc070,
  tall: 0x4f9f55,
  flower: 0x8fd08a,
  path: 0xe8dfc4,
  plaza: 0xf2ecda,
  trail: 0xc9b98e,
  sand: 0xf0dca0,
  water: 0x4f8fe0,
  tree: 0x2f6b38,
  rock: 0x8e8a82,
  bush: 0x3f8a46,
  plot: 0xa8743e,
  field: 0x9c6a3c,
  shop: 0xe86a4a,
  building: 0x8a5a3a,
  lamp: 0x6cc070,
  deco: 0x7a6a8a,
};

/** Os pixels RGBA do minimapa (largura × altura do mapa). */
export function minimapPixels(map: VillageMap): Uint8ClampedArray {
  const out = new Uint8ClampedArray(map.w * map.h * 4);
  for (let i = 0; i < map.w * map.h; i++) {
    const rgb = MINI_COLORS[map.tiles[i]!] ?? 0x000000;
    out[i * 4] = (rgb >> 16) & 255;
    out[i * 4 + 1] = (rgb >> 8) & 255;
    out[i * 4 + 2] = rgb & 255;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** O bloco do mapa sob um ponto do minimapa desenhado com `size` (largura × altura na tela). */
export function minimapTileAt(map: Pick<VillageMap, 'w' | 'h'>, px: number, py: number, width: number, height: number): { x: number; y: number } | null {
  if (width <= 0 || height <= 0) return null;
  const x = Math.floor((px / width) * map.w);
  const y = Math.floor((py / height) * map.h);
  return x >= 0 && y >= 0 && x < map.w && y < map.h ? { x, y } : null;
}
