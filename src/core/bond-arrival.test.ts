import { describe, expect, it } from 'vitest';
import { bondArrivalAt, BOND_ARRIVAL_MS } from './bond-arrival';
describe('chegada do companheiro evoluído', () => {
  it('abre o portal antes de revelar, levanta o sprite e pousa na escala normal', () => {
    expect(bondArrivalAt(0)).toMatchObject({ portal: 0, reveal: 0, lift: 0, done: false });
    expect(bondArrivalAt(700).portal).toBe(1);
    expect(bondArrivalAt(700).reveal).toBe(0);
    expect(bondArrivalAt(2200).lift).toBeGreaterThan(0.2);
    expect(bondArrivalAt(BOND_ARRIVAL_MS)).toMatchObject({ portal: 0, reveal: 1, scale: 1, done: true });
    expect(bondArrivalAt(9000).lift).toBeCloseTo(0);
  });
  it('mantém todos os envelopes dentro dos limites inclusive com relógio anterior ao início', () => {
    for (let t = -100; t < 6000; t += 17) {
      const frame = bondArrivalAt(t);
      for (const value of [frame.portal, frame.reveal, frame.scale, frame.burst]) expect(value).toBeGreaterThanOrEqual(0);
      expect(frame.scale).toBeLessThanOrEqual(1);
      expect(frame.portal).toBeLessThanOrEqual(1);
    }
  });
});
