/**
 * O atlas de tilesets da Vila: cada recorte de uma das folhas de `tilesets/` (créditos em THIRD_PARTY_NOTICES.md) que
 * a Vila usa, juntos em `src/village/vila-atlas.png` (gerada por `scripts/build-vila-atlas.mjs`, URL com hash no build).
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
  /** Flores são uma camada sobre a grama local, sem o retângulo verde da folha de origem. */
  removeGrass?: boolean;
  /** Peças modulares da mesma folha: origem x/y/w/h e destino x/y dentro do recorte. */
  patches?: readonly (readonly [number, number, number, number, number, number])[];
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
  // Trilhas regionais: recortes escolhidos entre os autotiles já versionados no repositório.
  AT('at-harvest', 'Harvest_1.png'),
  AT('at-sand', 'Desert_1.png'),
  AT('at-snow', 'Snow_1.png'),
  AT('at-snow-rock', 'Snow_3.png'),
  AT('at-ruins', 'Ruins_1.png'),
  AT('at-brick', 'Ruins_3.png'),
  AT('at-ruins-path', 'fall ruins path.png'),
  AT('at-harvest-stone', 'fall harvest stone.png'),
  // ---- chão: blocos 3×3 de 16 px (Route 224): areia com margem de grama, areia com margem de água e o mar
  { id: 'sand-grass', sheet: 'Route 224.png', x: 80, y: 48, w: 48, h: 48 },
  { id: 'sand-water', sheet: 'Route 224.png', x: 0, y: 96, w: 48, h: 48 },
  { id: 'sea', sheet: 'Route 224.png', x: 80, y: 96, w: 48, h: 48 },
  // ---- chão: mato alto e flores (Daisy Route); a grama continua em `survivor-grass.png`
  { id: 'tall', sheet: 'Daisy Route.png', x: 0, y: 128, w: 48, h: 64 },
  { id: 'flowers-white', sheet: 'Daisy Route.png', x: 80, y: 32, w: 48, h: 16, removeGrass: true },
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
  { id: 'board', sheet: 'Daisy Route.png', x: 8, y: 464, w: 32, h: 48 },
  // ---- praça e parque (os postes de luz continuam desenhados por código: nenhuma folha tem um poste de rua)
  { id: 'swing', sheet: 'Daisy Route.png', x: 0, y: 626, w: 64, h: 40, erase: [[12, 656, 40, 10]] },
  { id: 'gym', sheet: 'Daisy Route.png', x: 64, y: 626, w: 48, h: 34 },
  { id: 'slide', sheet: 'Daisy Route.png', x: 112, y: 626, w: 16, h: 30 },
  { id: 'carousel', sheet: 'Daisy Route.png', x: 0, y: 666, w: 48, h: 42 },
  { id: 'seesaw', sheet: 'Daisy Route.png', x: 48, y: 668, w: 64, h: 22 },
  { id: 'umbrella-b', sheet: 'Jonquil Town.png', x: 0, y: 638, w: 32, h: 30 },
  { id: 'umbrella-r', sheet: 'Jonquil Town.png', x: 32, y: 638, w: 32, h: 30 },
  { id: 'umbrella-g', sheet: 'Jonquil Town.png', x: 64, y: 638, w: 32, h: 30 },
  // ---- construções
  { id: 'house-brick', sheet: 'Brick House Tiles.png', x: 0, y: 12, w: 80, h: 108 },
  { id: 'home-yellow', sheet: 'Apathy Houses.png', x: 0, y: 0, w: 80, h: 128 },
  // As outras cores trazem só a fachada. O telhado completo é a peça comum do início da folha.
  { id: 'home-orange', sheet: 'Apathy Houses.png', x: 0, y: 0, w: 80, h: 128, patches: [[0, 304, 80, 80, 0, 48]] },
  { id: 'home-teal', sheet: 'Apathy Houses.png', x: 0, y: 0, w: 80, h: 128, patches: [[0, 480, 80, 80, 0, 48]] },
  { id: 'home-blue', sheet: 'Apathy Houses.png', x: 0, y: 0, w: 80, h: 128, patches: [[0, 656, 80, 80, 0, 48]] },
  { id: 'home-pink', sheet: 'Apathy Houses.png', x: 0, y: 0, w: 80, h: 128, patches: [[0, 832, 80, 80, 0, 48]] },
  { id: 'center-blue', sheet: 'Pokémon Center and Mart Buildings.png', x: 0, y: 625, w: 82, h: 90 },
  { id: 'kiosk-red', sheet: 'Pokémon Center and Mart Buildings.png', x: 86, y: 0, w: 42, h: 48 },
  { id: 'kiosk-blue', sheet: 'Pokémon Center and Mart Buildings.png', x: 86, y: 625, w: 42, h: 47 },
  { id: 'tower', sheet: 'Jonquil Town.png', x: 0, y: 704, w: 80, h: 144 },
  { id: 'gazebo', sheet: 'Park Tileset.png', x: 144, y: 60, w: 56, h: 84 },
  { id: 'cabin', sheet: 'General Store.png', x: 0, y: 0, w: 128, h: 112 },
  // A fachada da loja da praça é um recorte próprio; `cabin` continua reservado ao Café.
  { id: 'market-store', sheet: 'General Store.png', x: 0, y: 0, w: 128, h: 112 },
  { id: 'barn', sheet: 'Fall Harvest.png', x: 0, y: 520, w: 80, h: 120 },
  { id: 'manor', sheet: 'Garden House Sheet.png', x: 0, y: 20, w: 160, h: 124 },
  { id: 'planter', sheet: 'Garden House Sheet.png', x: 160, y: 30, w: 48, h: 26 },
  { id: 'pot', sheet: 'Garden House Sheet.png', x: 176, y: 62, w: 16, h: 26 },
  { id: 'mine-entrance', sheet: 'Costal Cave.png', x: 0, y: 256, w: 48, h: 48 },
  { id: 'log-depot', sheet: 'Ivy Woods.png', x: 0, y: 16, w: 32, h: 16 },
  { id: 'stump', sheet: 'Ivy Woods.png', x: 0, y: 16, w: 16, h: 16 },
  { id: 'pier-deck', sheet: 'Route 224.png', x: 80, y: 320, w: 48, h: 32 },
  // ---- prédios cívicos no mesmo estilo das casas (contorno azul-marinho, 1 px = 1 px de bloco de 16, telhado em 3/4)
  // Fliperama: a lojinha de telhado laranja com o fliperama (gabinete de jogo) do lado, de Silph City; 80 de largura,
  // a do prédio (o 'center-blue' tinha 82 e saía encolhido). O poste listrado à direita fica de fora do recorte.
  { id: 'arcade-shop', sheet: 'Silph City.png', x: 0, y: 768, w: 80, h: 64, erase: [[64, 768, 16, 36]] },
  // Pista de Pins: o salão de muralha ameiada com a quadra verde no terraço (Sinnoh Tile Dump, Ekat), sem o toldo.
  { id: 'pins-hall', sheet: 'Sinnoh Tile Dump.png', x: 112, y: 144, w: 80, h: 80 },
  // ---- Montanha do Mew (tudo de 'All Cliffs.png', a mesma rocha marrom-rosada; a estátua é `mountain-art.ts`)
  // Chão do platô, 48×48: as 9 células são a mesma rocha rachada do miolo do `cliff` (ladrilha sem emenda). Não há
  // autotile de rocha nessa paleta (os 'Moon_*' são cinza-esverdeados); a borda do platô quem faz é o `cliff`.
  {
    id: 'mtn-ground', sheet: 'All Cliffs.png', x: 0, y: 192, w: 48, h: 48,
    patches: [0, 16, 32].flatMap((dy) => [0, 16, 32].map((dx) => [16, 208, 16, 16, dx, dy] as const)),
  },
  // Penhasco 3×3 (48×48), visto de cima. Linha de cima (y 0–15): borda superior do platô (cantos arredondados e a
  // aresta de cima); linha do meio (y 16–31): as laterais esquerda/direita com o miolo de rocha rachada (a face de
  // pedras começa a aparecer em y ≈ 26); linha de baixo (y 32–47): a FACE do penhasco voltada para o sul (blocos de
  // pedra) com a sombra cinza na última linha. A face tem ~22 px (y 26–47), então cabe nos 16 px da linha de baixo
  // mais o fim da linha do meio: não precisou do formato 48×64.
  { id: 'cliff', sheet: 'All Cliffs.png', x: 0, y: 192, w: 48, h: 48 },
  // Degraus de pedra (16×16): tábuas de pedra horizontais que sobem a face do penhasco (ladrilham na vertical).
  { id: 'mtn-stairs', sheet: 'All Cliffs.png', x: 32, y: 240, w: 16, h: 16 },
  // Pedra grande (32×32) com a sombra embaixo; o chão de areia dos cantos sai transparente (`erase`, linha a linha).
  {
    id: 'boulder', sheet: 'All Cliffs.png', x: 32, y: 48, w: 32, h: 32,
    erase: [[32, 48, 13, 1], [51, 48, 13, 1], [32, 49, 10, 1], [54, 49, 10, 1], [32, 50, 7, 1], [57, 50, 3, 1], [61, 50, 3, 1], [32, 51, 5, 1], [59, 51, 1, 1], [62, 51, 2, 1], [32, 52, 4, 1], [61, 52, 3, 1], [32, 53, 4, 1], [60, 53, 4, 1], [32, 54, 4, 1], [60, 54, 4, 1], [32, 55, 3, 1], [61, 55, 3, 1], [32, 56, 3, 1], [61, 56, 3, 1], [32, 57, 3, 1], [61, 57, 3, 1], [32, 58, 2, 1], [62, 58, 1, 1], [32, 59, 2, 1], [62, 59, 2, 1], [32, 60, 1, 1], [63, 60, 1, 1], [32, 72, 1, 1], [32, 73, 1, 1], [32, 74, 1, 1], [32, 75, 2, 1], [62, 75, 2, 1], [32, 76, 2, 1], [62, 76, 2, 1], [32, 77, 2, 1], [62, 77, 2, 1], [32, 78, 3, 1], [61, 78, 3, 1], [32, 79, 4, 1], [61, 79, 3, 1]],
  },
  // Pedrinha solta (16×16, já com fundo transparente na folha).
  { id: 'mtn-rock', sheet: 'All Cliffs.png', x: 0, y: 176, w: 16, h: 16 },
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
