import type { Blocked, Dir } from './actors';
import { isWalkable } from './map';
import type { VillageMap } from './map';

/**
 * Limite de buscas de caminho por quadro. Cada busca percorre o mapa em largura, então com dezenas de moradores
 * andando ao mesmo tempo as buscas de um mesmo quadro somavam vários milissegundos e a Vila engasgava. Moradores que
 * ficam sem vez esperam o quadro seguinte (imperceptível); quem joga (`pathStep`) nunca entra na fila.
 * Sem `reset`, o limite é infinito (testes e usos fora do jogo não mudam).
 */
export class PathBudget {
  private left = Number.POSITIVE_INFINITY;
  /** Começa um quadro com `searches` buscas disponíveis (`Infinity` desliga o limite). */
  reset(searches: number): void {
    this.left = searches;
  }
  /** Gasta uma busca; `false` quando o quadro já usou todas. */
  take(): boolean {
    if (this.left <= 0) return false;
    this.left -= 1;
    return true;
  }
  get remaining(): number {
    return this.left;
  }
}

/** Orçamento compartilhado pelos moradores da Vila aberta (um jogo por vez). */
export const pathBudget = new PathBudget();

/** Resposta de `pathStepBudgeted` quando o quadro já gastou as buscas: o morador espera o próximo quadro. */
export const PATH_DEFERRED = 'wait' as const;

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

/** Como `pathStep`, mas respeitando `pathBudget`: sem busca disponível devolve `PATH_DEFERRED` (para os moradores). */
export function pathStepBudgeted(map: VillageMap, from: { x: number; y: number }, goal: { x: number; y: number }, blocked: Blocked): Dir | null | typeof PATH_DEFERRED {
  if (Math.abs(goal.x - from.x) + Math.abs(goal.y - from.y) <= 1) return null;
  if (!pathBudget.take()) return PATH_DEFERRED;
  return pathStep(map, from, goal, blocked);
}

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
const DELTA: readonly (readonly [number, number])[] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

/** Buffers reaproveitados entre buscas (a busca é síncrona e não se chama a si mesma). */
let firstBuffer = new Int8Array(0);
let queueBuffer = new Int32Array(0);

function search(map: VillageMap, from: { x: number; y: number }, goal: { x: number; y: number }, blocked: Blocked): Dir | null {
  const { w, h } = map;
  if (firstBuffer.length !== w * h) {
    firstBuffer = new Int8Array(w * h);
    queueBuffer = new Int32Array(w * h);
  }
  const first = firstBuffer;
  first.fill(-1);
  const queue = queueBuffer;
  const start = from.y * w + from.x;
  let tail = 0;
  queue[tail++] = start;
  first[start] = 4;
  for (let head = 0; head < tail; head++) {
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
      queue[tail++] = j;
    }
  }
  return null;
}
