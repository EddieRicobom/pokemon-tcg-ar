/**
 * O atlas de tilesets da Vila: cada recorte de uma das folhas de `tilesets/` (créditos em THIRD_PARTY_NOTICES.md) que
 * a Vila usa, juntos numa imagem só (`public/tilesets/vila-atlas.png`, gerada por `scripts/build-vila-atlas.mjs`).
 * As folhas principais já estão na escala da Vila (blocos de 16 px); os autotiles (`Autotiles/`) estão em 2× e entram
 * reduzidos pela metade (`half`), sem perder nada (cada pixel da arte ocupa 2×2 lá).
 *
 * Este arquivo é a única fonte das posições: o script desenha o atlas a partir dele e o jogo acha cada recorte por
 * aqui (`packAtlas`). Só sintaxe de TypeScript que o Node apaga sozinho (o script importa este arquivo direto).
 */

export interface AtlasSource {
  id: string;
  /** Caminho dentro de `tilesets/`. */
  sheet: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Folha em 2× (autotiles): entra com metade do tamanho. */
  half?: boolean;
  /** Pedaços de peças vizinhas que caem dentro do recorte (x, y, w, h na folha): saem transparentes. */
  erase?: readonly (readonly [number, number, number, number])[];
}

export interface AtlasRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const AT = (id: string, file: string): AtlasSource => ({ id, sheet: `Autotiles/${file}`, x: 0, y: 0, w: 96, h: 128, half: true });

export const ATLAS_SOURCES: readonly AtlasSource[] = [
  // ---- chão: autotiles no formato do RPG Maker XP (bloco 3×3 + cantos de dentro), reduzidos a 48×64
  AT('at-path', 'Default_4.png'),
  AT('at-trail', 'dust grass.png'),
  AT('at-plot', 'Default_2.png'),
  AT('at-plaza', 'Default_6.png'),
  AT('at-dirt', 'Default_3.png'),
  // ---- chão: blocos 3×3 de 16 px (Route 224): areia com margem de grama, areia com margem de água e o mar
  { id: 'sand-grass', sheet: 'Route 224.png', x: 80, y: 48, w: 48, h: 48 },
  { id: 'sand-water', sheet: 'Route 224.png', x: 0, y: 96, w: 48, h: 48 },
  { id: 'sea', sheet: 'Route 224.png', x: 80, y: 96, w: 48, h: 48 },
  // ---- chão: mato alto e flores (Daisy Route); a grama continua em `survivor-grass.png`
  { id: 'tall', sheet: 'Daisy Route.png', x: 0, y: 128, w: 48, h: 64 },
  { id: 'flowers-white', sheet: 'Daisy Route.png', x: 80, y: 32, w: 48, h: 16 },
  // ---- natureza
  { id: 'pine-s1', sheet: 'Route 224.png', x: 80, y: 160, w: 16, h: 32 },
  { id: 'pine-s2', sheet: 'Route 224.png', x: 96, y: 144, w: 16, h: 48 },
  { id: 'pine-m', sheet: 'Route 224.png', x: 48, y: 144, w: 32, h: 48 },
  { id: 'tree-big', sheet: 'Route 224.png', x: 0, y: 144, w: 48, h: 48 },
  { id: 'rock-1', sheet: 'Route 224.png', x: 80, y: 208, w: 16, h: 16 },
  { id: 'rock-2', sheet: 'Route 224.png', x: 96, y: 208, w: 16, h: 16 },
  { id: 'rock-3', sheet: 'Route 224.png', x: 112, y: 208, w: 16, h: 16 },
  { id: 'bush', sheet: 'Thistle Town.png', x: 112, y: 496, w: 16, h: 16 },
  { id: 'fence-h', sheet: 'Daisy Route.png', x: 48, y: 448, w: 32, h: 16 },
  { id: 'wall', sheet: 'Daisy Route.png', x: 64, y: 432, w: 64, h: 16 },
  { id: 'board', sheet: 'Daisy Route.png', x: 0, y: 480, w: 48, h: 48 },
  // ---- praça e parque (os postes de luz continuam desenhados por código: nenhuma folha tem um poste de rua)
  { id: 'swing', sheet: 'Daisy Route.png', x: 0, y: 626, w: 64, h: 46 },
  { id: 'gym', sheet: 'Daisy Route.png', x: 64, y: 626, w: 48, h: 34 },
  { id: 'slide', sheet: 'Daisy Route.png', x: 112, y: 626, w: 16, h: 30 },
  { id: 'carousel', sheet: 'Daisy Route.png', x: 0, y: 666, w: 48, h: 42 },
  { id: 'seesaw', sheet: 'Daisy Route.png', x: 48, y: 668, w: 64, h: 22 },
  { id: 'umbrella-b', sheet: 'Jonquil Town.png', x: 0, y: 636, w: 32, h: 32 },
  { id: 'umbrella-r', sheet: 'Jonquil Town.png', x: 32, y: 636, w: 32, h: 32 },
  { id: 'umbrella-g', sheet: 'Jonquil Town.png', x: 64, y: 636, w: 32, h: 32 },
  // ---- construções
  { id: 'house-brick', sheet: 'Brick House Tiles.png', x: 0, y: 12, w: 80, h: 108 },
  { id: 'home-yellow', sheet: 'Apathy Houses.png', x: 0, y: 0, w: 72, h: 128 },
  { id: 'home-orange', sheet: 'Apathy Houses.png', x: 0, y: 288, w: 72, h: 96 },
  { id: 'home-teal', sheet: 'Apathy Houses.png', x: 0, y: 464, w: 72, h: 96 },
  { id: 'home-blue', sheet: 'Apathy Houses.png', x: 0, y: 640, w: 72, h: 96 },
  { id: 'home-pink', sheet: 'Apathy Houses.png', x: 0, y: 816, w: 72, h: 96 },
  { id: 'center-red', sheet: 'Pokémon Center and Mart Buildings.png', x: 0, y: 0, w: 82, h: 90 },
  { id: 'center-blue', sheet: 'Pokémon Center and Mart Buildings.png', x: 0, y: 625, w: 82, h: 90 },
  { id: 'kiosk-red', sheet: 'Pokémon Center and Mart Buildings.png', x: 86, y: 0, w: 42, h: 48 },
  { id: 'kiosk-blue', sheet: 'Pokémon Center and Mart Buildings.png', x: 86, y: 625, w: 42, h: 47 },
  { id: 'tower', sheet: 'Jonquil Town.png', x: 0, y: 704, w: 80, h: 152, erase: [[0, 848, 16, 8], [64, 848, 16, 8]] },
  { id: 'gazebo', sheet: 'Park Tileset.png', x: 144, y: 60, w: 56, h: 84 },
  { id: 'cabin', sheet: 'General Store.png', x: 0, y: 0, w: 128, h: 104, erase: [[96, 96, 32, 8]] },
  { id: 'barn', sheet: 'Fall Harvest.png', x: 0, y: 520, w: 80, h: 120 },
  { id: 'manor', sheet: 'Garden House Sheet.png', x: 0, y: 20, w: 160, h: 124 },
  { id: 'planter', sheet: 'Garden House Sheet.png', x: 160, y: 30, w: 48, h: 26 },
  { id: 'pot', sheet: 'Garden House Sheet.png', x: 176, y: 62, w: 16, h: 26 },
];

/** Largura do atlas (px). */
export const ATLAS_W = 256;

/**
 * Posição de cada recorte no atlas: prateleiras da esquerda para a direita, na ordem da lista (determinístico — o
 * script e o jogo chegam ao mesmo lugar). 1 px de folga entre recortes.
 */
export function packAtlas(sources: readonly AtlasSource[] = ATLAS_SOURCES, width = ATLAS_W): { rects: Map<string, AtlasRect>; h: number } {
  const rects = new Map<string, AtlasRect>();
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const s of sources) {
    const w = s.half ? s.w / 2 : s.w;
    const h = s.half ? s.h / 2 : s.h;
    if (w > width) throw new Error(`recorte maior que o atlas: ${s.id}`);
    if (x + w > width) {
      x = 0;
      y += shelf + 1;
      shelf = 0;
    }
    rects.set(s.id, { x, y, w, h });
    x += w + 1;
    shelf = Math.max(shelf, h);
  }
  return { rects, h: y + shelf };
}
