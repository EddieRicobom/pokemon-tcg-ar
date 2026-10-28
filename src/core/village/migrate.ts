import { add, MAP_LAYOUT, MAP_LAYOUT_BEFORE_MOUNTAIN } from './life';
import type { Crop, VillageState } from './life';
import { findFree, isWalkable, tileAt } from './map';
import type { VillageMap } from './map';
import { FIELDS } from './town-layout';
import { WEST } from './west';

/**
 * Traz um save do mapa antigo (48×40) para o mapa grande: as posições antigas não querem dizer nada no desenho novo,
 * então nada fica "perdido" num lugar aleatório. Os móveis voltam para a mochila (para você pôr de novo onde
 * quiser), a horta é replantada nos canteiros da fazenda com o mesmo estágio e a mesma rega, a coleta do dia
 * recomeça e você aparece no ponto de partida. Devolve se mudou alguma coisa.
 */
export function migrateLayout(s: VillageState, map: VillageMap): boolean {
  if (s.layout === MAP_LAYOUT) return repairOccupiedTerrain(s, map);
  if (s.layout === MAP_LAYOUT_BEFORE_MOUNTAIN) {
    // O Monte Miragem entrou a oeste e a cidade andou `WEST` blocos: tudo vai junto, no mesmo lugar de antes.
    for (const f of s.placed) f.x += WEST;
    for (const c of s.crops) c.x += WEST;
    s.player = { ...s.player, x: s.player.x + WEST };
    s.harvested = {};
    s.layout = MAP_LAYOUT;
    repairOccupiedTerrain(s, map);
    return true;
  }
  for (const f of s.placed) add(s, f.item, 1);
  s.placed = [];
  const spots: { x: number; y: number }[] = [];
  for (const f of FIELDS) for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) if (tileAt(map, x, y) === 'field') spots.push({ x, y });
  const replanted: Crop[] = [];
  for (const c of s.crops) {
    const spot = spots.shift();
    // Sem canteiro livre (mais plantas do que cabem na fazenda): a semente volta para a mochila.
    if (!spot) add(s, c.seed as Parameters<typeof add>[1], 1);
    else replanted.push({ ...c, x: spot.x, y: spot.y });
  }
  s.crops = replanted;
  s.harvested = {};
  s.player = { x: map.spawn.x, y: map.spawn.y, dir: 'down' };
  s.layout = MAP_LAYOUT;
  return true;
}

/** Novos postos podem ocupar terreno antes decorável; desloca os itens, sem apagar mobília nem idade dos cultivos. */
function repairOccupiedTerrain(s: VillageState, map: VillageMap): boolean {
  let changed = false;
  const taken = (x: number, y: number) => s.placed.some((item) => item.x === x && item.y === y) || s.crops.some((crop) => crop.x === x && crop.y === y);
  for (const item of s.placed) {
    if (isWalkable(map, item.x, item.y)) continue;
    Object.assign(item, findFree(map, item.x, item.y, taken, () => 0));
    changed = true;
  }
  for (const crop of s.crops) {
    if (['grass', 'flower', 'field'].includes(tileAt(map, crop.x, crop.y))) continue;
    const field = FIELDS.flatMap((area) => Array.from({ length: area.w * area.h }, (_, i) => ({ x: area.x + i % area.w, y: area.y + Math.floor(i / area.w) }))).find((point) => tileAt(map, point.x, point.y) === 'field' && !taken(point.x, point.y));
    const spot = field ?? findFree(map, FIELDS[0]!.x, FIELDS[0]!.y, (x, y) => !['grass', 'flower', 'field'].includes(tileAt(map, x, y)) || taken(x, y), () => 0);
    Object.assign(crop, spot);
    changed = true;
  }
  if (!isWalkable(map, s.player.x, s.player.y)) {
    Object.assign(s.player, findFree(map, s.player.x, s.player.y, taken, () => 0));
    changed = true;
  }
  return changed;
}
