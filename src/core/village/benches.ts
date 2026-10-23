import type { Rng } from '../battle';
import { advance, moving, tryStep } from './actors';
import type { Blocked, Walker } from './actors';
import { isWalkable } from './map';
import type { VillageMap } from './map';
import { PATH_DEFERRED, pathStepBudgeted } from './pathing';

export interface Bench { id: string; x: number; y: number }
/** Dois lugares por banco, fora das portas e das vias principais. */
export const PUBLIC_BENCHES: readonly Bench[] = [
  { id: 'praca-oeste', x: 41, y: 37 },
  { id: 'praca-leste', x: 51, y: 39 },
  { id: 'parque', x: 10, y: 46 },
  { id: 'casas-oeste', x: 37, y: 52 },
  { id: 'casas-leste', x: 54, y: 52 },
];

export function benchesFor(map: VillageMap): Bench[] {
  return PUBLIC_BENCHES.filter((b) => [0, 1].every((dx) => isWalkable(map, b.x + dx, b.y) && isWalkable(map, b.x + dx, b.y + 1)));
}

interface Visit { bench: string; x: number; y: number; deadline: number; until: number | null }
interface VisitOptions { distance?: number; travelMs?: number; stayMs?: number; stayVarianceMs?: number; cooldownMs?: number }

/** Estado efêmero: reservas exclusivas, chegada a pé e descanso com duração limitada. */
export class BenchVisits {
  readonly visits = new Map<string, Visit>();
  private readonly nextTry = new Map<string, number>();

  constructor(readonly benches: readonly Bench[], private readonly options: VisitOptions = {}) {}

  release(id: string, now: number): void {
    this.visits.delete(id);
    this.nextTry.set(id, now + (this.options.cooldownMs ?? 45000));
  }

  reserved(x: number, y: number, except?: string): boolean {
    for (const [id, v] of this.visits) if (id !== except && v.x === x && v.y === y) return true;
    return false;
  }

  seated(id: string, w: Walker): boolean {
    const v = this.visits.get(id);
    return !!v && v.until !== null && !moving(w) && w.x === v.x && w.y === v.y;
  }

  /** Retorna true quando este comportamento já avançou o morador neste quadro. */
  step(w: Walker, dt: number, now: number, map: VillageMap, blocked: Blocked, rng: Rng): boolean {
    let visit = this.visits.get(w.id);
    if (!visit) {
      if (moving(w) || now < (this.nextTry.get(w.id) ?? 0)) return false;
      this.nextTry.set(w.id, now + 12000 + rng() * 23000);
      const candidates = this.benches.flatMap((b) => [0, 1].map((dx) => ({ bench: b.id, x: b.x + dx, y: b.y })))
        .filter((s) => Math.abs(s.x - w.x) + Math.abs(s.y - w.y) <= (this.options.distance ?? 12) && !blocked(s.x, s.y) && !this.reserved(s.x, s.y, w.id));
      // Prefere fazer companhia a quem já escolheu o banco.
      candidates.sort((a, b) => Number([...this.visits.values()].some((v) => v.bench === b.bench)) - Number([...this.visits.values()].some((v) => v.bench === a.bench)));
      const seat = candidates[0];
      if (!seat) return false;
      visit = { ...seat, deadline: now + (this.options.travelMs ?? 20000), until: null };
      this.visits.set(w.id, visit);
    }
    if (now >= (visit.until ?? visit.deadline) || blocked(visit.x, visit.y)) {
      this.release(w.id, now);
      return false;
    }
    advance(w, dt);
    if (moving(w)) return true;
    if (w.x === visit.x && w.y === visit.y) {
      visit.until ??= now + (this.options.stayMs ?? 20000) + rng() * (this.options.stayVarianceMs ?? 25000);
      w.dir = 'down';
      return true;
    }
    const dx = visit.x - w.x;
    const dy = visit.y - w.y;
    const dir = Math.abs(dx) + Math.abs(dy) === 1
      ? dx ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up'
      : pathStepBudgeted(map, w, visit, blocked);
    if (dir && dir !== PATH_DEFERRED) tryStep(w, dir, map, blocked);
    return true;
  }
}
