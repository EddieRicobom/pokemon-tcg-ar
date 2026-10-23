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

/** Onde um morador estava quando entrou na grade (o bloco atual e o de destino do passo). */
interface Mark { x: number; y: number; tx: number; ty: number }

/**
 * Contagem, por bloco, dos moradores acordados que ocupam o bloco (atual ou de destino). A busca de caminho consulta
 * a grade em O(1) em vez de varrer todos os moradores a cada bloco. O chamador tira o morador da grade enquanto ele
 * decide o próprio passo e põe de volta depois, então ninguém vê a própria marca como obstáculo e os outros são
 * lidos com a posição atual, como antes.
 */
export class MoverGrid {
  private readonly counts: Uint16Array;
  private readonly marks = new Map<string, Mark>();

  constructor(readonly w: number, readonly h: number) {
    this.counts = new Uint16Array(w * h);
  }

  /** Põe o morador na grade (no bloco atual e, se for diferente, no de destino). */
  enter(walker: Walker): void {
    if (this.marks.has(walker.id)) return;
    const mark = { x: walker.x, y: walker.y, tx: walker.tx, ty: walker.ty };
    this.marks.set(walker.id, mark);
    this.apply(mark, 1);
  }

  /** Tira o morador da grade (se estiver lá). */
  leave(id: string): void {
    const mark = this.marks.get(id);
    if (!mark) return;
    this.marks.delete(id);
    this.apply(mark, -1);
  }

  clear(): void {
    this.counts.fill(0);
    this.marks.clear();
  }

  /** Há um morador (que não seja `id`) ocupando o bloco? */
  occupiedByOther(x: number, y: number, id: string): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    const own = this.marks.get(id);
    let ownHere = 0;
    if (own) {
      if (own.x === x && own.y === y) ownHere += 1;
      if ((own.tx !== own.x || own.ty !== own.y) && own.tx === x && own.ty === y) ownHere += 1;
    }
    return this.counts[y * this.w + x]! - ownHere > 0;
  }

  private apply(mark: Mark, delta: number): void {
    this.add(mark.x, mark.y, delta);
    if (mark.tx !== mark.x || mark.ty !== mark.y) this.add(mark.tx, mark.ty, delta);
  }

  private add(x: number, y: number, delta: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.counts[y * this.w + x] = this.counts[y * this.w + x]! + delta;
  }
}

export interface ResidentOccupancyWorld {
  grid: StaticBlockGrid;
  /** Moradores acordados na grade (quem dorme não entra). */
  movers: MoverGrid;
  /** Reservas de lugares (bancos, mesas do Café): `reserved(x, y, except)` de cada `BenchVisits`. */
  reservations: readonly ((x: number, y: number, except?: string) => boolean)[];
  /** Quem joga: o bloco em que está e o que está pisando. */
  player: Pick<Walker, 'x' | 'y' | 'tx' | 'ty'> | null;
}

/**
 * O bloco está ocupado para o morador `id`? Mesma regra de `VillageGame.occupied(x, y, id)` para moradores (reservas de
 * lugar dos outros, móveis, plantas, você e os outros moradores acordados, no bloco ou no destino do passo), só que
 * sem alocar nada e com as três partes em estruturas indexadas. É o que as buscas de caminho chamam milhares de vezes.
 */
export function blockedForResident(world: ResidentOccupancyWorld, x: number, y: number, id: string): boolean {
  for (const reserved of world.reservations) if (reserved(x, y, id)) return true;
  if (world.grid.has(x, y)) return true;
  const p = world.player;
  if (p && ((p.x === x && p.y === y) || (p.tx === x && p.ty === y))) return true;
  return world.movers.occupiedByOther(x, y, id);
}
