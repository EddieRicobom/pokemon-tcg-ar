import type { Tile, VillageMap } from './map';
import { buildingsFor } from './town-layout';

export const LEISURE_SPOTS = [
  { id: 'garden', name: 'Jardim das Estações', icon: '🌷', x: 40, y: 81, action: 'Cuidar das flores', description: 'Um jardim de canteiros, cercas baixas e flores para recolher.' },
  { id: 'square', name: 'Praça dos Encontros', icon: '🎵', x: 71, y: 83, action: 'Fazer uma roda de conversa', description: 'Uma praça para sentar, conversar e encontrar os vizinhos.' },
  { id: 'grove', name: 'Bosque do Piquenique', icon: '🧺', x: 99, y: 66, action: 'Dividir uma fruta', description: 'Mesas entre as árvores. Traga uma Oran ou Pecha para compartilhar.' },
  { id: 'lookout', name: 'Mirante das Nuvens', icon: '🔭', x: 104, y: 19, action: 'Observar a paisagem', description: 'Um deck tranquilo, acima da margem, para observar o céu com um amigo.' },
  { id: 'beach', name: 'Praia das Conchas', icon: '🐚', x: 109, y: 49, action: 'Procurar uma concha', description: 'Areia clara, mar, guarda-sóis e um pequeno píer de madeira.' },
] as const;

/** Mantém o mapa antigo pixel a pixel e acrescenta bairros ao leste e ao sul. */
export function expandVillage(base: VillageMap, w: number, h: number, seed: number): VillageMap {
  const map: VillageMap = { ...base, w, h, tiles: new Array<Tile>(w * h).fill('grass'), decor: [...base.decor] };
  const put = (x: number, y: number, tile: Tile) => { if (x >= 0 && y >= 0 && x < w && y < h) map.tiles[y * w + x] = tile; };
  const fill = (x: number, y: number, width: number, height: number, tile: Tile) => { for (let j = y; j < y + height; j++) for (let i = x; i < x + width; i++) put(i, j, tile); };
  for (let y = 0; y < base.h; y++) for (let x = 0; x < base.w; x++) put(x, y, base.tiles[y * base.w + x]!);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x < base.w && y < base.h) continue;
    const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (edge < 3 || (x * 31 + y * 53 + seed) % 37 === 0) put(x, y, 'tree');
  }
  // Nova praia no leste. A costa tem pequenas curvas; a água nunca corta a rua antiga.
  for (let y = 35; y < h - 3; y++) {
    const coast = 111 + Math.round(Math.sin(y / 8) * 2);
    for (let x = 103; x < w; x++) put(x, y, x >= coast + 2 ? 'water' : x >= coast - 5 ? 'sand' : 'grass');
  }
  fill(32, 77, 19, 13, 'grass'); fill(64, 77, 17, 13, 'plaza'); fill(94, 60, 13, 13, 'grass'); fill(99, 15, 12, 8, 'pier');
  // Conexões largas, sem teletransporte: centro → anexos e uma trilha costeira contínua.
  fill(47, 67, 2, 25, 'path'); fill(39, 81, 33, 2, 'trail'); fill(70, 63, 2, 22, 'trail');
  fill(76, 64, 26, 2, 'trail'); fill(92, 38, 18, 2, 'trail'); fill(100, 19, 2, 49, 'trail');
  fill(87, 19, 18, 2, 'trail'); fill(100, 48, 10, 2, 'trail'); fill(109, 53, 7, 3, 'pier');
  // Canteiros com passagens entre eles, pequenos pomares e recursos visíveis.
  for (const [x, y] of [[34, 78], [38, 78], [43, 78], [34, 85], [39, 85], [44, 85]] as const) fill(x, y, 2, 2, 'flower');
  for (const [x, y] of [[95, 60], [104, 60], [95, 71], [104, 71], [31, 77], [51, 88]] as const) { put(x, y, 'tree'); put(x + 1, y + 1, 'bush'); }
  const decoration = (item: string, x: number, y: number) => {
    put(x, y, 'deco'); map.decor.push({ kind: 'furniture', item, x, y, w: 1, h: 1 });
  };
  for (const [item, x, y] of [
    ['jardineira-lavanda', 35, 80], ['jardineira-lavanda', 45, 80], ['barril-flores', 32, 84], ['banco-ferro', 37, 88], ['banco-ferro', 45, 88],
    ['lanterna-pedra', 65, 78], ['lanterna-pedra', 78, 78], ['banco-ferro', 66, 86], ['banco-ferro', 75, 86], ['canteiro-pedras', 78, 88],
    ['mesa-piquenique', 97, 64], ['mesa-piquenique', 103, 69], ['barril-flores', 94, 67], ['lixeira-praca', 104, 64],
    ['banco-ferro', 103, 16], ['lanterna-pedra', 109, 16], ['espreguicadeira', 108, 44], ['guarda-sol', 110, 44], ['espreguicadeira', 108, 59], ['guarda-sol', 110, 59],
  ] as const) decoration(item, x, y);
  // Prédios que só cabem no mapa grande (o mapa base 96×72 os descarta), como o Altar da Confiança.
  const known = new Set(base.buildings.map((b) => b.id));
  for (const b of buildingsFor(w, h)) {
    if (known.has(b.id)) continue;
    fill(b.x, b.y, b.w, b.h, 'building');
    fill(b.x, b.y + b.h, b.w, 1, 'path');
    map.buildings = [...map.buildings, b];
  }
  for (const place of LEISURE_SPOTS) { put(place.x, place.y + 1, 'deco'); map.decor.push({ kind: 'leisure-sign', x: place.x, y: place.y + 1, w: 1, h: 1 }); }
  return map;
}
