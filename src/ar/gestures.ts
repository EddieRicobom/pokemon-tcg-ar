/**
 * Gestos de ajuste do Pokémon na tela (puro, sem DOM): um dedo arrasta, dois dedos fazem pinça (e também arrastam
 * pelo ponto médio). Cada movimento devolve o centro anterior e o novo (em pixels de tela) e a razão de escala
 * (distância atual entre os dedos ÷ anterior; 1 com um dedo só).
 */
export interface GestureDelta {
  from: { x: number; y: number };
  to: { x: number; y: number };
  scale: number;
  fingers: number;
}

/** Distância mínima entre os dedos (px) para a pinça valer; evita escala absurda quando os dedos se encostam. */
const MIN_PINCH_DISTANCE = 24;

export class GestureTracker {
  private readonly points = new Map<number, { x: number; y: number }>();

  get fingers(): number {
    return this.points.size;
  }

  down(id: number, x: number, y: number): void {
    this.points.set(id, { x, y });
  }

  up(id: number): void {
    this.points.delete(id);
  }

  reset(): void {
    this.points.clear();
  }

  private measure(): { x: number; y: number; distance: number } | null {
    const list = [...this.points.values()];
    if (list.length === 0) return null;
    const x = list.reduce((sum, p) => sum + p.x, 0) / list.length;
    const y = list.reduce((sum, p) => sum + p.y, 0) / list.length;
    const distance = list.length >= 2 ? Math.hypot(list[0]!.x - list[1]!.x, list[0]!.y - list[1]!.y) : 0;
    return { x, y, distance };
  }

  /** Atualiza um dedo. Devolve null se o dedo não está sendo seguido ou nada mudou. */
  move(id: number, x: number, y: number): GestureDelta | null {
    if (!this.points.has(id)) return null;
    const before = this.measure()!;
    this.points.set(id, { x, y });
    const after = this.measure()!;
    const fingers = this.points.size;
    let scale = 1;
    if (fingers >= 2 && before.distance >= MIN_PINCH_DISTANCE && after.distance >= MIN_PINCH_DISTANCE) scale = after.distance / before.distance;
    if (before.x === after.x && before.y === after.y && scale === 1) return null;
    return { from: { x: before.x, y: before.y }, to: { x: after.x, y: after.y }, scale, fingers };
  }
}

/** Toque simples: pouco movimento e rápido. */
export function isTap(down: { x: number; y: number; at: number }, up: { x: number; y: number; at: number }, maxMovePx = 12, maxMs = 450): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= maxMovePx && up.at - down.at <= maxMs;
}
