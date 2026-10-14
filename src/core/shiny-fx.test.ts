import { describe, expect, it } from 'vitest';
import { haloAlpha, haloPulse, sparkleAt, starAlpha } from './shiny-fx';

describe('haloAlpha', () => {
  it('forte no centro, some na borda e fora dela', () => {
    expect(haloAlpha(0)).toBeGreaterThan(0.9);
    expect(haloAlpha(1)).toBe(0);
    expect(haloAlpha(1.4)).toBe(0);
    expect(haloAlpha(Number.NaN)).toBe(0);
  });

  it('diminui de dentro para fora', () => {
    let last = Infinity;
    for (let r = 0; r < 1; r += 0.1) {
      const a = haloAlpha(r);
      expect(a).toBeLessThanOrEqual(last);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
      last = a;
    }
  });
});

describe('starAlpha', () => {
  it('tem miolo claro, pontas nos eixos e vazio nas diagonais', () => {
    expect(starAlpha(0, 0)).toBeGreaterThan(0.95);
    expect(starAlpha(0.5, 0)).toBeGreaterThan(0.1);
    expect(starAlpha(0.7, 0.7)).toBe(0);
    expect(starAlpha(1, 0)).toBe(0);
    expect(starAlpha(0, -1.2)).toBe(0);
  });

  it('é simétrica', () => {
    expect(starAlpha(0.3, 0.1)).toBeCloseTo(starAlpha(-0.3, -0.1), 10);
    expect(starAlpha(0.3, 0.1)).toBeCloseTo(starAlpha(0.1, 0.3), 10);
  });
});

describe('sparkleAt', () => {
  it('as estrelas ficam em volta do Pokémon, nunca em cima do centro', () => {
    for (let i = 0; i < 6; i++) {
      for (let t = 0; t < 10; t += 0.37) {
        const s = sparkleAt(i, 6, t);
        expect(Math.hypot(s.x, s.y)).toBeGreaterThan(0.4);
        expect(Math.hypot(s.x, s.y)).toBeLessThan(0.75);
        expect(s.alpha).toBeGreaterThanOrEqual(0);
        expect(s.alpha).toBeLessThanOrEqual(1);
        expect(s.size).toBeGreaterThanOrEqual(0.1);
      }
    }
  });

  it('as estrelas começam espalhadas e giram com o tempo', () => {
    const a = sparkleAt(0, 4, 0);
    const b = sparkleAt(1, 4, 0);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.3);
    const later = sparkleAt(0, 4, 2);
    expect(Math.hypot(a.x - later.x, a.y - later.y)).toBeGreaterThan(0.1);
  });

  it('piscam: ao longo do tempo passam por apagadas e por acesas', () => {
    const alphas: number[] = [];
    for (let t = 0; t < 6; t += 0.05) alphas.push(sparkleAt(2, 5, t).alpha);
    expect(Math.min(...alphas)).toBe(0);
    expect(Math.max(...alphas)).toBeGreaterThan(0.9);
  });
});

describe('haloPulse', () => {
  it('fica entre 0,75 e 1', () => {
    for (let t = 0; t < 10; t += 0.1) {
      expect(haloPulse(t)).toBeGreaterThanOrEqual(0.75);
      expect(haloPulse(t)).toBeLessThanOrEqual(1);
    }
  });
});
