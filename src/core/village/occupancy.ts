import type { Walker } from './actors';

interface Tile { x: number; y: number }

/**
 * Grade de blocos fixos (móveis e plantas) refeita uma vez por quadro. Pergunta "tem móvel ou planta aqui?" custa uma
 * leitura de memória, em vez de varrer as listas do salvamento a cada bloco que a busca de caminho visita.
 */
export class StaticBlockGrid {
  private readonly fixed: Uint8Array;

  constructor(readonly w: number, readonly h: number) {
    this.fixed = new Uint8Array(w * h);
  }

  /** Marca os blocos das listas dadas (fora do mapa são ignorados). */
  rebuild(...lists: readonly (readonly Tile[])[]): void {
    this.fixed.fill(0);
    for (const list of lists) {
      for (const t of list) if (t.x >= 0 && t.y >= 0 && t.x < this.w && t.y < this.h) this.fixed[t.y * this.w + t.x] = 1;
    }
  }

  has(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.fixed[y * this.w + x] === 1;
  }
}

export interface ResidentOccupancyWorld {
  grid: StaticBlockGrid;
  /** Reservas de lugares (bancos, mesas do Café): `reserved(x, y, except)` de cada `BenchVisits`. */
  reservations: readonly ((x: number, y: number, except?: string) => boolean)[];
  /** Quem joga: o bloco em que está e o que está pisando. */
  player: Pick<Walker, 'x' | 'y' | 'tx' | 'ty'> | null;
  villagers: ReadonlyMap<string, Walker>;
  /** Quem dorme não ocupa o bloco (some da rua). */
  asleep: ReadonlySet<string>;
}

/**
 * O bloco está ocupado para o morador `id`? Mesma regra de `VillageGame.occupied(x, y, id)` para moradores (reservas de
 * lugar dos outros, móveis, plantas, você e os outros moradores acordados, no bloco ou no destino do passo), só que
 * sem alocar nada e com os móveis numa grade. É o que as buscas de caminho chamam milhares de vezes por busca.
 */
export function blockedForResident(world: ResidentOccupancyWorld, x: number, y: number, id: string): boolean {
  for (const reserved of world.reservations) if (reserved(x, y, id)) return true;
  if (world.grid.has(x, y)) return true;
  const p = world.player;
  if (p && ((p.x === x && p.y === y) || (p.tx === x && p.ty === y))) return true;
  for (const [other, w] of world.villagers) {
    if (other === id || world.asleep.has(other)) continue;
    if ((w.x === x && w.y === y) || (w.tx === x && w.ty === y)) return true;
  }
  return false;
}
