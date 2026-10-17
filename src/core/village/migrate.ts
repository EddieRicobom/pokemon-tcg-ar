import { add, MAP_LAYOUT } from './life';
import type { Crop, VillageState } from './life';
import { tileAt } from './map';
import type { VillageMap } from './map';
import { FIELDS } from './town-layout';

/**
 * Traz um save do mapa antigo (48×40) para o mapa grande: as posições antigas não querem dizer nada no desenho novo,
 * então nada fica "perdido" num lugar aleatório. Os móveis voltam para a mochila (para você pôr de novo onde
 * quiser), a horta é replantada nos canteiros da fazenda com o mesmo estágio e a mesma rega, a coleta do dia
 * recomeça e você aparece no ponto de partida. Devolve se mudou alguma coisa.
 */
export function migrateLayout(s: VillageState, map: VillageMap): boolean {
  if (s.layout === MAP_LAYOUT) return false;
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
