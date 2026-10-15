import type { Blocked, Dir } from './actors';
import { isWalkable } from './map';
import type { VillageMap } from './map';

/**
 * Para onde dar o próximo passo para chegar ao lado de (gx, gy): busca em largura nos blocos livres (o caminho mais
 * curto contornando prédios, a fonte e o lago, em vez de andar em linha reta e encostar numa parede). Quem está no
 * caminho (`blocked`: Pokémon, móveis, hortas) é contornado; se não houver caminho assim, vale o do mapa sem eles (o
 * passo é dado quando o bloco liberar). Devolve `null` se já está ao lado ou se não há caminho nenhum.
 */
export function pathStep(map: VillageMap, from: { x: number; y: number }, goal: { x: number; y: number }, blocked: Blocked): Dir | null {
  if (Math.abs(goal.x - from.x) + Math.abs(goal.y - from.y) <= 1) return null;
  return search(map, from, goal, blocked) ?? search(map, from, goal, () => false);
}

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
const DELTA: readonly (readonly [number, number])[] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

function search(map: VillageMap, from: { x: number; y: number }, goal: { x: number; y: number }, blocked: Blocked): Dir | null {
  const { w, h } = map;
  const first = new Int8Array(w * h).fill(-1);
  const start = from.y * w + from.x;
  const queue = [start];
  first[start] = 4;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % w;
    const y = (i - x) / w;
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = DELTA[d]!;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (first[j]! >= 0 || !isWalkable(map, nx, ny) || (nx === goal.x && ny === goal.y) || blocked(nx, ny)) continue;
      first[j] = i === start ? d : first[i]!;
      if (Math.abs(goal.x - nx) + Math.abs(goal.y - ny) <= 1) return DIRS[first[j]!]!;
      queue.push(j);
    }
  }
  return null;
}
