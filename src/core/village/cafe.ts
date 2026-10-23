import { BenchVisits } from './benches';
import { CAFE_TABLES, CAFE_TERRACE } from './cafe-layout';
import { advance, moving, stepVillager } from './actors';
import type { Walker, Blocked } from './actors';
import type { VillageMap } from './map';
import { hash } from './personality';
import type { Rng } from '../battle';
import type { VillageState } from './life';
import { payResidentWork, spendResidentCoins, RESIDENT_ECONOMY_RULES } from './resident-economy';

export const CAFE_RULES = { prepareMs: 6000, eatMs: 45000, socialBreakMs: 18000, deliveryDeadlineMs: 90000, orderLimit: 12 } as const;
export interface CafeOrder { residentId: string; table: string; dish: string; stage: 'pedido' | 'preparo' | 'entrega' | 'comendo'; at: number; servedAt: number | null }
const MENU = ['Chá de Oran', 'Bolo de Pecha', 'Suco de frutas', 'Biscoitos caseiros'] as const;

/** Pedidos são cenas de consumo no Café, sem gerar itens, moedas ou refeições no inventário. */
export class CafeService {
  constructor(private readonly state: VillageState) {}
  readonly seats = new BenchVisits(CAFE_TABLES, { distance: 60, travelMs: 120000, stayMs: 150000, stayVarianceMs: 10000, cooldownMs: 150000 });
  readonly orders = new Map<string, CafeOrder>();
  private readonly nextVisit = new Map<string, number>();
  private preparing: string | null = null;
  private readyAt = 0;
  private breakUntil = 0;

  release(id: string, now: number): void {
    this.seats.release(id, now); this.orders.delete(id);
    if (this.preparing === id) this.preparing = null;
  }
  clear(now: number): void {
    for (const id of this.seats.visits.keys()) this.release(id, now);
    this.orders.clear(); this.preparing = null;
  }
  seated(id: string, w: Walker): boolean { return this.seats.seated(id, w); }
  eatingTogether(walkers: ReadonlyMap<string, Walker>): string[] {
    for (const table of CAFE_TABLES) {
      const group = [...this.orders.values()].filter((o) => o.table === table.id && o.stage === 'comendo' && !!walkers.get(o.residentId) && this.seated(o.residentId, walkers.get(o.residentId)!)).map((o) => o.residentId);
      if (group.length > 1) return group;
    }
    return [];
  }
  stepCustomer(w: Walker, dt: number, now: number, map: VillageMap, blocked: Blocked, rng: Rng): boolean {
    if (!this.seats.visits.has(w.id)) {
      if ((this.state.residentEconomy[w.id]?.coins ?? 0) < RESIDENT_ECONOMY_RULES.cafePrice) return false;
      if (now < (this.nextVisit.get(w.id) ?? 0)) return false;
      this.nextVisit.set(w.id, now + 25000);
      if (rng() > .22) return false;
    }
    const handled = this.seats.step(w, dt, now, map, blocked, rng);
    if (!handled) { this.orders.delete(w.id); return false; }
    if (this.seated(w.id, w)) {
      const visit = this.seats.visits.get(w.id)!;
      let order = this.orders.get(w.id);
      if (!order) {
        order = { residentId: w.id, table: visit.bench, dish: MENU[hash(w.id) % MENU.length]!, stage: 'pedido', at: now, servedAt: null };
        this.orders.set(w.id, order);
      }
      if (order.servedAt !== null && now - order.servedAt >= CAFE_RULES.eatMs) this.release(w.id, now);
    }
    return true;
  }
  /** Um pedido por vez, com ida ao balcão, preparo, caminhada até a mesa e pausa entre atendimentos. */
  stepWaiter(w: Walker, dt: number, now: number, map: VillageMap, blocked: Blocked, rng: Rng, today: string): { handled: boolean; served?: string } {
    if (now < this.breakUntil) return { handled: false };
    let order = this.preparing ? this.orders.get(this.preparing) : undefined;
    if (order && now - order.at > CAFE_RULES.deliveryDeadlineMs) { order.stage = 'pedido'; order.at = now; this.preparing = null; order = undefined; this.breakUntil = now + 5000; }
    if (!order) {
      order = [...this.orders.values()].find((o) => o.stage === 'pedido');
      if (!order) return { handled: false };
      this.preparing = order.residentId;
      order.stage = 'preparo'; order.at = now; this.readyAt = 0;
    }
    const table = CAFE_TABLES.find((t) => t.id === order!.table)!;
    const target = order.stage === 'entrega' ? { x: table.x - 1, y: table.y } : CAFE_TERRACE.counter;
    if (Math.abs(w.x - target.x) + Math.abs(w.y - target.y) > 1) {
      stepVillager(w, dt, map, blocked, rng, target);
      return { handled: true };
    }
    advance(w, dt);
    if (moving(w)) return { handled: true };
    w.dir = order.stage === 'entrega' ? 'right' : 'up';
    if (order.stage === 'preparo') {
      if (!this.readyAt) this.readyAt = now + CAFE_RULES.prepareMs;
      if (now >= this.readyAt) order.stage = 'entrega';
      return { handled: true };
    }
    if (!spendResidentCoins(this.state, order.residentId, RESIDENT_ECONOMY_RULES.cafePrice)) {
      this.release(order.residentId, now); this.breakUntil = now + 1000; return { handled: true };
    }
    payResidentWork(this.state, w.id, 'cafe', `${order.residentId}:${order.at}`, today, RESIDENT_ECONOMY_RULES.cafeWage);
    order.stage = 'comendo'; order.servedAt = now;
    const served = order.residentId;
    this.preparing = null; this.breakUntil = now + CAFE_RULES.socialBreakMs;
    return { handled: true, served };
  }
}
